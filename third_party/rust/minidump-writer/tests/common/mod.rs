use std::{
    error,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    result,
};

use serde::Serialize;

#[allow(unused)]
type Error = Box<dyn error::Error + std::marker::Send + std::marker::Sync>;
#[allow(unused)]
pub type Result<T> = result::Result<T, Error>;

fn build_command() -> Command {
    // Anything that needs to spawn a child will need to give it permission to
    // ptrace itself, as Yama LSM will normally only allow a parent to debug
    // a child, not the other way around.
    #[cfg(target_os = "linux")]
    {
        let rc = unsafe { libc::prctl(libc::PR_SET_PTRACER, libc::PR_SET_PTRACER_ANY) };
        assert_eq!(rc, 0);
    }

    let mut cmd;
    if let Some(binary) = std::env::var_os("TEST_HELPER") {
        cmd = Command::new(binary);
    } else {
        cmd = Command::new("cargo");
        cmd.args(["run", "-q", "--bin", "test"]);

        // In normal cases where the host and target are the same this won't matter,
        // but tests will fail if you are eg running in a cross container which will
        // likely be x86_64 but may be targetting aarch64 or i686, which will result
        // in tests failing, or at the least not testing what you think
        cmd.args(["--target", current_platform::CURRENT_PLATFORM, "--"]);
    }

    cmd.env("RUST_BACKTRACE", "1");

    cmd
}

/// Must be taken by tests that use ptrace() to avoid racing on attaching to the parent,
/// leading to random failures.
static PTRACE_PARENT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[allow(unused)]
pub fn spawn_child(command: &str, args: &[&str]) {
    let mut cmd = build_command();
    cmd.arg(command).args(args);

    let child = {
        // Panicking is fine as far as ptrace is concerned,
        // no need to poison other tests.
        let _guard = PTRACE_PARENT_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        cmd.output().expect("failed to execute child")
    };

    println!("Child output:");
    println!("===stdout===");

    print_stdio(&child.stdout);

    println!("\n===stderr===");

    print_stdio(&child.stderr);

    println!("\n============");
    assert_eq!(child.status.code().expect("No return value"), 0);
}

fn start_child_and_wait_for_threads_helper(command: &str, num: usize) -> Child {
    let mut cmd = build_command();
    cmd.arg(command).arg(num.to_string());
    cmd.stdout(Stdio::piped());

    let mut child = cmd.spawn().expect("failed to spawn cargo");
    wait_for_threads(&mut child, num);
    child
}

#[allow(unused)]
pub fn start_child_and_wait_for_threads(num: usize) -> Child {
    start_child_and_wait_for_threads_helper("spawn_and_wait", num)
}

#[allow(unused)]
pub fn start_child_and_wait_for_named_threads(num: usize) -> Child {
    start_child_and_wait_for_threads_helper("spawn_name_wait", num)
}

#[allow(unused)]
pub fn start_child_and_wait_for_create_files(num: usize) -> Child {
    start_child_and_wait_for_threads_helper("create_files_wait", num)
}

#[allow(unused)]
pub fn wait_for_threads(child: &mut Child, num: usize) {
    let mut f = BufReader::new(child.stdout.as_mut().expect("Can't open stdout"));
    let mut lines = 0;
    while lines < num {
        let mut buf = String::new();
        match f.read_line(&mut buf) {
            Ok(_) => {
                if buf == "1\n" {
                    lines += 1;
                }
            }
            Err(e) => {
                std::panic::panic_any(e);
            }
        }
    }
}

#[allow(unused)]
pub fn start_child_and_return(args: &[&str]) -> Child {
    let mut cmd = build_command();
    cmd.args(args);

    cmd.stdout(Stdio::piped())
        .spawn()
        .expect("failed to execute child")
}

#[allow(unused)]
pub fn read_minidump_soft_errors_or_panic<'a, T>(
    dump: &minidump::Minidump<'a, T>,
) -> serde_json::Value
where
    T: std::ops::Deref<Target = [u8]> + 'a,
{
    let contents = std::str::from_utf8(
        dump.get_raw_stream(minidump_common::format::MINIDUMP_STREAM_TYPE::MozSoftErrors.into())
            .expect("missing soft error stream"),
    )
    .expect("expected utf-8 stream");

    serde_json::from_str(contents).expect("expected json")
}

pub fn visit_json_objects<V>(json: &serde_json::Value, path: &mut Vec<String>, visit: &mut V)
where
    V: FnMut(&[String], &serde_json::Value),
{
    if let Some(obj) = json.as_object() {
        for (key, value) in obj.iter() {
            // visiting the key is useful if you're matching against a complex enum member
            // but don't really care about its contents
            visit(path, &serde_json::Value::String(key.clone()));
            path.push(key.clone());
            visit_json_objects(value, path, visit);
            path.pop();
        }
    }
    if let Some(arr) = json.as_array() {
        for value in arr.iter() {
            visit_json_objects(value, path, visit);
        }
        return;
    }
    visit(path, json);
}

#[allow(unused)]
#[derive(Debug)]
pub struct ErrorPattern {
    value: serde_json::Value,
    ancestor: Option<String>,
}

#[allow(unused)]
impl ErrorPattern {
    pub fn value(value: impl Serialize) -> Self {
        Self {
            value: serde_json::to_value(value).unwrap(),
            ancestor: None,
        }
    }
    pub fn with_ancestor(mut self, ancestor: impl ToString) -> Self {
        self.ancestor = Some(ancestor.to_string());
        self
    }

    fn matches(&self, value: &serde_json::Value, path: &[String]) -> bool {
        &self.value == value
            && match &self.ancestor {
                None => true,
                Some(ancestor) => path.contains(ancestor),
            }
    }
}

#[allow(unused)]
pub(crate) fn assert_minidump_soft_errors_match_all<'a, T>(
    dump: &minidump::Minidump<'a, T>,
    patterns: &[ErrorPattern],
) where
    T: std::ops::Deref<Target = [u8]> + 'a,
{
    let actual_json = read_minidump_soft_errors_or_panic(dump);

    let mut path = vec![];
    // We can't use a HashSet because remove() is too greedy in terms of
    // lifetime.
    let mut expected: Vec<_> = patterns.iter().collect();

    visit_json_objects(&actual_json, &mut path, &mut |path, value| {
        for i in 0..expected.len() {
            let pattern = &expected[i];
            if pattern.matches(value, path) {
                expected.remove(i);
                return;
            }
        }
    });

    if !expected.is_empty() {
        panic!("Soft errors patterns not found: {:?}", expected);
    }
}

/// Asserts that the soft-error stream contains an error named `variant` anywhere
/// in its (possibly nested) structure. Data-carrying variants appear as object
/// keys and unit variants as strings, so both forms are matched.
#[allow(unused)]
pub fn assert_minidump_contains_soft_error<'a, T>(dump: &minidump::Minidump<'a, T>, variant: &str)
where
    T: std::ops::Deref<Target = [u8]> + 'a,
{
    let errors = read_minidump_soft_errors_or_panic(dump);
    assert!(
        soft_errors_contain(&errors, variant),
        "soft error list missing expected error `{variant}`\nError_list: {errors:#?}"
    );
}

fn soft_errors_contain(value: &serde_json::Value, variant: &str) -> bool {
    match value {
        serde_json::Value::String(s) => s == variant,
        serde_json::Value::Array(items) => {
            items.iter().any(|item| soft_errors_contain(item, variant))
        }
        serde_json::Value::Object(map) => {
            map.contains_key(variant) || map.values().any(|v| soft_errors_contain(v, variant))
        }
        _ => false,
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
#[allow(unused)]
pub use linux::*;

#[cfg(any(target_os = "linux", target_os = "android"))]
#[allow(unused)]
mod linux {
    use {
        minidump_writer::{
            CrashContextExt, Pid,
            module_reader::{self, ModuleMemoryReadError, ReadModuleMemory},
        },
        std::borrow::Cow,
    };
    pub struct SliceModuleMemoryReader<'a>(pub &'a [u8]);

    impl<'a> ReadModuleMemory for SliceModuleMemoryReader<'a> {
        fn read<'b>(
            &'b self,
            offset: u64,
            length: u64,
        ) -> Result<Cow<'b, [u8]>, ModuleMemoryReadError> {
            let inner = || {
                use module_reader::ReadError as E;
                let offset = usize::try_from(offset).map_err(|_| E::Overflow)?;
                let length = usize::try_from(length).map_err(|_| E::Overflow)?;
                let end = offset.checked_add(length).ok_or(E::Overflow)?;
                self.0
                    .get(offset..end)
                    .map(Cow::Borrowed)
                    .ok_or(E::OutOfBounds)
            };

            inner().map_err(|error| ModuleMemoryReadError {
                start_address: None,
                offset,
                length,
                error,
            })
        }
        fn absolute_to_relative(&self, addr: u64) -> Option<u64> {
            Some(addr)
        }
        /// Calculates the absolute address of the specified relative address
        fn relative_to_absolute(&self, addr: u64) -> Option<u64> {
            Some(addr)
        }
        fn is_process_memory(&self) -> bool {
            false
        }
    }

    pub fn get_dummy_crash_context(tid: Pid) -> CrashContextExt {
        let siginfo: libc::signalfd_siginfo = unsafe { std::mem::zeroed() };
        let context = unsafe { std::mem::zeroed() };
        #[cfg(not(target_arch = "arm"))]
        let float_state = unsafe { std::mem::zeroed() };
        CrashContextExt {
            inner: crash_context::CrashContext {
                siginfo,
                pid: std::process::id() as _,
                tid,
                context,
                #[cfg(not(target_arch = "arm"))]
                float_state,
            },
        }
    }
}

fn print_stdio(bytes: &[u8]) {
    if let Ok(s) = str::from_utf8(bytes) {
        print!("{s}");
    } else {
        for (idx, b) in bytes.iter().enumerate() {
            if idx == 0 {
                print!("{b:02x}");
            } else if idx % 16 == 0 {
                print!("\n{b:02x}");
            } else {
                print!(" {b:02x}");
            }
        }
    }
}

use {
    super::process_inspection::{self, ProcessInspector},
    crate::{minidump_format::PlatformId, serializers::*},
    std::{
        ffi::{CStr, c_char},
        mem,
    },
};

cfg_if::cfg_if! {
    if #[cfg(any(
        target_arch = "x86_64",
        target_arch = "x86",
    ))]
    {
        pub mod x86;
        pub use x86 as imp;
    } else if #[cfg(any(
        target_arch = "arm",
        target_arch = "aarch64",
    ))]
    {
        pub mod arm;
        pub use arm as imp;
    }
}

pub use imp::write_cpu_information;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum CpuInfoError {
    #[error("failed to read /proc/cpuinfo")]
    ReadFileError(#[source] process_inspection::Error),
    #[error("I/O error reading /proc/cpuinfo")]
    FileIOError(
        #[source]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
    #[error("Not all entries of /proc/cpuinfo found!")]
    NotAllProcEntriesFound,
    #[error("Couldn't parse core from file")]
    UnparsableInteger(
        #[from]
        #[serde(skip)]
        std::num::ParseIntError,
    ),
    #[error("Couldn't parse cores: {0}")]
    UnparsableCores(String),
}

/// Retrieves the [`MDOSPlatform`] and synthesized version information
pub fn os_information() -> (PlatformId, String) {
    let platform_id = if cfg!(target_os = "android") {
        PlatformId::Android
    } else {
        PlatformId::Linux
    };

    // This is quite unfortunate, but the primary reason that uname could fail
    // would be if it failed to fill out the nodename (hostname) field, even
    // though we don't care about that particular field at all
    let info = (|| unsafe {
        let mut uts_name = mem::zeroed();
        if libc::uname(&mut uts_name) == -1 {
            return None;
        }

        fn to_str(b: &[c_char]) -> &str {
            let cstr = unsafe { CStr::from_ptr(b.as_ptr().cast()) };
            cstr.to_str().unwrap_or("<unknown>")
        }

        Some(format!(
            "{} {} {} {}",
            to_str(&uts_name.sysname),
            to_str(&uts_name.release),
            to_str(&uts_name.version),
            to_str(&uts_name.machine),
        ))
    })()
    .unwrap_or_else(|| {
        let os = if platform_id == PlatformId::Linux {
            "Linux"
        } else {
            "Android"
        };

        let machine = if cfg!(target_arch = "x86_64") {
            "x86_64"
        } else if cfg!(target_arch = "x86") {
            "x86"
        } else if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else if cfg!(target_arch = "arm") {
            "arm"
        } else {
            "<unknown>"
        };

        // TODO: Fallback to other sources of information, eg /etc/os-release
        format!("{os} <unknown> <unknown> {machine}")
    });

    (platform_id, info)
}

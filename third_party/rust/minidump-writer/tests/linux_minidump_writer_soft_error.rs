#![cfg(any(target_os = "linux", target_os = "android"))]

use common::*;
use minidump::Minidump;
use minidump_writer::{FailSpotName, minidump_writer::MinidumpWriterConfig};

mod common;

#[test]
fn soft_error_stream() {
    let mut child = start_child_and_wait_for_threads(1);
    let pid = child.id() as i32;

    let mut tmpfile = tempfile::Builder::new()
        .prefix("soft_error_stream")
        .tempfile()
        .unwrap();

    let mut fail_client = FailSpotName::testing_client();
    fail_client.set_enabled(FailSpotName::StopProcess, true);

    // Write a minidump
    MinidumpWriterConfig::new(pid, pid)
        .write(&mut tmpfile)
        .expect("cound not write minidump");
    child.kill().expect("Failed to kill process");
    child.wait().expect("Failed to wait on killed process");

    // Ensure the minidump has a MozSoftErrors present
    let dump = Minidump::read_path(tmpfile.path()).expect("failed to read minidump");
    read_minidump_soft_errors_or_panic(&dump);
}

#[test]
fn soft_error_stream_content() {
    let mut child = start_child_and_wait_for_threads(1);
    let pid = child.id() as i32;

    let mut tmpfile = tempfile::Builder::new()
        .prefix("soft_error_stream_content")
        .tempfile()
        .unwrap();

    let mut fail_client = FailSpotName::testing_client();
    for name in [
        FailSpotName::StopProcess,
        FailSpotName::FillMissingAuxvInfo,
        FailSpotName::ThreadName,
        FailSpotName::SuspendThreads,
        FailSpotName::CpuInfoFileOpen,
    ] {
        fail_client.set_enabled(name, true);
    }

    // Write a minidump
    MinidumpWriterConfig::new(pid, pid)
        .write(&mut tmpfile)
        .expect("cound not write minidump");
    child.kill().expect("Failed to kill process");
    child.wait().expect("Failed to wait on killed process");

    let dump = Minidump::read_path(tmpfile.path()).expect("failed to read minidump");

    // Ensure the MozSoftErrors stream contains the expected errors
    assert_minidump_soft_errors_match_all(
        &dump,
        &[
            ErrorPattern::value(libc::EPERM).with_ancestor("StopProcessFailed"),
            // AuxvError is not reachable so use the string form instead
            ErrorPattern::value("InvalidFormat").with_ancestor("FillMissingAuxvInfoErrors"),
            ErrorPattern::value("ReadThreadNameFailed"),
            ErrorPattern::value(libc::EPERM).with_ancestor("SuspendThreadsErrors"),
            ErrorPattern::value(libc::EPERM).with_ancestor("WriteCpuInformationFailed"),
        ],
    );
}

#[test]
fn thread_stack_pointer_unmapped_soft_error() {
    let mut child = start_child_and_wait_for_threads(1);
    let pid = child.id() as i32;

    let mut tmpfile = tempfile::Builder::new()
        .prefix("stack_pointer_unmapped")
        .tempfile()
        .unwrap();

    let mut fail_client = FailSpotName::testing_client();
    fail_client.set_enabled(FailSpotName::StackPointerMapping, true);

    MinidumpWriterConfig::new(pid, pid)
        .write(&mut tmpfile)
        .expect("could not write minidump");
    child.kill().expect("Failed to kill process");
    child.wait().expect("Failed to wait on killed process");

    let dump = Minidump::read_path(tmpfile.path()).expect("failed to read minidump");
    assert_minidump_contains_soft_error(&dump, "GetStackInfoFailed");
}

#[test]
fn thread_stack_unreadable_soft_error() {
    let mut child = start_child_and_wait_for_threads(1);
    let pid = child.id() as i32;

    let mut tmpfile = tempfile::Builder::new()
        .prefix("stack_unreadable")
        .tempfile()
        .unwrap();

    let mut fail_client = FailSpotName::testing_client();
    fail_client.set_enabled(FailSpotName::ThreadStackCopy, true);

    MinidumpWriterConfig::new(pid, pid)
        .write(&mut tmpfile)
        .expect("could not write minidump");
    child.kill().expect("Failed to kill process");
    child.wait().expect("Failed to wait on killed process");

    let dump = Minidump::read_path(tmpfile.path()).expect("failed to read minidump");
    assert_minidump_contains_soft_error(&dump, "CopyFromProcessError");
}

#[test]
fn crashing_thread_ip_memory_unreadable_soft_error() {
    let mut child = start_child_and_wait_for_threads(1);
    let pid = child.id() as i32;

    let mut tmpfile = tempfile::Builder::new()
        .prefix("ip_memory_unreadable")
        .tempfile()
        .unwrap();

    let mut fail_client = FailSpotName::testing_client();
    fail_client.set_enabled(FailSpotName::CrashingThreadIpCopy, true);

    let mut config = MinidumpWriterConfig::new(pid, pid);
    config.set_crash_context(get_dummy_crash_context(pid));
    config
        .write(&mut tmpfile)
        .expect("could not write minidump");
    child.kill().expect("Failed to kill process");
    child.wait().expect("Failed to wait on killed process");

    let dump = Minidump::read_path(tmpfile.path()).expect("failed to read minidump");
    assert_minidump_contains_soft_error(&dump, "CopyFromProcessError");
}

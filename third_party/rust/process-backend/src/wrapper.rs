use core::ffi::c_int;
use serde::{Deserialize, Serialize};

#[derive(Debug)]
pub(crate) struct OwnedFd(c_int);

impl OwnedFd {
    // SAFETY: Must be a valid fd
    pub(crate) unsafe fn new(fd: c_int) -> Self {
        Self(fd)
    }
    pub(crate) fn as_raw_fd(&self) -> c_int {
        self.0
    }
}

impl Drop for OwnedFd {
    fn drop(&mut self) {
        let rv = unsafe { libc::close(self.0) };
        if rv == -1 {
            report_drop_failed!("failed to close file: {}", errno());
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Stat {
    pub st_mode: u32,
}

pub(crate) fn errno() -> c_int {
    unsafe { *errno_location() }
}

pub(crate) fn set_errno(value: c_int) {
    unsafe {
        *errno_location() = value;
    }
}

#[cfg(target_os = "android")]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno() }
}

#[cfg(not(target_os = "android"))]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno_location() }
}

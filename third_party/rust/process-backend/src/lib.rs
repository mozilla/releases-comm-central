#![no_std]
#![cfg(any(target_os = "linux", target_os = "android"))]

pub mod local;
pub mod regs;

/// This is the longest path length we guarantee we can handle, since we won't be able to allocate
/// in the fork of the crashed process. We can increase if necessary.
pub const MAX_PATH_LEN: usize = 256;

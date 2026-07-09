#![no_std]

pub use platform::*;

#[cfg_attr(any(target_os = "linux", target_os = "android"), path = "linux/mod.rs")]
mod platform;

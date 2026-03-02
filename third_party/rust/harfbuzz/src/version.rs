// Copyright 2023 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::sys::{hb_version, hb_version_atleast, hb_version_string};

/// Returns the HarfBuzz library version.
///
/// # Example:
///
/// ```
/// let (major, minor, patch) = harfbuzz::version();
/// println!("HarfBuzz version {}.{}.{}", major, minor, patch);
/// ```
pub fn version() -> (u32, u32, u32) {
    let mut major: u32 = 0;
    let mut minor: u32 = 0;
    let mut patch: u32 = 0;
    unsafe {
        hb_version(&mut major, &mut minor, &mut patch);
    }
    (major, minor, patch)
}

/// Returns true if the HarfBuzz library version is at least the given version.
///
/// # Example:
///
/// ```
/// assert!(harfbuzz::version_atleast(2, 0, 0));
/// ```
pub fn version_atleast(major: u32, minor: u32, patch: u32) -> bool {
    unsafe { hb_version_atleast(major, minor, patch) != 0 }
}

/// Returns the HarfBuzz library version as a string.
///
/// # Example:
///
/// ```
/// println!("HarfBuzz version {}", harfbuzz::version_string());
/// ```
pub fn version_string() -> &'static str {
    unsafe { core::ffi::CStr::from_ptr(hb_version_string()) }
        .to_str()
        .unwrap()
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub mod actions;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub mod linux;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub use actions::*;
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub mod locales;

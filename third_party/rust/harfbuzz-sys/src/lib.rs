// Copyright 2023 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! # harfbuzz-sys
//!
//! This crate provides raw bindings to the [HarfBuzz](https://harfbuzz.github.io/)
//! text shaping library.
//!
//! ## Features
//!
//! - `freetype` - Enables bindings to the FreeType font engine. (Enabled by default.)
//! - `coretext` - Enables bindings to the CoreText font engine. (Apple platforms only) (Enabled by default.)
//! - `directwrite` - Enables bindings to the DirectWrite font engine. (Windows only) (Enabled by default.)
//!
//! - `bundled` - Use the bundled copy of the harfbuzz library rather than one installed on the system.

#![no_std]
#![warn(clippy::doc_markdown)]

#[cfg(all(target_vendor = "apple", feature = "coretext"))]
pub mod coretext;

#[cfg(all(target_family = "windows", feature = "directwrite"))]
pub mod directwrite;

#[cfg(feature = "freetype")]
pub mod freetype;

#[allow(non_camel_case_types)]
#[allow(non_snake_case)]
#[allow(non_upper_case_globals)]
#[allow(clippy::unreadable_literal)]
#[allow(clippy::doc_markdown)]
#[allow(rustdoc::bare_urls)]
#[allow(rustdoc::broken_intra_doc_links)]
mod bindings;

pub use crate::bindings::*;

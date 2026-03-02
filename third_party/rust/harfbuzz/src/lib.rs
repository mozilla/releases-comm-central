// Copyright 2018 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! HarfBuzz is a text shaping engine. It solves the problem of selecting
//! and positioning glyphs from a font given a Unicode string.
//!
//! ## Features
//!
//! - `freetype` - Enables bindings to the FreeType font engine. (Enabled by default.)
//! - `coretext` - Enables bindings to the CoreText font engine. (Apple platforms only) (Enabled by default.)
//! - `directwrite` - Enables bindings to the DirectWrite font engine. (Windows only) (Enabled by default.)
//! - `std` - Enable certain functions that require the standard library. (Enabled by default.)
//!
//! - `bundled` - Use the bundled copy of the harfbuzz library rather than one installed on the system.

#![no_std]
#![warn(clippy::doc_markdown, missing_docs)]
#![deny(
    trivial_numeric_casts,
    unstable_features,
    unused_import_braces,
    unused_qualifications
)]

extern crate alloc;

#[cfg(feature = "std")]
extern crate std;

pub use harfbuzz_sys as sys;
pub use harfbuzz_traits as traits;

/// An error type for this crate
#[derive(Debug)]
pub enum HarfBuzzError {
    /// Allocation failed within HarfBuzz itself
    Alloc,
}
pub use HarfBuzzError as Error;

mod buffer;
pub use self::buffer::Buffer;

mod direction;
pub use self::direction::Direction;

mod language;
pub use self::language::Language;

mod blob;
pub use self::blob::Blob;

mod unicode_funcs;
pub use self::unicode_funcs::{UnicodeFuncs, UnicodeFuncsBuilder};

mod version;
pub use self::version::{version, version_atleast, version_string};

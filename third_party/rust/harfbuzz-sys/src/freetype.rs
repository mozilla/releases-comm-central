// Copyright 2023 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::hb_font_t;

extern "C" {
    /// This requires that the `freetype` feature is enabled.
    pub fn hb_ft_font_create_referenced(face: freetype_sys::FT_Face) -> *mut hb_font_t;
}

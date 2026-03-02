// Copyright 2023 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::{hb_face_t, hb_font_t};

use core_graphics::font::CGFont;
use core_text::font::CTFontRef;
use foreign_types::ForeignType;

type CGFontRef = *mut <CGFont as ForeignType>::CType;

extern "C" {
    /// This requires that the `coretext` feature is enabled.
    pub fn hb_coretext_face_create(cg_font: CGFontRef) -> *mut hb_face_t;
    /// This requires that the `coretext` feature is enabled.
    pub fn hb_coretext_font_create(ct_font: CTFontRef) -> *mut hb_font_t;
    /// This requires that the `coretext` feature is enabled.
    pub fn hb_coretext_face_get_cg_font(face: *mut hb_face_t) -> CGFontRef;
    /// This requires that the `coretext` feature is enabled.
    pub fn hb_coretext_font_get_ct_font(font: *mut hb_font_t) -> CTFontRef;
}

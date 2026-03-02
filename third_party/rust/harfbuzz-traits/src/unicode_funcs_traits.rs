// Copyright 2023 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

/// A general category value. Equivalent to [`hb_unicode_general_category_t`].
///
/// [`hb_unicode_general_category_t`]: crate::sys::hb_unicode_general_category_t
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[allow(non_camel_case_types)] // the names are defined by Unicode
#[allow(missing_docs)] // the categories are defined by Unicode
pub enum GeneralCategory {
    Control = 0,
    Format = 1,
    Unassigned = 2,
    PrivateUse = 3,
    Surrogate = 4,
    LowercaseLetter = 5,
    ModifierLetter = 6,
    OtherLetter = 7,
    TitlecaseLetter = 8,
    UppercaseLetter = 9,
    SpacingMark = 10,
    EnclosingMark = 11,
    NonSpacingMark = 12,
    DecimalNumber = 13,
    LetterNumber = 14,
    OtherNumber = 15,
    ConnectPunctuation = 16,
    DashPunctuation = 17,
    ClosePunctuation = 18,
    FinalPunctuation = 19,
    InitialPunctuation = 20,
    OtherPunctuation = 21,
    OpenPunctuation = 22,
    CurrencySymbol = 23,
    ModifierSymbol = 24,
    MathSymbol = 25,
    OtherSymbol = 26,
    LineSeparator = 27,
    ParagraphSeparator = 28,
    SpaceSeparator = 29,
}

/// An object to map from code points to general category properties.
pub trait GeneralCategoryFunc {
    /// Given a code point, return the general category as a [`GeneralCategory`].
    fn general_category(&self, ch: char) -> GeneralCategory;
}

/// An object to map from code points to combining classes.
pub trait CombiningClassFunc {
    /// Given a code point, return the combining class as a `u8` corresponding to a
    /// [`hb_unicode_combining_class_t`]. Note that the
    /// [Unicode stability policy](https://www.unicode.org/policies/stability_policy.html)
    /// guarantees that Canonical Combining Class numeric values fit in a `u8`.
    ///
    /// [`hb_unicode_combining_class_t`]: crate::sys::hb_unicode_combining_class_t
    fn combining_class(&self, ch: char) -> u8;
}

/// An object to map from code points to mirrored code points.
pub trait MirroringFunc {
    /// Given a code point, return the mirrored code point.
    fn mirroring(&self, ch: char) -> char;
}

/// An object to map from code points to script names.
pub trait ScriptFunc {
    /// Given a code point, return the script as a 4-byte script name.
    fn script(&self, ch: char) -> [u8; 4];
}

/// An object to compose two characters.
pub trait ComposeFunc {
    /// Given two code points, return the composed code point.
    fn compose(&self, a: char, b: char) -> Option<char>;
}

/// An object to decompose a character.
pub trait DecomposeFunc {
    /// Given a code point, return the two decomposed code points.
    fn decompose(&self, ab: char) -> Option<(char, char)>;
}

// Copyright 2018 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::sys;

/// A language tag.
///
/// This corresponds to a [BCP 47] language tag.
///
/// This is a wrapper around the [`hb_language_t`] type from the
/// [`harfbuzz-sys`](crate::sys) crate.
///
/// [`hb_language_t`]: crate::sys::hb_language_t
/// [BCP 47]: https://tools.ietf.org/html/bcp47
#[derive(Copy, Clone, PartialEq, PartialOrd)]
pub struct Language {
    /// The underlying `hb_language_t` from the `harfbuzz-sys` crate.
    ///
    /// This isn't commonly needed unless interfacing directly with
    /// functions from the `harfbuzz-sys` crate that haven't been
    /// safely exposed.
    raw: sys::hb_language_t,
}

impl Language {
    /// Construct a `Language` from a string.
    ///
    /// The string should be a [BCP 47] language tag.
    ///
    /// Example:
    ///
    /// ```
    /// let lang = harfbuzz::Language::from_string("en-US");
    /// assert!(lang.is_valid());
    /// let lang = harfbuzz::Language::from_string("ja");
    /// assert!(lang.is_valid());
    /// let lang = harfbuzz::Language::from_string("zh-Hant");
    /// assert!(lang.is_valid());
    /// let lang = harfbuzz::Language::from_string("sr-Latn-RS");
    /// assert!(lang.is_valid());
    /// let lang = harfbuzz::Language::from_string("");
    /// assert!(!lang.is_valid());
    /// ```
    ///
    /// [BCP 47]: https://tools.ietf.org/html/bcp47
    pub fn from_string(lang: &str) -> Self {
        Language {
            raw: unsafe {
                sys::hb_language_from_string(
                    lang.as_ptr() as *const core::ffi::c_char,
                    lang.len() as core::ffi::c_int,
                )
            },
        }
    }

    /// Converts the language to a string.
    ///
    /// Example:
    /// ```
    /// let lang = harfbuzz::Language::from_string("en-US");
    /// assert_eq!(lang.to_string(), "en-us");
    /// ```
    pub fn to_string(&self) -> &str {
        unsafe { core::ffi::CStr::from_ptr(sys::hb_language_to_string(self.raw)) }
            .to_str()
            .unwrap()
    }

    /// Construct a `Language` from a raw pointer.
    ///
    /// # Safety
    ///
    /// The pointer must be a valid pointer.
    pub unsafe fn from_raw(raw: sys::hb_language_t) -> Self {
        Language { raw }
    }

    /// Convert the `Language` to a raw pointer.
    ///
    /// This is useful for interfacing with functions from the
    /// [`harfbuzz-sys`](crate::sys) crate that haven't been safely exposed.
    pub fn as_raw(self) -> sys::hb_language_t {
        self.raw
    }

    /// Returns the default language for the process locale.
    ///
    /// See [`hb_language_get_default()`] for more information.
    ///
    /// Example:
    ///
    /// ```
    /// let lang = harfbuzz::Language::get_process_default();
    /// assert!(lang.is_valid());
    /// ```
    ///
    /// [`hb_language_get_default()`]: https://harfbuzz.github.io/harfbuzz-hb-common.html#hb-language-get-default
    pub fn get_process_default() -> Self {
        Language {
            raw: unsafe { sys::hb_language_get_default() },
        }
    }

    /// Returns whether or not the language is valid.
    ///
    /// TODO: This should go away and the constructor should
    /// return an `Option<Language>`.
    pub fn is_valid(self) -> bool {
        !self.raw.is_null()
    }
}

impl core::fmt::Debug for Language {
    fn fmt(&self, fmt: &mut core::fmt::Formatter) -> core::fmt::Result {
        fmt.write_str(self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::Language;

    #[test]
    fn test_lookup() {
        let en = Language::from_string("en_US");
        assert!(en.is_valid());
    }
}

// Copyright 2018 The Servo Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::sys;
use crate::UnicodeFuncs;
use crate::{Direction, Language};

/// A series of Unicode characters.
///
/// ## Adding Text
///
/// Since in Rust, a value of type `&str` must contain valid UTF-8
/// text, adding text to a `Buffer` is simple:
///
/// ```
/// # use harfbuzz::Buffer;
/// let mut b = Buffer::new();
/// b.add_str("Hello World");
/// assert_eq!(b.is_empty(), false);
/// ```
///
/// or, more simply:
///
/// ```
/// # use harfbuzz::Buffer;
/// let b = Buffer::with("Hello World");
/// assert_eq!(b.is_empty(), false);
/// ```
///
/// ## Segment Properties
///
/// In addition to the text itself, there are three important properties
/// that influence how a piece of text is shaped:
///
/// * Direction: The direction in which the output glyphs flow. This is
///   typically left to right or right to left. This is controlled via
///   the [`Buffer::set_direction()`] method.
/// * Script: Script is crucial for choosing the proper shaping behaviour
///   for scripts that require it (e.g. Arabic) and the which OpenType
///   features defined in the font to be applied. This is controlled via
///   the [`Buffer::set_script()`] method.
/// * Language: Languages are crucial for selecting which OpenType feature
///   to apply to the buffer which can result in applying language-specific
///   behaviour. Languages are orthogonal to the scripts, and though they
///   are related, they are different concepts and should not be confused
///   with each other. This is controlled via the [`Buffer::set_language()`]
///   method.
///
/// Additionally, Harfbuzz can attempt to infer the values for these
/// properties using the [`Buffer::guess_segment_properties()`] method:
///
/// ```
/// # use harfbuzz::{Buffer, Direction, sys};
/// let mut b = Buffer::with("مساء الخير");
/// b.guess_segment_properties();
/// assert_eq!(b.get_direction(), Direction::RTL);
/// assert_eq!(b.get_script(), sys::HB_SCRIPT_ARABIC);
/// ```
pub struct Buffer {
    /// The underlying `hb_buffer_t` from the `harfbuzz-sys` crate.
    ///
    /// This isn't commonly needed unless interfacing directly with
    /// functions from the `harfbuzz-sys` crate that haven't been
    /// safely exposed.
    raw: *mut sys::hb_buffer_t,
}

impl Buffer {
    /// Create a new, empty buffer.
    ///
    /// ```
    /// # use harfbuzz::Buffer;
    /// let b = Buffer::new();
    /// assert!(b.is_empty());
    /// ```
    pub fn new() -> Self {
        Buffer::default()
    }

    /// Construct a `Buffer` from a raw pointer. Takes ownership of the buffer.
    ///
    /// # Safety
    ///
    /// The pointer must be valid and must not be used after this function is called.
    pub unsafe fn from_raw(raw: *mut sys::hb_buffer_t) -> Self {
        Buffer { raw }
    }

    /// Borrows a raw pointer to the buffer.
    pub fn as_ptr(&self) -> *mut sys::hb_buffer_t {
        self.raw
    }

    /// Gives up ownership and returns a raw pointer to the buffer.
    pub fn into_raw(self) -> *mut sys::hb_buffer_t {
        let raw = self.raw;
        core::mem::forget(self);
        raw
    }

    /// Create a new buffer with the given text.
    pub fn with(text: &str) -> Self {
        let mut b = Buffer::new();
        b.add_str(text);
        b
    }

    /// Create a new, empty buffer with the specified capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        let mut b = Buffer::default();
        b.reserve(capacity);
        b
    }

    /// Sets a [`UnicodeFuncs`] instance to use with this buffer.
    ///
    /// Note: `unicode_funcs` is reference counted by HarfBuzz.
    pub fn set_unicode_funcs(&mut self, unicode_funcs: &UnicodeFuncs) {
        unsafe { sys::hb_buffer_set_unicode_funcs(self.raw, unicode_funcs.as_ptr()) }
    }

    /// Add UTF-8 encoded text to the buffer.
    pub fn add_str(&mut self, text: &str) {
        unsafe {
            sys::hb_buffer_add_utf8(
                self.raw,
                text.as_ptr() as *const core::ffi::c_char,
                text.len() as core::ffi::c_int,
                0,
                text.len() as core::ffi::c_int,
            );
        };
    }

    /// Append part of the contents of another buffer to this one.
    ///
    /// ```
    /// # use harfbuzz::Buffer;
    /// let mut b1 = Buffer::with("butter");
    /// let b2 = Buffer::with("fly");
    /// b1.append(&b2, 0, 3);
    /// assert_eq!(b1.len(), "butterfly".len());
    /// ```
    pub fn append(&mut self, other: &Buffer, start: usize, end: usize) {
        unsafe {
            sys::hb_buffer_append(
                self.raw,
                other.raw,
                start as core::ffi::c_uint,
                end as core::ffi::c_uint,
            );
        };
    }

    /// Throw away text stored in the buffer, but maintain the
    /// currently configured Unicode functions and flags.
    ///
    /// Text, glyph info, and segment properties will be discarded.
    pub fn clear_contents(&mut self) {
        unsafe { sys::hb_buffer_clear_contents(self.raw) };
    }

    /// Throw away all data stored in the buffer as well as configuration
    /// parameters like Unicode functions, flags, and segment properties.
    pub fn reset(&mut self) {
        unsafe { sys::hb_buffer_reset(self.raw) };
    }

    /// Preallocate space to fit at least *size* number of items.
    ///
    /// FIXME: Does this correctly match the expected semantics?
    pub fn reserve(&mut self, size: usize) {
        unsafe { sys::hb_buffer_pre_allocate(self.raw, size as u32) };
    }

    /// Returns the number of elements in the buffer, also referred to as its 'length'.
    pub fn len(&self) -> usize {
        unsafe { sys::hb_buffer_get_length(self.raw) as usize }
    }

    /// Returns `true` if the buffer contains no data.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Sets unset buffer segment properties based on buffer Unicode
    /// contents.
    ///
    /// If buffer is not empty, it must have content type
    /// `HB_BUFFER_CONTENT_TYPE_UNICODE`.
    ///
    /// If buffer script is not set (ie. is `HB_SCRIPT_INVALID`), it will
    /// be set to the Unicode script of the first character in the buffer
    /// that has a script other than `HB_SCRIPT_COMMON`,
    /// `HB_SCRIPT_INHERITED`, and `HB_SCRIPT_UNKNOWN`.
    ///
    /// Next, if buffer direction is not set (ie. is [`Direction::Invalid`]),
    /// it will be set to the natural horizontal direction of the buffer
    /// script as returned by `hb_script_get_horizontal_direction()`.
    ///
    /// Finally, if buffer language is not set (ie. is `HB_LANGUAGE_INVALID`),
    /// it will be set to the process's default language as returned by
    /// [`Language::get_process_default()`]. This may change in the future by
    /// taking buffer script into consideration when choosing a language.
    ///
    /// ```
    /// # use harfbuzz::{Buffer, Direction, sys};
    /// let mut b = Buffer::with("Hello, world!");
    /// b.guess_segment_properties();
    /// assert_eq!(b.get_direction(), Direction::LTR);
    /// assert_eq!(b.get_script(), sys::HB_SCRIPT_LATIN);
    /// ```
    ///
    /// See also:
    ///
    /// * [`Buffer::get_direction`]
    /// * [`Buffer::set_direction`]
    /// * [`Buffer::get_script`]
    /// * [`Buffer::set_script`]
    /// * [`Buffer::get_language`]
    /// * [`Buffer::set_language`]
    pub fn guess_segment_properties(&mut self) {
        unsafe { sys::hb_buffer_guess_segment_properties(self.raw) };
    }

    /// Set the text flow direction of the buffer.
    ///
    /// No shaping can happen without setting buffer direction, and
    /// it controls the visual direction for the output glyphs; for
    /// RTL direction the glyphs will be reversed. Many layout features
    /// depend on the proper setting of the direction, for example,
    /// reversing RTL text before shaping, then shaping with LTR direction
    /// is not the same as keeping the text in logical order and shaping
    /// with RTL direction.
    ///
    /// See also:
    ///
    /// * [`Buffer::get_direction()`]
    /// * [`Buffer::guess_segment_properties()`]
    pub fn set_direction(&mut self, direction: Direction) {
        unsafe { sys::hb_buffer_set_direction(self.raw, direction.into()) };
    }

    /// Get the text flow direction for the buffer.
    ///
    /// See also:
    ///
    /// * [`Buffer::set_direction()`]
    pub fn get_direction(&self) -> Direction {
        (unsafe { sys::hb_buffer_get_direction(self.raw) }).into()
    }

    /// Sets the script of buffer to *script*.
    ///
    /// Script is crucial for choosing the proper shaping behaviour
    /// for scripts that require it (e.g. Arabic) and the which
    /// OpenType features defined in the font to be applied.
    ///
    /// See also:
    ///
    /// * [`Buffer::get_script()`]
    /// * [`Buffer::guess_segment_properties()`]
    pub fn set_script(&mut self, script: sys::hb_script_t) {
        unsafe { sys::hb_buffer_set_script(self.raw, script) };
    }

    /// Get the script for the buffer.
    ///
    /// See also:
    ///
    /// * [`Buffer::set_script()`]
    pub fn get_script(&self) -> sys::hb_script_t {
        unsafe { sys::hb_buffer_get_script(self.raw) }
    }

    /// Sets the language of buffer to *language*.
    ///
    /// Languages are crucial for selecting which OpenType feature
    /// to apply to the buffer which can result in applying
    /// language-specific behaviour. Languages are orthogonal to
    /// the scripts, and though they are related, they are different
    /// concepts and should not be confused with each other.
    ///
    /// See also:
    ///
    /// * [`Buffer::get_language()`]
    /// * [`Buffer::guess_segment_properties()`]
    pub fn set_language(&mut self, language: Language) {
        unsafe { sys::hb_buffer_set_language(self.raw, language.as_raw()) };
    }

    /// Get the language for the buffer.
    ///
    /// See also:
    ///
    /// * [`Buffer::set_language()`]
    pub fn get_language(&self) -> Language {
        unsafe { Language::from_raw(sys::hb_buffer_get_language(self.raw)) }
    }
}

impl core::fmt::Debug for Buffer {
    fn fmt(&self, fmt: &mut core::fmt::Formatter) -> core::fmt::Result {
        fmt.debug_struct("Buffer")
            .field("direction", &self.get_direction())
            .field("script", &self.get_script())
            .field("language", &self.get_language())
            .finish()
    }
}

impl Default for Buffer {
    /// Create a new, empty buffer.
    fn default() -> Self {
        Buffer {
            raw: unsafe { sys::hb_buffer_create() },
        }
    }
}

impl Drop for Buffer {
    fn drop(&mut self) {
        unsafe { sys::hb_buffer_destroy(self.raw) }
    }
}

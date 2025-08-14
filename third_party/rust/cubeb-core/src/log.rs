// Copyright © 2017-2018 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

use std::ffi::{c_char, CStr};
use std::sync::RwLock;
use {ffi, Error, Result};

/// Level (verbosity) of logging for a particular cubeb context.
#[derive(PartialEq, Eq, Clone, Debug, Copy, PartialOrd, Ord)]
pub enum LogLevel {
    /// Logging disabled
    Disabled,
    /// Logging lifetime operation (creation/destruction).
    Normal,
    /// Verbose logging of callbacks, can have performance implications.
    Verbose,
}

impl From<ffi::cubeb_log_level> for LogLevel {
    fn from(x: ffi::cubeb_log_level) -> Self {
        use LogLevel::*;
        match x {
            ffi::CUBEB_LOG_NORMAL => Normal,
            ffi::CUBEB_LOG_VERBOSE => Verbose,
            _ => Disabled,
        }
    }
}

impl From<LogLevel> for ffi::cubeb_log_level {
    fn from(x: LogLevel) -> Self {
        use LogLevel::*;
        match x {
            Normal => ffi::CUBEB_LOG_NORMAL,
            Verbose => ffi::CUBEB_LOG_VERBOSE,
            Disabled => ffi::CUBEB_LOG_DISABLED,
        }
    }
}

pub fn log_enabled() -> bool {
    unsafe { ffi::cubeb_log_get_level() != LogLevel::Disabled as _ }
}

static LOG_CALLBACK: RwLock<Option<fn(s: &CStr)>> = RwLock::new(None);

extern "C" {
    fn cubeb_write_log(fmt: *const c_char, ...);
}

/// # Safety
///
/// |s| must be null, or a pointer to a valid, nul-terminated, array of chars.
#[no_mangle]
pub unsafe extern "C" fn rust_write_formatted_msg(s: *const c_char) {
    if s.is_null() {
        // Do nothing if the pointer is null.
        return;
    }
    if let Ok(guard) = LOG_CALLBACK.read() {
        if let Some(f) = *guard {
            f(CStr::from_ptr(s));
        }
        // Do nothing if there is no callback.
    }
    // Silently fail if lock cannot be acquired.
}

pub fn set_logging(level: LogLevel, f: Option<fn(s: &CStr)>) -> Result<()> {
    match LOG_CALLBACK.write() {
        Ok(mut guard) => {
            *guard = f;
        }
        Err(_) => return Err(Error::Error),
    }
    unsafe {
        call!(ffi::cubeb_set_log_callback(
            level.into(),
            Some(cubeb_write_log)
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logging_disabled_by_default() {
        assert!(!log_enabled());
    }
}

// Copyright © 2017 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

use std::ffi::{CStr, CString};

/// A borrowed view of a proplist owned by PulseAudio (e.g. obtained from
/// a `pa_sink_info`). Does not free the underlying proplist.
#[derive(Debug)]
pub struct Proplist(*mut ffi::pa_proplist);

impl Proplist {
    pub fn gets<T>(&self, key: T) -> Option<&CStr>
    where
        T: Into<Vec<u8>>,
    {
        let key = match CString::new(key) {
            Ok(k) => k,
            _ => return None,
        };
        let r = unsafe { ffi::pa_proplist_gets(self.0, key.as_ptr()) };
        if r.is_null() {
            None
        } else {
            Some(unsafe { CStr::from_ptr(r) })
        }
    }
}

pub unsafe fn from_raw_ptr(raw: *mut ffi::pa_proplist) -> Proplist {
    Proplist(raw)
}

/// A proplist allocated and owned by us; freed on drop. Kept distinct from
/// the borrowed `Proplist` so an owned drop can never free a proplist that
/// PulseAudio owns.
#[derive(Debug)]
pub struct OwnedProplist(*mut ffi::pa_proplist);

impl OwnedProplist {
    pub fn new() -> Option<OwnedProplist> {
        let p = unsafe { ffi::pa_proplist_new() };
        if p.is_null() {
            None
        } else {
            Some(OwnedProplist(p))
        }
    }

    pub fn sets<K, V>(&mut self, key: K, value: V) -> bool
    where
        K: Into<Vec<u8>>,
        V: Into<Vec<u8>>,
    {
        let key = match CString::new(key) {
            Ok(k) => k,
            _ => return false,
        };
        let value = match CString::new(value) {
            Ok(v) => v,
            _ => return false,
        };
        0 == unsafe { ffi::pa_proplist_sets(self.0, key.as_ptr(), value.as_ptr()) }
    }

    pub fn as_ptr(&self) -> *mut ffi::pa_proplist {
        self.0
    }
}

impl Drop for OwnedProplist {
    fn drop(&mut self) {
        unsafe { ffi::pa_proplist_free(self.0) };
    }
}

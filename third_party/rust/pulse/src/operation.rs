// Copyright © 2017 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

#[derive(Debug)]
pub struct Operation(*mut ffi::pa_operation);

impl Operation {
    // See https://github.com/mozilla/cubeb-pulse-rs/issues/95
    #[allow(clippy::missing_safety_doc)]
    pub unsafe fn from_raw_ptr(raw: *mut ffi::pa_operation) -> Operation {
        Operation(raw)
    }

    pub fn cancel(&mut self) {
        unsafe {
            ffi::pa_operation_cancel(self.0);
        }
    }

    pub fn get_state(&self) -> ffi::pa_operation_state_t {
        unsafe { ffi::pa_operation_get_state(self.0) }
    }

    /// Release our reference without canceling.  PulseAudio holds its
    /// own ref on in-flight operations, so the operation will continue
    /// to run and deliver its callback.
    pub fn detach(self) {
        unsafe {
            ffi::pa_operation_unref(self.0);
        }
        std::mem::forget(self);
    }
}

impl Clone for Operation {
    fn clone(&self) -> Self {
        Operation(unsafe { ffi::pa_operation_ref(self.0) })
    }
}

impl Drop for Operation {
    fn drop(&mut self) {
        if self.get_state() == ffi::PA_OPERATION_RUNNING {
            self.cancel();
        }
        unsafe {
            ffi::pa_operation_unref(self.0);
        }
    }
}

pub unsafe fn from_raw_ptr(raw: *mut ffi::pa_operation) -> Operation {
    Operation::from_raw_ptr(raw)
}

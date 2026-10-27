// Copyright © 2017 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

use crate::mainloop_api;
use crate::ErrorCode;
use crate::Result;
use mainloop_api::MainloopApi;

#[derive(Debug)]
pub struct ThreadedMainloop(*mut ffi::pa_threaded_mainloop);

#[derive(Debug)]
#[must_use = "the mainloop guard unlocks on drop"]
/// Guard returned by [`ThreadedMainloop::lock_guard`] and
/// [`ThreadedMainloop::lock_guard_if_needed`].
///
/// This guard must stay on the thread that created it.
///
/// ```compile_fail
/// fn require_send<T: Send>() {}
///
/// require_send::<pulse::MainloopLockGuard<'static>>();
/// ```
///
/// ```compile_fail
/// fn require_sync<T: Sync>() {}
///
/// require_sync::<pulse::MainloopLockGuard<'static>>();
/// ```
pub struct MainloopLockGuard<'a> {
    mainloop: &'a ThreadedMainloop,
    locked: bool,
}

impl Drop for MainloopLockGuard<'_> {
    fn drop(&mut self) {
        if self.locked {
            self.mainloop.unlock();
        }
    }
}

impl ThreadedMainloop {
    // see https://github.com/mozilla/cubeb-pulse-rs/issues/95
    #[allow(clippy::missing_safety_doc)]
    pub unsafe fn from_raw_ptr(raw: *mut ffi::pa_threaded_mainloop) -> Self {
        ThreadedMainloop(raw)
    }

    pub fn new() -> Self {
        unsafe { ThreadedMainloop::from_raw_ptr(ffi::pa_threaded_mainloop_new()) }
    }

    // see https://github.com/mozilla/cubeb-pulse-rs/issues/95
    #[allow(clippy::mut_from_ref)]
    pub fn raw_mut(&self) -> &mut ffi::pa_threaded_mainloop {
        unsafe { &mut *self.0 }
    }

    pub fn is_null(&self) -> bool {
        self.0.is_null()
    }

    pub fn start(&self) -> Result<()> {
        match unsafe { ffi::pa_threaded_mainloop_start(self.raw_mut()) } {
            0 => Ok(()),
            _ => Err(ErrorCode::from_error_code(ffi::PA_ERR_UNKNOWN)),
        }
    }

    pub fn stop(&self) {
        unsafe {
            ffi::pa_threaded_mainloop_stop(self.raw_mut());
        }
    }

    fn lock(&self) {
        unsafe {
            ffi::pa_threaded_mainloop_lock(self.raw_mut());
        }
    }

    fn unlock(&self) {
        unsafe {
            ffi::pa_threaded_mainloop_unlock(self.raw_mut());
        }
    }

    pub fn lock_guard(&self) -> MainloopLockGuard<'_> {
        self.lock();
        MainloopLockGuard {
            mainloop: self,
            locked: true,
        }
    }

    pub fn lock_guard_if_needed(&self) -> MainloopLockGuard<'_> {
        let locked = !self.in_thread();
        if locked {
            self.lock();
        }
        MainloopLockGuard {
            mainloop: self,
            locked,
        }
    }

    pub fn wait(&self) {
        unsafe {
            ffi::pa_threaded_mainloop_wait(self.raw_mut());
        }
    }

    pub fn signal(&self) {
        unsafe {
            ffi::pa_threaded_mainloop_signal(self.raw_mut(), 0);
        }
    }

    pub fn get_api(&self) -> MainloopApi {
        unsafe { mainloop_api::from_raw_ptr(ffi::pa_threaded_mainloop_get_api(self.raw_mut())) }
    }

    fn in_thread(&self) -> bool {
        unsafe { ffi::pa_threaded_mainloop_in_thread(self.raw_mut()) != 0 }
    }
}

impl ::std::default::Default for ThreadedMainloop {
    fn default() -> Self {
        ThreadedMainloop(::std::ptr::null_mut())
    }
}

impl ::std::ops::Drop for ThreadedMainloop {
    fn drop(&mut self) {
        if !self.is_null() {
            unsafe {
                ffi::pa_threaded_mainloop_free(self.raw_mut());
            }
        }
    }
}

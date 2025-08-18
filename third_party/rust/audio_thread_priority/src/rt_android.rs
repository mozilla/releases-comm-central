/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate libc;
use crate::AudioThreadPriorityError;
use std::convert::TryInto;

// https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/os/Process.java#474
const THREAD_PRIORITY_URGENT_AUDIO: libc::c_int = -19;

#[derive(Debug)]
pub struct RtPriorityHandleInternal {
    previous_priority: libc::c_int,
}

pub fn promote_current_thread_to_real_time_internal(
    _: u32,
    _: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    // Android's Process.setThreadPriority() ultimately calls setpriority().
    // See https://android.googlesource.com/platform/frameworks/base/+/master/core/jni/android_util_Process.cpp#543
    // and https://android.googlesource.com/platform/system/core/+/master/libutils/Threads.cpp#312

    // Per https://github.com/android/ndk/issues/1255
    // and https://android.googlesource.com/platform/bionic/+/master/libc/include/pthread.h#388,
    // it's acceptable to call setpriority() directly for native threads.

    let who = unsafe { libc::gettid().try_into().unwrap() };

    unsafe { (*libc::__errno()) = 0 };
    let previous_priority = unsafe { libc::getpriority(libc::PRIO_PROCESS, who) };
    if previous_priority == -1 && unsafe { *libc::__errno() } != 0 {
        return Err(AudioThreadPriorityError::new(
            "Failed to get current thread priority",
        ));
    }

    let r = unsafe { libc::setpriority(libc::PRIO_PROCESS, who, THREAD_PRIORITY_URGENT_AUDIO) };
    if r < 0 {
        return Err(AudioThreadPriorityError::new(
            "Failed to set current thread priority",
        ));
    }

    Ok(RtPriorityHandleInternal { previous_priority })
}

pub fn demote_current_thread_from_real_time_internal(
    h: RtPriorityHandleInternal,
) -> Result<(), AudioThreadPriorityError> {
    let who = unsafe { libc::gettid().try_into().unwrap() };
    let r = unsafe { libc::setpriority(libc::PRIO_PROCESS, who, h.previous_priority) };
    if r < 0 {
        return Err(AudioThreadPriorityError::new(
            "Failed to demote thread priority",
        ));
    }
    Ok(())
}

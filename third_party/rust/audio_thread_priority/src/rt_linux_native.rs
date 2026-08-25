/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Native Linux real-time promotion, used when the crate is built without the `dbus` feature.
//!
//! Instead of asking rtkit over D-Bus, this promotes the thread directly with
//! `pthread_setschedparam(SCHED_FIFO)`. It needs no D-Bus and no rtkit daemon, and works whenever
//! the process is allowed to request real-time scheduling: running as root, holding `CAP_SYS_NICE`,
//! or with an `RLIMIT_RTPRIO` limit configured (e.g. systemd `LimitRTPRIO` or
//! `/etc/security/limits.conf`). This is the mechanism JACK and PipeWire's direct mode use.

extern crate libc;

use std::convert::TryFrom;
use std::io::Error as OSError;
use std::sync::atomic::{AtomicU8, Ordering};

use crate::AudioThreadPriorityError;

/// Default real-time priority to request, unless overridden with [`set_rt_priority`]. Matches the
/// value the rtkit path already asks for.
const RT_PRIO_DEFAULT: libc::c_int = 10;

/// The real-time priority to request, or 0 to use `RT_PRIO_DEFAULT`. Set via [`set_rt_priority`].
static RT_PRIORITY: AtomicU8 = AtomicU8::new(0);

/// Set the real-time priority (1-99) to request when promoting a thread, overriding the default of
/// 10. Pass `None` to restore the default. Values outside 1-99 are ignored with a warning.
///
/// This is entirely optional: if never called, promotion uses priority 10, the value the rtkit path
/// requests. It is specific to the Linux build without the `dbus` feature; set it before promoting.
pub fn set_rt_priority(priority: Option<u8>) {
    match priority {
        Some(priority) if (1..=99).contains(&priority) => {
            RT_PRIORITY.store(priority, Ordering::Relaxed)
        }
        Some(priority) => {
            log::warn!("Ignoring invalid real-time priority {priority}, expected an integer 1-99")
        }
        None => RT_PRIORITY.store(0, Ordering::Relaxed),
    }
}

/// The real-time priority to request: the value set via [`set_rt_priority`], or the default.
fn requested_priority() -> libc::c_int {
    match RT_PRIORITY.load(Ordering::Relaxed) {
        0 => RT_PRIO_DEFAULT,
        priority => priority as libc::c_int,
    }
}

/// Prevents threads/processes forked from a real-time thread from inheriting real-time scheduling.
/// Not exposed by libc: <https://github.com/rust-lang/libc/issues/1511>
const SCHED_RESET_ON_FORK: libc::c_int = 0x4000_0000;

// This is different from libc::pid_t, which is 32 bits, and is defined in sys/types.h.
#[allow(non_camel_case_types)]
type kernel_pid_t = libc::c_long;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct RtPriorityThreadInfoInternal {
    /// System-wide thread id (tid), used to promote a thread by id.
    thread_id: kernel_pid_t,
    /// Process-local thread id, used to restore scheduler characteristics.
    pthread_id: libc::pthread_t,
    /// The PID of the process containing `thread_id`.
    pid: libc::pid_t,
    /// The scheduling policy in place before promotion, to restore on demotion.
    policy: libc::c_int,
    /// The scheduling priority in place before promotion, to restore on demotion.
    priority: libc::c_int,
}

impl RtPriorityThreadInfoInternal {
    /// Serialize to a byte buffer. The fields are packed explicitly rather than transmuting the
    /// struct, so no uninitialized padding bytes are ever read. Any trailing padding stays zero.
    pub fn serialize(&self) -> [u8; std::mem::size_of::<Self>()] {
        let thread_id = self.thread_id.to_ne_bytes();
        let pthread_id = self.pthread_id.to_ne_bytes();
        let pid = self.pid.to_ne_bytes();
        let policy = self.policy.to_ne_bytes();
        let priority = self.priority.to_ne_bytes();

        let mut bytes = [0u8; std::mem::size_of::<Self>()];
        let fields = thread_id
            .iter()
            .chain(&pthread_id)
            .chain(&pid)
            .chain(&policy)
            .chain(&priority);
        for (dst, &src) in bytes.iter_mut().zip(fields) {
            *dst = src;
        }
        bytes
    }
    /// Reconstruct from a byte buffer produced by `serialize`.
    pub fn deserialize(bytes: [u8; std::mem::size_of::<Self>()]) -> Self {
        fn take<const N: usize>(src: &mut impl Iterator<Item = u8>) -> [u8; N] {
            let mut chunk = [0u8; N];
            for slot in &mut chunk {
                *slot = src.next().unwrap();
            }
            chunk
        }
        let mut src = bytes.iter().copied();
        RtPriorityThreadInfoInternal {
            thread_id: kernel_pid_t::from_ne_bytes(take(&mut src)),
            pthread_id: libc::pthread_t::from_ne_bytes(take(&mut src)),
            pid: libc::pid_t::from_ne_bytes(take(&mut src)),
            policy: libc::c_int::from_ne_bytes(take(&mut src)),
            priority: libc::c_int::from_ne_bytes(take(&mut src)),
        }
    }
    /// Returns the PID of the process containing the thread.
    pub fn pid(&self) -> libc::pid_t {
        self.pid
    }
}

impl PartialEq for RtPriorityThreadInfoInternal {
    fn eq(&self, other: &Self) -> bool {
        self.thread_id == other.thread_id && self.pthread_id == other.pthread_id
    }
}

pub struct RtPriorityHandleInternal {
    thread_info: RtPriorityThreadInfoInternal,
}

/// The POSIX `pthread_*` functions return the error number directly and do not set `errno`, so the
/// return code must be converted with `Error::from_raw_os_error`, not read via `last_os_error`.
fn pthread_error(context: &str, rc: libc::c_int) -> AudioThreadPriorityError {
    AudioThreadPriorityError::new(&format!("{}: {}", context, OSError::from_raw_os_error(rc)))
}

/// The `sched_*` functions are thin syscall wrappers: they return -1 and set `errno`.
fn sched_error(context: &str) -> AudioThreadPriorityError {
    AudioThreadPriorityError::new(&format!("{}: {}", context, OSError::last_os_error()))
}

/// A thread's system-wide tid narrowed to `pid_t` for the scheduler syscalls. A tid always fits in
/// `pid_t` (it is a pid), but convert defensively rather than truncating.
fn scheduler_tid(thread_id: kernel_pid_t) -> Result<libc::pid_t, AudioThreadPriorityError> {
    libc::pid_t::try_from(thread_id)
        .map_err(|_| AudioThreadPriorityError::new("thread id does not fit in pid_t"))
}

/// Get the current thread information, capturing enough to promote or demote it later, possibly from
/// another process. The thread is identified by its system-wide tid, so a suitably privileged
/// process can promote it via `promote_thread_to_real_time_internal`. This mirrors the rtkit path,
/// except the native path changes the scheduler directly instead of delegating to the rtkit daemon.
pub fn get_current_thread_info_internal(
) -> Result<RtPriorityThreadInfoInternal, AudioThreadPriorityError> {
    let thread_id = unsafe { libc::syscall(libc::SYS_gettid) };
    let pthread_id = unsafe { libc::pthread_self() };
    let pid = unsafe { libc::getpid() };
    let mut policy = 0;
    let mut param = unsafe { std::mem::zeroed::<libc::sched_param>() };

    let rc = unsafe { libc::pthread_getschedparam(pthread_id, &mut policy, &mut param) };
    if rc != 0 {
        return Err(pthread_error("pthread_getschedparam", rc));
    }

    Ok(RtPriorityThreadInfoInternal {
        thread_id,
        pthread_id,
        pid,
        policy,
        priority: param.sched_priority,
    })
}

/// Promote the calling thread to real-time priority using `SCHED_FIFO`.
///
/// The buffer size and sample rate are unused here (they matter only for the rtkit path, which
/// derives an `RLIMIT_RTTIME` budget from them); the signature is kept to match the other backends.
pub fn promote_current_thread_to_real_time_internal(
    _audio_buffer_frames: u32,
    _audio_samplerate_hz: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    let thread_info = get_current_thread_info_internal()?;

    let mut param = unsafe { std::mem::zeroed::<libc::sched_param>() };
    param.sched_priority = requested_priority();

    let rc = unsafe {
        libc::pthread_setschedparam(
            thread_info.pthread_id,
            libc::SCHED_FIFO | SCHED_RESET_ON_FORK,
            &param,
        )
    };
    if rc != 0 {
        return Err(pthread_error("could not promote thread", rc));
    }

    Ok(RtPriorityHandleInternal { thread_info })
}

/// Restore the calling thread to the scheduling policy it had before promotion.
pub fn demote_current_thread_from_real_time_internal(
    rt_priority_handle: RtPriorityHandleInternal,
) -> Result<(), AudioThreadPriorityError> {
    let RtPriorityThreadInfoInternal {
        pthread_id,
        policy,
        priority,
        ..
    } = rt_priority_handle.thread_info;

    // Keep SCHED_RESET_ON_FORK set: the kernel forbids an unprivileged thread from clearing that
    // flag once set (and promotion set it), so restoring the bare saved policy would fail with
    // EPERM. The flag is harmless on a non-real-time thread.
    let mut param = unsafe { std::mem::zeroed::<libc::sched_param>() };
    param.sched_priority = priority;
    let rc =
        unsafe { libc::pthread_setschedparam(pthread_id, policy | SCHED_RESET_ON_FORK, &param) };
    if rc != 0 {
        return Err(pthread_error("could not demote thread", rc));
    }
    Ok(())
}

/// Promote a thread identified by its tid to real-time priority. Promoting a thread other than the
/// caller (in particular in another process) requires the caller to be privileged.
pub fn promote_thread_to_real_time_internal(
    thread_info: RtPriorityThreadInfoInternal,
    _audio_buffer_frames: u32,
    _audio_samplerate_hz: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    let tid = scheduler_tid(thread_info.thread_id)?;

    let mut param = unsafe { std::mem::zeroed::<libc::sched_param>() };
    param.sched_priority = requested_priority();

    let rc =
        unsafe { libc::sched_setscheduler(tid, libc::SCHED_FIFO | SCHED_RESET_ON_FORK, &param) };
    if rc < 0 {
        return Err(sched_error("could not promote thread"));
    }

    Ok(RtPriorityHandleInternal { thread_info })
}

/// Restore a thread identified by its tid to the scheduling policy it had before promotion.
pub fn demote_thread_from_real_time_internal(
    thread_info: RtPriorityThreadInfoInternal,
) -> Result<(), AudioThreadPriorityError> {
    // Keep SCHED_RESET_ON_FORK set (see demote_current_thread_from_real_time_internal): clearing it
    // as an unprivileged thread would fail with EPERM.
    let tid = scheduler_tid(thread_info.thread_id)?;
    let mut param = unsafe { std::mem::zeroed::<libc::sched_param>() };
    param.sched_priority = thread_info.priority;
    let rc =
        unsafe { libc::sched_setscheduler(tid, thread_info.policy | SCHED_RESET_ON_FORK, &param) };
    if rc < 0 {
        return Err(sched_error("could not demote thread"));
    }
    Ok(())
}

/// Setting an `RLIMIT_RTTIME` budget is only needed by the rtkit path. The native path relies on
/// the kernel's real-time throttling (`sched_rt_runtime_us`) instead, so this is a no-op.
pub fn set_real_time_hard_limit_internal(
    _audio_buffer_frames: u32,
    _audio_samplerate_hz: u32,
) -> Result<(), AudioThreadPriorityError> {
    Ok(())
}

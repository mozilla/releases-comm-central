use crate::AudioThreadPriorityError;
use libc::{pthread_mach_thread_np, pthread_self, thread_policy_t};
use log::info;
use mach2::boolean::boolean_t;
use mach2::kern_return::{kern_return_t, KERN_SUCCESS};
use mach2::mach_time::{mach_timebase_info, mach_timebase_info_data_t};
use mach2::message::mach_msg_type_number_t;
use mach2::port::mach_port_t;
use mach2::thread_policy::{
    thread_policy_get, thread_policy_set, thread_time_constraint_policy_data_t,
    THREAD_TIME_CONSTRAINT_POLICY, THREAD_TIME_CONSTRAINT_POLICY_COUNT,
};

#[derive(Debug)]
pub struct RtPriorityHandleInternal {
    tid: mach_port_t,
    previous_time_constraint_policy: thread_time_constraint_policy_data_t,
}

impl Default for RtPriorityHandleInternal {
    fn default() -> Self {
        Self::new()
    }
}

impl RtPriorityHandleInternal {
    pub fn new() -> RtPriorityHandleInternal {
        RtPriorityHandleInternal {
            tid: 0,
            previous_time_constraint_policy: thread_time_constraint_policy_data_t {
                period: 0,
                computation: 0,
                constraint: 0,
                preemptible: 0,
            },
        }
    }
}

pub fn demote_current_thread_from_real_time_internal(
    rt_priority_handle: RtPriorityHandleInternal,
) -> Result<(), AudioThreadPriorityError> {
    unsafe {
        let mut h = rt_priority_handle;
        let rv: kern_return_t = thread_policy_set(
            h.tid,
            THREAD_TIME_CONSTRAINT_POLICY,
            (&mut h.previous_time_constraint_policy) as *mut _ as thread_policy_t,
            THREAD_TIME_CONSTRAINT_POLICY_COUNT,
        );
        if rv != KERN_SUCCESS {
            return Err(AudioThreadPriorityError::new(
                "thread demotion error: thread_policy_get: RT",
            ));
        }

        info!("thread {} priority restored.", h.tid);
    }

    Ok(())
}

pub fn promote_current_thread_to_real_time_internal(
    audio_buffer_frames: u32,
    audio_samplerate_hz: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    let mut rt_priority_handle = RtPriorityHandleInternal::new();

    let buffer_frames = if audio_buffer_frames > 0 {
        audio_buffer_frames
    } else {
        audio_samplerate_hz / 20
    };

    unsafe {
        let tid: mach_port_t = pthread_mach_thread_np(pthread_self());
        let mut time_constraints = thread_time_constraint_policy_data_t {
            period: 0,
            computation: 0,
            constraint: 0,
            preemptible: 0,
        };

        // Get current thread attributes, to revert back to the correct setting later if needed.
        rt_priority_handle.tid = tid;

        // false: we want to get the current value, not the default value. If this is `false` after
        // returning, it means there are no current settings because of other factor, and the
        // default was returned instead.
        let mut get_default: boolean_t = 0;
        let mut count: mach_msg_type_number_t = THREAD_TIME_CONSTRAINT_POLICY_COUNT;
        let mut rv: kern_return_t = thread_policy_get(
            tid,
            THREAD_TIME_CONSTRAINT_POLICY,
            (&mut time_constraints) as *mut _ as thread_policy_t,
            &mut count,
            &mut get_default,
        );

        if rv != KERN_SUCCESS {
            return Err(AudioThreadPriorityError::new(
                "thread promotion error: thread_policy_get: time_constraint",
            ));
        }

        rt_priority_handle.previous_time_constraint_policy = time_constraints;

        let mut timebase_info = mach_timebase_info_data_t { denom: 0, numer: 0 };
        mach_timebase_info(&mut timebase_info);

        let ms2abs: f32 = ((timebase_info.denom as f32) / timebase_info.numer as f32) * 1000000.;

        // The time constraint calculations are somewhat arbitrary for now.
        let cb_duration = buffer_frames as f32 / (audio_samplerate_hz as f32) * 1000.;

        // Computation time is half of constraint, per macOS 12 behaviour.  And capped at 50ms per macOS limits:
        // https://github.com/apple-oss-distributions/xnu/blob/e3723e1f17661b24996789d8afc084c0c3303b26/osfmk/kern/thread_policy.c#L408
        // https://github.com/apple-oss-distributions/xnu/blob/e3723e1f17661b24996789d8afc084c0c3303b26/osfmk/kern/sched_prim.c#L822
        const MAX_RT_QUANTUM: f32 = 50.0;
        let computation = cb_duration / 2.0;
        let computation = if computation > MAX_RT_QUANTUM {
            info!(
                "thread computation time capped at {MAX_RT_QUANTUM}ms ({computation}ms requested)."
            );
            MAX_RT_QUANTUM
        } else {
            computation
        };

        time_constraints = thread_time_constraint_policy_data_t {
            period: (cb_duration * ms2abs) as u32,
            computation: (computation * ms2abs) as u32,
            constraint: (cb_duration * ms2abs) as u32,
            preemptible: 1, // true
        };

        rv = thread_policy_set(
            tid,
            THREAD_TIME_CONSTRAINT_POLICY,
            (&mut time_constraints) as *mut _ as thread_policy_t,
            THREAD_TIME_CONSTRAINT_POLICY_COUNT,
        );
        if rv != KERN_SUCCESS {
            return Err(AudioThreadPriorityError::new(
                "thread promotion error: thread_policy_set: time_constraint",
            ));
        }

        info!("thread {tid} bumped to real time priority.");
    }

    Ok(rt_priority_handle)
}

//! Timestamp implementation for Windows 10+ or Windows Server 2016+.
//!
//! Lower versions don't have the necessary API and should use the fallback.

#![cfg(feature = "win10plus")]

use winapi::um::realtimeapiset::QueryUnbiasedInterruptTime;
use winapi::um::winnt::PULONGLONG;

// Link against Windows' `mincore`.
#[link(name = "mincore")]
extern "system" {
    /// Gets the current interrupt-time count.
    ///
    /// See [`QueryInterruptTime`].
    ///
    /// [`QueryInterruptTime`]: https://docs.microsoft.com/en-us/windows/win32/api/realtimeapiset/nf-realtimeapiset-queryinterrupttime
    ///
    /// Note: we define it ourselves, because it's not actually included in `winapi`.
    fn QueryInterruptTime(InterruptTime: PULONGLONG);
}

/// Windows counts time in a system time unit of 100 nanoseconds.
const SYSTEM_TIME_UNIT: u64 = 100;

/// The time based on the current interrupt-time count.
/// This includes the suspend time.
///
/// See [`QueryInterruptTime`].
///
/// [`QueryInterruptTime`]: https://docs.microsoft.com/en-us/windows/win32/api/realtimeapiset/nf-realtimeapiset-queryinterrupttime
pub fn now_including_suspend() -> u64 {
    let mut interrupt_time = 0;
    unsafe {
        QueryInterruptTime(&mut interrupt_time);
    }

    interrupt_time * SYSTEM_TIME_UNIT
}

pub fn now_awake() -> u64 {
    let mut interrupt_time = 0;
    unsafe {
        assert!(QueryUnbiasedInterruptTime(&mut interrupt_time) != 0);
    }

    interrupt_time * SYSTEM_TIME_UNIT
}

use libc::clockid_t;

extern "C" {
    fn clock_gettime_nsec_np(clock_id: clockid_t) -> u64;
}

const CLOCK_MONOTONIC_RAW: clockid_t = 4;
const CLOCK_UPTIME_RAW: clockid_t = 8;

/// The time from a clock that increments monotonically,
/// tracking the time since an arbitrary point.
///
/// See [`clock_gettime_nsec_np`].
///
/// [`clock_gettime_nsec_np`]: https://opensource.apple.com/source/Libc/Libc-1158.1.2/gen/clock_gettime.3.auto.html
pub fn now_including_suspend() -> u64 {
    unsafe { clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW) }
}

/// The time from a clock that increments monotonically,
/// in the same manner as CLOCK_MONOTONIC_RAW,
/// but that does not increment while the system is asleep.
///
/// See `clock_gettime_nsec_np`.
pub fn now_awake() -> u64 {
    unsafe { clock_gettime_nsec_np(CLOCK_UPTIME_RAW) }
}

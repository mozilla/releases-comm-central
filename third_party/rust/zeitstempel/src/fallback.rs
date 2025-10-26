use std::convert::TryInto;
use std::time::Instant;

use once_cell::sync::Lazy;

static INIT_TIME: Lazy<Instant> = Lazy::new(Instant::now);

pub fn now_including_suspend() -> u64 {
    // This fallback is not used on Windows, though it would be still correct, as it uses [QueryPerformanceCounter] under the hood
    // [QueryPerformanceCounter]: https://docs.microsoft.com/en-us/windows/win32/api/profileapi/nf-profileapi-queryperformancecounter
    //
    // This fallback is not used on Linux, where it maps to `CLOCK_MONOTONIC`, which does NOT
    // include suspend time. But we don't use it there, so no problem.
    //
    // This fallback is not used on macOS, where it maps to `mach_absolute_time`, which does NOT
    // include suspend time. But we don't use it there, so no problem.
    //
    // For other operating systems we make no guarantees, other than that we won't panic.
    let now = Instant::now();
    now.checked_duration_since(*INIT_TIME)
        .and_then(|diff| diff.as_nanos().try_into().ok())
        .unwrap_or(0)
}

pub fn now_awake() -> u64 {
    // This fallback is not used on Windows, and there it probably is wrong because it includes suspend time.
    //
    // This fallback is not used on Linux, though it would still be correct, as it maps to `CLOCK_MONOTONIC`, which does NOT
    // include suspend time.
    //
    // This fallback is not used on macOS, though it would still be correct, as it maps to `mach_absolute_time`, which does NOT
    // include suspend time. But we don't use it there, so no problem.
    //
    // For other operating systems we make no guarantees, other than that we won't panic.
    let now = Instant::now();
    now.checked_duration_since(*INIT_TIME)
        .and_then(|diff| diff.as_nanos().try_into().ok())
        .unwrap_or(0)
}

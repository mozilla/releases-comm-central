//! Timestamp implementation for Windows based on `QueryPerformanceCounter`

use std::mem;
use std::sync::OnceLock;

use winapi::um::profileapi::{QueryPerformanceCounter, QueryPerformanceFrequency};
use winapi::um::realtimeapiset::QueryUnbiasedInterruptTime;
use winapi::um::winnt::LARGE_INTEGER;

/// Windows counts time in a system time unit of 100 nanoseconds.
const SYSTEM_TIME_UNIT: u64 = 100;

fn i64_to_large_integer(i: i64) -> LARGE_INTEGER {
    unsafe {
        let mut large_integer: LARGE_INTEGER = mem::zeroed();
        *large_integer.QuadPart_mut() = i;
        large_integer
    }
}

fn large_integer_to_i64(l: LARGE_INTEGER) -> i64 {
    unsafe { *l.QuadPart() }
}

fn frequency() -> i64 {
    static FREQUENCY: OnceLock<i64> = OnceLock::new();

    *FREQUENCY.get_or_init(|| unsafe {
        let mut l = i64_to_large_integer(0);
        QueryPerformanceFrequency(&mut l);
        large_integer_to_i64(l)
    })
}

// Computes (value*numer)/denom without overflow, as long as both
// (numer*denom) and the overall result fit into i64 (which is the case
// for our time conversions).
fn mul_div_i64(value: i64, numer: i64, denom: i64) -> i64 {
    let q = value / denom;
    let r = value % denom;
    // Decompose value as (value/denom*denom + value%denom),
    // substitute into (value*numer)/denom and simplify.
    // r < denom, so (denom*numer) is the upper bound of (r*numer)
    q * numer + r * numer / denom
}

/// The time based on [`QueryPerformanceCounter`].
/// This includes the suspend time.
///
/// [QueryPerformanceCounter]: https://docs.microsoft.com/en-us/windows/win32/api/profileapi/nf-profileapi-queryperformancecounter
pub fn now_including_suspend() -> u64 {
    let mut ticks = i64_to_large_integer(0);
    unsafe {
        assert!(QueryPerformanceCounter(&mut ticks) != 0);
    }
    mul_div_i64(large_integer_to_i64(ticks), 1000000000, frequency()) as u64
}

pub fn now_awake() -> u64 {
    let mut interrupt_time = 0;
    unsafe {
        assert!(QueryUnbiasedInterruptTime(&mut interrupt_time) != 0);
    }

    interrupt_time * SYSTEM_TIME_UNIT
}

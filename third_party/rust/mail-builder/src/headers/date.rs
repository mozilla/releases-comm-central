/*
 * Copyright Stalwart Labs Ltd. See the COPYING
 * file at the top-level directory of this distribution.
 *
 * Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
 * https://www.apache.org/licenses/LICENSE-2.0> or the MIT license
 * <LICENSE-MIT or https://opensource.org/licenses/MIT>, at your
 * option. This file may not be copied, modified, or distributed
 * except according to those terms.
 */

use std::{
    io::{self, Write},
    time::SystemTime,
};

pub static DOW: &[&str] = &["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
pub static MONTH: &[&str] = &[
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

use super::Header;

/// RFC5322 Date header
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Date {
    pub date: i64,
}

impl Date {
    /// Create a new Date header from a timestamp.
    pub fn new(date: i64) -> Self {
        Self { date }
    }

    /// Create a new Date header using the current time.
    pub fn now() -> Self {
        Self {
            date: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0) as i64,
        }
    }

    /// Returns an RFC822 date.
    pub fn to_rfc822(&self) -> String {
        // Ported from http://howardhinnant.github.io/date_algorithms.html#civil_from_days
        let (z, seconds) = ((self.date / 86400) + 719468, self.date % 86400);
        let era: i64 = (if z >= 0 { z } else { z - 146096 }) / 146097;
        let doe: u64 = (z - era * 146097) as u64; // [0, 146096]
        let yoe: u64 = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
        let y: i64 = (yoe as i64) + era * 400;
        let doy: u64 = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
        let mp = (5 * doy + 2) / 153; // [0, 11]
        let d: u64 = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
        let m: u64 = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
        let (h, mn, s) = (seconds / 3600, (seconds / 60) % 60, seconds % 60);

        format!(
            "{}, {} {} {:04} {:02}:{:02}:{:02} +0000", //{}{:02}{:02}",
            DOW[(((self.date as f64 / 86400.0).floor() as i64 + 4).rem_euclid(7)) as usize],
            d,
            MONTH.get(m.saturating_sub(1) as usize).unwrap_or(&""),
            (y + i64::from(m <= 2)),
            h,
            mn,
            s,
            /*if self.tz_before_gmt && (self.tz_hour > 0 || self.tz_minute > 0) {
                "-"
            } else {
                "+"
            },
            self.tz_hour,
            self.tz_minute*/
        )
    }
}

impl From<i64> for Date {
    fn from(datetime: i64) -> Self {
        Date::new(datetime)
    }
}

impl From<u64> for Date {
    fn from(datetime: u64) -> Self {
        Date::new(datetime as i64)
    }
}

impl Header for Date {
    fn write_header(&self, mut output: impl Write, _bytes_written: usize) -> io::Result<usize> {
        output.write_all(self.to_rfc822().as_bytes())?;
        output.write_all(b"\r\n")?;
        Ok(0)
    }
}

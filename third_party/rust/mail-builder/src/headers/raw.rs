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

use std::borrow::Cow;

use super::Header;

/// Raw e-mail header.
/// Raw headers are not encoded, only line-wrapped.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Raw<'x> {
    pub raw: Cow<'x, str>,
}

impl<'x> Raw<'x> {
    /// Create a new raw header
    pub fn new(raw: impl Into<Cow<'x, str>>) -> Self {
        Self { raw: raw.into() }
    }
}

impl<'x, T> From<T> for Raw<'x>
where
    T: Into<Cow<'x, str>>,
{
    fn from(value: T) -> Self {
        Self::new(value)
    }
}

impl<'x> Header for Raw<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        for (pos, &ch) in self.raw.as_bytes().iter().enumerate() {
            if bytes_written >= 76 && ch.is_ascii_whitespace() && pos < self.raw.len() - 1 {
                output.write_all(b"\r\n\t")?;
                bytes_written = 1;
            }
            output.write_all(&[ch])?;
            bytes_written += 1;
        }
        output.write_all(b"\r\n")?;
        Ok(0)
    }
}

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

/// URL header, used mostly on List-* headers
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct URL<'x> {
    pub url: Vec<Cow<'x, str>>,
}

impl<'x> URL<'x> {
    /// Create a new URL header
    pub fn new(url: impl Into<Cow<'x, str>>) -> Self {
        Self {
            url: vec![url.into()],
        }
    }

    /// Create a new multi-value URL header
    pub fn new_list<T, U>(urls: T) -> Self
    where
        T: Iterator<Item = U>,
        U: Into<Cow<'x, str>>,
    {
        Self {
            url: urls.map(|s| s.into()).collect(),
        }
    }
}

impl<'x> From<&'x str> for URL<'x> {
    fn from(value: &'x str) -> Self {
        Self::new(value)
    }
}

impl<'x> From<String> for URL<'x> {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl<'x> From<&[&'x str]> for URL<'x> {
    fn from(value: &[&'x str]) -> Self {
        URL {
            url: value.iter().map(|&s| s.into()).collect(),
        }
    }
}

impl<'x> From<&'x [String]> for URL<'x> {
    fn from(value: &'x [String]) -> Self {
        URL {
            url: value.iter().map(|s| s.into()).collect(),
        }
    }
}

impl<'x, T> From<Vec<T>> for URL<'x>
where
    T: Into<Cow<'x, str>>,
{
    fn from(value: Vec<T>) -> Self {
        URL {
            url: value.into_iter().map(|s| s.into()).collect(),
        }
    }
}

impl<'x> Header for URL<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        for (pos, url) in self.url.iter().enumerate() {
            if pos > 0 {
                if bytes_written + url.len() + 2 >= 76 {
                    output.write_all(b"\r\n\t")?;
                    bytes_written = 1;
                } else {
                    output.write_all(b" ")?;
                    bytes_written += 1;
                }
            }
            output.write_all(b"<")?;
            output.write_all(url.as_bytes())?;
            if pos < self.url.len() - 1 {
                output.write_all(b">,")?;
                bytes_written += url.len() + 3;
            } else {
                output.write_all(b">")?;
                bytes_written += url.len() + 2;
            }
        }

        if bytes_written > 0 {
            output.write_all(b"\r\n")?;
        }

        Ok(0)
    }
}

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

use crate::mime::make_boundary;

use super::Header;

/// RFC5322 Message ID header
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct MessageId<'x> {
    pub id: Vec<Cow<'x, str>>,
}

impl<'x> MessageId<'x> {
    /// Create a new Message ID header
    pub fn new(id: impl Into<Cow<'x, str>>) -> Self {
        Self {
            id: vec![id.into()],
        }
    }

    /// Create a new multi-value Message ID header
    pub fn new_list<T, U>(ids: T) -> Self
    where
        T: Iterator<Item = U>,
        U: Into<Cow<'x, str>>,
    {
        Self {
            id: ids.map(|s| s.into()).collect(),
        }
    }
}

impl<'x> From<&'x str> for MessageId<'x> {
    fn from(value: &'x str) -> Self {
        Self::new(value)
    }
}

impl<'x> From<String> for MessageId<'x> {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl<'x> From<&[&'x str]> for MessageId<'x> {
    fn from(value: &[&'x str]) -> Self {
        MessageId {
            id: value.iter().map(|&s| s.into()).collect(),
        }
    }
}

impl<'x> From<&'x [String]> for MessageId<'x> {
    fn from(value: &'x [String]) -> Self {
        MessageId {
            id: value.iter().map(|s| s.into()).collect(),
        }
    }
}

impl<'x, T> From<Vec<T>> for MessageId<'x>
where
    T: Into<Cow<'x, str>>,
{
    fn from(value: Vec<T>) -> Self {
        MessageId {
            id: value.into_iter().map(|s| s.into()).collect(),
        }
    }
}

pub fn generate_message_id_header(
    mut output: impl std::io::Write,
    hostname: &str,
) -> std::io::Result<()> {
    output.write_all(b"<")?;
    output.write_all(make_boundary(".").as_bytes())?;
    output.write_all(b"@")?;
    output.write_all(hostname.as_bytes())?;
    output.write_all(b">")
}

impl<'x> Header for MessageId<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        for (pos, id) in self.id.iter().enumerate() {
            if pos > 0 {
                if bytes_written + id.len() + 2 >= 76 {
                    output.write_all(b"\r\n\t")?;
                    bytes_written = 1;
                } else {
                    output.write_all(b" ")?;
                    bytes_written += 1;
                }
            }

            output.write_all(b"<")?;
            output.write_all(id.as_bytes())?;
            output.write_all(b">")?;
            bytes_written += id.len() + 2;
        }

        if bytes_written > 0 {
            output.write_all(b"\r\n")?;
        }

        Ok(0)
    }
}

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

use crate::encoders::{
    base64::base64_encode_mime,
    encode::{get_encoding_type, EncodingType},
    quoted_printable::quoted_printable_encode,
};

use super::Header;

/// Unstructured text e-mail header.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Text<'x> {
    pub text: Cow<'x, str>,
}

impl<'x> Text<'x> {
    /// Create a new unstructured text header
    pub fn new(text: impl Into<Cow<'x, str>>) -> Self {
        Self { text: text.into() }
    }
}

impl<'x, T> From<T> for Text<'x>
where
    T: Into<Cow<'x, str>>,
{
    fn from(value: T) -> Self {
        Self::new(value)
    }
}

impl<'x> Header for Text<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        match get_encoding_type(self.text.as_bytes(), true, false) {
            EncodingType::Base64 => {
                for (pos, chunk) in self.text.as_bytes().chunks(76 - bytes_written).enumerate() {
                    if pos > 0 {
                        output.write_all(b"\t")?;
                    }
                    output.write_all(b"=?utf-8?B?")?;
                    base64_encode_mime(chunk, &mut output, true)?;
                    output.write_all(b"?=\r\n")?;
                }
            }
            EncodingType::QuotedPrintable(is_ascii) => {
                for (pos, chunk) in self.text.as_bytes().chunks(76 - bytes_written).enumerate() {
                    if pos > 0 {
                        output.write_all(b"\t")?;
                    }
                    if !is_ascii {
                        output.write_all(b"=?utf-8?Q?")?;
                    } else {
                        output.write_all(b"=?us-ascii?Q?")?;
                    }
                    quoted_printable_encode(chunk, &mut output, true, false)?;
                    output.write_all(b"?=\r\n")?;
                }
            }
            EncodingType::None => {
                for (pos, &ch) in self.text.as_bytes().iter().enumerate() {
                    if bytes_written >= 76 && ch.is_ascii_whitespace() && pos < self.text.len() - 1
                    {
                        output.write_all(b"\r\n\t")?;
                        bytes_written = 1;
                    }
                    output.write_all(&[ch])?;
                    bytes_written += 1;
                }
                output.write_all(b"\r\n")?;
            }
        }
        Ok(0)
    }
}

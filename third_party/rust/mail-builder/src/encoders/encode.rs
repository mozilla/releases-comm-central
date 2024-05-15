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

use std::io::{self, Write};

use super::{base64::base64_encode_mime, quoted_printable::quoted_printable_encode};

pub enum EncodingType {
    Base64,
    QuotedPrintable(bool),
    None,
}

pub fn get_encoding_type(input: &[u8], is_inline: bool, is_body: bool) -> EncodingType {
    let base64_len = (input.len() * 4 / 3 + 3) & !3;
    let mut qp_len = if !is_inline { input.len() / 76 } else { 0 };
    let mut is_ascii = true;
    let mut needs_encoding = false;
    let mut line_len = 0;
    let mut prev_ch = 0;

    for (pos, &ch) in input.iter().enumerate() {
        line_len += 1;

        if ch >= 127
            || ((ch == b' ' || ch == b'\t')
                && ((is_body
                    && matches!(input.get(pos + 1..), Some([b'\n', ..] | [b'\r', b'\n', ..])))
                    || pos == input.len() - 1))
        {
            qp_len += 3;
            if !needs_encoding {
                needs_encoding = true;
            }
            if is_ascii && ch >= 127 {
                is_ascii = false;
            }
        } else if ch == b'='
            || (!is_body && ch == b'\r')
            || (is_inline && (ch == b'\t' || ch == b'\r' || ch == b'\n' || ch == b'?'))
        {
            qp_len += 3;
        } else if ch == b'\n' {
            if !needs_encoding && line_len > 997 {
                needs_encoding = true;
            }
            if is_body {
                if prev_ch != b'\r' {
                    qp_len += 1;
                }
                qp_len += 1;
            } else {
                if !needs_encoding && prev_ch != b'\r' {
                    needs_encoding = true;
                }
                qp_len += 3;
            }
            line_len = 0;
        } else {
            qp_len += 1;
        }

        prev_ch = ch;
    }

    if !needs_encoding {
        EncodingType::None
    } else if qp_len < base64_len {
        EncodingType::QuotedPrintable(is_ascii)
    } else {
        EncodingType::Base64
    }
}

pub fn rfc2047_encode(input: &str, mut output: impl Write) -> io::Result<usize> {
    Ok(match get_encoding_type(input.as_bytes(), true, false) {
        EncodingType::Base64 => {
            output.write_all(b"\"=?utf-8?B?")?;
            let bytes_written = base64_encode_mime(input.as_bytes(), &mut output, true)? + 14;
            output.write_all(b"?=\"")?;
            bytes_written
        }
        EncodingType::QuotedPrintable(is_ascii) => {
            if !is_ascii {
                output.write_all(b"\"=?utf-8?Q?")?;
            } else {
                output.write_all(b"\"=?us-ascii?Q?")?;
            }
            let bytes_written =
                quoted_printable_encode(input.as_bytes(), &mut output, true, false)?
                    + if is_ascii { 19 } else { 14 };
            output.write_all(b"?=\"")?;
            bytes_written
        }
        EncodingType::None => {
            let mut bytes_written = 2;
            output.write_all(b"\"")?;
            for &ch in input.as_bytes() {
                if ch == b'\\' || ch == b'"' {
                    output.write_all(b"\\")?;
                    bytes_written += 1;
                } else if ch == b'\r' || ch == b'\n' {
                    continue;
                }
                output.write_all(&[ch])?;
                bytes_written += 1;
            }
            output.write_all(b"\"")?;
            bytes_written
        }
    })
}

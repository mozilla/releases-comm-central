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

const CHARPAD: u8 = b'=';

#[inline(always)]
pub fn base64_encode(input: &[u8]) -> io::Result<Vec<u8>> {
    let mut buf = Vec::with_capacity(4 * (input.len() / 3));
    base64_encode_mime(input, &mut buf, true)?;
    Ok(buf)
}

pub fn base64_encode_mime(
    input: &[u8],
    mut output: impl Write,
    is_inline: bool,
) -> io::Result<usize> {
    let mut i = 0;
    let mut t1;
    let mut t2;
    let mut t3;
    let mut bytes_written = 0;

    if input.len() > 2 {
        while i < input.len() - 2 {
            #[cfg(not(feature = "ludicrous_mode"))]
            {
                t1 = input[i];
                t2 = input[i + 1];
                t3 = input[i + 2];

                output.write_all(&[
                    E0[t1 as usize],
                    E1[(((t1 & 0x03) << 4) | ((t2 >> 4) & 0x0F)) as usize],
                    E1[(((t2 & 0x0F) << 2) | ((t3 >> 6) & 0x03)) as usize],
                    E2[t3 as usize],
                ])?;
            }

            #[cfg(feature = "ludicrous_mode")]
            unsafe {
                t1 = *input.get_unchecked(i);
                t2 = *input.get_unchecked(i + 1);
                t3 = *input.get_unchecked(i + 2);

                output.write_all(&[
                    *E0.get_unchecked(t1 as usize),
                    *E1.get_unchecked((((t1 & 0x03) << 4) | ((t2 >> 4) & 0x0F)) as usize),
                    *E1.get_unchecked((((t2 & 0x0F) << 2) | ((t3 >> 6) & 0x03)) as usize),
                    *E2.get_unchecked(t3 as usize),
                ])?;
            }

            bytes_written += 4;

            if !is_inline && bytes_written % 19 == 0 {
                output.write_all(b"\r\n")?;
            }

            i += 3;
        }
    }

    let remaining = input.len() - i;
    if remaining > 0 {
        #[cfg(not(feature = "ludicrous_mode"))]
        {
            t1 = input[i];
            if remaining == 1 {
                output.write_all(&[
                    E0[t1 as usize],
                    E1[((t1 & 0x03) << 4) as usize],
                    CHARPAD,
                    CHARPAD,
                ])?;
            } else {
                t2 = input[i + 1];
                output.write_all(&[
                    E0[t1 as usize],
                    E1[(((t1 & 0x03) << 4) | ((t2 >> 4) & 0x0F)) as usize],
                    E2[((t2 & 0x0F) << 2) as usize],
                    CHARPAD,
                ])?;
            }
        }

        #[cfg(feature = "ludicrous_mode")]
        unsafe {
            t1 = *input.get_unchecked(i);
            if remaining == 1 {
                output.write_all(&[
                    *E0.get_unchecked(t1 as usize),
                    *E1.get_unchecked(((t1 & 0x03) << 4) as usize),
                    CHARPAD,
                    CHARPAD,
                ])?;
            } else {
                t2 = *input.get_unchecked(i + 1);
                output.write_all(&[
                    *E0.get_unchecked(t1 as usize),
                    *E1.get_unchecked((((t1 & 0x03) << 4) | ((t2 >> 4) & 0x0F)) as usize),
                    *E2.get_unchecked(((t2 & 0x0F) << 2) as usize),
                    CHARPAD,
                ])?;
            }
        }

        bytes_written += 4;

        if !is_inline && bytes_written % 19 == 0 {
            output.write_all(b"\r\n")?;
        }
    }

    if !is_inline && bytes_written % 19 != 0 {
        output.write_all(b"\r\n")?;
    }

    Ok(bytes_written)
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {

    #[test]
    fn encode_base64() {
        for (input, expected_result, is_inline) in [
            ("Test".to_string(), "VGVzdA==\r\n", false),
            ("Ye".to_string(), "WWU=\r\n", false),
            ("A".to_string(), "QQ==\r\n", false),
            ("ro".to_string(), "cm8=\r\n", false),
            (
                "Are you a Shimano or Campagnolo person?".to_string(),
                "QXJlIHlvdSBhIFNoaW1hbm8gb3IgQ2FtcGFnbm9sbyBwZXJzb24/\r\n",
                false,
            ),
            (
                "<!DOCTYPE html>\n<html>\n<body>\n</body>\n</html>\n".to_string(),
                "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8Ym9keT4KPC9ib2R5Pgo8L2h0bWw+Cg==\r\n",
                false,
            ),
            ("áéíóú".to_string(), "w6HDqcOtw7PDug==\r\n", false),
            (
                " ".repeat(100),
                concat!(
                    "ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
                    "ICAgICAgICAgICAgICAgICAgICAgICAgICAg\r\n",
                    "ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
                    "ICAgICAgICAgICAgIA==\r\n",
                ),
                false,
            ),
        ] {
            let mut output = Vec::new();
            super::base64_encode_mime(input.as_bytes(), &mut output, is_inline).unwrap();
            assert_eq!(std::str::from_utf8(&output).unwrap(), expected_result);
        }
    }
}

/*
 * Table adapted from Nick Galbreath's "High performance base64 encoder / decoder"
 *
 * Copyright 2005, 2006, 2007 Nick Galbreath -- nickg [at] modp [dot] com
 * All rights reserved.
 *
 * http://code.google.com/p/stringencoders/
 *
 * Released under bsd license.
 *
 */

pub static E0: &[u8] = &[
    b'A', b'A', b'A', b'A', b'B', b'B', b'B', b'B', b'C', b'C', b'C', b'C', b'D', b'D', b'D', b'D',
    b'E', b'E', b'E', b'E', b'F', b'F', b'F', b'F', b'G', b'G', b'G', b'G', b'H', b'H', b'H', b'H',
    b'I', b'I', b'I', b'I', b'J', b'J', b'J', b'J', b'K', b'K', b'K', b'K', b'L', b'L', b'L', b'L',
    b'M', b'M', b'M', b'M', b'N', b'N', b'N', b'N', b'O', b'O', b'O', b'O', b'P', b'P', b'P', b'P',
    b'Q', b'Q', b'Q', b'Q', b'R', b'R', b'R', b'R', b'S', b'S', b'S', b'S', b'T', b'T', b'T', b'T',
    b'U', b'U', b'U', b'U', b'V', b'V', b'V', b'V', b'W', b'W', b'W', b'W', b'X', b'X', b'X', b'X',
    b'Y', b'Y', b'Y', b'Y', b'Z', b'Z', b'Z', b'Z', b'a', b'a', b'a', b'a', b'b', b'b', b'b', b'b',
    b'c', b'c', b'c', b'c', b'd', b'd', b'd', b'd', b'e', b'e', b'e', b'e', b'f', b'f', b'f', b'f',
    b'g', b'g', b'g', b'g', b'h', b'h', b'h', b'h', b'i', b'i', b'i', b'i', b'j', b'j', b'j', b'j',
    b'k', b'k', b'k', b'k', b'l', b'l', b'l', b'l', b'm', b'm', b'm', b'm', b'n', b'n', b'n', b'n',
    b'o', b'o', b'o', b'o', b'p', b'p', b'p', b'p', b'q', b'q', b'q', b'q', b'r', b'r', b'r', b'r',
    b's', b's', b's', b's', b't', b't', b't', b't', b'u', b'u', b'u', b'u', b'v', b'v', b'v', b'v',
    b'w', b'w', b'w', b'w', b'x', b'x', b'x', b'x', b'y', b'y', b'y', b'y', b'z', b'z', b'z', b'z',
    b'0', b'0', b'0', b'0', b'1', b'1', b'1', b'1', b'2', b'2', b'2', b'2', b'3', b'3', b'3', b'3',
    b'4', b'4', b'4', b'4', b'5', b'5', b'5', b'5', b'6', b'6', b'6', b'6', b'7', b'7', b'7', b'7',
    b'8', b'8', b'8', b'8', b'9', b'9', b'9', b'9', b'+', b'+', b'+', b'+', b'/', b'/', b'/', b'/',
];

pub static E1: &[u8] = &[
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
];

pub static E2: &[u8] = &[
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
    b'A', b'B', b'C', b'D', b'E', b'F', b'G', b'H', b'I', b'J', b'K', b'L', b'M', b'N', b'O', b'P',
    b'Q', b'R', b'S', b'T', b'U', b'V', b'W', b'X', b'Y', b'Z', b'a', b'b', b'c', b'd', b'e', b'f',
    b'g', b'h', b'i', b'j', b'k', b'l', b'm', b'n', b'o', b'p', b'q', b'r', b's', b't', b'u', b'v',
    b'w', b'x', b'y', b'z', b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'+', b'/',
];

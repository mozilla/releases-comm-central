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
    borrow::Cow,
    cell::Cell,
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    io::{self, Write},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::{
    encoders::{
        base64::base64_encode_mime,
        encode::{get_encoding_type, EncodingType},
        quoted_printable::quoted_printable_encode,
    },
    headers::{
        content_type::ContentType, message_id::MessageId, raw::Raw, text::Text, Header, HeaderType,
    },
};

/// MIME part of an e-mail.
#[derive(Clone, Debug)]
pub struct MimePart<'x> {
    pub headers: Vec<(Cow<'x, str>, HeaderType<'x>)>,
    pub contents: BodyPart<'x>,
}

#[derive(Clone, Debug)]
pub enum BodyPart<'x> {
    Text(Cow<'x, str>),
    Binary(Cow<'x, [u8]>),
    Multipart(Vec<MimePart<'x>>),
}

impl<'x> From<&'x str> for BodyPart<'x> {
    fn from(value: &'x str) -> Self {
        BodyPart::Text(value.into())
    }
}

impl<'x> From<&'x [u8]> for BodyPart<'x> {
    fn from(value: &'x [u8]) -> Self {
        BodyPart::Binary(value.into())
    }
}

impl<'x> From<String> for BodyPart<'x> {
    fn from(value: String) -> Self {
        BodyPart::Text(value.into())
    }
}

impl<'x> From<&'x String> for BodyPart<'x> {
    fn from(value: &'x String) -> Self {
        BodyPart::Text(value.as_str().into())
    }
}

impl<'x> From<Cow<'x, str>> for BodyPart<'x> {
    fn from(value: Cow<'x, str>) -> Self {
        BodyPart::Text(value)
    }
}

impl<'x> From<Vec<u8>> for BodyPart<'x> {
    fn from(value: Vec<u8>) -> Self {
        BodyPart::Binary(value.into())
    }
}

impl<'x> From<Vec<MimePart<'x>>> for BodyPart<'x> {
    fn from(value: Vec<MimePart<'x>>) -> Self {
        BodyPart::Multipart(value)
    }
}

impl<'x> From<&'x str> for ContentType<'x> {
    fn from(value: &'x str) -> Self {
        ContentType::new(value)
    }
}

impl<'x> From<String> for ContentType<'x> {
    fn from(value: String) -> Self {
        ContentType::new(value)
    }
}

impl<'x> From<&'x String> for ContentType<'x> {
    fn from(value: &'x String) -> Self {
        ContentType::new(value.as_str())
    }
}

thread_local!(static COUNTER: Cell<u64> = const { Cell::new(0) });

pub fn make_boundary(separator: &str) -> String {
    // Create a pseudo-unique boundary
    let mut s = DefaultHasher::new();
    ((&s as *const DefaultHasher) as usize).hash(&mut s);
    thread::current().id().hash(&mut s);
    let hash = s.finish();

    format!(
        "{:x}{}{:x}{}{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_else(|_| Duration::new(0, 0))
            .as_nanos(),
        separator,
        COUNTER.with(|c| {
            hash.wrapping_add(c.replace(c.get() + 1))
                .wrapping_mul(11400714819323198485u64)
        }),
        separator,
        hash,
    )
}

impl<'x> MimePart<'x> {
    /// Create a new MIME part.
    pub fn new(
        content_type: impl Into<ContentType<'x>>,
        contents: impl Into<BodyPart<'x>>,
    ) -> Self {
        let mut content_type = content_type.into();
        let contents = contents.into();

        if matches!(contents, BodyPart::Text(_)) && content_type.attributes.is_empty() {
            content_type
                .attributes
                .push((Cow::from("charset"), Cow::from("utf-8")));
        }

        Self {
            contents,
            headers: vec![("Content-Type".into(), content_type.into())],
        }
    }

    /// Create a new raw MIME part that includes both headers and body.
    pub fn raw(contents: impl Into<BodyPart<'x>>) -> Self {
        Self {
            contents: contents.into(),
            headers: vec![],
        }
    }

    /// Set the attachment filename of a MIME part.
    pub fn attachment(mut self, filename: impl Into<Cow<'x, str>>) -> Self {
        self.headers.push((
            "Content-Disposition".into(),
            ContentType::new("attachment")
                .attribute("filename", filename)
                .into(),
        ));
        self
    }

    /// Set the MIME part as inline.
    pub fn inline(mut self) -> Self {
        self.headers.push((
            "Content-Disposition".into(),
            ContentType::new("inline").into(),
        ));
        self
    }

    /// Set the Content-Language header of a MIME part.
    pub fn language(mut self, value: impl Into<Cow<'x, str>>) -> Self {
        self.headers
            .push(("Content-Language".into(), Text::new(value).into()));
        self
    }

    /// Set the Content-ID header of a MIME part.
    pub fn cid(mut self, value: impl Into<Cow<'x, str>>) -> Self {
        self.headers
            .push(("Content-ID".into(), MessageId::new(value).into()));
        self
    }

    /// Set the Content-Location header of a MIME part.
    pub fn location(mut self, value: impl Into<Cow<'x, str>>) -> Self {
        self.headers
            .push(("Content-Location".into(), Raw::new(value).into()));
        self
    }

    /// Disable automatic Content-Transfer-Encoding detection and treat this as a raw MIME part
    pub fn transfer_encoding(mut self, value: impl Into<Cow<'x, str>>) -> Self {
        self.headers
            .push(("Content-Transfer-Encoding".into(), Raw::new(value).into()));
        self
    }

    /// Set custom headers of a MIME part.
    pub fn header(
        mut self,
        header: impl Into<Cow<'x, str>>,
        value: impl Into<HeaderType<'x>>,
    ) -> Self {
        self.headers.push((header.into(), value.into()));
        self
    }

    /// Returns the part's size
    pub fn size(&self) -> usize {
        match &self.contents {
            BodyPart::Text(b) => b.len(),
            BodyPart::Binary(b) => b.len(),
            BodyPart::Multipart(bl) => bl.iter().map(|b| b.size()).sum(),
        }
    }

    /// Add a body part to a multipart/* MIME part.
    pub fn add_part(&mut self, part: MimePart<'x>) {
        if let BodyPart::Multipart(ref mut parts) = self.contents {
            parts.push(part);
        }
    }

    /// Write the MIME part to a writer.
    pub fn write_part(self, mut output: impl Write) -> io::Result<usize> {
        let mut stack = Vec::new();
        let mut it = vec![self].into_iter();
        let mut boundary: Option<Cow<str>> = None;

        loop {
            while let Some(part) = it.next() {
                if let Some(boundary) = boundary.as_ref() {
                    output.write_all(b"\r\n--")?;
                    output.write_all(boundary.as_bytes())?;
                    output.write_all(b"\r\n")?;
                }
                match part.contents {
                    BodyPart::Text(text) => {
                        let mut is_attachment = false;
                        let mut is_raw = part.headers.is_empty();

                        for (header_name, header_value) in &part.headers {
                            output.write_all(header_name.as_bytes())?;
                            output.write_all(b": ")?;
                            if !is_attachment && header_name == "Content-Disposition" {
                                is_attachment = header_value
                                    .as_content_type()
                                    .map(|v| v.is_attachment())
                                    .unwrap_or(false);
                            } else if !is_raw && header_name == "Content-Transfer-Encoding" {
                                is_raw = true;
                            }
                            header_value.write_header(&mut output, header_name.len() + 2)?;
                        }
                        if !is_raw {
                            detect_encoding(text.as_bytes(), &mut output, !is_attachment)?;
                        } else {
                            if !part.headers.is_empty() {
                                output.write_all(b"\r\n")?;
                            }
                            output.write_all(text.as_bytes())?;
                        }
                    }
                    BodyPart::Binary(binary) => {
                        let mut is_text = false;
                        let mut is_attachment = false;
                        let mut is_raw = part.headers.is_empty();

                        for (header_name, header_value) in &part.headers {
                            output.write_all(header_name.as_bytes())?;
                            output.write_all(b": ")?;
                            if !is_text && header_name == "Content-Type" {
                                is_text = header_value
                                    .as_content_type()
                                    .map(|v| v.is_text())
                                    .unwrap_or(false);
                            } else if !is_attachment && header_name == "Content-Disposition" {
                                is_attachment = header_value
                                    .as_content_type()
                                    .map(|v| v.is_attachment())
                                    .unwrap_or(false);
                            } else if !is_raw && header_name == "Content-Transfer-Encoding" {
                                is_raw = true;
                            }
                            header_value.write_header(&mut output, header_name.len() + 2)?;
                        }

                        if !is_raw {
                            if !is_text {
                                output.write_all(b"Content-Transfer-Encoding: base64\r\n\r\n")?;
                                base64_encode_mime(binary.as_ref(), &mut output, false)?;
                            } else {
                                detect_encoding(binary.as_ref(), &mut output, !is_attachment)?;
                            }
                        } else {
                            if !part.headers.is_empty() {
                                output.write_all(b"\r\n")?;
                            }
                            output.write_all(binary.as_ref())?;
                        }
                    }
                    BodyPart::Multipart(parts) => {
                        if boundary.is_some() {
                            stack.push((it, boundary.take()));
                        }

                        let mut found_ct = false;
                        for (header_name, header_value) in part.headers {
                            output.write_all(header_name.as_bytes())?;
                            output.write_all(b": ")?;

                            if !found_ct && header_name.eq_ignore_ascii_case("Content-Type") {
                                boundary = match header_value {
                                    HeaderType::ContentType(mut ct) => {
                                        let bpos = if let Some(pos) = ct
                                            .attributes
                                            .iter()
                                            .position(|(a, _)| a.eq_ignore_ascii_case("boundary"))
                                        {
                                            pos
                                        } else {
                                            let pos = ct.attributes.len();
                                            ct.attributes.push((
                                                "boundary".into(),
                                                make_boundary("_").into(),
                                            ));
                                            pos
                                        };
                                        ct.write_header(&mut output, 14)?;
                                        ct.attributes.swap_remove(bpos).1.into()
                                    }
                                    HeaderType::Raw(raw) => {
                                        if let Some(pos) = raw.raw.find("boundary=\"") {
                                            if let Some(boundary) = raw.raw[pos..].split('"').nth(1)
                                            {
                                                Some(boundary.to_string().into())
                                            } else {
                                                Some(make_boundary("_").into())
                                            }
                                        } else {
                                            let boundary = make_boundary("_");
                                            output.write_all(raw.raw.as_bytes())?;
                                            output.write_all(b"; boundary=\"")?;
                                            output.write_all(boundary.as_bytes())?;
                                            output.write_all(b"\"\r\n")?;
                                            Some(boundary.into())
                                        }
                                    }
                                    _ => panic!("Unsupported Content-Type header value."),
                                };
                                found_ct = true;
                            } else {
                                header_value.write_header(&mut output, header_name.len() + 2)?;
                            }
                        }

                        if !found_ct {
                            output.write_all(b"Content-Type: ")?;
                            let boundary_ = make_boundary("_");
                            ContentType::new("multipart/mixed")
                                .attribute("boundary", &boundary_)
                                .write_header(&mut output, 14)?;
                            boundary = Some(boundary_.into());
                        }

                        output.write_all(b"\r\n")?;
                        it = parts.into_iter();
                    }
                }
            }
            if let Some(boundary) = boundary {
                output.write_all(b"\r\n--")?;
                output.write_all(boundary.as_bytes())?;
                output.write_all(b"--\r\n")?;
            }
            if let Some((prev_it, prev_boundary)) = stack.pop() {
                it = prev_it;
                boundary = prev_boundary;
            } else {
                break;
            }
        }
        Ok(0)
    }
}

fn detect_encoding(input: &[u8], mut output: impl Write, is_body: bool) -> io::Result<()> {
    match get_encoding_type(input, false, is_body) {
        EncodingType::Base64 => {
            output.write_all(b"Content-Transfer-Encoding: base64\r\n\r\n")?;
            base64_encode_mime(input, &mut output, false)?;
        }
        EncodingType::QuotedPrintable(_) => {
            output.write_all(b"Content-Transfer-Encoding: quoted-printable\r\n\r\n")?;
            quoted_printable_encode(input, &mut output, false, is_body)?;
        }
        EncodingType::None => {
            output.write_all(b"Content-Transfer-Encoding: 7bit\r\n\r\n")?;
            if is_body {
                let mut prev_ch = 0;
                for ch in input {
                    if *ch == b'\n' && prev_ch != b'\r' {
                        output.write_all(b"\r")?;
                    }
                    output.write_all(&[*ch])?;
                    prev_ch = *ch;
                }
            } else {
                output.write_all(input)?;
            }
        }
    }
    Ok(())
}

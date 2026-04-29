// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use crate::err::{Error, Res};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pkcs11Uri {
    pub token: Option<String>,
}

fn percent_decode(s: &str) -> String {
    let mut result = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(byte) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
        {
            result.push(byte);
            i += 3;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

fn percent_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                result.push(b as char);
            }
            _ => {
                use std::fmt::Write as _;
                write!(result, "%{b:02X}").expect("write to String");
            }
        }
    }
    result
}

/// Parse a PKCS#11 URI (RFC 7512).
/// Expects the input to start with "pkcs11:".
pub fn parse(uri: &str) -> Res<Pkcs11Uri> {
    let path = uri.strip_prefix("pkcs11:").ok_or(Error::InvalidInput)?;

    let mut token = None;
    for attr in path.split(';') {
        if let Some((key, value)) = attr.split_once('=')
            && key == "token"
        {
            token = Some(percent_decode(value));
        }
    }

    Ok(Pkcs11Uri { token })
}

/// Build a PKCS#11 URI from a token name.
#[must_use]
pub fn build(token_name: &str) -> String {
    format!("pkcs11:token={}", percent_encode(token_name))
}

#[cfg(test)]
mod tests {
    use test_fixture::fixture_init;

    use super::*;

    #[test]
    fn parse_simple() {
        fixture_init();
        let uri = parse("pkcs11:token=NSS%20Certificate%20DB").unwrap();
        assert_eq!(uri.token.as_deref(), Some("NSS Certificate DB"));
    }

    #[test]
    fn parse_no_token() {
        fixture_init();
        let uri = parse("pkcs11:manufacturer=Mozilla").unwrap();
        assert_eq!(uri.token, None);
    }

    #[test]
    fn parse_multiple_attrs() {
        fixture_init();
        let uri = parse("pkcs11:token=MyToken;manufacturer=Test;serial=1234").unwrap();
        assert_eq!(uri.token.as_deref(), Some("MyToken"));
    }

    #[test]
    fn parse_not_pkcs11() {
        fixture_init();
        assert!(parse("http://example.com").is_err());
    }

    #[test]
    fn build_uri() {
        fixture_init();
        assert_eq!(
            build("NSS Certificate DB"),
            "pkcs11:token=NSS%20Certificate%20DB"
        );
    }

    #[test]
    fn roundtrip() {
        fixture_init();
        let name = "My Token (Test-v2)";
        let uri_str = build(name);
        let parsed = parse(&uri_str).unwrap();
        assert_eq!(parsed.token.as_deref(), Some(name));
    }
}

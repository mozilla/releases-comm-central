/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Helper functions for converting strings to properly formatted names.

use crate::oxidize::is_rust_keyword;

/// Given a potentially fully qualified OpenAPI name ("microsoft.graph.user"),
/// produce the simple name for use here ("user").
pub fn simple_name(full: &str) -> &str {
    let out = full.rsplit('.').next().unwrap_or(full);
    assert!(!out.is_empty(), "attempted to generate empty name: {full}");
    assert!(
        !is_rust_keyword(out),
        "attempted to use a rust keyword as a name: {full}"
    );
    out
}

/// Sanitize a string into a PascalCase Rust identifier.
pub fn pascalize(s: &str) -> String {
    let mut out = String::new();
    let mut upper_next = true;
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            if upper_next {
                out.extend(ch.to_uppercase());
            } else {
                out.push(ch);
            }
            upper_next = false;
        } else {
            upper_next = true;
        }
    }
    assert!(
        !out.is_empty(),
        "attempted to pascalize into the empty string: {s}"
    );
    assert!(
        !is_rust_keyword(&out),
        "attempted to pascalize into a rust keyword: {s}"
    );
    out
}

/// Sanitize a string into a snake_case Rust identifier.
pub fn snakeify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_is_underscore = false;
    for ch in s.chars() {
        if ch.is_alphanumeric() {
            if ch.is_ascii_uppercase() {
                if !out.is_empty() && !prev_is_underscore {
                    out.push('_');
                }
                out.push(ch.to_ascii_lowercase());
            } else {
                out.push(ch);
            }
            prev_is_underscore = false;
        } else if !prev_is_underscore && !out.is_empty() {
            out.push('_');
            prev_is_underscore = true;
        }
    }
    assert!(
        !out.is_empty(),
        "attempted to snakify into the empty string: {s}"
    );
    assert!(
        !is_rust_keyword(&out),
        "attempted to snakify into a rust keyword: {s}"
    );
    out
}

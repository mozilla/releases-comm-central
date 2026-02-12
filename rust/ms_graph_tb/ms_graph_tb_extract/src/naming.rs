/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Helper functions for converting strings to properly formatted names.

use std::path::{Path, PathBuf};

use crate::oxidize::is_rust_keyword;

const GRAPH_PREFIX: &str = "microsoft.graph.";

/// Strip the "microsoft.graph." prefix from a potentially fully qualified
/// OpenAPI name (e.g. "microsoft.graph.user").
pub fn base_name(full: &str) -> String {
    full.replace(GRAPH_PREFIX, "")
}

/// Get a [`PathBuf`] representing the position of the schema represented by the
/// given OpenAPI name in the hierarchy.
///
/// For example, this means that "microsoft.graph.security.user" will have
/// "security/" as its path.
///
/// If the schema exists at the top level of the hierarchy, an empty path is
/// returned.
pub fn path(full: &str) -> PathBuf {
    // Strip out the type's prefix.
    let path = base_name(full);
    assert!(!path.is_empty(), "invalid type name: {full}");

    if !path.contains(".") {
        // The current type is at the top level.
        return PathBuf::new();
    }

    // Replace the delimiter to turn the type's name into a path `Path`
    // understands.
    let path = path.replace(".", "/");

    Path::new(path.as_str())
        .parent()
        // `parent()` only returns `None` in two cases: if the path is empty
        // (which we've already checked for earlier), or if we're dealing with
        // an absolute top-level path (which we shouldn't since we also stripped
        // out the trailing period after "microsoft.graph").
        .expect("unexpected empty or absolute path")
        .to_owned()
}

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
    if out.ends_with('_') {
        out.pop();
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

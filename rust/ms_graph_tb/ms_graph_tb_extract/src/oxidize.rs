/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Modules for turning our representation of the Graph API into Rust code
//! (specifically, a [`proc_macro2::TokenStream`]).

use proc_macro2::TokenStream;
use quote::{format_ident, quote};
use std::{collections::HashSet, fmt};

pub mod types;

fn imports(properties: &[crate::extract::schema::Property]) -> TokenStream {
    let mut imports = properties
        .iter()
        .filter_map(|p| {
            let name = p.name.as_str();
            if crate::SUPPORTED_TYPES.contains(&name) {
                Some(crate::naming::snakeify(name))
            } else {
                None
            }
        })
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    imports.sort();

    let imports = imports.iter().map(|s| format_ident!("{s}"));

    quote!(#( use crate::types::#imports::*; )*)
}

/// Currently a no-op, this will eventually do some basic cleaning of doc comments.
fn markup_doc_comment(doc_comment: String) -> String {
    doc_comment
}

/// Whether the type in question is a Rust reference, and if so, which kind.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum Reference {
    Own,
    Ref,
    Mut,
}

impl From<&Reference> for &str {
    fn from(value: &Reference) -> Self {
        match value {
            Reference::Own => "",
            Reference::Ref => "&",
            Reference::Mut => "&mut ",
        }
    }
}

impl fmt::Display for Reference {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s: &str = self.into();
        s.fmt(f)
    }
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum Composed {
    Copy,
    Slice,
    Composite,
}

/// Our representation of a Rust type.
#[derive(Clone, Debug)]
pub enum RustType {
    Bool,
    U8,
    I8,
    I16,
    I32,
    I64,
    F32,
    F64,
    String,
    _Bytes, // FIXME: will be needed once we add byte and binary support
    Custom(String),
}

impl RustType {
    fn composed(&self) -> Composed {
        match self {
            Self::Bool
            | Self::U8
            | Self::I8
            | Self::I16
            | Self::I32
            | Self::I64
            | Self::F32
            | Self::F64 => Composed::Copy,
            Self::String | Self::_Bytes => Composed::Slice,
            _ => Composed::Composite,
        }
    }

    fn base_str(&self, nullable: bool, refers: Reference) -> &str {
        let (string, bytes) = if refers == Reference::Own || (refers == Reference::Mut && nullable)
        {
            ("String", "Vec<u8>")
        } else {
            ("str", "[u8]")
        };

        match self {
            Self::Bool => "bool",
            Self::U8 => "u8",
            Self::I8 => "i8",
            Self::I16 => "i16",
            Self::I32 => "i32",
            Self::I64 => "i64",
            Self::F32 => "f32",
            Self::F64 => "f64",
            Self::String => string,
            Self::_Bytes => bytes,
            Self::Custom(s) => s,
        }
    }

    fn base_token(&self, nullable: bool, refers: Reference) -> TokenStream {
        let sliced = !(refers == Reference::Own || (refers == Reference::Mut && nullable));
        match self {
            Self::Bool => quote!(bool),
            Self::U8 => quote!(u8),
            Self::I8 => quote!(i8),
            Self::I16 => quote!(i16),
            Self::I32 => quote!(i32),
            Self::I64 => quote!(i64),
            Self::F32 => quote!(f32),
            Self::F64 => quote!(f64),
            Self::String if !sliced => quote!(String),
            Self::String => quote!(str),
            Self::_Bytes if !sliced => quote!(Vec<u8>),
            Self::_Bytes => quote!([u8]),
            Self::Custom(name) => {
                let ident = format_ident!("{name}");
                quote!(#ident)
            }
        }
    }
}

/// Returns true if the given string is a reserved Rust keyword.
pub fn is_rust_keyword(s: &str) -> bool {
    // https://doc.rust-lang.org/reference/keywords.html
    let keywords = [
        // strong
        "as",
        "break",
        "const",
        "continue",
        "crate",
        "else",
        "enum",
        "extern",
        "false",
        "fn",
        "for",
        "if",
        "impl",
        "in",
        "let",
        "loop",
        "match",
        "mod",
        "move",
        "mut",
        "pub",
        "ref",
        "return",
        "self",
        "Self",
        "static",
        "struct",
        "super",
        "trait",
        "true",
        "type",
        "unsafe",
        "use",
        "where",
        "while",
        // strong 2018
        "async",
        "await",
        "dyn",
        // reserved
        "abstract",
        "become",
        "box",
        "do",
        "final",
        "macro",
        "override",
        "priv",
        "try",
        "typeof",
        "unsized",
        "virtual",
        "yield",
        // weak
        "'static",
        "macro_rules",
        "raw",
        "safe",
        "union",
    ];

    keywords.contains(&s)
}

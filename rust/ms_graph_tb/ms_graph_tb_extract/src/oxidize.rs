/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Modules for turning our representation of the Graph API into Rust code
//! (specifically, a [`proc_macro2::TokenStream`]).

use proc_macro2::TokenStream;
use quote::{format_ident, quote};
use std::{collections::HashSet, fmt};

use crate::{extract::schema::Property, naming};

pub mod paths;
pub mod types;

fn imports(properties: &[crate::extract::schema::Property]) -> TokenStream {
    let mut imports = properties
        .iter()
        .filter_map(|p| {
            if let RustType::Custom(custom_rust_type) = &p.rust_type {
                let original_name = custom_rust_type.original_name();
                if crate::SUPPORTED_TYPES.contains(&original_name.as_str()) {
                    Some(custom_rust_type.as_snake_case())
                } else {
                    println!(
                        "not generating imports for property of unsupported custom type {}",
                        original_name
                    );
                    None
                }
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

/// Does some (very) basic clean up of descriptions to make them better
/// formatted as doc comments.
// This is dumb and buggy, and will eventually need proper regex, but is good
// enough for now to prevent major doc bugs/warnings.
fn markup_doc_comment(mut doc_comment: String) -> String {
    fn escape(s: &str) -> String {
        format!("`{s}`")
    }

    fn escape_in_place(s: &mut String, start_idx: usize, end_idx: usize) {
        s.reserve(2);
        // Make sure the end ` gets inserted first, so the index doesn't change
        s.insert(end_idx, '`');
        s.insert(start_idx, '`');
    }

    /// Escape members of a string of the form "Foo, Bar, and Baz" into
    /// "`Foo`, `Bar`, and `Baz`."
    fn escape_list(list: &str) -> String {
        let list = list.split(", ");
        let list = list
            .map(|item| {
                if item.starts_with("and ") {
                    let word = item
                        .split_ascii_whitespace()
                        .nth(1)
                        .expect("and is followed by a word");
                    let replacement = escape(word);
                    item.replace(word, &replacement)
                } else {
                    escape(item.trim_ascii())
                }
            })
            .collect::<Vec<_>>();
        list.join(", ")
    }

    // find all instances of " [Ff]or example: ", which are always followed by
    // something that can or should be escaped as code.
    let example_str = "for example: ";
    let lowered_comment = doc_comment.to_ascii_lowercase();
    let mut search_idx = 0;
    while let Some(match_idx) = lowered_comment[search_idx..].find(example_str) {
        let example_start = match_idx + example_str.len();

        // Examples always seem to have *some* text after them, so this match
        // always works in practice, but this is fragile.
        if let Some(example_len) = doc_comment[example_start..].find(". ") {
            let example_end = example_start + example_len;
            escape_in_place(&mut doc_comment, example_start, example_end);
            search_idx = example_end;
        } else {
            search_idx = example_start;
        }
    }

    // match against known lists of escaped words and escape them
    let list_wrappers = [("$filter (", ")"), ("Allowed values: ", ". ")];
    for (left, right) in list_wrappers {
        if let Some(match_idx) = doc_comment.find(left) {
            let start_idx = match_idx + left.len();
            if let Some(match_len) = doc_comment[start_idx..].find(right) {
                let before_list = &doc_comment[start_idx..start_idx + match_len];
                let after_list = escape_list(before_list);
                doc_comment = doc_comment.replace(before_list, &after_list);
            }
        }
    }

    // escape all keywords known to always benefit from escaping
    for word in [
        "$expand", "$filter", "$orderby", "$OrderBy", "$search", "$select", "$top",
    ] {
        let replacement = escape(word);
        doc_comment = doc_comment.replace(word, &replacement);
    }

    // if the doc comment doesn't have a summary line, turn the first sentence
    // into one
    if !doc_comment.contains("\n\n")
        && let Some(idx) = doc_comment.find(". ")
    {
        doc_comment.insert_str(idx + 1, "\n\n");
    }

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
    Custom(CustomRustType),
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
            Self::Custom(s) => s.as_pascal_case(),
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
                let ident = format_ident!("{}", name.as_pascal_case());
                quote!(#ident)
            }
        }
    }
}

/// A custom Rust type that doesn't fit in any of the [`RustType`] variants.
///
/// This struct holds both the PascalCase and original versions of the type's
/// name. Ideally we'd generate the PascalCase version upon request (e.g. when
/// `as_pascal_case` is called), but this causes ownership issues further down
/// the line.
#[derive(Debug, Clone)]
pub struct CustomRustType {
    pascal_case: String,
    original_name: String,
}

impl From<String> for CustomRustType {
    fn from(value: String) -> Self {
        Self::from(value.as_str())
    }
}

impl From<&str> for CustomRustType {
    fn from(value: &str) -> Self {
        CustomRustType {
            pascal_case: crate::naming::pascalize(value),
            original_name: value.to_string(),
        }
    }
}

impl CustomRustType {
    /// Returns the type's name in PascalCase.
    pub fn as_pascal_case(&self) -> &String {
        &self.pascal_case
    }

    /// Returns the type's name in snake_case.
    pub fn as_snake_case(&self) -> String {
        naming::snakeify(&self.original_name)
    }

    /// Returns the type's name as it was written in the OpenAPI spec.
    pub fn original_name(&self) -> &String {
        &self.original_name
    }
}

/// Given the propeperty and whether it should be a reference, produce a
/// `TokenStream` that can be used as a return type representing it.
///
/// `lifetime_name` defaults to `'a`. Note that any name *must* include the
/// leading `'`.
fn return_type(prop: &Property, refers: Reference, lifetime_name: Option<&str>) -> TokenStream {
    let base = &prop.rust_type.base_token(prop.nullable, refers);

    let mut ty: TokenStream = if matches!(prop.rust_type, RustType::Custom(_)) {
        // The format_ident! macro doesn't like lifetime names, so we do this manually.
        let lifetime_name: TokenStream = lifetime_name
            .unwrap_or("'a")
            .parse()
            .expect("should be a valid lifetime ident");
        quote!(#base<#lifetime_name>)
    } else {
        quote!(#base)
    };

    let composed = prop.rust_type.composed();
    if refers == Reference::Ref
        && composed != Composed::Copy
        && (!prop.is_collection || composed == Composed::Slice)
        && !matches!(prop.rust_type, RustType::Custom(_))
    {
        ty = quote!(&#ty);
    }

    if prop.is_collection {
        ty = quote!(Vec<#ty>);
    }

    if prop.nullable {
        ty = quote!(Option<#ty>);
    }

    if !prop.is_ref {
        ty = quote!(Result<#ty, Error>);
    }

    ty
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that lists of escaped values don't escape the word "and" at the end
    /// of the list.
    #[test]
    fn markup_list_with_and() {
        let input = r"The name of the company that the user is associated with. This property can be useful for describing the company that a guest comes from. The maximum length is 64 characters.Returned only on $select. Supports $filter (eq, ne, not, ge, le, in, startsWith, and eq on null values).".to_string();
        let expected = "The name of the company that the user is associated with.\n\n This property can be useful for describing the company that a guest comes from. The maximum length is 64 characters.Returned only on `$select`. Supports `$filter` (`eq`, `ne`, `not`, `ge`, `le`, `in`, `startsWith`, and `eq` on null values).";

        assert_eq!(markup_doc_comment(input), expected);
    }

    /// Test that "for example:" followed by an example escapes the example.
    #[test]
    fn markup_doc_with_examples() {
        let input = r"A list of other email addresses for the user; for example: ['bob@contoso.com', 'Robert@fabrikam.com']. Can store up to 250 values, each with a limit of 250 characters. NOTE: This property can't contain accent characters. Returned only on $select. Supports $filter (eq, not, ge, le, in, startsWith, endsWith, /$count eq 0, /$count ne 0).".to_string();
        let expected = "A list of other email addresses for the user; for example: `['bob@contoso.com', 'Robert@fabrikam.com']`.\n\n Can store up to 250 values, each with a limit of 250 characters. NOTE: This property can't contain accent characters. Returned only on `$select`. Supports `$filter` (`eq`, `not`, `ge`, `le`, `in`, `startsWith`, `endsWith`, `/$count eq 0`, `/$count ne 0`).";

        assert_eq!(markup_doc_comment(input), expected);
    }
}

#![doc = include_str!("../README.md")]
#![allow(
    clippy::derive_partial_eq_without_eq,
    clippy::doc_markdown,
    clippy::match_same_arms,
    clippy::module_name_repetitions,
    clippy::needless_doctest_main,
    clippy::too_many_lines
)]
#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

extern crate proc_macro;

mod attr;
mod error;
mod segment;
#[cfg(coverage_nightly)]
mod test_helpers;

use crate::attr::expand_attr;
use crate::error::{Error, Result};
use crate::segment::Segment;
use proc_macro::{
    Delimiter, Group, Ident, LexError, Literal, Punct, Spacing, Span, TokenStream, TokenTree,
};
use std::char;
use std::iter;
use std::panic;
use std::str::FromStr;

#[proc_macro]
pub fn paste(input: TokenStream) -> TokenStream {
    let mut contains_paste = false;
    let flatten_single_interpolation = true;
    match expand(
        input.clone(),
        &mut contains_paste,
        flatten_single_interpolation,
    ) {
        Ok(expanded) => {
            if contains_paste {
                expanded
            } else {
                input
            }
        }
        Err(err) => err.to_compile_error(),
    }
}

#[doc(hidden)]
#[proc_macro]
pub fn item(input: TokenStream) -> TokenStream {
    paste(input)
}

#[doc(hidden)]
#[proc_macro]
pub fn expr(input: TokenStream) -> TokenStream {
    paste(input)
}

fn expand(
    input: TokenStream,
    contains_paste: &mut bool,
    flatten_single_interpolation: bool,
) -> Result<TokenStream> {
    let mut expanded = TokenStream::new();
    let mut lookbehind = Lookbehind::Other;
    let mut prev_none_group = None::<Group>;
    let mut tokens = input.into_iter().peekable();
    loop {
        let token = tokens.next();
        if let Some(group) = prev_none_group.take() {
            if match (&token, tokens.peek()) {
                (Some(TokenTree::Punct(fst)), Some(TokenTree::Punct(snd))) => {
                    fst.as_char() == ':' && snd.as_char() == ':' && fst.spacing() == Spacing::Joint
                }
                _ => false,
            } {
                expanded.extend(group.stream());
                *contains_paste = true;
            } else {
                expanded.extend(iter::once(TokenTree::Group(group)));
            }
        }
        match token {
            Some(TokenTree::Group(group)) => {
                let delimiter = group.delimiter();
                let content = group.stream();
                let span = group.span();
                if delimiter == Delimiter::Bracket && is_paste_operation(&content) {
                    let segments = parse_bracket_as_segments(content, span)?;
                    let pasted = segment::paste(&segments)?;
                    let tokens = pasted_to_tokens(pasted, span)?;
                    expanded.extend(tokens);
                    *contains_paste = true;
                } else if flatten_single_interpolation
                    && delimiter == Delimiter::None
                    && is_single_interpolation_group(&content)
                {
                    expanded.extend(content);
                    *contains_paste = true;
                } else {
                    let mut group_contains_paste = false;
                    let is_attribute = delimiter == Delimiter::Bracket
                        && (lookbehind == Lookbehind::Pound || lookbehind == Lookbehind::PoundBang);
                    let mut nested = expand(
                        content,
                        &mut group_contains_paste,
                        flatten_single_interpolation && !is_attribute,
                    )?;
                    if is_attribute {
                        nested = expand_attr(nested, span, &mut group_contains_paste)?;
                    }
                    let group = if group_contains_paste {
                        let mut group = Group::new(delimiter, nested);
                        group.set_span(span);
                        *contains_paste = true;
                        group
                    } else {
                        group.clone()
                    };
                    if delimiter != Delimiter::None {
                        expanded.extend(iter::once(TokenTree::Group(group)));
                    } else if lookbehind == Lookbehind::DoubleColon {
                        expanded.extend(group.stream());
                        *contains_paste = true;
                    } else {
                        prev_none_group = Some(group);
                    }
                }
                lookbehind = Lookbehind::Other;
            }
            Some(TokenTree::Punct(punct)) => {
                lookbehind = match punct.as_char() {
                    ':' if lookbehind == Lookbehind::JointColon => Lookbehind::DoubleColon,
                    ':' if punct.spacing() == Spacing::Joint => Lookbehind::JointColon,
                    '#' => Lookbehind::Pound,
                    '!' if lookbehind == Lookbehind::Pound => Lookbehind::PoundBang,
                    _ => Lookbehind::Other,
                };
                expanded.extend(iter::once(TokenTree::Punct(punct)));
            }
            Some(other) => {
                lookbehind = Lookbehind::Other;
                expanded.extend(iter::once(other));
            }
            None => return Ok(expanded),
        }
    }
}

#[derive(PartialEq)]
enum Lookbehind {
    JointColon,
    DoubleColon,
    Pound,
    PoundBang,
    Other,
}

// https://github.com/dtolnay/paste/issues/26
fn is_single_interpolation_group(input: &TokenStream) -> bool {
    #[derive(PartialEq)]
    enum State {
        Init,
        Ident,
        Literal,
        Apostrophe,
        Lifetime,
        Colon1,
        Colon2,
    }

    let mut state = State::Init;
    for tt in input.clone() {
        state = match (state, &tt) {
            (State::Init, TokenTree::Ident(_)) => State::Ident,
            (State::Init, TokenTree::Literal(_)) => State::Literal,
            (State::Init, TokenTree::Punct(punct)) if punct.as_char() == '\'' => State::Apostrophe,
            (State::Apostrophe, TokenTree::Ident(_)) => State::Lifetime,
            (State::Ident, TokenTree::Punct(punct))
                if punct.as_char() == ':' && punct.spacing() == Spacing::Joint =>
            {
                State::Colon1
            }
            (State::Colon1, TokenTree::Punct(punct))
                if punct.as_char() == ':' && punct.spacing() == Spacing::Alone =>
            {
                State::Colon2
            }
            (State::Colon2, TokenTree::Ident(_)) => State::Ident,
            _ => return false,
        };
    }

    state == State::Ident || state == State::Literal || state == State::Lifetime
}

fn is_paste_operation(input: &TokenStream) -> bool {
    let mut tokens = input.clone().into_iter();

    match &tokens.next() {
        Some(TokenTree::Punct(punct)) if punct.as_char() == '<' => {}
        _ => return false,
    }

    let mut has_token = false;
    loop {
        match &tokens.next() {
            Some(TokenTree::Punct(punct)) if punct.as_char() == '>' => {
                return has_token && tokens.next().is_none();
            }
            Some(_) => has_token = true,
            None => return false,
        }
    }
}

// Coverage note:
// Uncovered line -Some(wrong) => return Err(Error::new(wrong.span(), "expected `>`")),
//
// This line can never be reached because segment::parse stops only when it
// sees `>` or runs out of tokens. So the very next token after parse() is
// always either `>` or None — never any other token.
//
// coverage(off) cannot be placed on a single match arm, only on a whole
// function. So the match was moved into this helper function so the
// attribute can be applied here.
#[cfg_attr(coverage_nightly, coverage(off))]
fn check_close_angle_token(token: Option<TokenTree>, scope: Span) -> Result<()> {
    match token {
        Some(TokenTree::Punct(punct)) if punct.as_char() == '>' => Ok(()),
        Some(wrong) => Err(Error::new(wrong.span(), "expected `>`")),
        None => Err(Error::new(scope, "expected `[< ... >]`")),
    }
}

// Coverage note:
// Uncovered lines (the fallthrough/else paths of the two if-let checks):
//   if let Ok(unsigned) = u32::from_str_radix(hex, 16) {
//       if let Some(ch) = char::from_u32(unsigned) {
//             ...
//        }// None path never covered
//   }// Err path never covered
//
// These paths can never be reached because:
// - The hex string comes from a Literal that the Rust compiler already parsed.
//   The compiler rejects any non-hex characters in \u{...} at compile time,
//   so from_str_radix will always succeed (never Err).
// - The compiler also rejects surrogate codepoints like \u{D800} at compile
//   time, so char::from_u32 will always succeed (never None).
//
// The defensive checks are kept in case this code is called with manually
// constructed TokenStreams in the future. The block is moved into this helper
// so coverage(off) can be applied at function scope (the only level the
// attribute supports). The call site becomes a simple bool check with no
// uncoverable branches.
//
// Returns true if the value was converted (caller should `continue`), false otherwise.
#[cfg_attr(coverage_nightly, coverage(off))]
fn try_convert_unicode_escape(value: &mut String) -> bool {
    if value.starts_with("'\\u{") {
        let hex = &value[4..value.len() - 2];
        if let Ok(unsigned) = u32::from_str_radix(hex, 16) {
            if let Some(ch) = char::from_u32(unsigned) {
                value.clear();
                value.push(ch);
                return true;
            }
        }
    }
    false
}

fn parse_bracket_as_segments(input: TokenStream, scope: Span) -> Result<Vec<Segment>> {
    let mut tokens = input.into_iter().peekable();

    match &tokens.next() {
        Some(TokenTree::Punct(punct)) if punct.as_char() == '<' => {}
        Some(wrong) => return Err(Error::new(wrong.span(), "expected `<`")),
        None => return Err(Error::new(scope, "expected `[< ... >]`")),
    }

    let mut segments = segment::parse(&mut tokens)?;

    check_close_angle_token(tokens.next(), scope)?;

    if let Some(unexpected) = tokens.next() {
        return Err(Error::new(
            unexpected.span(),
            "unexpected input, expected `[< ... >]`",
        ));
    }

    for segment in &mut segments {
        if let Segment::String(string) = segment {
            if try_convert_unicode_escape(&mut string.value) {
                continue;
            }
            if string.value.contains(&['\\', '.', '+'][..])
                || string.value.starts_with("b'")
                || string.value.starts_with("b\"")
                || string.value.starts_with("br\"")
            {
                return Err(Error::new(string.span, "unsupported literal"));
            }
            let mut range = 0..string.value.len();
            if string.value.starts_with("r\"") {
                range.start += 2;
                range.end -= 1;
            } else if string.value.starts_with(&['"', '\''][..]) {
                range.start += 1;
                range.end -= 1;
            }
            string.value = string.value[range].replace('-', "_");
        }
    }

    Ok(segments)
}

fn pasted_to_tokens(mut pasted: String, span: Span) -> Result<TokenStream> {
    let mut raw_mode = false;
    let mut tokens = TokenStream::new();

    if pasted.starts_with(|ch: char| ch.is_ascii_digit()) {
        let literal = match panic::catch_unwind(|| Literal::from_str(&pasted)) {
            Ok(Ok(literal)) => TokenTree::Literal(literal),
            Ok(Err(LexError { .. })) | Err(_) => {
                return Err(Error::new(
                    span,
                    &format!("`{:?}` is not a valid literal", pasted),
                ));
            }
        };
        tokens.extend(iter::once(literal));
        return Ok(tokens);
    }

    if pasted.starts_with('\'') {
        let mut apostrophe = TokenTree::Punct(Punct::new('\'', Spacing::Joint));
        apostrophe.set_span(span);
        tokens.extend(iter::once(apostrophe));
        pasted.remove(0);
    }

    if pasted.starts_with("r#") {
        raw_mode = true;
    }

    let ident = match panic::catch_unwind(|| {
        if raw_mode {
            let mut spasted = pasted.clone();
            spasted.remove(0);
            spasted.remove(0);
            Ident::new_raw(&spasted, span)
        } else {
            Ident::new(&pasted, span)
        }
    }) {
        Ok(ident) => TokenTree::Ident(ident),
        Err(_) => {
            return Err(Error::new(
                span,
                &format!("`{:?}` is not a valid identifier", pasted),
            ));
        }
    };

    tokens.extend(iter::once(ident));
    Ok(tokens)
}

// Below functions and macro is just for testing the internal functions that are not directly exposed
// and can not be tested through public paste macro because of pre-validation of most error cases in it,
// so we can not cover those error cases through it.
// Also some of the inputs for testing those functions can not be constructed directly in tests because of TokenStream,
// so we need to construct them using proc_macro functions and then call the functions we want to test.
#[cfg(coverage_nightly)]
#[coverage(off)]
#[proc_macro]
#[doc(hidden)]
pub fn paste_test(input: TokenStream) -> TokenStream {
    let scope = Span::call_site();
    test_helpers::expand_attr_test(scope);
    test_helpers::parse_bracket_as_segments_test(scope);

    {
        let mut multi_inner = TokenStream::new();
        multi_inner.extend([TokenTree::Ident(Ident::new("a", scope))]);
        multi_inner.extend([TokenTree::Ident(Ident::new("b", scope))]);
        let multi_none = TokenTree::Group(Group::new(Delimiter::None, multi_inner));
        let _ = segment::get_token_tree_string_value(&multi_none);
    }

    {
        let empty_none = TokenTree::Group(Group::new(Delimiter::None, TokenStream::new()));
        let _ = segment::get_token_tree_string_value(&empty_none);
    }

    // Emit compile_error! unconditionally into the output so any call site that
    // reaches the compiler gets the intended error message directly.
    let mut out = TokenStream::from_str(
        "compile_error!(\"paste_test! is for internal coverage testing only and must not be called outside of test context\");",
    )
    .unwrap();
    out.extend(input);
    out
}

#[cfg(doctest)]
#[doc(hidden)]
mod doc_tests {
    /// ```compile_fail
    /// use pastey::paste_test;
    /// paste_test!("test");
    /// ```
    fn paste_test_macro_for_internal_coverage() {}

    /// ```
    /// use pastey::paste;
    /// let arr: [u8; 3] = paste!([1u8, 2, 3]);
    /// ```
    fn test_non_paste_bracket_returns_input() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($id:ident) => { paste! { fn $id() {} } }
    /// }
    /// m!(doc_flatten_fn);
    /// doc_flatten_fn();
    /// ```
    fn test_flatten_single_ident_group() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($life:lifetime) => {
    ///         paste! { struct DocRef<$life>(pub &$life ()); }
    ///     }
    /// }
    /// m!('a);
    /// ```
    fn test_flatten_lifetime_group() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($t:path) => { paste! { type DocPathAlias = $t; } }
    /// }
    /// m!(std::string::String);
    /// let _: DocPathAlias = String::new();
    /// ```
    fn test_flatten_path_group() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($lit:literal) => { paste! { const DOC_LIT: u8 = $lit; } }
    /// }
    /// m!(99u8);
    /// ```
    fn test_flatten_literal_group() {}

    /// ```
    /// use pastey::paste;
    /// paste! { let _: std::string::String = String::new(); }
    /// ```
    fn test_double_colon_none_group() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///    ($t:ty) => {
    ///       paste! {
    ///          pub const NONE_GROUP_TY_STR: &str = stringify!($t::method);
    ///      }
    ///   }
    /// }
    /// m!(Vec<u8>);
    /// ```
    fn test_none_group_complex_type_before_double_colon() {}

    /// ```
    /// use pastey::paste;
    /// paste! {
    ///     mod doc_inner_mod {
    ///         #![allow(dead_code)]
    ///         pub struct DocInner;
    ///     }
    /// }
    /// ```
    fn test_inner_mod() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! allow_lint {
    ///     ($lint:ident) => {
    ///         paste! {
    ///             #[allow(clippy::$lint)]
    ///             pub struct DocLintStruct;
    ///         }
    ///     }
    /// }
    /// allow_lint!(pedantic);
    /// ```
    fn test_double_colon_none_group_in_attr() {}

    /// ```
    /// use pastey::paste;
    /// paste! { const _: &str = stringify!([<'\u{48}' ello>]); }
    /// ```
    fn test_char_unicode_escape_in_paste() {}

    /// ```
    /// use pastey::paste;
    /// paste! { const _: &str = stringify!([<r"hel" lo>]); }
    /// ```
    fn test_raw_string_in_paste() {}

    /// ```
    /// use pastey::paste;
    /// paste! { struct DocLifeRef<[<'a>]>(pub &[<'a>] ()); }
    /// ```
    fn test_lifetime_paste_tokens() {}

    /// ```
    /// use pastey::paste;
    /// paste! { #[allow(non_camel_case_types)] struct [<# loop>]; }
    /// ```
    fn test_raw_mode_paste_tokens() {}

    /// ```
    /// use pastey::paste;
    /// paste! { const _: &str = stringify!([<'\u{41}' bcde>]); }
    /// ```
    fn test_char_unicode_paste_tokens() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($t:ty) => {
    ///         paste! { let _: $t = std::string::String::new(); }
    ///     }
    /// }
    /// m!(String);
    /// ```
    fn test_none_group_not_followed_by_double_colon() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: u32 = [<99 invalid>]; }
    /// ```
    fn test_error_invalid_literal_with_trailing_tokens() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<@invalid>]; }
    /// ```
    fn test_error_invalid_identifier_special_char() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [identifier]; }
    /// ```
    fn test_error_expected_bracket_with_angle() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<identifier]; }
    /// ```
    fn test_error_expected_closing_angle() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<identifier> extra]; }
    /// ```
    fn test_error_unexpected_token_after_closing_angle() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<"byte\\string">]; }
    /// ```
    fn test_error_unsupported_escaped_string() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<b"byte_string">]; }
    /// ```
    fn test_error_unsupported_byte_string() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<x b'y'>]() {} }
    /// ```
    fn test_error_unsupported_byte_char_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<br"raw_byte">]; }
    /// ```
    fn test_error_unsupported_raw_byte_string() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<"string.with.dots">]; }
    /// ```
    fn test_error_unsupported_string_with_dots() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<"string+plus">]; }
    /// ```
    fn test_error_unsupported_string_with_plus() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<>]; }
    /// ```
    fn test_error_expected_content_in_brackets() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<a..b>]; }
    /// ```
    fn test_error_invalid_numeric_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [< >]; }
    /// ```
    fn test_error_no_tokens_in_paste() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<'static>]; }
    /// ```
    fn test_error_lifetime_without_identifier() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($x:ident) => {
    ///         paste! { const _: u32 = [<$x>]; }
    ///     }
    /// }
    /// m!(123);
    /// ```
    fn test_error_invalid_ident_starting_with_number() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<"terminated>]; }
    /// ```
    fn test_error_terminated_string_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { let x = [<y z>]; }
    /// ```
    fn test_error_multiple_tokens_non_paste() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { let x: i32 = [<not_a_number>]; }
    /// ```
    fn test_error_paste_result_type_mismatch() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<'a 'b>]; }
    /// ```
    fn test_error_multiple_lifetimes() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<42 56>]; }
    /// ```
    fn test_error_multiple_numeric_tokens() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! concat_idents {
    ///     ($a:ident, $b:ident) => { paste! { const TEST: u32 = [<method_ $a>](); } }
    /// }
    /// concat_idents!(test, func);
    /// ```
    fn test_error_method_call_on_paste_result() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _ : &str = [<r# if>]; }
    /// ```
    fn test_error_raw_keyword_identifier() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     () => { paste! { const _: u32 = [<>]; } }
    /// }
    /// m!();
    /// ```
    fn test_error_empty_macro_result() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<-identifier>]; }
    /// ```
    fn test_error_hyphen_at_start() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<'123>]; }
    /// ```
    fn test_error_apostrophe_with_number() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($lit:literal) => {
    ///         paste! { const _: &str = stringify!([<$lit>]); }
    ///     }
    /// }
    /// m!("both" "strings");
    /// ```
    fn test_error_invalid_literal_argument() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<'\u{D800}>]; }
    /// ```
    fn test_error_invalid_unicode_escape() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: u32 = [<0x>]; }
    /// ```
    fn test_error_incomplete_hex_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: u32 = [<0b>]; }
    /// ```
    fn test_error_incomplete_binary_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: f64 = [<1..5>]; }
    /// ```
    fn test_error_range_literal_invalid() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<if>]; }
    /// ```
    fn test_error_keyword_as_identifier() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<fn>]; }
    /// ```
    fn test_error_fn_keyword() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<match>]; }
    /// ```
    fn test_error_match_keyword() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<{inner}>]; }
    /// ```
    fn test_error_brace_group_in_paste() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<(parts)>]; }
    /// ```
    fn test_error_paren_group_in_paste() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! test {
    ///     () => { paste! { const _: &str = [<&&invalid>]; } }
    /// }
    /// test!();
    /// ```
    fn test_error_double_ampersand() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! test {
    ///     () => { paste! { const _: &str = [<||invalid>]; } }
    /// }
    /// test!();
    /// ```
    fn test_error_double_pipe() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: &str = [<@#$>]; }
    /// ```
    fn test_error_random_special_chars() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { let value: i32 = [<test>]; }
    /// ```
    fn test_error_undefined_identifier_value() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn doc_err_in_brace() { let _ = [<@>]; } }
    /// ```
    fn test_error_invalid_paste_inside_brace_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { const _: u32 = [<0 x>]; }
    /// ```
    fn test_error_pasted_incomplete_hex_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { #[cfg(test) trailing_token] fn f() {} }
    /// ```
    fn test_error_attr_trailing_tokens_after_paren_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<Foo::+Bar>]; }
    /// ```
    fn test_error_invalid_colon_sequence() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<Bar:::Test>]() {} }
    /// ```
    fn test_error_invalid_colon_patterns() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [*invalid>]() {} }
    /// ```
    fn test_error_bracket_first_token_not_less_than() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<test]() {} }
    /// ```
    fn test_error_bracket_closing_token_not_greater_than() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<test>extra]() {} }
    /// ```
    fn test_error_extra_tokens_after_bracket() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<test:replace('\u{XY}', 'A')>]() {} }
    /// ```
    fn test_error_invalid_hex_unicode() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! test_replace {
    ///     ($a:expr, $b:expr) => {
    ///         paste! { concat!(stringify!($a), stringify!($b)) }
    ///     }
    /// }
    /// let result = test_replace!(x, "y");
    /// ```
    fn test_macro_group_flattening() {}

    /// ```
    /// use pastey::paste;
    /// paste! { fn [<foo_bar>]() {} }
    /// foo_bar();
    /// ```
    fn test_valid_paste_operation() {}

    /// ```
    /// use pastey::paste;
    /// paste! { use std::[<vec>]; }
    /// let v = Vec::<i32>::new();
    /// assert_eq!(v.len(), 0);
    /// ```
    fn test_valid_path_with_double_colon() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! concat_name {
    ///     ($name:ident) => {
    ///         paste! { const [<$name:lower>]: &str = stringify!($name); }
    ///     }
    /// }
    /// concat_name!(TEST);
    /// ```
    fn test_valid_modifiers() {}

    /// ```
    /// use pastey::paste;
    /// macro_rules! test_ident_colon {
    ///     ($param:ident: $ty:ident) => {
    ///         paste! { fn [<test_$param>]($param: $ty) {} }
    ///     }
    /// }
    /// test_ident_colon!(x: i32);
    /// test_x(42i32);
    /// ```
    fn test_type_annotation() {}
}

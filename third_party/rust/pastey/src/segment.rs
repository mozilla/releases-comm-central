use crate::error::{Error, Result};
use proc_macro::{token_stream, Delimiter, Group, Ident, Literal, Span, TokenTree};
use std::iter::Peekable;

pub(crate) enum Segment {
    String(LitStr),
    Apostrophe(Span),
    Env(LitStr),
    Modifier(Colon, Ident),
    Replace(Colon, Group),
}

pub(crate) struct LitStr {
    pub value: String,
    pub span: Span,
}

pub(crate) struct Colon {
    pub span: Span,
}

pub(crate) fn parse(tokens: &mut Peekable<token_stream::IntoIter>) -> Result<Vec<Segment>> {
    let mut segments = Vec::new();
    while match tokens.peek() {
        None => false,
        Some(TokenTree::Punct(punct)) => punct.as_char() != '>',
        Some(_) => true,
    } {
        match tokens.next().unwrap() {
            TokenTree::Ident(ident) => {
                let mut fragment = ident.to_string();
                if fragment.starts_with("r#") {
                    fragment = fragment.split_off(2);
                }
                if fragment == "env"
                    && match tokens.peek() {
                        Some(TokenTree::Punct(punct)) => punct.as_char() == '!',
                        _ => false,
                    }
                {
                    let bang = tokens.next().unwrap(); // `!`
                    let expect_group = tokens.next();
                    let parenthesized = match &expect_group {
                        Some(TokenTree::Group(group))
                            if group.delimiter() == Delimiter::Parenthesis =>
                        {
                            group
                        }
                        Some(wrong) => return Err(Error::new(wrong.span(), "expected `(`")),
                        None => {
                            return Err(Error::new2(
                                ident.span(),
                                bang.span(),
                                "expected `(` after `env!`",
                            ));
                        }
                    };
                    let mut inner = parenthesized.stream().into_iter();
                    let lit = match inner.next() {
                        Some(TokenTree::Literal(lit)) => lit,
                        Some(wrong) => {
                            return Err(Error::new(wrong.span(), "expected string literal"))
                        }
                        None => {
                            return Err(Error::new2(
                                ident.span(),
                                parenthesized.span(),
                                "expected string literal as argument to env! macro",
                            ))
                        }
                    };

                    segments.push(Segment::Env(LitStr {
                        value: get_literal_string_value(&lit, false, false)?,
                        span: lit.span(),
                    }));

                    if let Some(unexpected) = inner.next() {
                        return Err(Error::new(
                            unexpected.span(),
                            "unexpected token in env! macro",
                        ));
                    }
                } else {
                    segments.push(Segment::String(LitStr {
                        value: fragment,
                        span: ident.span(),
                    }));
                }
            }
            TokenTree::Literal(lit) => {
                segments.push(Segment::String(LitStr {
                    value: lit.to_string(),
                    span: lit.span(),
                }));
            }
            // Note: `_` is always tokenized as an Ident, never a Punct, so there
            // is no `'_'` arm here, it would be unreachable dead code.
            TokenTree::Punct(punct) => match punct.as_char() {
                '\'' => segments.push(Segment::Apostrophe(punct.span())),
                ':' => {
                    let colon_span = punct.span();
                    let colon = Colon { span: colon_span };
                    let ident = match tokens.next() {
                        Some(TokenTree::Ident(ident)) => ident,
                        wrong => {
                            let span = wrong.as_ref().map_or(colon_span, TokenTree::span);
                            return Err(Error::new(span, "expected identifier after `:`"));
                        }
                    };

                    if ident.to_string().as_str() == "replace" {
                        let replace = tokens.next();

                        match replace {
                            Some(TokenTree::Group(group))
                                if group.delimiter() == Delimiter::Parenthesis =>
                            {
                                segments.push(Segment::Replace(colon, group));
                            }
                            _ => {
                                return Err(Error::new2(
                                    colon.span,
                                    ident.span(),
                                    "expected `(` after replace modifier",
                                ));
                            }
                        }
                    } else {
                        segments.push(Segment::Modifier(colon, ident));
                    }
                }
                '#' => segments.push(Segment::String(LitStr {
                    value: "#".to_string(),
                    span: punct.span(),
                })),
                _ => return Err(Error::new(punct.span(), "unexpected punct")),
            },
            TokenTree::Group(group) => {
                if group.delimiter() == Delimiter::None {
                    let mut inner = group.stream().into_iter().peekable();
                    let nested = parse(&mut inner)?;
                    if let Some(unexpected) = inner.next() {
                        return Err(Error::new(unexpected.span(), "unexpected token"));
                    }
                    segments.extend(nested);
                } else {
                    return Err(Error::new(group.span(), "unexpected token"));
                }
            }
        }
    }
    Ok(segments)
}

pub(crate) fn paste(segments: &[Segment]) -> Result<String> {
    let mut evaluated = Vec::new();
    let mut is_lifetime = false;

    for (i, segment) in segments.iter().enumerate() {
        match segment {
            Segment::String(segment) => {
                if segment.value.as_str() == "#" {
                    if i == 0 {
                        // Enable Raw mode
                        evaluated.push(String::from("r#"));
                        continue;
                    }
                    return Err(Error::new(
                        segment.span,
                        "`#` is reserved keyword and it enables the raw mode \
                            (i.e. generate Raw Identifiers) and it is only allowed in \
                            the beginning like `[< # ... >]`",
                    ));
                }
                evaluated.push(segment.value.clone());
            }
            Segment::Apostrophe(span) => {
                if is_lifetime {
                    return Err(Error::new(*span, "unexpected lifetime"));
                }
                is_lifetime = true;
            }
            Segment::Env(var) => {
                let resolved = match std::env::var(&var.value) {
                    Ok(resolved) => resolved,
                    Err(_) => {
                        return Err(Error::new(
                            var.span,
                            &format!("no such env var: {:?}", var.value),
                        ));
                    }
                };
                let resolved = resolved.replace('-', "_");
                evaluated.push(resolved);
            }
            Segment::Modifier(colon, ident) => {
                let last = match evaluated.pop() {
                    Some(last) => last,
                    None => {
                        return Err(Error::new2(colon.span, ident.span(), "unexpected modifier"))
                    }
                };
                match ident.to_string().as_str() {
                    "lower" => {
                        evaluated.push(last.to_lowercase());
                    }
                    "upper" => {
                        evaluated.push(last.to_uppercase());
                    }
                    "snake" => {
                        let mut acc = String::new();
                        let mut prev = '_';
                        for ch in last.chars() {
                            if ch.is_uppercase() && prev != '_' {
                                acc.push('_');
                            }
                            acc.push(ch);
                            prev = ch;
                        }
                        evaluated.push(acc.to_lowercase());
                    }
                    "camel" | "upper_camel" | "lower_camel" => {
                        let mut is_lower_camel = ident.to_string().as_str() == "lower_camel";
                        let mut acc = String::new();
                        let mut prev = '_';
                        for ch in last.chars() {
                            if ch != '_' {
                                if prev == '_' {
                                    if is_lower_camel {
                                        for chl in ch.to_lowercase() {
                                            acc.push(chl);
                                        }
                                        is_lower_camel = false;
                                    } else {
                                        for chu in ch.to_uppercase() {
                                            acc.push(chu);
                                        }
                                    }
                                } else if prev.is_uppercase() {
                                    for chl in ch.to_lowercase() {
                                        acc.push(chl);
                                    }
                                } else {
                                    acc.push(ch);
                                }
                            }
                            prev = ch;
                        }
                        evaluated.push(acc);
                    }
                    "camel_edge" => {
                        let mut acc = String::new();
                        let mut prev = '_';
                        for ch in last.chars() {
                            if ch != '_' {
                                if prev == '_' {
                                    for chu in ch.to_uppercase() {
                                        acc.push(chu);
                                    }
                                } else if prev.is_uppercase() {
                                    for chl in ch.to_lowercase() {
                                        acc.push(chl);
                                    }
                                } else {
                                    acc.push(ch);
                                }
                            } else if prev == '_' {
                                acc.push(ch);
                            }
                            prev = ch;
                        }
                        evaluated.push(acc);
                    }
                    _ => {
                        return Err(Error::new2(
                            colon.span,
                            ident.span(),
                            "unsupported modifier",
                        ));
                    }
                }
            }
            Segment::Replace(colon, group) => {
                let mut inner_stream = group.stream().into_iter();
                let from = inner_stream.next();
                let punct = inner_stream.next();
                let to = inner_stream.next();

                if let Some(unexpected_token) = inner_stream.next() {
                    return Err(Error::new(unexpected_token.span(), "expected `)`"));
                }

                match (from, punct, to) {
                    (Some(from), Some(TokenTree::Punct(punct)), Some(to))
                        if punct.as_char() == ',' =>
                    {
                        let last =
                            match evaluated.pop() {
                                Some(last) => last,
                                None => return Err(Error::new2(
                                    colon.span,
                                    group.span(),
                                    "replace modifier requires a preceding value to operate on.",
                                )),
                            };

                        let from_str = get_token_tree_string_value(&from)?;
                        let to_str = get_token_tree_string_value(&to)?;

                        let new_ident = last.replace(&from_str, &to_str);

                        evaluated.push(new_ident);
                    }
                    _ => {
                        return Err(Error::new(
                            group.span(),
                            "expected replace modifier format: `:replace(\"from\", \"to\")`",
                        ))
                    }
                }
            }
        }
    }

    let mut pasted = evaluated.into_iter().collect::<String>();
    if is_lifetime {
        pasted.insert(0, '\'');
    }
    Ok(pasted)
}

// The three defensive sub-conditions below can never evaluate to false when called
// from get_literal_string_value with a real proc_macro::Literal, because-
//
//   ends_with('"')   — the Rust tokenizer rejects unterminated string literals before
//                      the macro receives them, so starts_with('"') implies ends_with('"').
//   ends_with('\'')  — same: the tokenizer rejects unterminated char literals.
//   len() >= 2       — impossible once both prefix and suffix chars are confirmed present.
//
// These checks are kept for correctness in case this function is called with an
// arbitrary &str in the future.  The false branches are exercised by the
// unit tests below, which call is_quoted_string_or_char directly
// with raw &str values (e.g. "\"abc", "'abc", "\"").
// proc_macro::Literal has no constructor that produces such malformed tokens, so
// the test_helpers.rs (with paste_test macro) path cannot cover these branches.
fn is_quoted_string_or_char(l_str: &str, parse_char: bool) -> bool {
    ((l_str.starts_with('"') && l_str.ends_with('"'))
        || (parse_char && l_str.starts_with('\'') && l_str.ends_with('\'')))
        && l_str.len() >= 2
}

fn get_literal_string_value(l: &Literal, parse_char: bool, parse_numbers: bool) -> Result<String> {
    let l_str = l.to_string();

    if is_quoted_string_or_char(&l_str, parse_char) {
        // TODO: maybe handle escape sequences in the string if
        // someone has a use case.
        Ok(String::from(&l_str[1..l_str.len() - 1]))
    } else if parse_numbers {
        Ok(l_str)
    } else {
        Err(Error::new(l.span(), "expected string literal"))
    }
}

pub(crate) fn get_token_tree_string_value(t: &TokenTree) -> Result<String> {
    match t {
        TokenTree::Ident(ident) => Ok(ident.to_string()),
        TokenTree::Literal(literal) => get_literal_string_value(literal, true, true),
        TokenTree::Group(group) if group.delimiter() == Delimiter::None => {
            // Handle interpolated tokens from macro_rules (common in older Rust versions)
            let mut inner = group.stream().into_iter();
            if let Some(first) = inner.next() {
                if inner.next().is_none() {
                    // Single token in the group, recursively process it
                    return get_token_tree_string_value(&first);
                }
            }
            Err(Error::new(t.span(), "Expected either Ident, or Literal."))
        }
        _ => Err(Error::new(t.span(), "Expected either Ident, or Literal.")),
    }
}

#[cfg(test)]
mod tests {
    use super::is_quoted_string_or_char;

    #[test]
    fn test_is_quoted_string_or_char() {
        assert!(is_quoted_string_or_char("\"hello\"", false));
        assert!(!is_quoted_string_or_char("abc", false));
        assert!(!is_quoted_string_or_char("\"", false));
        assert!(!is_quoted_string_or_char("\"abc", false));
        assert!(is_quoted_string_or_char("'a'", true));
        assert!(!is_quoted_string_or_char("'abc", true));
        assert!(!is_quoted_string_or_char("abc", true));
    }
}

#[cfg(doctest)]
#[doc(hidden)]
mod doc_tests {
    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a + b>]() {} }
    /// ```
    fn test_unexpected_punct() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<{}>]() {} }
    /// ```
    fn test_unexpected_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env! foo>]() {} }
    /// ```
    fn test_env_missing_paren() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!(foo)>]() {} }
    /// ```
    fn test_env_non_literal_arg() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!()>]() {} }
    /// ```
    fn test_env_empty() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!("CARGO_PKG_NAME" "extra")>]() {} }
    /// ```
    fn test_env_unexpected_token() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a:>]() {} }
    /// ```
    fn test_no_ident_after_colon() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a:replace x>]() {} }
    /// ```
    fn test_replace_missing_paren() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a:pillow>]() {} }
    /// ```
    fn test_unsupported_modifier() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a:replace("x","y","z")>]() {} }
    /// ```
    fn test_replace_extra_token() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<:replace("H","W")>]; }
    /// ```
    fn test_replace_no_preceding_value() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<a:replace(x)>]() {} }
    /// ```
    fn test_replace_wrong_format() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<foo # bar>]; }
    /// ```
    fn test_raw_mode_wrong_position() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<'a 'b>]() {} }
    /// ```
    fn test_unexpected_lifetime() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!("THIS_VAR_DOES_NOT_EXIST_XYZ_999")>]() {} }
    /// ```
    fn test_no_such_env_var() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<:lower>]() {} }
    /// ```
    fn test_modifier_no_preceding_value() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!["CARGO_PKG_NAME"]>]() {} }
    /// ```
    fn test_env_bracket_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<a:replace["x", "y"]>]; }
    /// ```
    fn test_replace_bracket_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($e:expr) => { paste! { fn [<$e foo>]() {} } }
    /// }
    /// m!(1 > 0);
    /// ```
    fn test_none_group_unexpected_token() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<a:replace("x"; "y")>]; }
    /// ```
    fn test_replace_wrong_separator() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!(42)>]() {} }
    /// ```
    fn test_env_numeric_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { fn [<env!('a')>]() {} }
    /// ```
    fn test_env_char_literal() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// paste! { struct [<Foo:replace(["x"], "y")>]; }
    /// ```
    fn test_replace_from_bracket_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($from:expr) => { paste! { struct [<Foo:replace($from, "y")>]; } }
    /// }
    /// m!(x + y);
    /// ```
    fn test_replace_from_multi_token_none_group() {}

    /// ```compile_fail
    /// use pastey::paste;
    /// macro_rules! m {
    ///     ($to:expr) => { paste! { struct [<Foo:replace("o", $to)>]; } }
    /// }
    /// m!(x + y);
    /// ```
    fn test_replace_to_multi_token_none_group() {}
}

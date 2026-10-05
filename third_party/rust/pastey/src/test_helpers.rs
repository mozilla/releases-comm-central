// These functions test `expand_attr` and `parse_bracket_as_segments`, which cannot be called
// directly through the public API because most error cases are pre-validated before reaching them.
// Unit tests cannot be used either, since the `proc_macro` crate is unavailable outside a
// proc macro execution context. Coverage is disabled because these are internal test helpers,
// not production code.

use crate::attr::expand_attr;
use proc_macro::{Delimiter, Group, Ident, Punct, Spacing, Span, TokenStream, TokenTree};
use std::str::FromStr;

use super::{expand, parse_bracket_as_segments, pasted_to_tokens};

#[cfg_attr(coverage_nightly, coverage(off))]
pub(super) fn expand_attr_test(scope: Span) {
    {
        let mut attr_ts = TokenStream::new();
        attr_ts.extend([
            TokenTree::Ident(Ident::new("doc", scope)),
            TokenTree::Punct(Punct::new('=', Spacing::Alone)),
            TokenTree::Group(Group::new(Delimiter::None, TokenStream::new())),
        ]);
        let mut flag = false;
        let _ = expand_attr(attr_ts, scope, &mut flag);
    }

    {
        let mut attr_ts = TokenStream::new();
        attr_ts.extend([
            TokenTree::Ident(Ident::new("doc", scope)),
            TokenTree::Punct(Punct::new('=', Spacing::Alone)),
            TokenTree::Punct(Punct::new('\'', Spacing::Joint)),
            TokenTree::Punct(Punct::new('\'', Spacing::Alone)),
        ]);
        let _ = expand_attr(attr_ts, scope, &mut false);
    }

    {
        let mut attr_ts = TokenStream::new();
        attr_ts.extend([
            TokenTree::Ident(Ident::new("allow", scope)),
            TokenTree::Group(Group::new(
                Delimiter::Parenthesis,
                TokenStream::from_str("doc = : \"world\"").unwrap(),
            )),
        ]);
        let _ = expand_attr(attr_ts, scope, &mut false);
    }

    {
        let mut paren_ts = TokenStream::from_str("doc = : \"world\"").unwrap();
        paren_ts.extend([
            TokenTree::Punct(Punct::new(',', Spacing::Alone)),
            TokenTree::Ident(Ident::new("allow", scope)),
        ]);
        let mut attr_ts = TokenStream::new();
        attr_ts.extend([
            TokenTree::Ident(Ident::new("cfg_attr", scope)),
            TokenTree::Group(Group::new(Delimiter::Parenthesis, paren_ts)),
        ]);
        let _ = expand_attr(attr_ts, scope, &mut false);
    }

    {
        let mut contains = false;
        let _ = expand(
            TokenStream::from_str("# [ doc = : \"world\" ] fn f () { }").unwrap(),
            &mut contains,
            true,
        );
    }

    {
        let mut ts = TokenStream::new();
        ts.extend([
            TokenTree::Group(Group::new(
                Delimiter::None,
                TokenStream::from_str("x").unwrap(),
            )),
            TokenTree::Punct(Punct::new(':', Spacing::Alone)),
            TokenTree::Punct(Punct::new('@', Spacing::Alone)),
        ]);
        let _ = expand(ts, &mut false, false);
    }

    {
        let mut inner_bracket = TokenStream::new();
        inner_bracket.extend([
            TokenTree::Punct(Punct::new('<', Spacing::Alone)),
            TokenTree::Ident(Ident::new("foo", scope)),
            TokenTree::Punct(Punct::new('+', Spacing::Alone)),
            TokenTree::Ident(Ident::new("bar", scope)),
            TokenTree::Punct(Punct::new('>', Spacing::Alone)),
        ]);
        let bracket = TokenTree::Group(Group::new(Delimiter::Bracket, inner_bracket));
        let mut paren_inner = TokenStream::new();
        paren_inner.extend([bracket]);
        let paren_ts = TokenStream::from(TokenTree::Group(Group::new(
            Delimiter::Parenthesis,
            paren_inner,
        )));
        let _ = expand(paren_ts, &mut false, false);
    }

    {
        let mut inner = TokenStream::new();
        inner.extend([
            TokenTree::Ident(Ident::new("x", scope)),
            TokenTree::Punct(Punct::new(':', Spacing::Alone)),
        ]);
        let mut ts = TokenStream::new();
        ts.extend([TokenTree::Group(Group::new(Delimiter::None, inner))]);
        let _ = expand(ts, &mut false, true);
    }

    {
        let mut inner = TokenStream::new();
        inner.extend([
            TokenTree::Ident(Ident::new("x", scope)),
            TokenTree::Punct(Punct::new(':', Spacing::Joint)),
            TokenTree::Punct(Punct::new('@', Spacing::Alone)),
        ]);
        let mut ts = TokenStream::new();
        ts.extend([TokenTree::Group(Group::new(Delimiter::None, inner))]);
        let _ = expand(ts, &mut false, true);
    }

    {
        let mut inner = TokenStream::new();
        inner.extend([
            TokenTree::Ident(Ident::new("x", scope)),
            TokenTree::Punct(Punct::new(':', Spacing::Joint)),
            TokenTree::Punct(Punct::new(':', Spacing::Joint)),
        ]);
        let mut ts = TokenStream::new();
        ts.extend([TokenTree::Group(Group::new(Delimiter::None, inner))]);
        let _ = expand(ts, &mut false, true);
    }
}

#[cfg_attr(coverage_nightly, coverage(off))]
pub(super) fn parse_bracket_as_segments_test(scope: Span) {
    let _ = parse_bracket_as_segments(TokenStream::from_str("foo >").unwrap(), scope);
    let _ = parse_bracket_as_segments(TokenStream::new(), scope);
    let _ = parse_bracket_as_segments(TokenStream::from_str("< foo").unwrap(), scope);
    let _ = parse_bracket_as_segments(TokenStream::from_str("< foo > extra").unwrap(), scope);
    let _ = parse_bracket_as_segments(TokenStream::from_str("< foo +").unwrap(), scope);
    let _ = pasted_to_tokens(String::from("0invalid"), scope);
    let _ = pasted_to_tokens(String::from("0 "), scope);
    let _ = parse_bracket_as_segments(TokenStream::from_str("< env !").unwrap(), scope);

    {
        let mut inner_ts = TokenStream::new();
        inner_ts.extend([TokenTree::Punct(Punct::new('@', Spacing::Alone))]);
        let mut ts = TokenStream::new();
        ts.extend([
            TokenTree::Punct(Punct::new('<', Spacing::Alone)),
            TokenTree::Group(Group::new(Delimiter::None, inner_ts)),
            TokenTree::Punct(Punct::new('>', Spacing::Alone)),
        ]);
        let _ = parse_bracket_as_segments(ts, scope);
    }

    {
        let mut ts = TokenStream::new();
        ts.extend([
            TokenTree::Punct(Punct::new('*', Spacing::Alone)),
            TokenTree::Ident(Ident::new("foo", scope)),
            TokenTree::Punct(Punct::new('>', Spacing::Alone)),
        ]);
        let _ = parse_bracket_as_segments(ts, scope);
    }
}

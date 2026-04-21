/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Types for working with [OData query
//! parameters](https://learn.microsoft.com/en-us/graph/query-parameters).

use std::borrow::Cow;
use std::fmt::{Display, Formatter};
use thiserror::Error;

/// Common internal representation of the `$select` parameter.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Selection<P: Clone> {
    // The API seems to deduplicate on the server-side, so we don't need to do that. Because this
    // parameter will likely consist of a few small enum variants, vec operations are a good fit.
    properties: Vec<P>,
}

impl<T: Clone> Default for Selection<T> {
    fn default() -> Self {
        Self {
            properties: Vec::new(),
        }
    }
}

impl<P: Display + Clone> Selection<P> {
    /// Set the selected properties.
    pub fn select<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.properties = properties.into_iter().collect();
    }

    /// Add additional properties to the selection.
    pub fn extend<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.properties.extend(properties);
    }

    /// Get the selection as a (key, value) pair. Useful for combining with
    /// `form_urlencoded::Serializer::append_pair` and similar.
    pub fn pair(&self) -> Option<(&'static str, String)> {
        if self.properties.is_empty() {
            None
        } else {
            Some((
                "$select",
                self.properties
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(","),
            ))
        }
    }
}

/// Common internal representation of the `$expand` parameter.
#[derive(Clone, Debug)]
pub(crate) struct ExpansionList<E: Clone> {
    expansions: Vec<E>,
}

impl<E: Clone> Default for ExpansionList<E> {
    fn default() -> Self {
        Self {
            expansions: Vec::new(),
        }
    }
}

impl<E: Display + Clone> ExpansionList<E> {
    /// Set the expanded properties.
    pub fn expand<I: IntoIterator<Item = E>>(&mut self, expansions: I) {
        self.expansions = expansions.into_iter().collect();
    }

    /// Add additional properties to be expanded.
    pub fn extend<I: IntoIterator<Item = E>>(&mut self, expansions: I) {
        self.expansions.extend(expansions);
    }

    /// Get the expansion as a (key, value) pair. Useful for combining with
    /// `form_urlencoded::Serializer::append_pair` and similar.
    pub fn pair(&self) -> Option<(&'static str, String)> {
        if self.expansions.is_empty() {
            None
        } else {
            Some((
                // There's a bug in Microsoft's code preventing `$expand` from
                // working with delta() queries, but it can be worked around by
                // just dropping the `$`. The docs say the `$` is only optional
                // on some APIs, and should always be included, so it's possible
                // that this should be done with post-processing on delta()
                // queries instead.
                "expand",
                self.expansions
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(","),
            ))
        }
    }
}

/// OData options that can be applied to an expanded property.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExpandOptions<P: Clone> {
    selection: Selection<P>,
    filter: FilterQuery,
}

impl<P: Clone> Default for ExpandOptions<P> {
    fn default() -> Self {
        Self {
            selection: Selection::default(),
            filter: FilterQuery::default(),
        }
    }
}

impl<P: Display + Clone> ExpandOptions<P> {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Select properties from the expansion.
    pub fn select<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.selection.select(properties);
    }

    /// Add additional properties to select from the expansion.
    pub fn extend_selection<I: IntoIterator<Item = P>>(&mut self, properties: I) {
        self.selection.extend(properties);
    }

    /// Apply the given filter to the expansion.
    pub fn filter(&mut self, expression: FilterExpression) {
        self.filter.set(expression);
    }

    /// Whether the expansion has no options set.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.selection.properties.is_empty() && self.filter.expression.is_none()
    }

    /// Format as `property_name` with any options applied.
    pub(crate) fn full_format(
        &self,
        f: &mut Formatter<'_>,
        property_name: impl Display,
    ) -> std::fmt::Result {
        if self.is_empty() {
            write!(f, "{property_name}")
        } else {
            write!(f, "{property_name}({self})")
        }
    }
}

impl<P: Display + Clone> Display for ExpandOptions<P> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let mut parts = Vec::new();
        if let Some((select, selection)) = self.selection.pair() {
            parts.push(format!("{select}={selection}"));
        }
        if let Some((filter, expression)) = self.filter.pair() {
            parts.push(format!("{filter}={expression}"));
        }
        write!(f, "{}", parts.join(";"))
    }
}

/// Common internal representation of the `$filter` parameter.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct FilterQuery {
    expression: Option<FilterExpression>,
}

impl FilterQuery {
    pub fn set(&mut self, expression: FilterExpression) {
        self.expression = Some(expression);
    }

    /// Get the filter query as a (key, value) pair. Useful for combining with
    /// `form_urlencoded::Serializer::append_pair` and similar.
    pub fn pair(&self) -> Option<(&'static str, String)> {
        self.expression
            .as_ref()
            .map(|expression| ("$filter", expression.to_string()))
    }
}

/// An OData filter identifier.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FilterIdentifier(Cow<'static, str>);

/// Construct a [`FilterIdentifier`] and validate it at compile time.
#[macro_export]
macro_rules! filter_ident {
    ($value:expr) => {
        match $crate::odata::FilterIdentifier::from_static($value) {
            Ok(ident) => ident,
            Err(err) => panic!("invalid OData filter identifier literal: {err}"),
        }
    };
}

impl Display for FilterIdentifier {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let Self(name) = self;
        write!(f, "{name}")
    }
}

impl FilterIdentifier {
    pub const fn from_static(value: &'static str) -> Result<Self, InvalidFilterIdentifier> {
        match validate_filter_identifier(value) {
            Ok(()) => Ok(Self(Cow::Borrowed(value))),
            Err(err) => Err(err),
        }
    }
}

/// Reasons why a string is not a valid OData filter identifier.
///
/// This currently validates the ASCII subset of the [OData identifier grammar]:
/// the first character must be `[A-Za-z_]`, subsequent characters must be
/// `[A-Za-z0-9_]`, and the identifier must be at most 128 characters long.
///
/// [OData identifier grammar]: https://github.com/oasis-tcs/odata-abnf/blob/main/abnf/odata-abnf-construction-rules.txt
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum InvalidFilterIdentifier {
    #[error("OData filter identifiers must not be empty")]
    Empty,

    #[error("OData filter identifiers must be at most 128 characters")]
    TooLong,

    #[error("OData filter identifiers currently only support ASCII")]
    NonAscii,

    #[error("invalid leading character in OData filter identifier: {0:?}")]
    InvalidLeadingCharacter(char),

    #[error("invalid character in OData filter identifier: {0:?}")]
    InvalidCharacter(char),
}

const fn validate_filter_identifier(value: &str) -> Result<(), InvalidFilterIdentifier> {
    let bytes = value.as_bytes();
    if bytes.is_empty() {
        return Err(InvalidFilterIdentifier::Empty);
    }

    if bytes.len() > 128 {
        return Err(InvalidFilterIdentifier::TooLong);
    }

    if !value.is_ascii() {
        return Err(InvalidFilterIdentifier::NonAscii);
    }

    if !(bytes[0].is_ascii_alphabetic() || bytes[0] == b'_') {
        return Err(InvalidFilterIdentifier::InvalidLeadingCharacter(
            bytes[0] as char,
        ));
    }

    let mut idx = 1;
    while idx < bytes.len() {
        if !(bytes[idx].is_ascii_alphanumeric() || bytes[idx] == b'_') {
            return Err(InvalidFilterIdentifier::InvalidCharacter(
                bytes[idx] as char,
            ));
        }
        idx += 1;
    }

    Ok(())
}

impl TryFrom<String> for FilterIdentifier {
    type Error = InvalidFilterIdentifier;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        validate_filter_identifier(&value)?;
        Ok(Self(Cow::Owned(value)))
    }
}

/// An operand within an OData filter expression.
// See "Literal Data Values" for the exhaustive list of operand types we may
// need to support, though note that because there are no type annotations in
// URLs, not all types need to be explicitly expressed here (e.g., Integer
// stores an i64, which can represent all the int types):
// https://github.com/oasis-tcs/odata-abnf/blob/main/abnf/odata-abnf-construction-rules.txt
// See also the examples here:
// https://docs.oasis-open.org/odata/odata/v4.02/csd01/part2-url-conventions/odata-v4.02-csd01-part2-url-conventions.html#Literals
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FilterOperand {
    Null,
    String(String),
    Bool(bool),
    Integer(i64),
}

impl Display for FilterOperand {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Null => write!(f, "null"),
            Self::String(value) => write!(f, "'{}'", value.replace('\'', "''")),
            Self::Bool(value) => write!(f, "{value}"),
            Self::Integer(value) => write!(f, "{value}"),
        }
    }
}

impl From<String> for FilterOperand {
    fn from(value: String) -> Self {
        Self::String(value)
    }
}

impl From<&str> for FilterOperand {
    fn from(value: &str) -> Self {
        Self::String(value.to_string())
    }
}

impl From<bool> for FilterOperand {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl From<i64> for FilterOperand {
    fn from(value: i64) -> Self {
        Self::Integer(value)
    }
}

/// An OData filter expression.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FilterExpression {
    Or(Box<Self>, Box<Self>),
    And(Box<Self>, Box<Self>),
    Eq(FilterIdentifier, FilterOperand),
}

impl FilterExpression {
    #[must_use]
    pub fn eq(lhs: FilterIdentifier, rhs: impl Into<FilterOperand>) -> Self {
        Self::Eq(lhs, rhs.into())
    }

    #[must_use]
    pub fn and(lhs: Self, rhs: Self) -> Self {
        Self::And(Box::new(lhs), Box::new(rhs))
    }

    #[must_use]
    pub fn or(lhs: Self, rhs: Self) -> Self {
        Self::Or(Box::new(lhs), Box::new(rhs))
    }
}

impl Display for FilterExpression {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        // this adds more () than necessary, but keeps the implementation simple
        match self {
            Self::Eq(lhs, rhs) => write!(f, "{lhs} eq {rhs}"),
            Self::And(lhs, rhs) => write!(f, "({lhs} and {rhs})"),
            Self::Or(lhs, rhs) => write!(f, "({lhs} or {rhs})"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ExpandOptions, FilterExpression, Selection};
    use crate::{
        Error, Expand, Filter, Operation, Select, paths, paths::me::mail_folders,
        types::mail_folder, types::user,
    };
    use http::uri;

    #[test]
    fn serialize_selection() {
        let mut selection = Selection::default();
        selection.extend(vec![user::UserSelection::AboutMe]);
        let (key, value) = selection.pair().unwrap();
        assert_eq!(key, "$select");
        assert_eq!(value, "aboutMe");
    }

    #[test]
    fn serialize_filter_expression() {
        let filter = FilterExpression::and(
            FilterExpression::eq(filter_ident!("id"), "foo"),
            FilterExpression::or(
                FilterExpression::eq(filter_ident!("isRead"), true),
                FilterExpression::or(
                    FilterExpression::eq(filter_ident!("parentFolderId"), "bar"),
                    FilterExpression::eq(filter_ident!("baz"), 0),
                ),
            ),
        );
        assert_eq!(
            filter.to_string(),
            "(id eq 'foo' and (isRead eq true or (parentFolderId eq 'bar' or baz eq 0)))"
        );
    }

    #[test]
    fn serialize_expand_options() {
        let mut options = ExpandOptions::new();
        options.select([mail_folder::MailFolderSelection::DisplayName]);
        options.filter(FilterExpression::eq(filter_ident!("displayName"), "foo"));
        assert_eq!(
            options.to_string(),
            "$select=displayName;$filter=displayName eq 'foo'"
        );
    }

    #[test]
    fn serialize_get_me() -> Result<(), Error> {
        let mut get_me = paths::me::Get::new("https://graph.microsoft.com/v1.0".to_string());
        get_me.select(vec![user::UserSelection::AboutMe]);
        let req = get_me.build_request()?;
        let uri = req.uri();

        // <https://graph.microsoft.com/v1.0/me?$select=aboutMe>
        let expected =
            uri::Uri::try_from("https://graph.microsoft.com/v1.0/me?%24select=aboutMe").unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }

    #[test]
    fn serialize_message_delta_with_filter() -> Result<(), Error> {
        let mut request = paths::me::mail_folders::mail_folder_id::messages::delta::Get::new(
            "https://graph.microsoft.com/v1.0".to_string(),
            "inbox".to_string(),
        );
        request.filter(FilterExpression::eq(
            filter_ident!("parentFolderId"),
            "inbox",
        ));
        let req = request.build_request()?;
        let uri = req.uri();

        // <https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta()?$filter=parentFolderId eq 'inbox'>
        let expected = uri::Uri::try_from(
            "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta()?%24filter=parentFolderId+eq+%27inbox%27",
        )
        .unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }

    #[test]
    fn serialize_mail_folders_with_multiple_odata_params() -> Result<(), Error> {
        let mut request = mail_folders::Get::new("https://graph.microsoft.com/v1.0".to_string());
        let mut child_folders = ExpandOptions::new();
        child_folders.select([mail_folder::MailFolderSelection::DisplayName]);
        request.select([mail_folder::MailFolderSelection::DisplayName]);
        request.expand([mail_folder::MailFolderExpand::ChildFolders(child_folders)]);
        let req = request.build_request()?;
        let uri = req.uri();

        // <https://graph.microsoft.com/v1.0/me/mailFolders?$select=displayName&expand=childFolders($select=displayName)>
        let expected = uri::Uri::try_from(
            "https://graph.microsoft.com/v1.0/me/mailFolders?%24select=displayName&expand=childFolders%28%24select%3DdisplayName%29",
        )
        .unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }

    #[test]
    fn serialize_mail_folders_with_expand() -> Result<(), Error> {
        let mut request = mail_folders::Get::new("https://graph.microsoft.com/v1.0".to_string());
        let mut child_folders = ExpandOptions::new();
        child_folders.select([mail_folder::MailFolderSelection::DisplayName]);
        request.expand([mail_folder::MailFolderExpand::ChildFolders(child_folders)]);
        let req = request.build_request()?;
        let uri = req.uri();

        // <https://graph.microsoft.com/v1.0/me/mailFolders?expand=childFolders($select=displayName)>
        let expected = uri::Uri::try_from(
            "https://graph.microsoft.com/v1.0/me/mailFolders?expand=childFolders%28%24select%3DdisplayName%29",
        )
        .unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }

    #[test]
    fn serialize_expand_with_multiple_odata_params() -> Result<(), Error> {
        let mut request = mail_folders::Get::new("https://graph.microsoft.com/v1.0".to_string());
        let mut child_folders = ExpandOptions::new();
        child_folders.select([mail_folder::MailFolderSelection::DisplayName]);
        child_folders.filter(FilterExpression::eq(filter_ident!("displayName"), "inbox"));
        request.expand([mail_folder::MailFolderExpand::ChildFolders(child_folders)]);
        let req = request.build_request()?;
        let uri = req.uri();

        // <https://graph.microsoft.com/v1.0/me/mailFolders?expand=childFolders($select=displayName;$filter=displayName eq 'inbox')>
        let expected = uri::Uri::try_from(
            "https://graph.microsoft.com/v1.0/me/mailFolders?expand=childFolders%28%24select%3DdisplayName%3B%24filter%3DdisplayName+eq+%27inbox%27%29",
        )
        .unwrap();
        assert_eq!(*uri, expected);

        Ok(())
    }
}

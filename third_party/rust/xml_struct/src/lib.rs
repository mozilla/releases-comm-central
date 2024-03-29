/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This crate provides a mechanism for serializing Rust data structures as
//! well-formed XML with a minimum of boilerplate.
//!
//! Consumers can provide manual implementations of the [`XmlSerialize`] and
//! [`XmlSerializeAttr`] traits if desired, but the primary intent of this crate
//! is to provide automated derivation of these traits in order to facilitate
//! serialization of complex XML structures.
//!
//! # Limitations
//!
//! At present, derived implementations of these traits are designed to handle
//! the specific case of Microsoft Exchange Web Services. As such, all XML
//! elements and attributes are named in PascalCase and certain behaviors are
//! not supported (such as serializing enum variants without enclosing XML
//! elements derived from the variant name).
//!
//! Furthermore, the PascalCase implementation is naïve and depends on
//! [`char::to_ascii_uppercase`], making it unsuitable for use with non-ASCII
//! identifiers.
//!
//! There is also currently no provision for deserialization from XML, as the
//! support offered by `quick_xml`'s serde implementation has been found to be
//! sufficient for the time being.
//!
//! In recognition of these limitations, this crate should not be published to
//! crates.io at this time. If a generalized implementation generates interest
//! or is thought to have merit, these limitations may be addressed at a later
//! time.

mod impls;
mod tests;

use quick_xml::{
    events::{BytesEnd, BytesStart, Event},
    Writer,
};
use thiserror::Error;

pub use xml_struct_derive::*;

/// A data structure which can be serialized as XML content nodes.
///
/// # Usage
///
/// The following demonstrates end-to-end usage of `XmlSerialize` with both
/// derived and manual implementations.
///
/// ```
/// use quick_xml::{
///     events::{BytesText, Event},
///     writer::Writer
/// };
/// use xml_struct::{Error, XmlSerialize};
///
/// #[derive(XmlSerialize)]
/// #[xml_struct(default_ns = "http://foo.example/")]
/// struct Foo {
///     some_field: String,
///
///     #[xml_struct(flatten)]
///     something_else: Bar,
/// }
///
/// enum Bar {
///     Baz,
///     Qux(String),
/// }
///
/// impl XmlSerialize for Bar {
///     fn serialize_child_nodes<W>(&self, writer: &mut Writer<W>) -> Result<(), Error>
///     where
///         W: std::io::Write,
///     {
///         match self {
///             Self::Baz => writer.write_event(Event::Text(BytesText::new("BAZ")))?,
///             Self::Qux(qux) => qux.serialize_as_element(writer, "Qux")?,
///         }
///
///         Ok(())
///     }
/// }
///
/// let mut writer: Writer<Vec<u8>> = Writer::new(Vec::new());
/// let foo = Foo {
///     some_field: "foo".into(),
///     something_else: Bar::Baz,
/// };
///
/// assert!(foo.serialize_as_element(&mut writer, "FlyYouFoo").is_ok());
///
/// let out = writer.into_inner();
/// let out = std::str::from_utf8(&out).unwrap();
///
/// assert_eq!(
///     out,
///     r#"<FlyYouFoo xmlns="http://foo.example/"><SomeField>foo</SomeField>BAZ</FlyYouFoo>"#,
/// );
/// ```
pub trait XmlSerialize {
    /// Serializes this value as XML content nodes within an enclosing XML
    /// element.
    fn serialize_as_element<W>(&self, writer: &mut Writer<W>, name: &str) -> Result<(), Error>
    where
        W: std::io::Write,
    {
        writer.write_event(Event::Start(BytesStart::new(name)))?;

        self.serialize_child_nodes(writer)?;

        writer.write_event(Event::End(BytesEnd::new(name)))?;

        Ok(())
    }

    /// Serializes this value as XML content nodes.
    fn serialize_child_nodes<W>(&self, writer: &mut Writer<W>) -> Result<(), Error>
    where
        W: std::io::Write;
}

/// A data structure which can be serialized as the value of an XML attribute.
pub trait XmlSerializeAttr {
    /// Serializes this value as the value of an XML attribute.
    fn serialize_as_attribute(&self, start_tag: &mut BytesStart, name: &str);
}

/// An error generated during the XML serialization process.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum Error {
    #[error("failed to process XML document")]
    Xml(#[from] quick_xml::Error),
}

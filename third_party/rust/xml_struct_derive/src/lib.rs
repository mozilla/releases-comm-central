/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod properties;
mod serialize;

use syn::{parse_macro_input, DeriveInput};

pub(crate) use properties::*;

use crate::serialize::{write_serialize_impl_for_enum, write_serialize_impl_for_struct};

// This value must match the `attributes` attribute for the derive macro.
const MACRO_ATTRIBUTE: &str = "xml_struct";

/// A macro providing automated derivation of the `XmlSerialize` trait.
///
/// By default, when applied to a struct, the resulting implementation will
/// serialize each of the struct's fields as an XML element with a tag name
/// derived from the name of the field.
///
/// For example, the following declaration corresponds to the following output:
///
/// ```ignore
/// #[derive(XmlSerialize)]
/// struct Foo {
///     some_field: SerializeableType,
///     another: String,
/// }
///
/// let foo = Foo {
///     some_field: SerializeableType {
///         ...
///     },
///     another: String::from("I am text!"),
/// };
/// ```
///
/// ```text
/// <SomeField>
///     ...
/// </SomeField>
/// <Another>
///     I am text!
/// </Another>
/// ```
///
/// When applied to an enum, the implementation will write an XML element with a
/// tag name derived from the name of the variant. Any fields of the variant
/// will be serialized as children of that element, with tag names derived from
/// the name of the field.
///
/// As above, the following enum corresponds to the following output:
///
/// ```ignore
/// #[derive(XmlSerialize)]
/// enum Bar {
///     Foobar {
///         some_field: SerializeableType,
///         another: String,
///     },
///     ...
/// }
///
/// let bar = Bar::Foobar {
///     some_field: SerializeableType {
///         ...
///     },
///     another: String::from("I am text!"),
/// };
/// ```
///
/// ```text
/// <Foobar>
///     <SomeField>
///         ...
///     </SomeField>
///     <Another>
///         I am text!
///     </Another>
/// </Foobar>
/// ```
///
/// Unnamed fields, i.e. fields of tuple structs or enum tuple variants, are
/// serialized without an enclosing element.
///
/// Enums which consist solely of unit variants will also receive an
/// implementation of the `XmlSerializeAttr` trait.
///
/// # Configuration
///
/// The output from derived implementations may be configured with the
/// `xml_struct` attribute. For example, serializing the following as an element
/// named "Baz" corresponds to the following output:
///
/// ```ignore
/// #[derive(XmlSerialize)]
/// #[xml_struct(default_ns = "http://foo.example/")]
/// struct Baz {
///     #[xml_struct(flatten)]
///     some_field: SerializeableType,
///
///     #[xml_struct(attribute, ns_prefix = "foo")]
///     another: String,
/// }
///
/// let foo = Baz {
///     some_field: SerializeableType {
///         ...
///     },
///     another: String::from("I am text!"),
/// };
/// ```
///
/// ```text
/// <Baz xmlns="http://foo.example/" foo:Another="I am text!">
///     ...
/// </Baz>
/// ```
///
/// The following options are available:
///
/// ## Data Structures
///
/// These options affect the serialization of a struct or enum as a whole.
///
/// - `default_ns = "http://foo.example/"`
///
///   Provides the name to be used as the default namespace of elements
///   representing the marked structure, i.e.:
///
///   ```text
///   <Element xmlns="http://foo.example/"/>
///   ```
///
///   **NOTE**: The namespace will not be specified if values are serialized as
///   content nodes only.
///
/// - `ns = ("foo", "http://foo.example/")`
///
///   Declares a namespace to be used for elements representing the marked
///   structure, i.e.:
///
///   ```text
///   <Element xmlns:foo="http://foo.example/"/>
///   ```
///
///   Multiple namespaces may be declared for each structure.
///
///   **NOTE**: The namespace will not be specified if values are serialized as
///   content nodes only.
///
/// - `text`
///
///   Specifies that a marked enum's variants should be serialized as text nodes
///   or as XML attribute values (depending on use in containing structures).
///
///   **NOTE**: This option is only valid for enums which contain solely unit
///   variants.
///
/// - `variant_ns_prefix = "foo"`
///
///   Specifies that a marked enum's variants, when serialized as XML elements,
///   should include a namespace prefix, i.e.
///
///   ```text
///   <foo:Element/>
///   ```
///
///   **NOTE**: This option is only valid for enums which are not serialized as
///   text nodes.
///
/// ## Structure Fields
///
/// These options affect the serialization of a single field in a struct or enum
/// variant.
///
/// - `attribute`
///
///   Specifies that the marked field should be serialized as an XML attribute,
///   i.e. `Field="value"`.
///
/// - `element`
///
///   Specifies that the marked field should be serialized as an XML element.
///   This is the default behavior, and use of this attribute is optional.
///
/// - `flatten`
///
///   Specifies that the marked field should be serialized as content nodes
///   without an enclosing XML element.
///
/// - `ns_prefix = "foo"`
///
///   Specifies that the marked field, when serialized as an XML element or
///   attribute, should use include a namespace prefix, i.e. `foo:Field="value"`
///   or
///
///   ```text
///   <foo:Field/>
///   ```
#[proc_macro_derive(XmlSerialize, attributes(xml_struct))]
pub fn derive_xml_serialize(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    let props = match TypeProps::try_from_input(&input) {
        Ok(props) => props,
        Err(err) => return err.into_compile_error().into(),
    };

    let DeriveInput {
        generics, ident, ..
    } = input;

    match input.data {
        syn::Data::Struct(input) => write_serialize_impl_for_struct(ident, generics, input, props),
        syn::Data::Enum(input) => write_serialize_impl_for_enum(ident, generics, input, props),
        syn::Data::Union(_) => panic!("Serializing unions as XML is unsupported"),
    }
    // `syn` and `quote` use the `proc_macro2` crate, so internally we deal in
    // its `TokenStream`, but derive macros must use `proc_macro`'s, so convert
    // at the last minute.
    .into()
}

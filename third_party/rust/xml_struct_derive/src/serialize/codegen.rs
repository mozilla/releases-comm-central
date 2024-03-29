/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, Literal, TokenStream};
use quote::{quote, ToTokens};
use syn::Generics;

use crate::{FieldProps, FieldRepr, TypeProps};

/// Generates an implementation of the `XmlSerialize` trait and, if appropriate,
/// the `XmlSerializeAttr` trait.
pub(super) fn generate_serialize_impl_for<G>(
    type_ident: Ident,
    generics: Generics,
    props: TypeProps,
    body_generator: G,
) -> TokenStream
where
    G: FnOnce(&[XmlAttribute]) -> ImplTokenSets,
{
    let default_ns_attr = props.default_ns_name.map(|ns_name| XmlAttribute {
        // The terminology is a little confusing here. In terms of the XML
        // spec, the "name" of a namespace is the (usually) URI used as the
        // _value_ of the namespace declaration attribute.
        name: Literal::string("xmlns").into_token_stream(),
        value: ns_name,
    });

    let ns_decl_attrs = props.ns_decls.into_iter().map(|ns_decl| XmlAttribute {
        name: generate_static_string_concat("xmlns:", ns_decl.prefix),
        value: ns_decl.name,
    });

    let namespace_attrs: Vec<_> = default_ns_attr.into_iter().chain(ns_decl_attrs).collect();

    let ImplTokenSets {
        as_element_impl,
        child_nodes_body,
        as_attr_body,
    } = body_generator(&namespace_attrs);

    let (impl_generics, ty_generics, where_clause) = generics.split_for_impl();

    let attr_impl = if let Some(body) = as_attr_body {
        quote! {
            #[automatically_derived]
            impl #impl_generics ::xml_struct::XmlSerializeAttr for #type_ident #ty_generics #where_clause {
                fn serialize_as_attribute(&self, start_tag: &mut ::quick_xml::events::BytesStart, name: &str) {
                    #body
                }
            }
        }
    } else {
        // In cases where there is no clear text representation of a value, we
        // provide no derivation of `XmlSerializeAttr`.
        TokenStream::default()
    };

    // Construct the final implementation from the type-specific sets of tokens.
    quote! {
        #[automatically_derived]
        impl #impl_generics ::xml_struct::XmlSerialize for #type_ident #ty_generics #where_clause {
            #as_element_impl

            fn serialize_child_nodes<W: std::io::Write>(
                &self,
                writer: &mut ::quick_xml::writer::Writer<W>
            ) -> Result<(), ::xml_struct::Error> {
                #child_nodes_body

                Ok(())
            }
        }

        #attr_impl
    }
}

/// The sets of tokens which make up the implementations or bodies of
/// `XmlSerialize` and `XmlSerializeAttr` trait methods.
pub(super) struct ImplTokenSets {
    /// The implementation of `XmlSerialize::serialize_as_element()` if it is
    /// necessary to override the provided default implementation.
    as_element_impl: TokenStream,

    /// The body of `XmlSerialize::serialize_child_nodes()`.
    child_nodes_body: TokenStream,

    /// The body of `XmlSerializeAttr::serialize_as_attribute()` if the type is
    /// capable of being serialized as such.
    as_attr_body: Option<TokenStream>,
}

/// Creates a generator for the sets of tokens necessary to serialize a struct
/// with the provided fields.
pub(super) fn with_struct_fields(
    fields: Vec<Field>,
) -> impl FnOnce(&[XmlAttribute]) -> ImplTokenSets {
    move |namespace_attrs| {
        let Fields {
            attr_fields,
            child_fields,
        } = partition_fields(fields);

        let content_call = if !child_fields.is_empty() {
            Some(quote! {
                <Self as XmlSerialize>::serialize_child_nodes(self, writer)?;
            })
        } else {
            None
        };

        let impl_body =
            generate_xml_tag_calls(quote!(name), namespace_attrs, &attr_fields, content_call);

        ImplTokenSets {
            as_element_impl: quote! {
                fn serialize_as_element<W: std::io::Write>(
                    &self,
                    writer: &mut ::quick_xml::writer::Writer<W>,
                    name: &str,
                ) -> Result<(), ::xml_struct::Error> {
                    #impl_body

                    Ok(())
                }
            },
            child_nodes_body: generate_field_content_node_calls(child_fields),

            // There is no clear text representation of an arbitrary struct, so
            // we cannot provide an `XmlSerializeAttr` derivation.
            as_attr_body: None,
        }
    }
}

/// Creates a generator for the sets of tokens necessary to serialize a
/// unit-only enum as text nodes or attribute values.
pub(super) fn with_text_variants(
    variants: Vec<Ident>,
) -> impl FnOnce(&[XmlAttribute]) -> ImplTokenSets {
    // While the generator function takes namespace attributes as its argument,
    // we expect that the consuming code has already verified that there are
    // none for this enum, since attributes cannot be specified for text content
    // nodes.
    move |_| {
        let match_arms: Vec<_> = variants
            .iter()
            .map(|variant| quote!(Self::#variant => stringify!(#variant)))
            .collect();

        let text_from_value = quote! {
            let text = match self {
                #(#match_arms,)*
            };
        };

        ImplTokenSets {
            // No namespaces can be declared on enums which are serialized as
            // text, nor can they contain any attribute fields, so the default
            // implementation of `serialize_as_element()` is sufficient.
            as_element_impl: TokenStream::default(),
            child_nodes_body: quote! {
                #text_from_value

                writer.write_event(
                    ::quick_xml::events::Event::Text(
                        ::quick_xml::events::BytesText::new(text)
                    )
                )?;
            },
            as_attr_body: Some(quote! {
                #text_from_value

                // `start_tag` is one of the parameters to the
                // `serialize_as_attribute()` method.
                start_tag.push_attribute((name, text));
            }),
        }
    }
}

/// Creates a generator for the sets of tokens necessary to serialize an enum
/// with the provided variants.
pub(super) fn with_enum_variants(
    variants: Vec<Variant>,
    ns_prefix: Option<TokenStream>,
) -> impl FnOnce(&[XmlAttribute]) -> ImplTokenSets {
    move |namespace_attrs| {
        let match_arms: TokenStream = variants
            .into_iter()
            .map(|variant| {
                let ident = variant.ident;

                let name_tokens = {
                    // If the consumer has specified that variants should be
                    // serialized with a namespace prefix, we need to statically
                    // concatenate the prefix with the variant name. Otherwise,
                    // we just need to stringify the variant name.
                    if let Some(prefix) = &ns_prefix {
                        let ident_as_str = ident.to_string();
                        let ident_as_str_tokens = format!(":{ident_as_str}");
                        generate_static_string_concat(prefix, ident_as_str_tokens)
                    } else {
                        quote!(stringify!(#ident))
                    }
                };

                match variant.kind {
                    VariantKind::Struct(fields) => {
                        let VariantTokenSets {
                            accessors,
                            content_calls,
                        } = generate_variant_token_sets(name_tokens, namespace_attrs, fields);

                        quote! {
                            Self::#ident { #(#accessors),* } => {
                                #content_calls
                            }
                        }
                    }
                    VariantKind::Tuple(fields) => {
                        let VariantTokenSets {
                            accessors,
                            content_calls,
                        } = generate_variant_token_sets(name_tokens, namespace_attrs, fields);

                        quote! {
                            Self::#ident(#(#accessors),*) => {
                                #content_calls
                            }
                        }
                    }
                    VariantKind::Unit => {
                        let content_calls =
                            generate_xml_tag_calls(name_tokens, namespace_attrs, &[], None);

                        quote! {
                            Self::#ident => {
                                #content_calls
                            }
                        }
                    }
                }
            })
            .collect();

        ImplTokenSets {
            // No namespaces can be declared directly on the element enclosing
            // an enum value, nor can it be provided with attribute fields, so
            // the default `serialize_as_element()` implementation is
            // sufficient.
            as_element_impl: TokenStream::default(),

            child_nodes_body: quote! {
                match self {
                    #match_arms
                }
            },

            // There is no clear text representation of an arbitrary enum
            // variant, so we cannot provide an `XmlSerializeAttr` derivation.
            as_attr_body: None,
        }
    }
}

/// The common sets of tokens which make up a `match` arm for an enum variant.
struct VariantTokenSets {
    /// The identifiers used for accessing the fields of an enum variant.
    accessors: Vec<TokenStream>,

    /// The calls for serializing the child nodes of the XML element
    /// representing an enum variant.
    content_calls: TokenStream,
}

/// Generates a list of accessors and set of calls to serialize content for an
/// enum variant.
fn generate_variant_token_sets(
    name_tokens: TokenStream,
    namespace_attrs: &[XmlAttribute],
    fields: Vec<Field>,
) -> VariantTokenSets {
    let accessors: Vec<_> = fields
        .iter()
        .map(|field| &field.accessor)
        .cloned()
        .collect();

    let Fields {
        attr_fields,
        child_fields,
    } = partition_fields(fields);

    let child_node_calls = generate_field_content_node_calls(child_fields);

    let content_calls = generate_xml_tag_calls(
        name_tokens,
        namespace_attrs,
        &attr_fields,
        Some(child_node_calls),
    );

    VariantTokenSets {
        accessors,
        content_calls,
    }
}

/// Divides the fields of a struct or enum variant into those which will be
/// represented as attributes and those which will be represented as child nodes.
fn partition_fields(fields: Vec<Field>) -> Fields {
    let (attr_fields, child_fields) = fields
        .into_iter()
        .partition(|field| matches!(field.props.repr, FieldRepr::Attribute));

    Fields {
        attr_fields,
        child_fields,
    }
}

/// Generates tokens representing a call to add namespace attributes to an
/// element.
fn generate_namespace_attrs_call(namespace_attrs: &[XmlAttribute]) -> TokenStream {
    if !namespace_attrs.is_empty() {
        let namespace_attrs: Vec<_> = namespace_attrs
            .iter()
            .map(|XmlAttribute { name, value }| quote!((#name, #value)))
            .collect();

        quote! {
            .with_attributes([
                #(#namespace_attrs,)*
            ])
        }
    } else {
        TokenStream::default()
    }
}

/// Generates calls to serialize struct or enum fields as XML attributes.
fn generate_attribute_field_calls(attr_fields: &[Field]) -> TokenStream {
    if !attr_fields.is_empty() {
        attr_fields
            .iter()
            .map(|field| {
                let name = field_name_to_string_tokens(field);
                let accessor = &field.accessor;
                let ty = &field.ty;

                quote! {
                    <#ty as ::xml_struct::XmlSerializeAttr>::serialize_as_attribute(&#accessor, &mut start_tag, #name);
                }
            })
            .collect()
    } else {
        TokenStream::default()
    }
}

/// Generates calls to add a new XML element to a document, including any
/// necessary attributes and content nodes.
///
/// If `content_calls` is `None`, the XML element will be an empty tag (e.g.,
/// "<SomeTag/>"). Otherwise, the XML element will enclose any content added to
/// the writer by those calls.
fn generate_xml_tag_calls(
    name_tokens: TokenStream,
    namespace_attrs: &[XmlAttribute],
    attr_fields: &[Field],
    content_calls: Option<TokenStream>,
) -> TokenStream {
    let namespaces_call = generate_namespace_attrs_call(namespace_attrs);
    let attr_calls = generate_attribute_field_calls(attr_fields);

    let calls = if let Some(content_calls) = content_calls {
        // If the type has fields to serialize as child elements, wrap them
        // first in an appropriate parent element.
        quote! {
            writer.write_event(
                ::quick_xml::events::Event::Start(start_tag)
            )?;

            #content_calls

            writer.write_event(
                ::quick_xml::events::Event::End(
                    ::quick_xml::events::BytesEnd::new(#name_tokens)
                )
            )?;
        }
    } else {
        // If the type has no fields which are to be serialized as child
        // elements, write an empty XML tag.
        quote! {
            writer.write_event(
                ::quick_xml::events::Event::Empty(start_tag)
            )?;
        }
    };

    quote! {
        let mut start_tag = ::quick_xml::events::BytesStart::new(#name_tokens)
            #namespaces_call;

        #attr_calls

        #calls
    }
}

/// Generates calls to serialize the given fields as XML content nodes.
fn generate_field_content_node_calls(child_fields: Vec<Field>) -> TokenStream {
    child_fields
        .into_iter()
        .map(|field| {
            if matches!(field.props.repr, FieldRepr::Attribute) {
                panic!("attribute field passed to child node call generator");
            }

            let ty = &field.ty;
            let accessor = &field.accessor;

            match field.kind {
                FieldKind::Named(_) if !field.props.should_flatten => {
                    let child_name = field_name_to_string_tokens(&field);

                    quote! {
                        <#ty as ::xml_struct::XmlSerialize>::serialize_as_element(&#accessor, writer, #child_name)?;
                    }
                }

                // If this is a tuple struct or the consumer has specifically
                // requested a flat representation, serialize without a
                // containing element.
                _ => {
                    quote! {
                        <#ty as ::xml_struct::XmlSerialize>::serialize_child_nodes(&#accessor, writer)?;
                    }
                }
            }
        })
        .collect()
}

/// Converts the name of a field to a string suitable for use as a tag name.
///
/// The identifier is stringified and converted to the desired case system. It
/// will also generate code for concatenating the field name with any namespace
/// prefix to be added.
fn field_name_to_string_tokens(field: &Field) -> TokenStream {
    match &field.kind {
        FieldKind::Named(ident) => {
            let name = ident.to_string();

            let case_mapped = kebab_to_pascal(&name);

            if let Some(prefix) = &field.props.namespace_prefix {
                let string_with_colon = format!(":{case_mapped}");
                generate_static_string_concat(prefix, Literal::string(&string_with_colon))
            } else {
                Literal::string(&case_mapped).into_token_stream()
            }
        }

        FieldKind::Unnamed => panic!("cannot stringify unnamed field"),
    }
}

/// Converts a kebab_case identifier string to PascalCase.
fn kebab_to_pascal(kebab: &str) -> String {
    let mut capitalize_next = true;

    kebab
        .chars()
        .filter_map(|character| {
            if character == '_' {
                // Consume the underscore and capitalize the next character.
                capitalize_next = true;

                None
            } else if capitalize_next {
                capitalize_next = false;

                // Rust supports non-ASCII identifiers, so this could
                // technically fail, but this macro does not currently handle
                // the general XML case, and so full Unicode case mapping is out
                // of scope at present.
                Some(character.to_ascii_uppercase())
            } else {
                Some(character)
            }
        })
        .collect()
}

#[derive(Debug)]
/// A representation of an enum variant.
pub(crate) struct Variant {
    // The identifier for the variant.
    pub ident: Ident,

    // The form of the variant, along with any fields.
    pub kind: VariantKind,
}

#[derive(Debug)]
/// The form of an enum variant and its contained fields.
pub(crate) enum VariantKind {
    Struct(Vec<Field>),
    Tuple(Vec<Field>),
    Unit,
}

#[derive(Debug)]
/// A representation of a struct or enum field.
pub(crate) struct Field {
    // The form of the field, along with any identifier.
    pub kind: FieldKind,

    // The type of the field.
    pub ty: TokenStream,

    // An expression which will access the value of the field.
    pub accessor: TokenStream,

    // Properties affecting the serialization of the field.
    pub props: FieldProps,
}

#[derive(Debug)]
/// A container for partitioned attribute and child element fields.
struct Fields {
    attr_fields: Vec<Field>,
    child_fields: Vec<Field>,
}

#[derive(Debug)]
/// The form of a field, whether named or unnamed.
pub(crate) enum FieldKind {
    Named(Ident),
    Unnamed,
}

/// Tokens representing an XML attribute's name/value pair.
pub(crate) struct XmlAttribute {
    name: TokenStream,
    value: TokenStream,
}

/// Generates code for concatenating strings at compile-time.
///
/// This code allows for concatenating `const` string references and/or string
/// literals with zero runtime cost.
fn generate_static_string_concat<T, U>(a: T, b: U) -> TokenStream
where
    T: ToTokens,
    U: ToTokens,
{
    quote!({
        const LEN: usize = #a.len() + #b.len();

        const fn copy_bytes_into(input: &[u8], mut output: [u8; LEN], offset: usize) -> [u8; LEN] {
            // Copy the input byte-by-byte into the output buffer at the
            // specified offset.
            // NOTE: If/when `const_for` is stabilized, this can become a `for`
            // loop. https://github.com/rust-lang/rust/issues/87575
            let mut index = 0;
            loop {
                output[offset + index] = input[index];
                index += 1;
                if index == input.len() {
                    break;
                }
            }

            // We must return the buffer, as `const` functions cannot take a
            // mutable reference, so it's moved into and out of scope.
            output
        }

        const fn constcat(prefix: &'static str, value: &'static str) -> [u8; LEN] {
            let mut output = [0u8; LEN];
            output = copy_bytes_into(prefix.as_bytes(), output, 0);
            output = copy_bytes_into(value.as_bytes(), output, prefix.len());

            output
        }

        // As of writing this comment, Rust does not provide a standard macro
        // for compile-time string concatenation, so we exploit the fact that
        // `str::as_bytes()` and `std::str::from_utf8()` are `const`.
        const BYTES: [u8; LEN] = constcat(#a, #b);
        match std::str::from_utf8(&BYTES) {
            Ok(value) => value,

            // Given that both inputs to `constcat()` are Rust strings, they're
            // guaranteed to be valid UTF-8. As such, directly concatenating
            // them should create valid UTF-8 as well. If we hit this panic,
            // it's probably a bug in one of the above functions.
            Err(_) => panic!("Unable to statically concatenate strings"),
        }
    })
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::TokenStream;
use quote::ToTokens as _;
use syn::{
    punctuated::Punctuated, spanned::Spanned as _, Attribute, DeriveInput, Error, Expr, Meta, Token,
};

use crate::MACRO_ATTRIBUTE;

const UNRECOGNIZED_ATTRIBUTE_MSG: &str = "unrecognized `xml_struct` attribute";

#[derive(Debug, Default)]
/// Properties governing the serialization of a struct or enum with a derived
/// `XmlSerialize` implementation.
pub(crate) struct TypeProps {
    /// A declaration of a name for the default XML namespace.
    ///
    /// The value of this name, if any, will be represented as an `xmlns`
    /// attribute on the start tag if a field of this type is serialized as an
    /// XML element.
    ///
    /// Note that, in XML terminology, the "name" is the value of the `xmlns`
    /// attribute, usually a URI.
    pub default_ns_name: Option<TokenStream>,

    /// Declarations of XML namespaces.
    ///
    /// The values of these declarations, if any, will be represented as
    /// `xmlns:{prefix}` attributes on the start tag if a field of this type is
    /// serialized as an XML element.
    pub ns_decls: Vec<NamespaceDecl>,

    /// Whether values of this type should be serialized as text nodes instead
    /// of element nodes.
    ///
    /// A value of `true` is only valid when the type to which it is applied is
    /// an `enum` consisting only of unit variants.
    pub should_serialize_as_text: bool,

    /// A namespace prefix to apply to tags representing enum variants.
    ///
    /// This property is invalid for structs or text enums.
    pub ns_prefix_for_variants: Option<TokenStream>,
}

impl TypeProps {
    /// Constructs a set of serialization properties for an enum or struct from
    /// its input to the derive macro.
    pub(crate) fn try_from_input(input: &DeriveInput) -> Result<Self, Error> {
        let attr = match find_configuration_attribute(&input.attrs) {
            Some(attr) => attr,

            // If we don't find a matching attribute, we assume the default set
            // of properties.
            None => return Ok(Self::default()),
        };

        // We build a list of errors so that we can combine them later and emit
        // them all instead of quitting at the first we encounter.
        let mut errors = Vec::new();

        // We start with the default set of properties, then parse the
        // `xml_struct` attribute to modify any property which deviates from the
        // default.
        let mut properties = TypeProps::default();
        for meta in attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)? {
            match meta {
                Meta::Path(path) => {
                    if path.is_ident("text") {
                        // The consumer has specified that they want to
                        // represent values of the type to which this is applied
                        // as text. This is only possible when the type is an
                        // enum, for which all variants are unit. When that's
                        // the case, we use the variant name as the text value.
                        let is_unit_only_enum = match &input.data {
                            syn::Data::Enum(input) => input
                                .variants
                                .iter()
                                .all(|variant| matches!(variant.fields, syn::Fields::Unit)),

                            _ => false,
                        };

                        if is_unit_only_enum {
                            properties.should_serialize_as_text = true;
                        } else {
                            // There is no clear representation of non-unit enum
                            // variants or of structs as text nodes or text
                            // attributes, so we just forbid it.
                            errors.push(Error::new(
                                path.span(),
                                "only unit enums may be derived as text",
                            ))
                        }
                    } else {
                        errors.push(Error::new(path.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                    }
                }
                Meta::NameValue(name_value) => {
                    if name_value.path.is_ident("default_ns") {
                        // When serialized as an element, values of the type to
                        // which this is applied should include a declaration of
                        // a default namespace, e.g. `xmlns="foo"`. This
                        // attribute should occur at most once per type.
                        match properties.default_ns_name {
                            Some(_) => {
                                errors.push(Error::new(
                                    name_value.path.span(),
                                    "cannot declare more than one default namespace",
                                ));
                            }

                            None => {
                                properties.default_ns_name =
                                    Some(name_value.value.to_token_stream())
                            }
                        }
                    } else if name_value.path.is_ident("ns") {
                        // When serialized as an element, values of the type to
                        // which this is applied should include a declaration of
                        // a namespace with prefix, e.g. `xmlns:foo="bar"`.
                        // There can be many of these attributes per type.
                        //
                        // Ideally, we could prevent duplicate namespace prefixes here,
                        // but allowing consumers to pass either by variable or by
                        // literal makes that exceedingly difficult.
                        match &name_value.value {
                            Expr::Tuple(tuple) if tuple.elems.len() == 2 => {
                                properties.ns_decls.push(NamespaceDecl {
                                    prefix: tuple.elems[0].to_token_stream(),
                                    name: tuple.elems[1].to_token_stream(),
                                })
                            }

                            unexpected => errors.push(Error::new(
                                unexpected.span(),
                                "namespace value must be a tuple of exactly two elements",
                            )),
                        }
                    } else if name_value.path.is_ident("variant_ns_prefix") {
                        // When serialized as an element, values of the enum
                        // type to which this is applied should have a namespace
                        // prefix added to the element's tag name.
                        match properties.ns_prefix_for_variants {
                            Some(_) => {
                                errors.push(Error::new(
                                    name_value.path.span(),
                                    "cannot declare more than one namespace prefix",
                                ));
                            }
                            None => match &input.data {
                                syn::Data::Enum(_) => {
                                    properties.ns_prefix_for_variants =
                                        Some(name_value.value.to_token_stream());
                                }

                                _ => {
                                    errors.push(Error::new(
                                        name_value.path.span(),
                                        "cannot declare variant namespace prefix for non-enum",
                                    ));
                                }
                            },
                        }
                    } else {
                        errors.push(Error::new(name_value.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                    }
                }

                _ => {
                    errors.push(Error::new(meta.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                }
            }
        }

        let has_namespace_decl =
            properties.default_ns_name.is_some() || !properties.ns_decls.is_empty();
        if has_namespace_decl && properties.should_serialize_as_text {
            // There's no meaningful way to namespace text content, so the
            // combination of these properties is almost certainly a mistake.
            errors.push(Error::new(
                attr.span(),
                "cannot declare namespaces for text content",
            ));
        }

        if properties.ns_prefix_for_variants.is_some() && properties.should_serialize_as_text {
            // Namespace prefixes are added as part of an element name and so
            // cannot be applied to values which will be serialized as a text
            // node.
            errors.push(Error::new(
                attr.span(),
                "cannot declare variant namespace prefix for text enum",
            ));
        }

        // Combine and return errors if there are any. If none, we've
        // successfully parsed the attributes and can return the appropriate
        // props.
        match errors.into_iter().reduce(|mut combined, err| {
            combined.combine(err);

            combined
        }) {
            Some(err) => Err(err),
            None => Ok(properties),
        }
    }
}

#[derive(Debug)]
/// A declaration of an XML namespace for a type with a derived `XmlSerialize`
/// implementation.
pub(crate) struct NamespaceDecl {
    pub prefix: TokenStream,
    pub name: TokenStream,
}

#[derive(Debug, Default)]
/// Properties governing the serialization of a field in a struct or enum with a
/// derived `XmlSerialize` implementation.
pub(crate) struct FieldProps {
    /// The type of XML structure which the field represents.
    pub repr: FieldRepr,

    /// Whether the field should be serialized with a "flat" representation.
    ///
    /// A flattened field will be serialized only as its content nodes, rather
    /// than as an XML element containing those content nodes.
    pub should_flatten: bool,

    /// A prefix to add to this field's name when serialized as an element or
    /// attribute.
    pub namespace_prefix: Option<TokenStream>,
}

impl FieldProps {
    /// Constructs a set of serialization properties for an enum or struct field
    /// from its struct attributes.
    pub(crate) fn try_from_attrs(
        value: Vec<Attribute>,
        field_has_name: bool,
    ) -> Result<Self, Error> {
        // Find the attribute for configuring behavior of the derivation, if
        // any.
        let attr = match find_configuration_attribute(&value) {
            Some(attr) => attr,

            // If we don't find a matching attribute, we assume the default set
            // of properties.
            None => return Ok(Self::default()),
        };

        // We build a list of errors so that we can combine them later and emit
        // them all instead of only emitting the first.
        let mut errors = Vec::new();

        // We start with the default set of properties, then parse the
        // `xml_struct` attribute to modify any property which deviates from the
        // default.
        let mut properties = FieldProps::default();
        for meta in attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated)? {
            match meta {
                Meta::Path(path) => {
                    if path.is_ident("attribute") {
                        // The name of the field is used as the XML attribute
                        // name, so unnamed fields (e.g., members of tuple
                        // structs) cannot be represented as attributes.
                        if field_has_name {
                            properties.repr = FieldRepr::Attribute;
                        } else {
                            errors.push(Error::new(
                                path.span(),
                                "cannot serialize unnamed field as XML attribute",
                            ))
                        }
                    } else if path.is_ident("element") {
                        properties.repr = FieldRepr::Element;
                    } else if path.is_ident("flatten") {
                        properties.should_flatten = true;
                    } else {
                        errors.push(Error::new(path.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                    }
                }
                Meta::NameValue(name_value) => {
                    if name_value.path.is_ident("ns_prefix") {
                        match properties.namespace_prefix {
                            Some(_) => errors.push(Error::new(
                                name_value.span(),
                                "cannot declare more than one namespace prefix",
                            )),
                            None => {
                                properties.namespace_prefix =
                                    Some(name_value.value.to_token_stream());
                            }
                        }
                    } else {
                        errors.push(Error::new(name_value.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                    }
                }

                _ => {
                    errors.push(Error::new(meta.span(), UNRECOGNIZED_ATTRIBUTE_MSG));
                }
            }
        }

        if matches!(properties.repr, FieldRepr::Attribute) && properties.should_flatten {
            errors.push(Error::new(attr.span(), "cannot flatten attribute fields"));
        }

        // Combine and return errors if there are any. If none, we've
        // successfully parsed the attributes and can return the appropriate
        // props.
        match errors.into_iter().reduce(|mut combined, err| {
            combined.combine(err);

            combined
        }) {
            Some(err) => Err(err),
            None => Ok(properties),
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
/// The types of XML structure which fields may represent.
pub(crate) enum FieldRepr {
    Attribute,

    #[default]
    Element,
}

/// Gets the attribute containing configuration parameters for this derive
/// macro, if any.
fn find_configuration_attribute(attrs: &[Attribute]) -> Option<&Attribute> {
    attrs
        .iter()
        .find(|attr| attr.path().is_ident(MACRO_ATTRIBUTE))
}

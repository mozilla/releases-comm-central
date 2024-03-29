/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod codegen;

use proc_macro2::{Ident, Literal, TokenStream};
use quote::{format_ident, quote, ToTokens};
use syn::{DataEnum, DataStruct, Generics};

use crate::{FieldProps, TypeProps};

use self::codegen::{
    generate_serialize_impl_for, with_enum_variants, with_struct_fields, with_text_variants, Field,
    FieldKind, Variant, VariantKind,
};

/// Generates an implementation of the `XmlSerialize` trait for a Rust struct
/// and its fields.
pub(crate) fn write_serialize_impl_for_struct(
    ident: Ident,
    generics: Generics,
    input: DataStruct,
    props: TypeProps,
) -> TokenStream {
    // We build a list of errors so that we can combine them later and emit
    // them all instead of quitting at the first we encounter.
    let mut errors = Vec::new();

    // Process the struct's fields in order to determine how to represent them,
    // based on struct type and any consumer-applied attributes.
    let fields = match input.fields {
        // Fields in a regular struct, i.e. declared with a name and type.
        syn::Fields::Named(fields) => fields
            .named
            .into_iter()
            .map(process_named_field(
                &mut errors,
                |ident| quote!(self.#ident),
            ))
            .collect(),

        // Fields in a tuple struct, i.e. declared by type and position only.
        syn::Fields::Unnamed(fields) => fields
            .unnamed
            .into_iter()
            .enumerate()
            .map(process_unnamed_field(&mut errors, |idx| {
                let idx_literal = Literal::usize_unsuffixed(idx);
                quote!(self.#idx_literal)
            }))
            .collect(),

        // A unit struct, i.e. one which has no fields.
        syn::Fields::Unit => vec![],
    };

    // Combine and return errors if there are any. If none, we've successfully
    // handled all fields and can generate the final implementation.
    let err = errors.into_iter().reduce(|mut acc, err| {
        acc.combine(err);

        acc
    });

    if let Some(err) = err {
        return err.into_compile_error();
    }

    generate_serialize_impl_for(ident, generics, props, with_struct_fields(fields))
}

/// Generates an implementation of the `XmlSerialize` trait (and the
/// `XmlSerializeAttr` trait if appropriate) for a Rust enum, its variants, and
/// their fields.
pub(crate) fn write_serialize_impl_for_enum(
    ident: Ident,
    generics: Generics,
    input: DataEnum,
    mut props: TypeProps,
) -> TokenStream {
    if props.should_serialize_as_text {
        // We depend on the code which generates `TypeProps` to handle verifying
        // that this enum consists solely of unit variants when setting this
        // property, so we just collect variant identifiers.
        let variants = input
            .variants
            .into_iter()
            .map(|variant| variant.ident)
            .collect();

        return generate_serialize_impl_for(ident, generics, props, with_text_variants(variants));
    }

    // We build a list of errors so that we can combine them later and emit
    // them all instead of quitting at the first we encounter.
    let mut errors = Vec::new();

    // Process the enum's variants in order to determine how to represent them,
    // based on variant type and any consumer-applied attributes.
    let variants = input
        .variants
        .into_iter()
        .map(process_enum_variant(&mut errors))
        .collect();

    // Combine and return errors if there are any. If none, we've successfully
    // handled all fields and can generate the final implementation.
    let err = errors.into_iter().reduce(|mut acc, err| {
        acc.combine(err);

        acc
    });

    if let Some(err) = err {
        return err.into_compile_error();
    }

    // Since this is enum-specific, there should be no reason for it to be used
    // in codegen and we can just steal the memory.
    let ns_prefix = props.ns_prefix_for_variants.take();

    generate_serialize_impl_for(
        ident,
        generics,
        props,
        with_enum_variants(variants, ns_prefix),
    )
}

/// Creates a callback for processing a `syn` enum variant into codegen details.
fn process_enum_variant(errors: &mut Vec<syn::Error>) -> impl FnMut(syn::Variant) -> Variant + '_ {
    |variant| {
        // Process the variants's fields in order to determine how to represent
        // them, based on variant type and any consumer-applied attributes.
        let kind = match variant.fields {
            syn::Fields::Named(fields) => {
                let fields = fields
                    .named
                    .into_iter()
                    .map(process_named_field(errors, Ident::to_token_stream))
                    .collect();

                VariantKind::Struct(fields)
            }
            syn::Fields::Unnamed(fields) => {
                let fields = fields
                    .unnamed
                    .into_iter()
                    .enumerate()
                    .map(process_unnamed_field(errors, |idx| {
                        format_ident!("field{idx}").into_token_stream()
                    }))
                    .collect();

                VariantKind::Tuple(fields)
            }
            syn::Fields::Unit => VariantKind::Unit,
        };

        Variant {
            ident: variant.ident,
            kind,
        }
    }
}

/// Creates a callback for extracting representation details from a named field
/// (i.e., a field of a regular struct or a struct enum variant) and its
/// attributes.
///
/// The `accessor_generator` callback should, based on the name of a field,
/// return an expression for accessing the value of that field (either on `self`
/// or within a match arm).
fn process_named_field<'cb, 'g: 'cb, G>(
    errors: &'cb mut Vec<syn::Error>,
    mut accessor_generator: G,
) -> impl FnMut(syn::Field) -> Field + 'cb
where
    G: FnMut(&Ident) -> TokenStream + 'g,
{
    move |field| {
        // We should be able to unwrap without panicking, since we know this is
        // a named field.
        let ident = field.ident.unwrap();
        let accessor = accessor_generator(&ident);

        let props = FieldProps::try_from_attrs(field.attrs, true)
            .unwrap_or_else(collect_field_processing_error(errors));

        Field {
            kind: FieldKind::Named(ident),
            ty: field.ty.into_token_stream(),
            accessor,
            props,
        }
    }
}

/// Creates a callback for extracting representation details from an unnamed
/// field (i.e., a field of a tuple struct or a tuple enum variant) and its
/// attributes.
///
/// The `accessor_generator` callback should, based on the position of a field,
/// return an expression for accessing the value of that field (either on `self`
/// or within a match arm).
fn process_unnamed_field<'cb, 'g: 'cb, G>(
    errors: &'cb mut Vec<syn::Error>,
    mut accessor_generator: G,
) -> impl FnMut((usize, syn::Field)) -> Field + 'cb
where
    G: FnMut(usize) -> TokenStream + 'g,
{
    move |(idx, field)| {
        let accessor = accessor_generator(idx);

        let props = FieldProps::try_from_attrs(field.attrs, false)
            .unwrap_or_else(collect_field_processing_error(errors));

        Field {
            kind: FieldKind::Unnamed,
            ty: field.ty.into_token_stream(),
            accessor,
            props,
        }
    }
}

/// Creates a callback for handling errors in processing field properties.
fn collect_field_processing_error(
    errors: &mut Vec<syn::Error>,
) -> impl FnMut(syn::Error) -> FieldProps + '_ {
    |err| {
        errors.push(err);

        FieldProps::default()
    }
}

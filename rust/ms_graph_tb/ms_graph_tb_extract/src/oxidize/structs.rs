/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, TokenStreamExt, format_ident, quote};

use super::RustType;
use crate::GENERATION_DISCLOSURE;
use crate::extract::schema::object::Property;
use crate::naming::{pascalize, snakeify};
use crate::oxidize::markup_doc_comment;

/// The kind of Graph struct we're generating.
///
/// This is used to infer how and where the struct will be generated.
#[derive(Debug, Clone)]
pub enum StructKind {
    /// The struct is generated from a named OpenAPI object schema, and will
    /// likely be generated in its own module.
    Named,

    /// The struct is generated from an unnamed OpenAPI object schema, and is
    /// likely a request or response body that will be generated alongside the
    /// request/path it's associated with.
    Unnamed,
}

/// A Graph API struct, ready for converting to a stream of tokens via [`quote!`].
#[derive(Debug, Clone)]
pub struct GraphStruct {
    name: String,
    description: Option<TokenStream>,
    pub(crate) properties: Vec<Property>,
    pub(crate) kind: StructKind,
    has_expansions: bool,
}

impl GraphStruct {
    pub fn new(
        name: &str,
        description: Option<String>,
        properties: Vec<Property>,
        kind: StructKind,
        has_expansions: bool,
    ) -> Self {
        let name = name.to_string();
        let description = description.map(|doc| quote!(#[doc = #doc]));

        Self {
            name,
            description,
            properties,
            kind,
            has_expansions,
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

impl ToTokens for GraphStruct {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            name,
            description,
            properties,
            kind,
            has_expansions,
        } = self;

        let name = format_ident!("{}", pascalize(name));

        let imports = super::imports(properties, Some(&snakeify(&name.to_string())));
        let expand_ident = format_ident!("{}Expand", name);
        let select_variants = select_variants(properties);
        let rename_all = match kind {
            StructKind::Named => "camelCase",
            StructKind::Unnamed => "PascalCase",
        };
        let field_defs = field_defs(properties);
        let expand_def = (*has_expansions).then(|| expand_def(expand_ident.clone(), properties));
        let single_value_extended_properties_expand_impl = (*has_expansions)
            .then(|| single_value_extended_properties_expand_impl(&expand_ident, properties));
        let single_value_extended_properties_impl = matches!(kind, StructKind::Named)
            .then(|| single_value_extended_properties_impl(&name, properties));

        // Unnamed structs typically represent the body of requests or responses,
        // where selection is not relevant.
        let selection = match kind {
            StructKind::Named => {
                let selection_ident = format_ident!("{}Selection", name);
                let selection = quote! {
                    ///Properties that can be selected from this type.
                    #[derive(Copy, Clone, Debug, Display, PartialEq, Eq)]
                    #[strum(serialize_all = "camelCase")]
                    pub enum #selection_ident {
                        #(#select_variants),*
                    }
                };

                Some(selection)
            }
            StructKind::Unnamed => None,
        };

        // Unnamed structs are generated in the same file as the request/path they
        // relate to, so a module documentation does not make sense for them.
        let module_doc = match kind {
            StructKind::Named => {
                let module_doc = format!("Types related to {name}.\n\n{GENERATION_DISCLOSURE}");
                let module_doc = quote!(#![doc = #module_doc]);

                Some(module_doc)
            }
            StructKind::Unnamed => None,
        };

        tokens.append_all(quote!(
            #module_doc

            use serde::{Deserialize, Serialize};
            use serde_with::skip_serializing_none;
            use std::fmt;
            use strum::Display;

            #imports
            use crate::Nullable;
            use crate::odata::ExpandOptions;

            #selection
            #expand_def

            #description
            #[skip_serializing_none]
            #[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
            #[serde(default, rename_all = #rename_all)]
            pub struct #name {
                #(#field_defs)*
            }
            #single_value_extended_properties_expand_impl
            #single_value_extended_properties_impl
        ))
    }
}

struct FieldDef {
    doc_comment: Option<TokenStream>,
    serde_attrs: Option<TokenStream>,
    field_name: Ident,
    ty: TokenStream,
}

impl ToTokens for FieldDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            doc_comment,
            serde_attrs,
            field_name,
            ty,
        } = self;
        tokens.append_all(quote! {
            #doc_comment
            #serde_attrs
            pub #field_name: #ty,
        })
    }
}

fn select_variants(properties: &[Property]) -> Vec<TokenStream> {
    let mut select_variants = properties
        .iter()
        .filter(|p| !p.navigation_property)
        .filter_map(|p| {
            let name = pascalize(&p.name);
            let ident = format_ident!("{name}");
            if p.is_ref {
                if matches!(p.rust_type, RustType::NamedObjectSchema(_)) {
                    let inner = format_ident!("{name}Selection");
                    Some(quote!(#ident(#inner)))
                } else {
                    None
                }
            } else {
                Some(quote!(#ident))
            }
        })
        .collect::<Vec<_>>();
    select_variants.sort_by_key(|a| a.to_string());
    select_variants
}

fn expand_def(expand_ident: Ident, properties: &[Property]) -> TokenStream {
    let expand_variants = expand_variants(properties);
    if expand_variants.is_empty() {
        quote! {
            ///Zero-variant enum that cannot be instantiated.
            ///
            /// None of the types that can be expanded from this type are
            /// currently supported. This enum is used to indicate that any
            /// attempts to expand this Graph type will fail to compile.
            #[derive(Clone, Debug)]
            pub enum #expand_ident {}

            impl fmt::Display for #expand_ident {
                fn fmt(&self, _: &mut fmt::Formatter<'_>) -> std::fmt::Result {
                    match *self {}
                }
            }
        }
    } else {
        let expand_display_arms = expand_display_arms(properties, &expand_ident);
        quote! {
            ///Types that are syntactically valid to expand for this type.
            ///
            /// Being present in this enum does not guarantee Graph can expand
            /// the property for any particular path.
            #[derive(Clone, Debug, strum::EnumDiscriminants)]
            #[strum_discriminants(name(ExpandNames))]
            #[strum_discriminants(vis(pub(self)))]
            #[strum_discriminants(derive(Display))]
            #[strum_discriminants(strum(serialize_all = "camelCase"))]
            pub enum #expand_ident {
                #(#expand_variants),*
            }

            impl fmt::Display for #expand_ident {
                fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                    match self {
                        #(#expand_display_arms),*
                    }
                }
            }
        }
    }
}

fn expand_variants(properties: &[Property]) -> Vec<TokenStream> {
    let mut expand_variants = properties
        .iter()
        .filter(|p| p.navigation_property)
        .filter_map(|p| {
            let RustType::NamedObjectSchema(custom_type) = &p.rust_type else {
                return None;
            };

            let name = pascalize(&p.name);
            let ident = format_ident!("{name}");
            let inner = format_ident!("{}Selection", custom_type.as_pascal_case());
            Some(quote!(#ident(ExpandOptions<#inner>)))
        })
        .collect::<Vec<_>>();
    expand_variants.sort_by_key(|a| a.to_string());
    expand_variants
}

fn expand_display_arms(properties: &[Property], expand_ident: &Ident) -> Vec<TokenStream> {
    let mut expand_arms = properties
        .iter()
        .filter(|p| p.navigation_property && matches!(p.rust_type, RustType::NamedObjectSchema(_)))
        .map(|p| {
            let variant = format_ident!("{}", pascalize(&p.name));
            quote! {
                #expand_ident::#variant(opt) => {
                    opt.full_format(f, ExpandNames::from(self))
                }
            }
        })
        .collect::<Vec<_>>();
    expand_arms.sort_by_key(|a| a.to_string());
    expand_arms
}

fn field_defs(properties: &[Property]) -> Vec<FieldDef> {
    let mut field_defs = properties
        .iter()
        .map(|p| {
            let doc_comment = if let Some(doc) = &p.description {
                let doc = markup_doc_comment(doc.clone());
                Some(quote!(#[doc = #doc]))
            } else if p.is_ref {
                let ref_type = &p.rust_type.base_token();
                let doc_str = format!("Inherited properties from `{ref_type}`.");
                Some(quote!(#[doc = #doc_str]))
            } else {
                None
            };

            let field_name_string = snakeify(&p.name);
            let field_name = format_ident!("{field_name_string}");
            let ty = field_type(p);
            let serde_attrs = p.is_ref.then(|| quote!(#[serde(flatten)]));

            FieldDef {
                doc_comment,
                serde_attrs,
                field_name,
                ty,
            }
        })
        .collect::<Vec<_>>();

    field_defs.sort_by_key(|field| field.field_name.to_string());
    field_defs
}

fn field_type(prop: &Property) -> TokenStream {
    let base = prop.rust_type.base_token();
    let mut ty = if prop.is_collection {
        quote!(Vec<#base>)
    } else {
        quote!(#base)
    };

    if prop.nullable {
        ty = quote!(Nullable<#ty>);
    }

    if !prop.is_ref {
        ty = quote!(Option<#ty>);
    }

    ty
}

fn has_single_value_extended_properties(properties: &[Property]) -> bool {
    properties.iter().any(|prop| {
        prop.name == "singleValueExtendedProperties"
            && prop.navigation_property
            && matches!(prop.rust_type, RustType::NamedObjectSchema(_))
            && prop.is_collection
    })
}

fn single_value_extended_properties_expand_impl(
    expand_name: &Ident,
    properties: &[Property],
) -> Option<TokenStream> {
    if !has_single_value_extended_properties(properties) {
        return None;
    }

    Some(quote! {
        impl crate::extended_properties::SingleValueExtendedPropertiesExpand for #expand_name {
            ///Construct [`Self::SingleValueExtendedProperties`].
            fn svleps(
                options: ExpandOptions<SingleValueLegacyExtendedPropertySelection>,
            ) -> Self {
                Self::SingleValueExtendedProperties(options)
            }
        }
    })
}

fn single_value_extended_properties_impl(
    name: &Ident,
    properties: &[Property],
) -> Option<TokenStream> {
    if !has_single_value_extended_properties(properties) {
        return None;
    }

    let svleps_nullable = properties
        .iter()
        .find(|prop| prop.name == "singleValueExtendedProperties")
        .is_some_and(|prop| prop.nullable);
    let all_svleps_body = if svleps_nullable {
        quote!(
            self.single_value_extended_properties
                .as_ref()
                .and_then(Option::as_ref)
        )
    } else {
        quote!(self.single_value_extended_properties.as_ref())
    };

    Some(quote! {
        impl crate::extended_properties::SingleValueExtendedPropertiesType for #name {
            ///Wrapper for [`Self::single_value_extended_properties`].
            fn all_svleps(&self) -> Option<&Vec<SingleValueLegacyExtendedProperty>> {
                #all_svleps_body
            }
        }
    })
}

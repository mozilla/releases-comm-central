/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, TokenStreamExt, format_ident, quote};

use super::{Reference, RustType, arg_type, return_type};
use crate::extract::schema::Property;
use crate::naming::{pascalize, snakeify};
use crate::oxidize::markup_doc_comment;
use crate::{GENERATION_DISCLOSURE, SUPPORTED_TYPES};

/// The kind of Graph type we're generating.
///
/// This is used to infer how and where the type will be generated.
#[derive(Debug, Clone)]
pub enum TypeKind {
    /// The type is named in the OpenAPI spec, and will likely be generated in
    /// its own module.
    Named,

    /// The type isn't named in the OpenAPI spec (and probably represented by an
    /// "object" schema), and is likely a request or response body that will be
    /// generated alongside the request/path it's associated with.
    Unnamed,
}

/// A Graph API type, ready for converting to a stream of tokens via [`quote!`].
#[derive(Debug, Clone)]
pub struct GraphType {
    name: String,
    description: Option<TokenStream>,
    pub(crate) properties: Vec<Property>,
    pub(crate) kind: TypeKind,
    has_expansions: bool,
}

impl GraphType {
    pub fn new(
        name: &str,
        description: Option<String>,
        properties: Vec<Property>,
        kind: TypeKind,
        has_expansions: bool,
    ) -> Self {
        let name = String::from(name);
        let description = description.map(|doc| quote!(#[doc = #doc]));

        Self {
            name,
            description,
            properties,
            kind,
            has_expansions,
        }
    }

    pub fn name(&self) -> &String {
        &self.name
    }
}

impl ToTokens for GraphType {
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

        // Generating documentation for methods of unnamed types seems to cause
        // some weird bug with rustc's diagnostics that means we end up with
        // leftover unused imports even after running Clippy, see
        // https://github.com/rust-lang/rust/issues/155098
        let function_defs = function_defs(properties, matches!(kind, TypeKind::Named));
        let expand_def = (*has_expansions).then(|| expand_def(expand_ident, properties));

        // Unnamed types typically represent the body of requests or responses,
        // where selection is not relevant.
        let selection = match kind {
            TypeKind::Named => {
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
            TypeKind::Unnamed => None,
        };

        // Unnamed types are generated in the same file as the request/path they
        // relate to, so a module documentation does not make sense for them.
        let module_doc = match kind {
            TypeKind::Named => {
                let module_doc = format!("Types related to {name}.\n\n{GENERATION_DISCLOSURE}");
                let module_doc = quote!(#![doc = #module_doc]);

                Some(module_doc)
            }
            TypeKind::Unnamed => None,
        };

        tokens.append_all(quote!(
            #module_doc

            use serde::{Deserialize, Serialize};
            use serde_json::Value;
            use std::borrow::Cow;
            use std::fmt;
            use strum::Display;

            #imports
            use crate::odata::ExpandOptions;
            use crate::{Error, PropertyMap};

            #selection
            #expand_def

            #description
            #[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
            pub struct #name<'a> {
                #[serde(flatten)]
                pub(crate) properties: PropertyMap<'a>,
            }

            impl<'a> From<PropertyMap<'a>> for #name<'a> {
                fn from(properties: PropertyMap<'a>) -> Self {
                    Self { properties }
                }
            }

            impl<'a> #name<'a> {
                ///Construct a new instance of this type with no properties set.
                #[must_use]
                pub fn new() -> Self {
                    Self::default()
                }
                #(#function_defs)*
            }
        ))
    }
}

struct MethodDef {
    fn_name: Ident,
    doc_comment: Option<TokenStream>,
    must_use: Option<TokenStream>,
    mutable: bool,
    ret_type: TokenStream,
    arg: Option<TokenStream>,
    body: TokenStream,
    lifetime: Option<TokenStream>,
}

impl PartialEq for MethodDef {
    fn eq(&self, other: &Self) -> bool {
        self.fn_name == other.fn_name
    }
}

impl Eq for MethodDef {}

impl Ord for MethodDef {
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.fn_name.cmp(&other.fn_name)
    }
}

impl PartialOrd for MethodDef {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl ToTokens for MethodDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            doc_comment,
            must_use,
            fn_name,
            mutable,
            ret_type,
            arg,
            body,
            lifetime,
        } = self;
        let self_mods = if *mutable {
            quote!(mut)
        } else {
            quote!(&#lifetime)
        };
        tokens.append_all(quote! {
            #doc_comment
            #must_use
            pub fn #fn_name(#self_mods self, #arg) -> #ret_type {
                #body
            }
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
                if SUPPORTED_TYPES.contains(p.name.as_str()) {
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
            let RustType::NamedSchema(custom_type) = &p.rust_type else {
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
        .filter(|p| p.navigation_property && matches!(p.rust_type, RustType::NamedSchema(_)))
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

fn function_defs(properties: &[Property], generate_doc: bool) -> Vec<MethodDef> {
    // Collect the generated function defs into [getter def, setter def] pairs
    let mut function_defs = properties
        .iter()
        .map(|p| {
            let name = snakeify(&p.name);
            let fn_name = format_ident!("{name}");
            let ret_type = return_type(p, Reference::Ref, None);

            let doc_comment = if !generate_doc {
                None
            } else if let Some(doc) = &p.description {
                let doc = markup_doc_comment(doc.clone());
                Some(quote!(#[doc = #doc]))
            } else if p.is_ref {
                let ref_type = &p.rust_type.base_token(false, Reference::Own);
                let doc_str = format!("Accessor to inherited properties from `{ref_type}`.");
                Some(quote!(#[doc = #doc_str]))
            } else {
                None
            };
            let must_use = if p.is_ref {
                Some(quote!(#[must_use]))
            } else {
                None
            };

            let body = getter_body(p);
            let lifetime =
                (p.is_ref || matches!(p.rust_type, RustType::NamedSchema(_))).then_some(quote!('a));
            let getter = MethodDef {
                doc_comment,
                must_use,
                fn_name,
                ret_type,
                mutable: false,
                arg: None,
                body,
                lifetime,
            };

            let fn_name = format_ident!("set_{name}");
            let ret_type = quote!(Self);

            let doc_comment = if generate_doc {
                let doc_str = format!("Setter for [`{name}`](Self::{name}).\n\nThis library makes no guarantees that Graph exposes this property as writable.");
                Some(quote!(#[doc = #doc_str]))
            } else {
                None
            };

            let must_use = Some(quote!(#[must_use]));
            let arg_type = arg_type(p, Reference::Own);
            let arg = Some(quote!(mut val: #arg_type));
            let body = setter_body(p);
            let lifetime = None;
            let setter = MethodDef {
                doc_comment,
                must_use,
                fn_name,
                ret_type,
                mutable: true,
                arg,
                body,
                lifetime,
            };

            [getter, setter]
        })
        .collect::<Vec<_>>();

    // Sort by the name of the getter, then flatten the pairs
    function_defs.sort();
    function_defs.into_iter().flatten().collect()
}

fn getter_body(prop: &Property) -> TokenStream {
    if prop.is_ref {
        // refs are actually flattened in responses, but we want them abstracted,
        // so the accessor is actually just a type conversion
        let Property {
            rust_type: RustType::NamedSchema(typ),
            ..
        } = prop
        else {
            panic!("Reference to non-custom type: {prop:?}");
        };
        let ident = format_ident!("{}", typ.as_pascal_case());

        return quote! {
            #ident {
                properties: PropertyMap(Cow::Borrowed(&*self.properties.0)),
            }
        };
    }

    fn type_to_getter(base_type: &RustType) -> &str {
        use RustType::*;
        match base_type {
            Bool => "bool",
            U8 => "u64",
            I8 | I16 | I32 | I64 => "i64",
            F32 | F64 => "f64",
            String => "str",
            Bytes => "array",
            NamedSchema(_) | UnnamedSchema(_) => "object",
        }
    }

    let name = &prop.name;
    let base_str = prop.rust_type.base_str(prop.nullable, Reference::Ref);

    // This is inserted near the top for nullable types, so failed casts are always errors.
    let null_check = prop.nullable.then_some(quote! {
        if val.is_null() {
            return Ok(None);
        }
    });

    // "val" is our outer type, "v" is our closure argument (if we need one).
    // The conversion applied in the next step is applied on the innermost type.
    let val = if !prop.is_collection {
        format_ident!("val")
    } else {
        format_ident!("v")
    };

    // Our attempt to cast into the closest available type.
    // Because of our above null check, any failure to cast here indicates an error.
    // FIXME: This is written assuming arrays can be null, but never contain nulls.
    // It should be determined if this is correct, or if the type should change accordingly.
    let getter = type_to_getter(&prop.rust_type);
    let getter_ident = format_ident!("as_{getter}");
    let mut ret = quote!(#val.#getter_ident().ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", #val)))?);

    // If the type that produced isn't the base return type, it needs an additional conversion.
    if getter != base_str {
        if matches!(prop.rust_type, RustType::NamedSchema(_)) {
            ret = quote!(PropertyMap(Cow::Borrowed(#ret)).into());
        } else {
            ret = quote!(#ret.try_into().or_else(|e| Err(Error::UnexpectedResponse(format!("{e:?}"))))?);
        }
    }

    // If this is a collection, we actually want the above transformation mapped over everything.
    if prop.is_collection {
        ret = quote! {
            val
                .as_array()
                .ok_or_else(|| Error::UnexpectedResponse(format!("{:?}", val)))?
                .iter()
                .map(|v| Ok::<_, Error>(#ret))
                .collect::<Result<_, _>>()?
        };
    }

    // If this is a nullable type, we handled the None case already, so always wrap Some.
    if prop.nullable {
        ret = quote!(Some(#ret));
    }

    quote! {
        let val = self.properties.0.get(#name).ok_or(Error::NotFound)?;
        #null_check
        Ok(#ret)
    }
}

fn setter_body(prop: &Property) -> TokenStream {
    let name = &prop.name;
    let modification = match (&prop.rust_type, prop.is_ref, prop.is_collection) {
        (RustType::NamedSchema(_), true, false) => quote!(append(val.properties.0.to_mut())),
        (RustType::NamedSchema(_), false, false) => quote! {
                insert(#name.to_string(), Value::Object(val.properties.0.into_owned()))
        },
        (RustType::NamedSchema(_), false, true) => quote! {
            insert(
                #name.to_string(),
                val.into_iter()
                    .map(|v| Value::Object(v.properties.0.into_owned()))
                    .collect(),
            )
        },
        (_, _, _) => quote!(insert(#name.to_string(), val.into())),
    };

    quote! {
        self.properties.0.to_mut().#modification;
        self
    }
}

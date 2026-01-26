/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote, ToTokens, TokenStreamExt};

use crate::extract::path::{Method, Operation, Path, Success};
use crate::GENERATION_DISCLOSURE;

use super::{markup_doc_comment, Reference, RustType};

pub struct RequestDef {
    struct_def: StructDef,
    impl_def: ImplDef,
    operation_def: OperationDef,
    select_def: SelectDef,
}

impl ToTokens for RequestDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let RequestDef {
            struct_def,
            impl_def,
            operation_def,
            select_def,
        } = self;
        tokens.append_all(quote! {
            #struct_def
            #impl_def
            #operation_def
            #select_def
        })
    }
}

impl ToTokens for Path {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Path {
            name,
            description,
            operations,
        } = self;
        let mut imports = vec![];
        let mut operations = operations.clone();
        operations.sort_by(|a, b| a.method.cmp(&b.method));
        let operation_defs = operations
            .iter()
            .filter_map(|operation| {
                let description = match (&operation.summary, &operation.description) {
                    (Some(summary), Some(desc)) => Some(format!("{summary}\n\n{desc}")),
                    (Some(text), None) | (None, Some(text)) => Some(text.clone()),
                    (None, None) => None,
                };
                let description = match description {
                    Some(desc) => {
                        let mut desc = markup_doc_comment(desc);
                        if let Some(external_docs) = &operation.external_docs {
                            desc.push_str(&format!("\n\nMore information available via [Microsoft documentation]({external_docs})."))
                        }
                        Some(quote!(#[doc = #desc]))
                    }
                    None => {
                        if let Some(external_docs) = &operation.external_docs {
                            let desc = format!("External documentation available via [Microsoft documentation]({external_docs})");
                            Some(quote!(#[doc = #desc]))
                        } else {
                            None
                        }
                    }
                };
                let method = operation.method;
                match operation.method {
                    Method::Get => {
                        let selectable = selectable(operation);
                        let selection_type = if selectable {
                            let Success::WithBody(ref selection_body) = operation.success else {
                                panic!("selectable request with no response type: {operation:?}");
                            };
                            let RustType::Custom(ref selection_type) =
                                selection_body.property.rust_type
                            else {
                                panic!("non-custom selectable response type: {operation:?}");
                            };
                            let selection_type = format_ident!("{}Selection", selection_type.as_pascal_case());
                            imports.push(selection_body.property.clone());
                            Some(selection_type)
                        } else {
                            None
                        }
                        .map(|s| format_ident!("{s}"));
                        let struct_def = StructDef {
                            description,
                            method,
                            lifetime: None,
                            body_line: None,
                            selection_type: selection_type.clone(),
                        };
                        let impl_def = ImplDef { method, lifetime: None, arg: None, selectable };
                        let operation_def = OperationDef {
                            method: method.to_string(),
                            lifetime: None,
                            body: None,
                            selectable,
                        };
                        let select_def = SelectDef { selection_type };
                        Some(RequestDef {
                            struct_def,
                            impl_def,
                            operation_def,
                            select_def,
                        })
                    }
                    Method::Patch => {
                        let op_body = operation
                            .body
                            .clone()
                            .expect("Patch operations should have a body");
                        let mut body = op_body
                                .property
                                .rust_type
                                .base_token(false, Reference::Own);
                        if op_body.property.is_ref {
                            body = quote!(#body<'a>);
                        }
                        let lifetime = Some(quote!(<'a>));
                        let struct_def = StructDef {
                            description,
                            method,
                            lifetime: lifetime.clone(),
                            body_line: Some(quote!(body: #body,)),
                            selection_type: None,
                        };
                        let impl_def = ImplDef {
                            method,
                            lifetime: lifetime.clone(),
                            arg: Some(quote!(body: #body)),
                            selectable: false
                        };
                        let operation_def = OperationDef {
                            method: method.to_string(),
                            lifetime,
                            body: Some(body),
                            selectable: false,
                        };
                        let select_def = SelectDef { selection_type: None };
                        Some(RequestDef {
                            struct_def,
                            impl_def,
                            operation_def,
                            select_def,
                        })
                    }
                    _ => {
                        eprintln!("skipping unsupported method: {method}");
                        None
                    }
                }
            })
            .collect::<Vec<_>>();

        let description = description
            .as_ref()
            .map(|d| format!("{d}\n\n"))
            .unwrap_or_default();
        let description = format!("{description}{GENERATION_DISCLOSURE}");
        let description = quote!(#![doc = #description]);
        tokens.append_all(description);

        let imports = super::imports(&imports);

        tokens.append_all(quote! {
            use form_urlencoded::Serializer;
            use http::method::Method;
            use std::str::FromStr;

            #imports
            use crate::{Operation, Select, Selection};

            const PATH: &str = #name;
        });
        tokens.append_all(operation_defs);
    }
}

struct StructDef {
    description: Option<TokenStream>,
    method: Method,
    lifetime: Option<TokenStream>,
    body_line: Option<TokenStream>,
    selection_type: Option<Ident>,
}

impl ToTokens for StructDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            description,
            method,
            lifetime,
            body_line: body,
            selection_type,
        } = self;
        let selection_line = selection_type
            .as_ref()
            .map(|selection_type| quote!(selection: Selection<#selection_type>,));
        tokens.append_all(quote! {
            #description
            #[derive(Debug, Default)]
            pub struct #method #lifetime {
                #body
                #selection_line
            }
        })
    }
}

struct ImplDef {
    method: Method,
    lifetime: Option<TokenStream>,
    arg: Option<TokenStream>,
    selectable: bool,
}

impl ToTokens for ImplDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            method,
            lifetime,
            arg,
            selectable,
        } = self;
        let body_line = if arg.is_some() {
            Some(quote!(body,))
        } else {
            None
        };
        let selection_line = if *selectable {
            Some(quote!(selection: Selection::default(),))
        } else {
            None
        };
        tokens.append_all(quote! {
            impl #lifetime #method #lifetime {
                pub fn new(#arg) -> Self {
                    Self {
                        #body_line
                        #selection_line
                    }
                }
            }
        })
    }
}

struct OperationDef {
    method: String,
    lifetime: Option<TokenStream>,
    body: Option<TokenStream>,
    selectable: bool,
}

impl ToTokens for OperationDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let OperationDef {
            method,
            lifetime,
            body,
            selectable,
        } = self;
        let upper_method = format_ident!("{}", method.to_ascii_uppercase());
        let method = format_ident!("{method}");

        // Clippy gets confused if you clone (), so handle that case separately
        let (body_type, body_clone) = if let Some(body) = body {
            (body, quote!(self.body.clone()))
        } else {
            (&quote!(()), quote!(()))
        };

        let selection_str = if *selectable {
            quote! {
                let mut params = Serializer::new(String::new());
                let (select, selection) = self.selection.pair();
                params.append_pair(select, &selection);
                let params = params.finish();
                let p_and_q = http::uri::PathAndQuery::from_str(&format!("{PATH}?{params}")).unwrap();
            }
        } else {
            quote!(let p_and_q = PATH;)
        };

        tokens.append_all(quote! {
            impl #lifetime Operation for #method #lifetime {
                const METHOD: Method = Method::#upper_method;
                type Body = #body_type;

                fn build(&self) -> http::Request<Self::Body> {
                    #selection_str
                    http::Request::builder()
                        .uri(p_and_q)
                        .method(Self::METHOD)
                        .body(#body_clone)
                        .unwrap()
                }
            }
        })
    }
}

struct SelectDef {
    selection_type: Option<Ident>,
}

impl ToTokens for SelectDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        if let Self {
            selection_type: Some(selection_type),
        } = self
        {
            tokens.append_all(quote! {
                impl Select for Get {
                    type Properties = #selection_type;

                    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
                        self.selection.select(properties)
                    }

                    fn extend<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
                        self.selection.extend(properties)
                    }
                }
            })
        }
    }
}

fn selectable(request: &Operation) -> bool {
    if let Some(parameters) = &request.parameters {
        parameters
            .iter()
            .any(|p| p.name == Some("$select".to_string()))
    } else {
        false
    }
}

impl ToTokens for Method {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        tokens.append(format_ident!("{self}"))
    }
}

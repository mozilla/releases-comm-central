/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, TokenStreamExt, format_ident, quote};

use crate::GENERATION_DISCLOSURE;
use crate::extract::{
    path::{Method, Operation, Path, Success},
    schema::Property,
};
use crate::naming::snakeify;

use super::{Reference, RustType, markup_doc_comment, return_type};

impl ToTokens for Path {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Path {
            name,
            template_expressions,
            description,
            operations,
        } = self;
        let mut imports = vec![];
        let template_expressions = TemplateExpressionsDef::new(name, template_expressions);
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
                let response = operation_response(operation);
                match method {
                    Method::Get => Some(http_get(&mut imports, template_expressions.idents.clone(), description, operation, response)),
                    Method::Patch => Some(http_patch(template_expressions.idents.clone(), description, operation, response)),
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
            use crate::*;

            #template_expressions
        });
        tokens.append_all(operation_defs);
    }
}

fn operation_response(operation: &Operation) -> TokenStream {
    let mut response = operation.success.to_token_stream();
    if operation.delta {
        response = quote!(DeltaResponse<#response>);
    } else if operation.pageable {
        response = quote!(Paginated<#response>);
    }
    response
}

fn http_get(
    imports: &mut Vec<Property>,
    template_expressions: Vec<Ident>,
    description: Option<TokenStream>,
    operation: &Operation,
    response: TokenStream,
) -> RequestDef {
    let method = Method::Get;
    let selectable = selectable(operation);
    let selection_type = if selectable {
        let Success::WithBody(ref selection_body) = operation.success else {
            panic!("selectable request with no response type: {operation:?}");
        };
        let RustType::Custom(ref selection_type) = selection_body.property.rust_type else {
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
    let impl_def = ImplDef {
        method,
        lifetime: None,
        template_expressions,
        arg: None,
        selectable,
    };
    let operation_def = OperationDef {
        method: method.to_string(),
        lifetime: None,
        body: None,
        response: response.clone(),
        selectable,
    };
    let select_def = SelectDef { selection_type };
    let delta_def = operation.delta.then(|| DeltaDef { response });
    RequestDef {
        struct_def,
        impl_def,
        operation_def,
        select_def,
        delta_def,
    }
}

fn http_patch(
    template_expressions: Vec<Ident>,
    description: Option<TokenStream>,
    operation: &Operation,
    response: TokenStream,
) -> RequestDef {
    let method = Method::Patch;
    let op_body = operation
        .body
        .clone()
        .expect("Patch operations should have a body");
    let mut body = op_body.property.rust_type.base_token(false, Reference::Own);
    let body_lifetime = Some(quote!(<'body>));
    if op_body.property.is_ref {
        body = quote!(#body #body_lifetime);
    }
    let struct_def = StructDef {
        description,
        method,
        lifetime: body_lifetime.clone(),
        body_line: Some(quote!(body: #body,)),
        selection_type: None,
    };
    let impl_def = ImplDef {
        method,
        lifetime: body_lifetime.clone(),
        template_expressions,
        arg: Some(quote!(body: #body)),
        selectable: false,
    };
    let operation_def = OperationDef {
        method: method.to_string(),
        lifetime: body_lifetime,
        body: Some(body),
        response,
        selectable: false,
    };
    let select_def = SelectDef {
        selection_type: None,
    };
    assert!(!operation.delta, "deltas are not supported for PATCH");
    RequestDef {
        struct_def,
        impl_def,
        operation_def,
        select_def,
        delta_def: None,
    }
}

/// The path and its template expressions, ready for converting to tokens. Do
/// not construct this directly, use the `Self::new` constructor.
struct TemplateExpressionsDef {
    path: String,
    idents: Vec<Ident>,
}

impl TemplateExpressionsDef {
    fn new(raw_path: &str, template_expressions: &[String]) -> Self {
        let mut path = format!("{{endpoint}}{raw_path}");
        let mut idents = vec![format_ident!("endpoint")];
        for template in template_expressions {
            let pat = format!("{{{template}}}");
            let snakeified = snakeify(template);
            let to = format!("{{{snakeified}}}",);
            path = path.replacen(&pat, &to, 1);
            idents.push(format_ident!("{snakeified}"));
        }
        Self { path, idents }
    }
}

impl ToTokens for TemplateExpressionsDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self { path, idents } = self;
        tokens.append_all(quote! {
            #[derive(Debug)]
            struct TemplateExpressions {
                #( #idents: String, )*
            }
            fn format_path(template_expressions: &TemplateExpressions) -> String {
                let TemplateExpressions {
                    #( #idents, )*
                } = template_expressions;
                // remove all trailing '/' so there's only one (from the path)
                let endpoint = endpoint.trim_end_matches('/');
                format!(#path)
            }
        });
    }
}

pub struct RequestDef {
    struct_def: StructDef,
    impl_def: ImplDef,
    operation_def: OperationDef,
    select_def: SelectDef,
    delta_def: Option<DeltaDef>,
}

impl ToTokens for RequestDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let RequestDef {
            struct_def,
            impl_def,
            operation_def,
            select_def,
            delta_def,
        } = self;
        tokens.append_all(quote! {
            #struct_def
            #impl_def
            #operation_def
            #select_def
            #delta_def
        })
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
            #[derive(Debug)]
            pub struct #method #lifetime {
                template_expressions: TemplateExpressions,
                #body
                #selection_line
            }
        })
    }
}

struct ImplDef {
    method: Method,
    lifetime: Option<TokenStream>,
    template_expressions: Vec<Ident>,
    arg: Option<TokenStream>,
    selectable: bool,
}

impl ToTokens for ImplDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            method,
            lifetime,
            template_expressions,
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
                pub fn new(#( #template_expressions: String, )* #arg) -> Self {
                    Self {
                        template_expressions: TemplateExpressions {
                            #( #template_expressions, )*
                        },
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
    response: TokenStream,
    selectable: bool,
}

impl ToTokens for OperationDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let OperationDef {
            method,
            lifetime,
            body,
            response,
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
                let path = format_path(&self.template_expressions);
                let uri = format!("{path}?{params}").parse::<http::uri::Uri>().unwrap();
            }
        } else {
            quote!(let uri = format_path(&self.template_expressions).parse::<http::uri::Uri>().unwrap();)
        };

        tokens.append_all(quote! {
            impl #lifetime Operation for #method #lifetime {
                const METHOD: Method = Method::#upper_method;
                type Body = #body_type;
                type Response<'response> = #response;

                fn build(&self) -> http::Request<Self::Body> {
                    #selection_str
                    http::Request::builder()
                        .uri(uri)
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

impl ToTokens for Success {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        match self {
            Self::NoBody => tokens.append_all(quote!(())),
            Self::WithBody(body) => tokens.append_all(return_type(
                &body.property,
                Reference::Own,
                Some("'response"),
            )),
        }
    }
}

struct DeltaDef {
    response: TokenStream,
}

impl ToTokens for DeltaDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self { response } = self;
        tokens.append_all(quote! {
            ///Retrieve delta changes using an opaque token from a previous
            /// delta response. The caller must ensure only tokens from this
            /// path are used.
            #[derive(Debug)]
            pub struct GetDelta {
                token: http::Uri,
            }
            impl TryFrom<&str> for GetDelta {
                type Error = Error;

                fn try_from(token: &str) -> Result<Self, Self::Error> {
                    let token = http::Uri::from_str(token)?;
                    Ok(Self { token })
                }
            }

            impl Operation for GetDelta {
                const METHOD: Method = Method::GET;
                type Body = ();
                type Response<'response> = #response;

                fn build(&self) -> http::Request<Self::Body> {
                    http::Request::builder()
                        .uri(&self.token)
                        .method(Self::METHOD)
                        .body(())
                        .unwrap()
                }
            }
        });
    }
}

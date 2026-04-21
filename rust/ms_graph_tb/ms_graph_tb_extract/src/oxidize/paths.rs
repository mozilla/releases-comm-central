/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, TokenStreamExt, format_ident, quote};

use crate::GENERATION_DISCLOSURE;
use crate::extract::path::ApiBody;
use crate::extract::{
    path::{Method, Operation, Path, Success},
    schema::Property,
};
use crate::module_hierarchy::ModuleName;
use crate::naming::snakeify;
use crate::oxidize::types::GraphType;

use super::{Reference, RustType, markup_doc_comment, return_type};

/// Code generation state for one extracted API path.
///
/// This wraps [`crate::extract::path::Path`], which is an OpenAPI-style API
/// path, and emits the corresponding Rust path module.
pub struct PathModule<'a> {
    pub path: &'a Path,
    pub child_modules: &'a [ModuleName],
}

impl ToTokens for PathModule<'_> {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            path,
            child_modules,
        } = self;
        let Path {
            name,
            template_expressions,
            description,
            operations,
        } = path;
        let mut imports = vec![];
        let template_expressions = TemplateExpressionsDef::new(name, template_expressions);
        let child_modules = child_modules.iter().map(ModuleName::as_rust_ident);
        let mut operations = operations.clone();
        operations.sort_by_key(|op| op.method);
        let operation_defs = operations
            .iter()
            .map(|operation| {
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

                let response = operation_response(operation);
                match &operation.body {
                    Some(body) => request_with_body(
                        body.clone(),
                        &mut imports,
                        template_expressions.idents.clone(),
                        description,
                        operation,
                        response
                    ),
                    None => request_without_body(
                        &mut imports,
                        template_expressions.idents.clone(),
                        description,
                        operation,
                        response
                    ),
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

        let imports = super::imports(&imports, None);

        tokens.append_all(quote! {
            #( pub mod #child_modules; )*

            use form_urlencoded::Serializer;
            use http::method::Method;
            use std::str::FromStr;

            #imports
            use crate::odata::*;
            use crate::pagination::*;
            use crate::*;

            #template_expressions
        });
        tokens.append_all(operation_defs);
    }
}

fn operation_response(operation: &Operation) -> TokenStream {
    if operation.is_delta {
        let response = delta_response_value(operation);
        quote!(DeltaResponse<#response>)
    } else if operation.pageable {
        let response = operation.success.to_token_stream();
        quote!(Paginated<#response>)
    } else {
        operation.success.to_token_stream()
    }
}

fn delta_response_value(operation: &Operation) -> TokenStream {
    let Success::WithBody(body) = &operation.success else {
        panic!("delta operations must have a response body: {operation:?}");
    };

    assert!(
        body.property.is_collection,
        "delta operations must have a collection response body: {operation:?}"
    );

    let mut element = body.property.clone();
    element.is_collection = false;

    return_type(&element, Reference::Own, Some("'response"))
}

/// Construct a response property for OData queries, such as `$select` and
/// `$expand`.
///
/// Returns `None` if the operation success response has no body.
fn odata_target_property(operation: &Operation) -> Option<Property> {
    let Success::WithBody(body) = &operation.success else {
        return None;
    };

    let mut property = body.property.clone();

    // Operations with responses of type `*CollectionResponse` don't apply the
    // query to that type, they apply it to the type in the collection.
    if operation.pageable
        && let RustType::NamedSchema(custom_type) = &property.rust_type
        && let Some(base_name) = custom_type
            .original_name()
            .strip_suffix("CollectionResponse")
    {
        assert!(
            crate::SUPPORTED_TYPES.contains(base_name),
            "a {base_name}CollectionResponse type should not be present if {base_name} is not a supported type"
        );
        property.name = base_name.to_string();
        property.rust_type = RustType::NamedSchema(base_name.into());
        property.is_ref = false;

        // This only works if all `*CollectionResponse` types aren't collections
        // of collections, which seems to be the case. If it ever stops being
        // the case, this will need to do something more complicated, since we
        // don't have direct access to the underlying base type here.
        property.is_collection = false;
    }

    if operation.is_delta {
        property.is_collection = false;
    }

    Some(property)
}

/// Get the Rust identifier for the OData query-option target type with the
/// given generated suffix.
///
/// Returns `None` if the operation success response has no body or if the OData
/// target is not a custom Graph type.
fn odata_target_ident(operation: &Operation, suffix: &str) -> Option<Ident> {
    let property = odata_target_property(operation)?;
    let RustType::NamedSchema(custom_type) = property.rust_type else {
        return None;
    };
    Some(format_ident!("{}{}", custom_type.as_pascal_case(), suffix))
}

/// Generate the struct and implementation of a request that doesn't take a
/// body.
fn request_without_body(
    imports: &mut Vec<Property>,
    template_expressions: Vec<Ident>,
    description: Option<TokenStream>,
    operation: &Operation,
    response: TokenStream,
) -> RequestDef {
    if let Success::WithBody(ref body) = operation.success {
        imports.push(body.property.clone());
    }

    let method = operation.method;

    let selectable = selectable(operation);
    let expandable = expandable(operation);
    let filterable = filterable(operation);
    let selection_type = selectable
        .then(|| odata_target_ident(operation, "Selection"))
        .flatten();
    let selectable = selection_type.is_some();
    let expand_type = expandable
        .then(|| odata_target_ident(operation, "Expand"))
        .flatten();
    let expandable = expand_type.is_some();
    if selectable || expandable {
        let Some(query_target) = odata_target_property(operation) else {
            panic!("queryable request with no response type: {operation:?}");
        };
        imports.push(query_target);
    }

    let mut unnamed_body_types = Vec::new();
    if let Success::WithBody(resp_body) = &operation.success
        && let RustType::UnnamedSchema(graph_type) = &resp_body.property.rust_type
    {
        unnamed_body_types.push(graph_type.clone());
    }

    let struct_def = StructDef {
        description,
        method,
        lifetime: None,
        body_line: None,
        selection_type: selection_type.clone(),
        expand_type: expand_type.clone(),
        filterable,
    };
    let impl_def = ImplDef {
        method,
        lifetime: None,
        template_expressions,
        arg: None,
        selectable,
        expandable,
        filterable,
    };
    let operation_def = OperationDef {
        method: method.to_string(),
        lifetime: None,
        body: None,
        response: response.clone(),
        selectable,
        expandable,
        filterable,
    };
    let select_def = SelectDef { selection_type };
    let expand_def = ExpandDef {
        expand_type,
        method,
    };
    let filter_def = FilterDef { method, filterable };
    let delta_def = operation.is_delta.then(|| DeltaDef { response });
    RequestDef {
        unnamed_body_types,
        struct_def,
        impl_def,
        operation_def,
        select_def,
        expand_def,
        filter_def,
        delta_def,
    }
}

/// Generate the struct and implementation of a request that takes the given
/// body.
fn request_with_body(
    op_body: ApiBody,
    imports: &mut Vec<Property>,
    template_expressions: Vec<Ident>,
    description: Option<TokenStream>,
    operation: &Operation,
    response: TokenStream,
) -> RequestDef {
    imports.push(op_body.property.clone());

    if let Success::WithBody(ref body) = operation.success {
        imports.push(body.property.clone());
    }

    let method = operation.method;
    let filterable = filterable(operation);

    let mut body = op_body.property.rust_type.base_token(false, Reference::Own);
    let body_lifetime = match op_body.property.rust_type {
        RustType::NamedSchema(_) | RustType::UnnamedSchema(_) => Some(quote!(<'body>)),
        _ => None,
    };
    if op_body.property.is_ref || matches!(op_body.property.rust_type, RustType::UnnamedSchema(_)) {
        body = quote!(#body #body_lifetime);
    }

    let mut unnamed_body_types = Vec::new();
    if let RustType::UnnamedSchema(graph_type) = op_body.property.rust_type {
        unnamed_body_types.push(graph_type);
    } else if let Success::WithBody(resp_body) = &operation.success
        && let RustType::UnnamedSchema(graph_type) = &resp_body.property.rust_type
    {
        unnamed_body_types.push(graph_type.clone());
    }

    let struct_def = StructDef {
        description,
        method,
        lifetime: body_lifetime.clone(),
        body_line: Some(quote!(body: OperationBody<#body>,)),
        selection_type: None,
        expand_type: None,
        filterable,
    };
    let impl_def = ImplDef {
        method,
        lifetime: body_lifetime.clone(),
        template_expressions,
        arg: Some(quote!(body: OperationBody<#body>)),
        selectable: false,
        expandable: false,
        filterable,
    };
    let operation_def = OperationDef {
        method: method.to_string(),
        lifetime: body_lifetime,
        body: Some(body),
        response,
        selectable: false,
        expandable: false,
        filterable,
    };
    let select_def = SelectDef {
        selection_type: None,
    };
    let expand_def = ExpandDef {
        expand_type: None,
        method,
    };
    let filter_def = FilterDef { method, filterable };
    assert!(
        !operation.is_delta,
        "deltas are not supported for requests with a body"
    );
    RequestDef {
        unnamed_body_types,
        struct_def,
        impl_def,
        operation_def,
        select_def,
        expand_def,
        filter_def,
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
    #[must_use]
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
    unnamed_body_types: Vec<GraphType>,
    struct_def: StructDef,
    impl_def: ImplDef,
    operation_def: OperationDef,
    select_def: SelectDef,
    expand_def: ExpandDef,
    filter_def: FilterDef,
    delta_def: Option<DeltaDef>,
}

impl ToTokens for RequestDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let RequestDef {
            unnamed_body_types,
            struct_def,
            impl_def,
            operation_def,
            select_def,
            expand_def,
            filter_def,
            delta_def,
        } = self;
        tokens.append_all(
            unnamed_body_types
                .iter()
                .map(|graph_type| quote!(#graph_type)),
        );
        tokens.append_all(quote! {
            #struct_def
            #impl_def
            #operation_def
            #select_def
            #expand_def
            #filter_def
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
    expand_type: Option<Ident>,
    filterable: bool,
}

impl ToTokens for StructDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            description,
            method,
            lifetime,
            body_line: body,
            selection_type,
            expand_type,
            filterable,
        } = self;
        let selection_line = selection_type
            .as_ref()
            .map(|selection_type| quote!(selection: Selection<#selection_type>,));
        let expand_line = expand_type
            .as_ref()
            .map(|expand_type| quote!(expansion: ExpansionList<#expand_type>,));
        let filter_line = filterable.then(|| quote!(filter: FilterQuery,));
        tokens.append_all(quote! {
            #description
            #[derive(Debug)]
            pub struct #method #lifetime {
                template_expressions: TemplateExpressions,
                #body
                #selection_line
                #expand_line
                #filter_line
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
    expandable: bool,
    filterable: bool,
}

impl ToTokens for ImplDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            method,
            lifetime,
            template_expressions,
            arg,
            selectable,
            expandable,
            filterable,
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
        let expand_line = if *expandable {
            Some(quote!(expansion: ExpansionList::default(),))
        } else {
            None
        };
        let filter_line = if *filterable {
            Some(quote!(filter: FilterQuery::default(),))
        } else {
            None
        };
        tokens.append_all(quote! {
            impl #lifetime #method #lifetime {
                #[must_use]
                pub fn new(#( #template_expressions: String, )* #arg) -> Self {
                    Self {
                        template_expressions: TemplateExpressions {
                            #( #template_expressions, )*
                        },
                        #body_line
                        #selection_line
                        #expand_line
                        #filter_line
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
    expandable: bool,
    filterable: bool,
}

impl ToTokens for OperationDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let OperationDef {
            method,
            lifetime,
            body,
            response,
            selectable,
            expandable,
            filterable,
        } = self;
        let upper_method = format_ident!("{}", method.to_ascii_uppercase());
        let method = format_ident!("{method}");

        let append_selection = selectable.then(|| {
            quote! {
                if let Some((select, selection)) = self.selection.pair() {
                    params.append_pair(select, &selection);
                }
            }
        });
        let append_filter = filterable.then(|| {
            quote! {
                if let Some((filter, expression)) = self.filter.pair() {
                    params.append_pair(filter, &expression);
                }
            }
        });
        let append_expand = expandable.then(|| {
            quote! {
                if let Some((expand, expansion)) = self.expansion.pair() {
                    params.append_pair(expand, &expansion);
                }
            }
        });

        let build_uri = if *selectable || *expandable || *filterable {
            quote! {
                let mut params = Serializer::new(String::new());
                #append_selection
                #append_expand
                #append_filter
                let params = params.finish();
                let path = format_path(&self.template_expressions);
                let uri = if params.is_empty() {
                    path.parse::<http::uri::Uri>().unwrap()
                } else {
                    format!("{path}?{params}").parse::<http::uri::Uri>().unwrap()
                };
            }
        } else {
            quote!(let uri = format_path(&self.template_expressions).parse::<http::uri::Uri>().unwrap();)
        };

        let build_request = match body {
            None => quote! {
                let request = http::Request::builder()
                    .uri(uri)
                    .method(Self::METHOD)
                    .body(vec![])?;
            },
            Some(_) => quote! {
                let (body, content_type) = match self.body {
                    OperationBody::JSON(body) => (serde_json::to_vec(&body)?, String::from("application/json")),
                    OperationBody::Other { body, content_type } => (body, content_type),
                };

                let request = http::Request::builder()
                    .uri(uri)
                    .method(Self::METHOD)
                    .header("Content-Type", content_type)
                    .body(body)?;
            },
        };

        let lifetime = lifetime.as_ref().map(|_| quote!(<'_>));

        tokens.append_all(quote! {
            impl Operation for #method #lifetime {
                const METHOD: Method = Method::#upper_method;
                type Response<'response> = #response;

                fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
                    #build_uri

                    #build_request

                    Ok(request)
                }
            }
        });
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
                        self.selection.select(properties);
                    }

                    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
                        self.selection.extend(properties);
                    }
                }
            })
        }
    }
}

struct FilterDef {
    method: Method,
    filterable: bool,
}

impl ToTokens for FilterDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self { method, filterable } = self;
        if *filterable {
            tokens.append_all(quote! {
                impl Filter for #method {
                    fn filter(&mut self, expression: FilterExpression) {
                        self.filter.set(expression);
                    }
                }
            })
        }
    }
}

struct ExpandDef {
    expand_type: Option<Ident>,
    method: Method,
}

impl ToTokens for ExpandDef {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        if let Self {
            expand_type: Some(expand_type),
            method,
        } = self
        {
            tokens.append_all(quote! {
                impl Expand for #method {
                    type Properties = #expand_type;

                    fn expand<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
                        self.expansion.expand(properties);
                    }

                    fn extend_expand<P: IntoIterator<Item = Self::Properties>>(
                        &mut self,
                        properties: P,
                    ) {
                        self.expansion.extend(properties);
                    }
                }
            })
        }
    }
}

fn queryable(request: &Operation, query: &'static str) -> bool {
    if let Some(parameters) = &request.parameters {
        parameters
            .iter()
            .any(|p| p.name.as_deref() == Some(query) && p.r#in.as_deref() == Some("query"))
    } else {
        false
    }
}

fn selectable(request: &Operation) -> bool {
    queryable(request, "$select")
}

fn filterable(request: &Operation) -> bool {
    queryable(request, "$filter")
}

fn expandable(request: &Operation) -> bool {
    queryable(request, "$expand")
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
                type Response<'response> = #response;

                fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
                    let request = http::Request::builder()
                        .uri(&self.token)
                        .method(Self::METHOD)
                        .body(vec![])?;

                    Ok(request)
                }
            }
        });
    }
}

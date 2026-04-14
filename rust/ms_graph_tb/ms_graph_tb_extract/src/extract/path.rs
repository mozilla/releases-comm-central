/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use strum::Display;

use crate::extract::schema::{Property, SchemaContext, SchemaKind};
use crate::naming::simple_name;
use crate::openapi::path::{OaBody, OaParameter, OaPath};
use crate::openapi::schema::OaSchema;
use crate::oxidize::{RustType, SchemaName};

use super::schema::extract_from_schema;

/// Our representation of a Graph API path.
///
/// This follows a typical OpenAPI structure where a "path" is a collection
/// of operations using the same HTTP path.
#[derive(Debug, Clone)]
pub struct Path {
    /// The full, unedited path name (e.g., `/me`).
    pub name: String,

    /// A list of OpenAPI [path template expressions] in the path.
    ///
    /// [path template expressions]: https://spec.openapis.org/oas/latest.html#path-templating
    pub template_expressions: Vec<String>,

    /// A description of the path.
    pub description: Option<String>,

    /// All supported HTTP operations for this path.
    pub operations: Vec<Operation>,
}

/// A structured Graph API operation (i.e., HTTP request).
#[derive(Debug, Clone)]
pub struct Operation {
    pub method: Method,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub external_docs: Option<String>,
    pub pageable: bool,
    pub is_delta: bool,
    pub parameters: Option<Vec<Parameter>>,
    pub body: Option<ApiBody>,
    pub success: Success,
}

/// An HTTP method.
// It's a bit unusual to derive Ord for this, but we use it to get a (somewhat
// arbitrary) stable order when defining implementations.
#[derive(Debug, Display, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Method {
    Get,
    Post,
    Patch,
    Put,
    Delete,
}

impl TryFrom<&str> for Method {
    type Error = ParseError;
    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "get" => Ok(Self::Get),
            "patch" => Ok(Self::Patch),
            "post" => Ok(Self::Post),
            "put" => Ok(Self::Put),
            "delete" => Ok(Self::Delete),
            s => Err(ParseError(format!("unkown method: {s}"))),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParseError(String);

impl std::error::Error for ParseError {}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        let Self(s) = self;
        s.fmt(f)
    }
}

/// A structured GraphAPI HTTP request parameter.
// FIXME: most fields are ignored because only $select is currently supported
#[derive(Debug, Clone)]
pub struct Parameter {
    pub name: Option<String>,
    pub _in: Option<String>,
    pub _description: Option<String>,
    pub _typ: Option<RustType>,
}

impl From<&OaParameter> for Parameter {
    fn from(value: &OaParameter) -> Self {
        let typ = match &value.schema {
            None => None,
            Some(OaSchema::Ref { reference }) => Some(RustType::NamedSchema(SchemaName::from(
                simple_name(reference).to_string(),
            ))),
            Some(schema) => {
                let (_, properties) = extract_from_schema(
                    schema,
                    SchemaContext {
                        kind: SchemaKind::Other,
                        is_delta: false,
                    },
                );
                assert_eq!(
                    properties.len(),
                    1,
                    "Parameter with multiple types: {properties:?}"
                );
                Some(properties[0].rust_type.clone())
            }
        };
        Parameter {
            name: value.name.clone(),
            _in: value.r#in.clone(),
            _description: value.description.clone(),
            _typ: typ,
        }
    }
}

/// A structured Graph API HTTP request or response body.
// FIXME: determine if there's a good way to use the description
#[derive(Debug, Clone)]
pub struct ApiBody {
    pub _description: Option<String>,
    pub property: Property,
}

impl ApiBody {
    pub fn from_openapi(value: &OaBody, kind: SchemaKind, is_delta: bool) -> Self {
        let (_, properties) = extract_from_schema(&value.schema, SchemaContext { kind, is_delta });
        assert_eq!(
            properties.len(),
            1,
            "Body with multiple properties: {value:?}"
        );
        ApiBody {
            _description: value.description.clone(),
            property: properties[0].clone(),
        }
    }
}

/// The success code of a Graph API response.
#[derive(Debug, Clone)]
pub enum Success {
    /// Successful response contains no body
    NoBody,

    /// Successful response contains a body
    WithBody(ApiBody),
}

fn schema_has_delta_base_ref(schema: &OaSchema) -> bool {
    match schema {
        OaSchema::Ref { reference } => {
            reference == "#/components/schemas/BaseDeltaFunctionResponse"
        }
        OaSchema::Obj { items, all_of, .. } => {
            items.as_deref().is_some_and(schema_has_delta_base_ref)
                || all_of
                    .as_ref()
                    .is_some_and(|schemas| schemas.iter().any(schema_has_delta_base_ref))
        }
    }
}

fn template_expressions_from_path_name(name: &str) -> impl Iterator<Item = &str> {
    name.split('{').skip(1).map(|s| {
        s.split_once('}')
            .expect("all path template expressions should have matched braces")
            .0
    })
}

/// For the given OpenAPI path, extract its Graph API description and supported
/// requests.
pub fn extract_from_oa_path(name: String, oa_path: &OaPath) -> Path {
    let OaPath {
        description,
        operations,
    } = oa_path;
    let description = description.clone();

    let template_expressions = template_expressions_from_path_name(&name)
        .map(String::from)
        .collect();

    let operations = operations
        .iter()
        .map(|(method, request)| {
            let method = method
                .as_str()
                .try_into()
                .unwrap_or_else(|e| todo!("method: {e}"));
            let summary = request.summary.clone();
            let description = request.description.clone();
            let external_docs = request.external_docs.clone();
            let pageable = request.pageable;
            let parameters = request
                .parameters
                .as_ref()
                .map(|p| p.iter().map(Parameter::from).collect());
            let is_delta = request
                .responses
                .get("2XX")
                .and_then(|body| body.as_ref())
                .is_some_and(|body| schema_has_delta_base_ref(&body.schema));
            let body = request
                .body
                .as_ref()
                .map(|body| ApiBody::from_openapi(body, SchemaKind::Request(method), is_delta));
            let success = if request.responses.contains_key("204") {
                Success::NoBody
            } else if let Some(None) = request.responses.get("2XX") {
                Success::NoBody
            } else if let Some(Some(two_hundred)) = request.responses.get("2XX") {
                let mut body =
                    ApiBody::from_openapi(two_hundred, SchemaKind::SuccessResponse, is_delta);
                body.property.is_ref |= is_delta;
                Success::WithBody(body)
            } else {
                todo!("success response: {:?}", request.responses);
            };

            Operation {
                method,
                summary,
                description,
                external_docs,
                pageable,
                is_delta,
                parameters,
                body,
                success,
            }
        })
        .collect();
    Path {
        name,
        template_expressions,
        description,
        operations,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::{
        extract::path::{Method, Success, extract_from_oa_path},
        openapi::{
            path::{OaBody, OaOperation, OaPath},
            schema::OaSchema,
        },
        oxidize::RustType,
    };

    #[test]
    fn test_media_resource() {
        let oa_path = OaPath {
            description: None,
            operations: HashMap::from([
                (
                    "get".to_string(),
                    OaOperation {
                        summary: None,
                        description: Some("Return the pet's noise.".to_string()),
                        external_docs: None,
                        pageable: false,
                        parameters: None,
                        body: None,
                        responses: HashMap::from([(
                            "2XX".to_string(),
                            Some(OaBody {
                                application_type: Some("application/octet-stream".to_string()),
                                description: Some(".wav with the pet's noise.".to_string()),
                                schema: OaSchema::Obj {
                                    typ: Some("string".to_string()),
                                    format: Some("binary".to_string()),
                                    nullable: None,
                                    properties: None,
                                    items: None,
                                    all_of: None,
                                    one_of: None,
                                    any_of: None,
                                    description: None,
                                    navigation_property: false,
                                },
                            }),
                        )]),
                    },
                ),
                (
                    "put".to_string(),
                    OaOperation {
                        summary: None,
                        description: Some("Return the pet's noise.".to_string()),
                        external_docs: None,
                        pageable: false,
                        parameters: None,
                        body: None,
                        responses: HashMap::from([("2XX".to_string(), None)]),
                    },
                ),
            ]),
        };

        let graph_path = extract_from_oa_path("/pets/{pet-id}/$value".to_string(), &oa_path);

        assert_eq!(graph_path.name, "/pets/{pet-id}/$value");
        assert_eq!(graph_path.operations.len(), 2);

        let get_op = graph_path
            .operations
            .iter()
            .find(|op| op.method == Method::Get)
            .unwrap();

        println!("{get_op:?}");

        if let Success::WithBody(body) = get_op.success.clone() {
            assert!(matches!(body.property.rust_type, RustType::Bytes));
        } else {
            panic!("Media resource success should have a body.");
        }
    }
}

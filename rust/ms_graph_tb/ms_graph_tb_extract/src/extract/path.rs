/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use strum::Display;

use crate::extract::schema::Property;
use crate::naming::simple_name;
use crate::openapi::path::{OaBody, OaParameter, OaPath};
use crate::openapi::schema::OaSchema;
use crate::oxidize::{CustomRustType, RustType};

use super::schema::extract_from_schema;

/// Our representation of a Graph API path.
///
/// This follows a typical OpenAPI structure where a "path" is a collection
/// of operations using the same HTTP path.
#[derive(Debug, Clone)]
pub struct Path {
    pub name: String,
    pub description: Option<String>,
    pub operations: Vec<Operation>,
}

/// A structured Graph API operation (i.e., HTTP request).
#[derive(Debug, Clone)]
pub struct Operation {
    pub method: Method,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub external_docs: Option<String>,
    pub parameters: Option<Vec<Parameter>>,
    pub body: Option<RequestBody>,
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

#[derive(Debug, Clone)]
pub struct ParseError(String);

impl std::error::Error for ParseError {}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        let Self(s) = self;
        s.fmt(f)
    }
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
            Some(OaSchema::Ref { reference }) => Some(RustType::Custom(CustomRustType::from(
                simple_name(reference).to_string(),
            ))),
            Some(schema) => {
                let (_, properties) = extract_from_schema(schema);
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

/// A structured GraphAPI HTTP request body.
// FIXME: determine if there's a good way to use the description
#[derive(Debug, Clone)]
pub struct RequestBody {
    pub _description: Option<String>,
    pub property: Property,
}

impl From<&OaBody> for RequestBody {
    fn from(value: &OaBody) -> Self {
        if let OaSchema::Obj { .. } = &value.schema {
            assert_eq!(
                value.application_type.as_deref(),
                Some("application/json"),
                "non-json body: {value:?}"
            );
        }
        let (_, properties) = extract_from_schema(&value.schema);
        assert_eq!(
            properties.len(),
            1,
            "Body with multiple properties: {value:?}"
        );
        RequestBody {
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
    WithBody(RequestBody),
}

/// For the given OpenAPI path, extract its Graph API description and supported
/// requests.
pub fn extract_from_oa_path(name: String, oa_path: &OaPath) -> Path {
    let OaPath {
        description,
        operations,
    } = oa_path;
    let description = description.clone();

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
            let parameters = request
                .parameters
                .as_ref()
                .map(|p| p.iter().map(Parameter::from).collect());
            let body = request.body.as_ref().map(RequestBody::from);
            let success = if request.responses.contains_key("204") {
                Success::NoBody
            } else if let Some(Some(two_hundred)) = request.responses.get("2XX") {
                Success::WithBody(two_hundred.into())
            } else {
                todo!("success response: {:?}", request.responses);
            };

            Operation {
                method,
                summary,
                description,
                external_docs,
                parameters,
                body,
                success,
            }
        })
        .collect();
    Path {
        name,
        description,
        operations,
    }
}

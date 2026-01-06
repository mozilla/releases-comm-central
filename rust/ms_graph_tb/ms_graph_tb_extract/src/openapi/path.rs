/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;
use yaml_rust2::{yaml::Hash as YamlHash, Yaml};

use super::{get_map_in, get_node_in, get_seq_in, get_str_in, parse_schema, OaSchema};

/// An OpenAPI path.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct OaPath {
    pub description: Option<String>,
    pub operations: HashMap<String, OaOperation>,
}

/// An OpenAPI Operation (request).
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct OaOperation {
    pub summary: Option<String>,
    pub description: Option<String>,

    // this field is technically structured, but we only store the url, since the only additional
    // info is always the useless description "Find more info here"
    pub external_docs: Option<String>,
    pub parameters: Option<Vec<OaParameter>>,
    pub body: Option<OaBody>,
    pub responses: HashMap<String, Option<OaBody>>,
}

/// An OpenAPI HTTP request parameter.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct OaParameter {
    pub name: Option<String>,
    pub r#in: Option<String>,
    pub description: Option<String>,
    pub style: Option<String>,
    pub schema: Option<OaSchema>,
}

/// An OpenAPI HTTP request body.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct OaBody {
    pub application_type: Option<String>,
    pub description: Option<String>,
    pub schema: OaSchema,
}

/// Parse the given yaml text as an OpenAPI path.
pub(super) fn parse_path(node: &Yaml) -> OaPath {
    let map = node
        .as_hash()
        .expect("all paths should be compound YAML objects");

    let description = get_str_in(map, "description").map(|s| s.to_string());
    let operations = map
        .iter()
        .filter_map(|(key, node)| {
            let key = key.as_str().expect("keys are `str`s");
            if matches!(key, "description" | "parameters" | "x-ms-docs-grouped-path") {
                return None;
            }
            let map = node
                .as_hash()
                .unwrap_or_else(|| panic!("expected operation, got: {node:?}"));
            let method = key.into();
            let summary = get_str_in(map, "summary");
            let description = get_str_in(map, "description");
            let external_docs = get_external_docs(map);
            let body = get_request_body(map);
            let responses = get_responses(map);
            let parameters = get_parameters(map);
            Some((
                method,
                OaOperation {
                    summary,
                    description,
                    external_docs,
                    parameters,
                    body,
                    responses,
                },
            ))
        })
        .collect();

    OaPath {
        description,
        operations,
    }
}

fn get_external_docs(map: &YamlHash) -> Option<String> {
    let map = get_map_in(map, "externalDocs")?;
    Some(
        get_str_in(map, "url")
            .expect("external docs should have url")
            .to_string(),
    )
}

fn get_request_body(map: &YamlHash) -> Option<OaBody> {
    let map = get_map_in(map, "requestBody")?;
    get_body(map)
}

fn get_body(map: &YamlHash) -> Option<OaBody> {
    if let Some(reference) = get_str_in(map, "$ref") {
        return Some(OaBody {
            application_type: None,
            description: None,
            schema: OaSchema::Ref { reference },
        });
    }
    let content = get_map_in(map, "content")?;
    let (application_type, application) = content
        .iter()
        .next()
        .expect("content should have an application type");
    let application_type = application_type.as_str().map(str::to_string);
    let application = application
        .as_hash()
        .expect("application should be a compount YAML type");
    let schema = get_node_in(application, "schema").expect("application/json should have schema");
    let schema = parse_schema(schema);

    let description = get_str_in(map, "description");

    Some(OaBody {
        application_type,
        description,
        schema,
    })
}

fn get_responses(map: &YamlHash) -> HashMap<String, Option<OaBody>> {
    let responses = get_map_in(map, "responses").expect("requests should have responses");
    responses
        .iter()
        .map(|(k, v)| {
            let method = k.as_str().expect("response keys should be strings");
            let map = v
                .as_hash()
                .expect("response values should be compound YAML objects");
            let body = get_body(map);
            (method.to_string(), body)
        })
        .collect()
    /*

    }*/
}

fn get_parameters(map: &YamlHash) -> Option<Vec<OaParameter>> {
    let parameters = get_seq_in(map, "parameters")?;
    Some(
        parameters
            .iter()
            .map(|node| {
                let map = node
                    .as_hash()
                    .expect("parameters should be compound YAML objects");
                let schema = get_node_in(map, "schema").map(parse_schema);
                OaParameter {
                    name: get_str_in(map, "name"),
                    r#in: get_str_in(map, "in"),
                    description: get_str_in(map, "description"),
                    style: get_str_in(map, "style"),
                    schema,
                }
            })
            .collect(),
    )
}

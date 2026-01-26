/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;
use yaml_rust2::yaml::Hash;
use yaml_rust2::Yaml;

use super::{get_bool_in, get_map_in, get_node_in, get_seq_in, get_str_in};

/// A recursive OpenAPI schema object, or reference to another schema object.
#[derive(Debug, Clone, Eq, PartialEq)]
pub enum OaSchema {
    // e.g., `$ref: "#/components/schemas/microsoft.graph.user"`
    Ref {
        reference: String,
    },
    Obj {
        typ: Option<String>,
        format: Option<String>,
        nullable: Option<bool>,
        properties: Option<HashMap<String, OaSchema>>,
        items: Option<Box<OaSchema>>,
        all_of: Option<Vec<OaSchema>>,
        one_of: Option<Vec<OaSchema>>,
        any_of: Option<Vec<OaSchema>>,
        description: Option<String>,
        navigation_property: bool,
    },
}

impl Default for OaSchema {
    fn default() -> Self {
        OaSchema::Obj {
            typ: None,
            format: None,
            nullable: None,
            properties: None,
            items: None,
            all_of: None,
            one_of: None,
            any_of: None,
            description: None,
            navigation_property: false,
        }
    }
}

impl OaSchema {
    pub fn nullable(&self) -> Option<bool> {
        match self {
            OaSchema::Ref { .. } => None,
            OaSchema::Obj { nullable, .. } => *nullable,
        }
    }
}

/// Parses the given request body and returns its schema.
pub(super) fn parse_request_body(node: &Yaml) -> OaSchema {
    let map = node
        .as_hash()
        .expect("all request bodies should be compound YAML objects");

    let map = get_map_in(map, "content").expect("request bodies should have a content");
    let map = get_map_in(map, "application/json")
        .expect("request bodies should have the type application/json");

    let schema = get_map_in(map, "schema").expect("request bodies should contain a schema");

    parse_schema_from_map(schema)
}

/// Recursively parses the given yaml node as a schema object or reference.
pub(super) fn parse_schema(node: &Yaml) -> OaSchema {
    let map = node
        .as_hash()
        .expect("all schemas should be compound YAML objects");

    parse_schema_from_map(map)
}

/// Recursively parses the schema represented by the given [`Hash`].
fn parse_schema_from_map(map: &Hash) -> OaSchema {
    if let Some(r) = get_str_in(map, "$ref") {
        return OaSchema::Ref {
            reference: r.to_string(),
        };
    }

    let typ = get_str_in(map, "type");
    let format = get_str_in(map, "format");
    let nullable = get_bool_in(map, "nullable");
    let description = get_str_in(map, "description");

    let properties = get_map_in(map, "properties").map(|props| {
        props
            .into_iter()
            .filter_map(|(k, v)| k.as_str().map(|name| (name.to_string(), parse_schema(v))))
            .collect()
    });

    let items = get_node_in(map, "items").map(|n| Box::new(parse_schema(n)));
    let all_of = get_seq_in(map, "allOf").map(|seq| seq.iter().map(parse_schema).collect());
    let one_of = get_seq_in(map, "oneOf").map(|seq| seq.iter().map(parse_schema).collect());
    let any_of = get_seq_in(map, "anyOf").map(|seq| seq.iter().map(parse_schema).collect());

    let navigation_property = get_bool_in(map, "x-ms-navigationProperty").unwrap_or(false);

    OaSchema::Obj {
        typ,
        format,
        nullable,
        properties,
        items,
        all_of,
        one_of,
        any_of,
        description,
        navigation_property,
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Modules for simple representations of generic OpenAPI data from the yaml
//! source, primarily for initial parsing.

use std::collections::HashMap;
use yaml_rust2::{yaml::Hash as YamlHash, Yaml, YamlLoader};

pub mod schema;

use schema::{parse_schema, OaSchema};

/// A parsed OpenAPI yaml file, not yet interpreted.
pub struct LoadedYaml {
    pub schemas: HashMap<String, OaSchema>,
}

/// Parse the given yaml text as an OpenAPI specification.
pub fn load_yaml(yaml_str: &str) -> Result<LoadedYaml, Box<dyn std::error::Error>> {
    let docs = YamlLoader::load_from_str(yaml_str)?;
    println!("yaml loaded");
    let doc = docs.into_iter().next().ok_or("Empty YAML document")?;

    let components = get_map_key(&doc, "components").ok_or("Missing 'components'")?;
    let schemas = get_map_key(components, "schemas").ok_or("Missing 'components.schemas'")?;
    println!("loaded roots");

    let schemas = schemas
        .as_hash()
        .expect("schemas should be a compound YAML object")
        .into_iter()
        .filter_map(|(k, v)| k.as_str().map(|name| (name.to_string(), parse_schema(v))))
        .collect();

    Ok(LoadedYaml { schemas })
}

fn get_map_key<'a>(y: &'a Yaml, key: &str) -> Option<&'a Yaml> {
    if let Some(h) = y.as_hash() {
        h.get(&Yaml::from_str(key))
    } else {
        None
    }
}

fn get_str_in<'a>(h: &'a YamlHash, key: &str) -> Option<&'a str> {
    h.get(&Yaml::from_str(key))?.as_str()
}

fn get_bool_in(h: &YamlHash, key: &str) -> Option<bool> {
    match h.get(&Yaml::from_str(key)) {
        Some(Yaml::Boolean(b)) => Some(*b),
        _ => None,
    }
}

fn get_map_in<'a>(h: &'a YamlHash, key: &str) -> Option<&'a YamlHash> {
    match h.get(&Yaml::from_str(key)) {
        Some(Yaml::Hash(m)) => Some(m),
        _ => None,
    }
}

fn get_node_in<'a>(h: &'a YamlHash, key: &str) -> Option<&'a Yaml> {
    h.get(&Yaml::from_str(key))
}

fn get_seq_in<'a>(h: &'a YamlHash, key: &str) -> Option<&'a Vec<Yaml>> {
    match h.get(&Yaml::from_str(key)) {
        Some(Yaml::Array(a)) => Some(a),
        _ => None,
    }
}

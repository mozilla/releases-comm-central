/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Modules for simple representations of generic OpenAPI data from the yaml
//! source, primarily for initial parsing.

use log::info;
use std::collections::BTreeMap;
use yaml_rust2::{Yaml, YamlLoader, yaml::Hash as YamlHash};

pub mod path;
pub mod schema;

use path::{OaParameter, OaPath, parse_parameter, parse_path};
use schema::{OaSchema, parse_request_body, parse_schema};

/// A parsed OpenAPI yaml file, not yet interpreted.
pub struct LoadedYaml {
    pub paths: BTreeMap<String, OaPath>,
    pub schemas: BTreeMap<String, OaSchema>,
}

/// Parse the given yaml text as an OpenAPI specification.
pub fn load_yaml(yaml_str: &str) -> Result<LoadedYaml, Box<dyn std::error::Error>> {
    let docs = YamlLoader::load_from_str(yaml_str)?;
    info!("yaml loaded");
    let doc = docs.into_iter().next().ok_or("Empty YAML document")?;

    let (parameters, schemas) = if let Some(components) = get_map_key(&doc, "components") {
        get_params_and_schemas(components)
    } else {
        <_>::default()
    };

    let paths = get_and_parse(&doc, "paths", |y| parse_path(y, &parameters));

    info!("loaded roots");

    Ok(LoadedYaml { paths, schemas })
}

fn get_params_and_schemas(
    components: &Yaml,
) -> (BTreeMap<String, OaParameter>, BTreeMap<String, OaSchema>) {
    let parameters = get_and_parse(components, "parameters", parse_parameter);
    let mut schemas = get_and_parse(components, "schemas", parse_schema);
    let mut request_bodies = get_and_parse(components, "requestBodies", parse_request_body);

    // Bundle the schemas from request bodies together with the rest of the
    // schemas. This *should* not cause any conflict (despite schemas and
    // request bodies being defined in separate sections of the spec file),
    // because the name of request bodies all seem to end with "RequestBody"
    // (e.g. "sendMailRequestBody").
    schemas.append(&mut request_bodies);

    (parameters, schemas)
}

fn get_and_parse<T, PARSER: Fn(&Yaml) -> T>(
    y: &Yaml,
    map_key: &str,
    parser: PARSER,
) -> BTreeMap<String, T> {
    get_map_key(y, map_key)
        .map(|parameters| {
            parameters
                .as_hash()
                .expect("this should only be used with compound YAML objects")
                .into_iter()
                .filter_map(|(k, v)| k.as_str().map(|name| (name.to_string(), parser(v))))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default()
}

fn get_map_key<'a>(y: &'a Yaml, key: &str) -> Option<&'a Yaml> {
    if let Some(h) = y.as_hash() {
        h.get(&Yaml::from_str(key))
    } else {
        None
    }
}

fn get_str_in(h: &YamlHash, key: &str) -> Option<String> {
    h.get(&Yaml::from_str(key))?.as_str().map(str::to_string)
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

#[cfg(test)]
mod tests {
    use crate::openapi::{LoadedYaml, load_yaml};

    #[test]
    fn simple_json_endpoint() {
        let yaml: &str = r##"
            openapi: 3.0.4
            paths:
                /pets/{pet-id}:
                    get:
                        description: Return information about a pet.
                        responses:
                            '2XX':
                                $ref: "#/components/schemas/pet"
            components:
                schemas:
                    pet:
                        type: object
                        properties:
                            name:
                                type: string
                                description: The name of the pet.
                                nullable: false
                requestBodies:
                    petRequestBody:
                        description: Request body for pets.
                        content:
                            application/json:
                                schema:
                                    $ref: "#/components/schemas/pet"
            "##;

        let LoadedYaml { paths, schemas } = load_yaml(yaml).unwrap();

        println!("{schemas:?}");

        assert_eq!(paths.len(), 1);
        assert_eq!(schemas.len(), 2);
    }

    #[test]
    fn media_query_endpoint() {
        let yaml: &str = r##"
            openapi: 3.0.4
            paths:
                /pets/{pet-id}/$value:
                    get:
                        description: Return the pet's noise.
                        responses:
                            '2XX':
                                description: .wav with the pet's noise.
                                content:
                                    application/octet-stream:
                                        schema:
                                            type: string
                                            format: binary
                    put:
                        description: Change the pet's noise.
                        responses:
                            2XX:
                                description: Success
        "##;

        let LoadedYaml { paths, .. } = load_yaml(yaml).unwrap();

        println!("{paths:?}");

        assert_eq!(paths.len(), 1);
    }
}

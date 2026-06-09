/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use log::warn;
use std::collections::HashMap;

use crate::SUPPORTED_TYPES;
use crate::naming::pascalize;
use crate::openapi::schema::OaSchema;
use crate::oxidize::RustType;
use crate::oxidize::structs::{GraphStruct, StructKind};

use super::{
    SchemaContext, SchemaKind, map_openapi_schema_to_rust, named_schema_type, ref_simple_name,
};

/// Our representation of a Graph API property.
#[derive(Debug, Clone)]
pub struct Property {
    pub name: String,
    pub nullable: bool,
    pub is_collection: bool,
    pub rust_type: RustType,
    pub description: Option<String>,
    pub navigation_property: bool,

    /// Whether this property is an OpenAPI reference (not a Rust reference)
    pub is_ref: bool,
}

/// Result of extracting a schema into the data needed for code generation.
#[derive(Debug, Clone)]
pub struct SchemaObject {
    pub description: Option<String>,

    /// Supported properties in this schema.
    pub properties: Vec<Property>,

    // This is equivalent to whether the type represented has any navigation
    // properties, but has to be tracked independently from `properties`, since
    // there may be no supported properties, and the path generation code has no
    // way of knowing that.
    pub has_expansions: bool,
}

/// For the given schema object, extract its Graph API description and properties.
pub fn extract_from_schema(schema: &OaSchema, context: SchemaContext) -> SchemaObject {
    let mut out = Vec::new();
    let mut has_expansions = false;
    collect_schema_properties(schema, &context, &mut out, &mut has_expansions);
    SchemaObject {
        description: top_level_description(schema),
        properties: out,
        has_expansions,
    }
}

fn top_level_description(schema: &OaSchema) -> Option<String> {
    match schema {
        OaSchema::Obj {
            description: Some(description),
            ..
        } => Some(description.clone()),
        OaSchema::Obj {
            all_of: Some(all_of),
            ..
        } => {
            for element in all_of {
                if let OaSchema::Obj {
                    description: Some(description),
                    ..
                } = element
                {
                    return Some(description.clone());
                }
            }
            None
        }
        _ => None,
    }
}

fn collect_schema_properties(
    schema: &OaSchema,
    context: &SchemaContext,
    out: &mut Vec<Property>,
    has_navigation_properties: &mut bool,
) {
    match schema {
        OaSchema::Obj {
            navigation_property: true,
            ..
        } => {
            *has_navigation_properties = true;
        }
        OaSchema::Obj {
            all_of: Some(list),
            description,
            ..
        } => {
            for s in list {
                match s {
                    OaSchema::Ref { reference } => {
                        if let Some((name, ty)) = custom_from_ref(reference) {
                            out.push(Property {
                                name: name.to_string(),
                                nullable: false,
                                is_collection: false,
                                is_ref: true,
                                rust_type: ty,
                                description: description.clone(),
                                navigation_property: false,
                            });
                        }
                    }
                    OaSchema::Obj { .. } => {
                        collect_schema_properties(s, context, out, has_navigation_properties);
                    }
                }
            }
        }
        OaSchema::Obj {
            any_of: Some(list),
            description,
            ..
        } => {
            // Note: we don't currently support requests with more than one
            // possible body; if that happens then it will make
            // `ApiBody::from_openapi()` panic.
            for s in list {
                match s {
                    OaSchema::Ref { reference } => {
                        if let Some((name, ty)) = custom_from_ref(reference) {
                            out.push(Property {
                                name: name.to_string(),
                                nullable: false,
                                is_collection: false,
                                is_ref: true,
                                rust_type: ty,
                                description: description.clone(),
                                navigation_property: false,
                            });
                        }
                    }
                    _ => warn!("skipping unsupported type in anyOf: {s:?}"),
                }
            }
        }
        OaSchema::Obj {
            typ: Some(prop_type),
            properties: Some(props),
            description,
            ..
        } if prop_type == "object"
            // Delta requests are GETs without a body, and their response has
            // special deserialization logic that's handled elsewhere (see
            // ms_graph_tb's `DeltaResponse` and friends).
            && !context.is_delta
            // We currently only support generating the unnamed body type for a
            // request or response, so fall back to the generic case if we're
            // generating e.g. a property for a named type.
            && !matches!(&context.kind, SchemaKind::Other) =>
        {
            // The schema has a single property with the "object" type, so we
            // generate an unnamed object property, which we can use to generate
            // a type alongside the relevant request/path.
            let prop = unnamed_object_prop(props, description, context);
            out.push(prop);
        }
        OaSchema::Obj {
            properties: Some(props),
            ..
        } => {
            for (name, prop_schema) in props {
                if name.starts_with("@odata.") {
                    continue;
                }
                let navigation_property = matches!(
                    prop_schema,
                    OaSchema::Obj {
                        navigation_property: true,
                        ..
                    }
                );
                if navigation_property {
                    *has_navigation_properties = true;
                }
                if let Some((is_collection, description, rust_type)) =
                    map_openapi_schema_to_rust(prop_schema)
                {
                    let nullable = prop_schema.nullable().unwrap_or(false);
                    let is_ref = matches!(prop_schema, OaSchema::Ref { .. });
                    let prop = Property {
                        name: name.clone(),
                        nullable,
                        is_collection,
                        is_ref,
                        rust_type,
                        description,
                        navigation_property,
                    };
                    out.push(prop);
                } else {
                    warn!("skipping property with unsupported type: {name}");
                }
            }
        }
        OaSchema::Obj { typ: Some(s), .. } | OaSchema::Ref { reference: s } => {
            // a direct single property (typically from inline definitions in paths)
            if let Some((is_collection, description, rust_type)) =
                map_openapi_schema_to_rust(schema)
            {
                let nullable = schema.nullable().unwrap_or(false);
                let is_ref = matches!(schema, OaSchema::Ref { .. });
                let navigation_property = matches!(
                    schema,
                    OaSchema::Obj {
                        navigation_property: true,
                        ..
                    }
                );
                if navigation_property {
                    *has_navigation_properties = true;
                }
                out.push(Property {
                    name: ref_simple_name(s).to_string(),
                    nullable,
                    is_collection,
                    is_ref,
                    rust_type,
                    description,
                    navigation_property,
                });
            } else {
                warn!("skipping unsupported type: {s}");
            }
        }
        _ => panic!("unknown schema structure: {schema:?}"),
    }
}

/// Generates a [`Property`] for an unnamed OpenAPI object schema from the
/// OpenAPI spec, with the given properties and description.
///
/// # Limitations
///
/// This function currently only supports unnamed objects that do not contain
/// nested objects.
///
/// It also currently only supports unnamed schemas from HTTP requests and
/// responses (which is indicated by `context.kind`).
fn unnamed_object_prop(
    properties: &HashMap<String, OaSchema>,
    description: &Option<String>,
    context: &SchemaContext,
) -> Property {
    let mut obj_props = Vec::new();

    for (name, prop_schema) in properties {
        if let Some((is_collection, description, rust_type)) =
            map_openapi_schema_to_rust(prop_schema)
        {
            let nullable = prop_schema.nullable().unwrap_or(false);
            let is_ref = matches!(prop_schema, OaSchema::Ref { .. });
            let prop = Property {
                name: name.clone(),
                nullable,
                is_collection,
                is_ref,
                rust_type,
                description,
                navigation_property: false,
            };
            obj_props.push(prop);
        } else {
            warn!("Skipping property with unsupported type: {name}");
        }
    }

    let name = match &context.kind {
        SchemaKind::Request(method) => format!("{method}_request_body"),
        SchemaKind::SuccessResponse => String::from("response_body"),
        SchemaKind::Enum => {
            panic!("Attempted to generate a property from an enum")
        }
        _ => {
            panic!("Generating an unnamed object for SchemaKind::Other is not supported yet")
        }
    };

    let name = pascalize(name.as_str());
    let graph_struct = GraphStruct::new(
        &name,
        description.clone(),
        obj_props,
        StructKind::Unnamed,
        false,
    );

    Property {
        name,
        nullable: false,
        is_collection: false,
        rust_type: RustType::UnnamedObjectSchema(graph_struct),
        description: None,
        navigation_property: false,
        is_ref: false,
    }
}

fn custom_from_ref(reference: &str) -> Option<(&str, RustType)> {
    let simple = ref_simple_name(reference);
    if SUPPORTED_TYPES.contains(simple) {
        Some((simple, named_schema_type(simple)))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extract::path::Method;

    /// Generate an [`OaSchema`] to be used in tests targeting structs
    /// generated from unnamed OpenAPI object schemas. It corresponds to
    /// the following YAML schema:
    ///
    /// ```yaml
    /// type: object
    /// properties:
    ///     StringProp:
    ///         type: string
    ///     NumberProp:
    ///         type: number
    ///         format: int32
    /// ```
    fn get_test_unnamed_object() -> OaSchema {
        let string_prop = OaSchema::Obj {
            typ: Some("string".to_string()),
            format: None,
            nullable: None,
            properties: None,
            items: None,
            all_of: None,
            one_of: None,
            any_of: None,
            enum_variants: None,
            description: None,
            navigation_property: false,
        };

        let number_prop = OaSchema::Obj {
            typ: Some("number".to_string()),
            format: Some("int32".to_string()),
            nullable: None,
            properties: None,
            items: None,
            all_of: None,
            one_of: None,
            any_of: None,
            enum_variants: None,
            description: None,
            navigation_property: false,
        };

        OaSchema::Obj {
            typ: Some("object".to_string()),
            format: None,
            nullable: None,
            properties: Some(HashMap::from([
                ("StringProp".to_string(), string_prop),
                ("NumberProp".to_string(), number_prop),
            ])),
            items: None,
            all_of: None,
            one_of: None,
            any_of: None,
            enum_variants: None,
            description: None,
            navigation_property: false,
        }
    }

    /// Tests that an object coming from an unnamed OpenAPI schema is correctly
    /// identified and turned into a [`GraphStruct`].
    #[test]
    fn test_unnamed_object() {
        let schema = get_test_unnamed_object();

        let context = SchemaContext {
            kind: SchemaKind::Request(Method::Post),
            is_delta: false,
        };

        let mut props = Vec::new();
        let mut has_navigation_properties = false;
        collect_schema_properties(
            &schema,
            &context,
            &mut props,
            &mut has_navigation_properties,
        );

        assert_eq!(props.len(), 1, "we should only have one top-level property");
        assert!(!has_navigation_properties);

        let RustType::UnnamedObjectSchema(graph_struct) = &props[0].rust_type else {
            panic!(
                "expected top-level property to be `UnnamedObjectSchema`: {:?}",
                props[0]
            );
        };

        assert!(
            matches!(graph_struct.kind, StructKind::Unnamed),
            "the graph type should be tagged as coming from an unnamed schema"
        );
        assert_eq!(
            graph_struct.name(),
            "PostRequestBody",
            "the graph type should be named PostRequestBody"
        );
        assert_eq!(
            graph_struct.properties.len(),
            2,
            "the graph type should have two properties"
        );

        let Some(string_prop) = graph_struct
            .properties
            .iter()
            .find(|prop| prop.name == "StringProp")
        else {
            panic!("the graph type should have a property named StringProp");
        };

        assert!(
            matches!(string_prop.rust_type, RustType::String),
            "the type of the StringProp property should be a string"
        );

        let Some(number_prop) = graph_struct
            .properties
            .iter()
            .find(|prop| prop.name == "NumberProp")
        else {
            panic!("the graph type should have a property named NumberProp");
        };

        assert!(
            matches!(number_prop.rust_type, RustType::I32),
            "the type of the NumberProp property should be an i32 number"
        );
    }

    /// Tests that an unnamed OpenAPI schema isn't turned into a [`GraphStruct`]
    /// if its context involve a delta request/response.
    #[test]
    fn test_unnamed_object_delta() {
        let schema = get_test_unnamed_object();

        let context = SchemaContext {
            kind: SchemaKind::Request(Method::Post),
            is_delta: true,
        };

        let mut props = Vec::new();
        let mut has_navigation_properties = false;
        collect_schema_properties(
            &schema,
            &context,
            &mut props,
            &mut has_navigation_properties,
        );
        assert!(!has_navigation_properties);

        for prop in props {
            assert!(
                !matches!(prop.rust_type, RustType::UnnamedObjectSchema(_)),
                "top-level property should not be identified as an unnamed object: {prop:?}"
            )
        }
    }

    /// Tests that an OpenAPI schema isn't turned into a [`GraphStruct`] if it
    /// appears as a named schema that isn't specific to a request/response
    /// body.
    #[test]
    fn test_unnamed_object_other() {
        let schema = get_test_unnamed_object();

        let context = SchemaContext {
            kind: SchemaKind::Other,
            is_delta: false,
        };

        let mut props = Vec::new();
        let mut has_navigation_properties = false;
        collect_schema_properties(
            &schema,
            &context,
            &mut props,
            &mut has_navigation_properties,
        );
        assert!(!has_navigation_properties);

        for prop in props {
            assert!(
                !matches!(prop.rust_type, RustType::UnnamedObjectSchema(_)),
                "top-level property should not be identified as an unnamed object: {prop:?}"
            )
        }
    }
}

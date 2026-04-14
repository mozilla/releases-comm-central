/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use log::warn;
use std::collections::HashMap;

use crate::extract::path::Method;
use crate::naming::pascalize;
use crate::openapi::schema::OaSchema;
use crate::oxidize::types::{GraphType, TypeKind};
use crate::oxidize::{RustType, SchemaName};
use crate::{SUPPORTED_TYPES, simple_name};

/// The kind of schema that's currently being processed.
#[derive(Debug, Clone)]
pub enum SchemaKind {
    /// The schema is for the body of a request with the given method.
    Request(Method),

    /// The schema is for the body of a specific success (i.e. 2XX) response.
    SuccessResponse,

    /// The schema isn't directly correlated to a specific request/response
    /// (e.g. it's a named type in the OpenAPI spec).
    Other,
}

/// Context for a schema being processed.
#[derive(Debug, Clone)]
pub struct SchemaContext {
    /// The kind of schema (i.e. how it appears in the OpenAPI spec).
    pub kind: SchemaKind,

    /// Whether the schema is for a delta request.
    pub is_delta: bool,
}

/// Our representation of a Graph API property.
#[derive(Debug, Clone)]
pub struct Property {
    pub name: String,
    pub nullable: bool,
    pub is_collection: bool,
    pub rust_type: RustType,
    pub description: Option<String>,

    /// Whether this property is an OpenAPI reference (not a Rust reference)
    pub is_ref: bool,
}

/// For the given schema object, extract its Graph API description and properties.
pub fn extract_from_schema(
    schema: &OaSchema,
    context: SchemaContext,
) -> (Option<String>, Vec<Property>) {
    let mut out = Vec::new();
    collect_schema_properties(schema, &context, &mut out);
    (top_level_description(schema), out)
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

fn collect_schema_properties(schema: &OaSchema, context: &SchemaContext, out: &mut Vec<Property>) {
    match schema {
        OaSchema::Obj {
            navigation_property: true,
            ..
        } => {
            // navigation properties aren't real properties, they basically just inform about a subpath
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
                            });
                        }
                    }
                    OaSchema::Obj { .. } => {
                        collect_schema_properties(s, context, out);
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
                if let OaSchema::Obj {
                    navigation_property: true,
                    ..
                } = prop_schema
                {
                    continue;
                }
                if name.starts_with("@odata.") {
                    continue;
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
                out.push(Property {
                    name: ref_simple_name(s).to_string(),
                    nullable,
                    is_collection,
                    is_ref,
                    rust_type,
                    description,
                });
            } else {
                warn!("skipping unsupported type: {s}");
            }
        }
        _ => panic!("unknown schema structure: {schema:?}"),
    }
}

/// Generates a [`Property`] for an unnamed schema of type "object" from the
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
            };
            obj_props.push(prop);
        } else {
            warn!("Skipping property with unsupported type: {name}");
        }
    }

    let name = match &context.kind {
        SchemaKind::Request(method) => format!("{method}_request_body"),
        SchemaKind::SuccessResponse => String::from("response_body"),
        SchemaKind::Other => {
            panic!("Generating an unnamed object for SchemaKind::Other is not supported yet")
        }
    };

    let name = pascalize(name.as_str());
    let graph_type = GraphType::new(&name, description.clone(), obj_props, TypeKind::Unnamed);

    Property {
        name,
        nullable: false,
        is_collection: false,
        rust_type: RustType::UnnamedSchema(graph_type),
        description: None,
        is_ref: false,
    }
}

fn custom_from_ref(reference: &str) -> Option<(&str, RustType)> {
    let simple = ref_simple_name(reference);
    if SUPPORTED_TYPES.contains(simple) {
        Some((simple, RustType::NamedSchema(SchemaName::from(simple))))
    } else {
        None
    }
}

/// Given a reference in the shape `#/components/schemas/microsoft.graph.user`,
/// get the name of the type being referred to. Note that the middle part is not
/// always "schemas", e.g. `#/components/requestBodies/sendMailRequestBody`.
fn ref_simple_name(reference: &str) -> &str {
    let name = std::path::Path::new(reference)
        .file_name()
        .expect("invalid ref name")
        .to_str()
        .expect("expected valid UTF-8 ref name");
    simple_name(name)
}

fn map_openapi_schema_to_rust(schema: &OaSchema) -> Option<(bool, Option<String>, RustType)> {
    match schema {
        OaSchema::Ref { reference } => {
            let simple = ref_simple_name(reference);
            if SUPPORTED_TYPES.contains(simple) {
                Some((false, None, RustType::NamedSchema(SchemaName::from(simple))))
            } else {
                warn!("skipping unsupported schema: {simple}: {schema:?}");
                None
            }
        }
        OaSchema::Obj {
            typ,
            format,
            items,
            description,
            ..
        } => {
            let description = description.clone();
            if let Some(t) = typ.as_deref() {
                match t {
                    "array" => {
                        let item = items.as_deref()?;
                        if let OaSchema::Obj { typ: Some(s), .. } = item
                            && s == "array"
                        {
                            todo!("nested arrays: {schema:?}");
                        }
                        let (_, _, typ) = map_openapi_schema_to_rust(item)?;
                        Some((true, description, typ))
                    }
                    "string" => Some((
                        false,
                        description,
                        map_string_format_to_rust(format.as_deref()),
                    )),
                    "boolean" => Some((false, description, RustType::Bool)),
                    "integer" => Some((
                        false,
                        description,
                        map_integer_format_to_rust(format.as_deref()),
                    )),
                    "number" => Some((
                        false,
                        description,
                        map_number_format_to_rust(format.as_deref()),
                    )),
                    "object" => {
                        if let Some(simple) = match_supported_custom_from_schema(schema) {
                            Some((
                                false,
                                description,
                                RustType::NamedSchema(SchemaName::from(simple)),
                            ))
                        } else {
                            panic!("Unrecognized 'object' schema: {schema:?}");
                        }
                    }
                    _ => None,
                }
            } else {
                if let Some(simple) = match_supported_custom_from_schema(schema) {
                    return Some((
                        false,
                        description,
                        RustType::NamedSchema(SchemaName::from(simple)),
                    ));
                }
                None
            }
        }
    }
}

// Try to discover a supported custom type by scanning refs inside composition.
fn match_supported_custom_from_schema(schema: &OaSchema) -> Option<String> {
    match schema {
        OaSchema::Ref { reference } => custom_simple_from_ref(reference),
        OaSchema::Obj {
            all_of,
            one_of,
            any_of,
            ..
        } => {
            for items in [all_of, one_of, any_of].into_iter().flatten() {
                for s in items {
                    if let Some(found) = match_supported_custom_from_schema(s) {
                        return Some(found);
                    }
                }
            }
            None
        }
    }
}

fn custom_simple_from_ref(r#ref: &str) -> Option<String> {
    let simple = ref_simple_name(r#ref).to_string();
    if SUPPORTED_TYPES.contains(simple.as_str()) {
        Some(simple)
    } else {
        None
    }
}

fn map_string_format_to_rust(fmt: Option<&str>) -> RustType {
    match fmt {
        None => RustType::String,
        Some("byte") | Some("binary") => RustType::Bytes,
        Some(t) => {
            warn!("treating {t} as a string");
            RustType::String
        }
    }
}

fn map_integer_format_to_rust(fmt: Option<&str>) -> RustType {
    match fmt {
        Some("uint8") => RustType::U8,
        Some("int8") => RustType::I8,
        Some("int16") => RustType::I16,
        Some("int32") => RustType::I32,
        Some("int64") => RustType::I64,
        // Default to i32 if unspecified
        None => RustType::I32,
        Some(fmt) => panic!("Unknown number format: {fmt}"),
    }
}

fn map_number_format_to_rust(fmt: Option<&str>) -> RustType {
    match fmt {
        Some("uint8") => RustType::U8,
        Some("int8") => RustType::I8,
        Some("int16") => RustType::I16,
        Some("int32") => RustType::I32,
        Some("int64") => RustType::I64,
        Some("float") => RustType::F32,
        Some("double") => RustType::F64,
        Some("decimal") => RustType::F64, // technically lossy, but rarely used
        None => panic!("Number with unspecified format"),
        Some(fmt) => panic!("Unknown number format: {fmt}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Generate an [`OaSchema`] to be used in tests targetting objects
    /// represented by unnamed schemas in the OpenAPI spec. It corresponds to
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
            description: None,
            navigation_property: false,
        }
    }

    /// Tests that an object coming from an unnamed OpenAPI schema is correctly
    /// identified and turned into a [`GraphType`].
    #[test]
    fn test_unnamed_object() {
        let schema = get_test_unnamed_object();

        let context = SchemaContext {
            kind: SchemaKind::Request(Method::Post),
            is_delta: false,
        };

        let mut props = Vec::new();
        collect_schema_properties(&schema, &context, &mut props);

        assert_eq!(props.len(), 1, "we should only have one top-level property");

        let RustType::UnnamedSchema(graph_type) = &props[0].rust_type else {
            panic!(
                "expected top-level property to be `UnnamedSchema`: {:?}",
                props[0]
            );
        };

        assert!(
            matches!(graph_type.kind, TypeKind::Unnamed),
            "the graph type should be tagged as coming from an unnamed schema"
        );
        assert_eq!(
            graph_type.name(),
            "PostRequestBody",
            "the graph type should be named PostRequestBody"
        );
        assert_eq!(
            graph_type.properties.len(),
            2,
            "the graph type should have two properties"
        );

        let Some(string_prop) = graph_type
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

        let Some(number_prop) = graph_type
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

    /// Tests that an unnamed OpenAPI schema isn't turned into a [`GraphType`]
    /// if its context involve a delta request/response.
    #[test]
    fn test_unnamed_object_delta() {
        let schema = get_test_unnamed_object();

        let context = SchemaContext {
            kind: SchemaKind::Request(Method::Post),
            is_delta: true,
        };

        let mut props = Vec::new();
        collect_schema_properties(&schema, &context, &mut props);

        for prop in props {
            assert!(
                !matches!(prop.rust_type, RustType::UnnamedSchema(_)),
                "top-level property should not be identified as an unnamed object: {prop:?}"
            )
        }
    }

    /// Tests that an OpenAPI schema isn't turned into a [`GraphType`] if its
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
        collect_schema_properties(&schema, &context, &mut props);

        for prop in props {
            assert!(
                !matches!(prop.rust_type, RustType::UnnamedSchema(_)),
                "top-level property should not be identified as an unnamed object: {prop:?}"
            )
        }
    }
}

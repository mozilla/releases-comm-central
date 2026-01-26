/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::openapi::schema::OaSchema;
use crate::oxidize::{CustomRustType, RustType};
use crate::{simple_name, SUPPORTED_TYPES};

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
pub fn extract_from_schema(schema: &OaSchema) -> (Option<String>, Vec<Property>) {
    let mut out = Vec::new();
    collect_schema_properties(schema, &mut out);
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

fn collect_schema_properties(schema: &OaSchema, out: &mut Vec<Property>) {
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
                        collect_schema_properties(s, out);
                    }
                }
            }
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
                    out.push(Property {
                        name: name.clone(),
                        nullable,
                        is_collection,
                        is_ref,
                        rust_type,
                        description,
                    });
                } else {
                    println!("Skipping unsupported type: {name}");
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
                println!("Skipping unsupported type: {s}");
            }
        }
        _ => panic!("unknown schema structure: {schema:?}"),
    }
}

fn custom_from_ref(reference: &str) -> Option<(&str, RustType)> {
    let simple = ref_simple_name(reference);
    if SUPPORTED_TYPES.contains(&simple) {
        Some((simple, RustType::Custom(CustomRustType::from(simple))))
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
            if SUPPORTED_TYPES.contains(&simple) {
                Some((false, None, RustType::Custom(CustomRustType::from(simple))))
            } else {
                println!("skipping unsupported schema: {simple}: {schema:?}");
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
                        if let OaSchema::Obj { typ: Some(s), .. } = item {
                            if s == "array" {
                                todo!("nested arrays: {schema:?}");
                            }
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
                                RustType::Custom(CustomRustType::from(simple)),
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
                        RustType::Custom(CustomRustType::from(simple)),
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
    if SUPPORTED_TYPES.contains(&simple.as_str()) {
        Some(simple)
    } else {
        None
    }
}

fn map_string_format_to_rust(fmt: Option<&str>) -> RustType {
    match fmt {
        None => RustType::String,
        Some("byte") | Some("binary") => todo!("base64 decoding"),
        Some(t) => {
            println!("treating {t} as a string");
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

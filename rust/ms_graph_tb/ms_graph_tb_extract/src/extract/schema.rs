/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub mod enumeration;
pub mod object;

use log::warn;

use crate::extract::path::Method;
use crate::naming::simple_name;
use crate::openapi::schema::OaSchema;
use crate::oxidize::{RustType, SchemaName};
use crate::{SUPPORTED_ENUMS, SUPPORTED_OBJECTS, SUPPORTED_TYPES};

/// The kind of schema that's currently being processed.
#[derive(Debug, Clone)]
pub enum SchemaKind {
    /// The schema is unsupported, so its kind is irrelevant.
    Unsupported,

    /// The schema is an enumeration, not an object.
    Enum,

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

pub enum ExtractedSchema {
    Object(object::SchemaObject),
    Enum(enumeration::SchemaEnum),
}

pub fn extract_from_schema(schema: &OaSchema, context: SchemaContext) -> ExtractedSchema {
    match context.kind {
        SchemaKind::Enum => ExtractedSchema::Enum(enumeration::extract_from_schema(schema)),
        _ => ExtractedSchema::Object(object::extract_from_schema(schema, context)),
    }
}

/// Given a reference in the shape `#/components/schemas/microsoft.graph.user`,
/// get the name of the type being referred to. Note that the middle part is not
/// always "schemas", e.g. `#/components/requestBodies/sendMailRequestBody`.
pub(super) fn ref_simple_name(reference: &str) -> &str {
    let name = std::path::Path::new(reference)
        .file_name()
        .expect("invalid ref name")
        .to_str()
        .expect("expected valid UTF-8 ref name");
    simple_name(name)
}

fn named_schema_type(simple: &str) -> RustType {
    supported_named_schema_type(simple)
        .unwrap_or_else(|| panic!("Unsupported named schema: {simple}"))
}

pub(super) fn supported_named_schema_type(simple: &str) -> Option<RustType> {
    if SUPPORTED_OBJECTS.contains(simple) {
        Some(RustType::NamedObjectSchema(SchemaName::from(simple)))
    } else if SUPPORTED_ENUMS.contains(simple) {
        Some(RustType::NamedEnumSchema(SchemaName::from(simple)))
    } else {
        None
    }
}

fn map_openapi_schema_to_rust(schema: &OaSchema) -> Option<(bool, Option<String>, RustType)> {
    match schema {
        OaSchema::Ref { reference } => {
            let simple = ref_simple_name(reference);
            if SUPPORTED_TYPES.contains(simple) {
                Some((false, None, named_schema_type(simple)))
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
                            Some((false, description, named_schema_type(&simple)))
                        } else {
                            panic!("Unrecognized 'object' schema: {schema:?}");
                        }
                    }
                    _ => None,
                }
            } else {
                if let Some(simple) = match_supported_custom_from_schema(schema) {
                    return Some((false, description, named_schema_type(&simple)));
                }
                None
            }
        }
    }
}

/// Try to discover a supported custom type by scanning refs inside composition.
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

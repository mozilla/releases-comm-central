/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::openapi::schema::OaSchema;

pub struct SchemaEnum {
    pub variants: Vec<String>,
}

pub fn extract_from_schema(schema: &OaSchema) -> SchemaEnum {
    let OaSchema::Obj {
        enum_variants: Some(variants),
        ..
    } = schema
    else {
        panic!("Attempted to extract an enum from a non-enum schema: {schema:?}");
    };

    SchemaEnum {
        variants: variants.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_enum() {
        let schema = OaSchema::Obj {
            typ: Some("string".to_string()),
            format: None,
            nullable: None,
            properties: None,
            items: None,
            all_of: None,
            one_of: None,
            any_of: None,
            enum_variants: Some(vec![
                "delivering".to_string(),
                "partiallyDelivered".to_string(),
                "unknownFutureValue".to_string(),
            ]),
            description: None,
            navigation_property: false,
        };

        let extracted = extract_from_schema(&schema);

        assert_eq!(
            extracted.variants,
            vec![
                "delivering".to_string(),
                "partiallyDelivered".to_string(),
                "unknownFutureValue".to_string(),
            ]
        );
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#![cfg(test)]

use quick_xml::events::{attributes::Attribute, BytesStart};
use xml_struct_tests::{serialize_value_as_element, serialize_value_children};

use crate::XmlSerializeAttr;

#[test]
fn string_as_content_node() {
    let content = String::from("some arbitrary content");
    let expected = content.clone();

    let actual =
        serialize_value_children(content).expect("Failed to serialize string as text content");
    assert_eq!(
        actual, expected,
        "Serializing `String` should result in bare text content"
    );
}

#[test]
fn string_as_element() {
    let name = "SomeTag";

    let content = String::from("some arbitrary content");
    let expected = format!("<{name}>{content}</{name}>");

    let actual = serialize_value_as_element(content.clone(), name)
        .expect("Failed to serialize string as text content");
    assert_eq!(
        actual, expected,
        "Serializing `String` should result in element with text content"
    );

    let actual = serialize_value_as_element(&content, name)
        .expect("Failed to serialize string as text content");
    assert_eq!(
        actual, expected,
        "Serializing `&String` should result in element with text content"
    );

    let actual = serialize_value_as_element(content.as_str(), name)
        .expect("Failed to serialize string as text content");
    assert_eq!(
        actual, expected,
        "Serializing `&str` should result in element with text content"
    );
}

#[test]
fn int_as_content_node() {
    let content: i8 = 17;
    let expected = format!("{content}");

    let actual =
        serialize_value_children(content).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i8` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as u8).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u8` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as i16).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i16` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as u16).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u16` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as i32).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i32` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as u32).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u32` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as i64).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i64` should result in bare text content"
    );

    let actual =
        serialize_value_children(content as u64).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u64` should result in bare text content"
    );

    let actual = serialize_value_children(content as usize)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `usize` should result in bare text content"
    );
}

#[test]
fn int_as_element() {
    let name = "last_march_of_the_ints";

    let content: i8 = 17;
    let expected = format!("<{name}>{content}</{name}>");

    let actual =
        serialize_value_as_element(content, name).expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i8` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as u8, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u8` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as i16, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i16` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as u16, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u16` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as i32, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i32` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as u32, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u32` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as i64, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `i64` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as u64, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `u64` should result in bare text content"
    );

    let actual = serialize_value_as_element(content as usize, name)
        .expect("Failed to serialize int as text content");
    assert_eq!(
        actual, expected,
        "Serializing `usize` should result in bare text content"
    );
}

#[test]
fn bool_as_content_node() {
    let content = true;
    let expected = "true";

    let actual = serialize_value_children(content).expect("Failed to serialize value");

    assert_eq!(
        actual, expected,
        "`true` should be serialized as string value 'true'"
    );

    let content = false;
    let expected = "false";

    let actual = serialize_value_children(content).expect("Failed to serialize value");

    assert_eq!(
        actual, expected,
        "`false` should be serialized as string value 'false'"
    );
}

#[test]
fn bool_as_attribute_value() {
    let element_name = "foo";
    let attr_name = "bar";

    let content = true;
    let expected = vec![Attribute::from((attr_name, "true"))];

    let mut start = BytesStart::new(element_name);
    content.serialize_as_attribute(&mut start, &attr_name);

    let actual: Vec<_> = start
        .attributes()
        .map(|result| result.expect("Failed to get attribute value"))
        .collect();

    assert_eq!(
        actual, expected,
        "`true` should be serialized as string value 'true'"
    );

    let content = false;
    let expected = vec![Attribute::from((attr_name, "false"))];

    let mut start = BytesStart::new(element_name);
    content.serialize_as_attribute(&mut start, &attr_name);

    let actual: Vec<_> = start
        .attributes()
        .map(|result| result.expect("Failed to get attribute value"))
        .collect();

    assert_eq!(
        actual, expected,
        "`false` should be serialized as string value 'false'"
    );
}

#[test]
fn bool_as_element() {
    let name = "george";

    let content = true;
    let expected = format!("<{name}>true</{name}>");

    let actual = serialize_value_as_element(content, name).expect("Failed to serialize value");

    assert_eq!(
        actual, expected,
        "Serializing `bool` should result in bare text content"
    );

    let content = false;
    let expected = format!("<{name}>false</{name}>");

    let actual = serialize_value_as_element(content, name).expect("Failed to serialize value");

    assert_eq!(
        actual, expected,
        "Serializing `bool` should result in bare text content"
    );
}

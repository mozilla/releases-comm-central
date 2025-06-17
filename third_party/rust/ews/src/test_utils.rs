/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use quick_xml::{de::Deserializer, Writer};
use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::Error;

/// Assert the expected result of XML serialization.
pub fn assert_serialized_content<T: XmlSerialize>(
    data: &T,
    root_tag_name: &str,
    expected_xml_content: &str,
) {
    // Serialize into XML.
    let mut writer = {
        let inner: Vec<u8> = Default::default();
        Writer::new(inner)
    };
    data.serialize_as_element(&mut writer, root_tag_name)
        .unwrap();

    // Read the contents of the `Writer`'s buffer.
    let buf = writer.into_inner();
    let actual_xml_content = std::str::from_utf8(buf.as_slice())
        .map_err(|e| Error::UnexpectedResponse(e.to_string().into_bytes()))
        .unwrap();

    assert_eq!(actual_xml_content, expected_xml_content);
}

/// Assert the expected result of XML deserialization.
pub fn assert_deserialized_content<T>(content: &str, expected: T)
where
    T: for<'a> Deserialize<'a> + Eq + std::fmt::Debug,
{
    let mut deserializer = Deserializer::from_reader(content.as_bytes());
    let deserialized_data: T = serde_path_to_error::deserialize(&mut deserializer).unwrap();
    assert_eq!(deserialized_data, expected);
}

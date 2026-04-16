# `xml_struct`

The `xml_struct` crate is intended to provide simple and low-boilerplate
serialization of Rust data structures to XML.

## Limitations

This crate was specifically designed to support the
[`ews`](https://crates.io/crates/ews) crate. Because of this, it makes several
behavioral assumptions which make it unsuitable for general use. Primary among
these are that transformation of field/structure names to XML tag names is not
configurable (all names are transformed to PascalCase) and whether fields are
serialized as XML elements or attributes by default is not configurable.

Deserialization is likewise not supported at this time.

For general-purpose XML serialization or deserialization, one of these crates
may better suit your needs at this time:

- [`xmlserde`](https://github.com/imjeremyhe/xmlserde)
- [`yaserde`](https://github.com/media-io/yaserde)

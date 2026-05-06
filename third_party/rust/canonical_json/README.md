# Canonical JSON library

Canonical JSON is a variant of JSON in which each value has a single,
unambiguous serialized form. This provides meaningful and repeatable hashes
of encoded data.

Canonical JSON can be parsed by regular JSON parsers. The most notable differences compared to usual JSON format ([RFC 7159](https://tools.ietf.org/html/rfc7159) or ``serde_json::to_string()``) are:

- Object keys must appear in lexiographical order and must not be repeated
- No inter-token whitespace
- Unicode characters and escaped characters are escaped

This library follows [gibson's Canonical JSON spec](https://github.com/gibson042/canonicaljson-spec).

## Usage

Add this to your ``Cargo.toml``:

```toml
[dependencies]
canonical_json = "0.5.0"
```

## Examples

```rust,no_run
   use serde_json::json;
   use canonical_json::ser::to_string;

   fn main() {
     to_string(&json!(null)); // returns "null"

     to_string(&json!("we ❤ Rust")); // returns "we \u2764 Rust""

     to_string(&json!(10.0_f64.powf(21.0))); // returns "1e+21"

     to_string(&json!({
         "a": "a",
         "id": "1",
         "b": "b"
     })); // returns "{"a":"a","b":"b","id":"1"}"; (orders object keys)

     to_string(&json!(vec!["one", "two", "three"])); // returns "["one","two","three"]"
   }
```

## Test suite

Run the projet test suite:

```
$ cargo test
```

Run @gibson042's Canonical JSON test suite:

```
$ git clone git@github.com:gibson042/canonicaljson-spec.git
$ cd canonicaljson-spec/
$ ./test.sh ../canonicaljson-rs/demo/target/debug/demo
```

Some known errors:

- `lone leading surrogate in hex escape`
- `number out of range`
- `Non-token input after 896 characters: "\u6} surrogate pair\u2014U+1D306`


## See also

* [python-canonicaljson-rs](https://github.com/mozilla-services/python-canonicaljson-rs/): Python bindings for this crate
* [CanonicalJSON.jsm](https://searchfox.org/mozilla-central/rev/358cef5d1a87172f23b15e1a705d6f278db4cdad/toolkit/modules/CanonicalJSON.jsm) in Gecko
* [Original python implementation](https://github.com/Kinto/kinto-signer/blob/6.1.0/kinto_signer/canonicaljson.py) in Remote Settings
* https://github.com/matrix-org/python-canonicaljson/  (encodes unicode with ``\xDD`` instead of ``\uDDDD``)

## License

Licensed under MIT

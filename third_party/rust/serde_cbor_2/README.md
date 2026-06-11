# Serde CBOR

[![CI](https://github.com/kanidm/cbor/actions/workflows/ci.yml/badge.svg)](https://github.com/kanidm/cbor/actions/workflows/ci.yml)
[![crates.io](https://img.shields.io/crates/v/serde_cbor_2.svg?label=latest)](https://crates.io/crates/serde_cbor_2)
[![Documentation](https://docs.rs/serde_cbor_2/badge.svg)](https://docs.rs/serde_cbor_2)

This crate implements the Concise Binary Object Representation from [RFC 7049][rfc7049].
It builds on [Serde][serde], the generic serialization framework for Rust.
CBOR provides a binary encoding for a superset of the JSON data model that is small and very fast to parse.

## Usage

Serde CBOR supports Rust 1.81 and up. Add this to your `Cargo.toml`:

```toml
[dependencies]
serde_cbor_2 = "0.11.2"
```

Storing and loading Rust types is easy and requires only minimal modifications to the program code.

```rust
use std::{error::Error, fs::File};
use serde::{Deserialize, Serialize};

// Types annotated with `Serialize` can be stored as CBOR.
// To be able to load them again add `Deserialize`.
#[derive(Debug, Serialize, Deserialize)]
struct Mascot {
    name: String,
    species: String,
    year_of_birth: u32,
}

fn main() -> Result<(), Box<dyn Error>> {
    let ferris = Mascot {
        name: "Ferris".to_owned(),
        species: "crab".to_owned(),
        year_of_birth: 2015,
    };

    let ferris_file = File::create("examples/ferris.cbor")?;
    // Write Ferris to the given file.
    // Instead of a file you can use any type that implements `io::Write`
    // like a HTTP body, database connection etc.
    serde_cbor_2::to_writer(ferris_file, &ferris)?;

    let tux_file = File::open("examples/tux.cbor")?;
    // Load Tux from a file.
    // Serde CBOR performs roundtrip serialization meaning that
    // the data will not change in any way.
    let tux: Mascot = serde_cbor_2::from_reader(tux_file)?;

    println!("{tux:?}");
    // prints: Mascot { name: "Tux", species: "penguin", year_of_birth: 1996 }

    Ok(())
}
```

There are a lot of options available to customize the format.
To operate on untyped CBOR values have a look at the `Value` type.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <http://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any
additional terms or conditions.

[rfc7049]: https://tools.ietf.org/html/rfc7049
[serde]: https://github.com/serde-rs/serde

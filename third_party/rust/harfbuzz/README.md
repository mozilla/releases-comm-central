<div align="center">

# harfbuzz

[![Build Status](https://github.com/servo/rust-harfbuzz/actions/workflows/main.yml/badge.svg)](https://github.com/servo/rust-harfbuzz/actions)
[![crates.io](https://img.shields.io/crates/v/harfbuzz.svg)](https://crates.io/crates/harfbuzz)
[![Docs](https://docs.rs/harfbuzz/badge.svg)](https://docs.rs/harfbuzz)

</div>

[HarfBuzz](https://harfbuzz.github.io/) is a text shaping engine. It solves the
problem of selecting and positioning glyphs from a font given a Unicode string.

This crate provides a higher level API (than the
[raw C bindings](https://crates.io/crates/harfbuzz-sys)).

## Features

- `freetype` - Enables bindings to the FreeType font engine. (Enabled by
  default.)
- `coretext` - Enables bindings to the Core Text font engine (Apple platforms
  only). (Enabled by default.)
- `directwrite` - Enables bindings to the DirectWrite font engine (Windows
  only). (Enabled by default.)
- `bundled` - Use the bundled copy of the HarfBuzz library rather than one
  installed on the system.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or
  <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or
  <https://opensource.org/license/mit>)

at your option.

## Contribution

Contributions are welcome by pull request.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
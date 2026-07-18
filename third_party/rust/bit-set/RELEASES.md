Version 0.12.0 (TO BE RELEASED)
========================================================

<a id="v0.12.0"></a>

Version 0.11.1
========================================================

<a id="v0.11.1"></a>

- fixed repo links in Cargo.toml
- methods such as `fn contains` may have better codegen (https://github.com/contain-rs/bit-vec/pull/153)

Version 0.11.0 (VULNERABILITY FIX)
========================================================

<a id="v0.11.0"></a>

- removed nanoserde support
- moved the crate into a workspace
- fixed an unsoundness with deserialize (see `bit-vec` v0.10.0)

Version 0.10.1 (YANKED)
========================================================

<a id="v0.10.1"></a>

Version 0.10.0
========================================================

<a id="v0.10.0"></a>

- exposed `BitBlock`

Version 0.9.0
========================================================

<a id="v0.9.0"></a>

- Minimal Supported Rust Version is 1.82
- Rust edition 2021 is used
- implemented `fn make_empty`
- implemented `fn reset`
- added general initialization functions: `fn new_general`, `fn from_bit_vec_general`, `fn with_capacity_general`, `fn from_bytes_general`

Version 0.8.0
========================================================

<a id="v0.8.0"></a>

Version 0.7.0 (ZERO BREAKING CHANGES)
========================================================

<a id="v0.7.0"></a>

- `serde::Serialize`, `Deserialize` is derived under the `serde` optional feature
- `impl Display` is implemented
- `impl Debug` has different output (we do not promise stable `Debug` output)
- `fn truncate` is implemented
- `fn get_mut` is implemented

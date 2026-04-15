[![Rust CI](https://github.com/mozilla/thin-vec/actions/workflows/rust.yml/badge.svg)](https://github.com/mozilla/thin-vec/actions) [![crates.io](https://img.shields.io/crates/v/thin-vec.svg)](https://crates.io/crates/thin-vec) [![Docs](https://docs.rs/thin-vec/badge.svg)](https://docs.rs/thin-vec)

# thin-vec

ThinVec is a Vec that stores its length and capacity inline, making it take up
less space.

Currently this crate mostly exists to facilitate Gecko (Firefox) FFI, but it
works perfectly fine as a native Rust library as well.

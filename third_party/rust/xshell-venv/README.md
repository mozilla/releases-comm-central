# `xshell-venv`

[![crates.io](https://img.shields.io/crates/v/xshell-venv.svg?style=flat-square)](https://crates.io/crates/xshell-venv)
[![docs.rs docs](https://img.shields.io/badge/docs-latest-blue.svg?style=flat-square)](https://docs.rs/xshell-venv)
[![License: MIT](https://img.shields.io/github/license/badboy/xshell-venv?style=flat-square)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/badboy/xshell-venv/test.yml?style=flat-square)](https://github.com/badboy/xshell-venv/actions/workflows/test.yml)

`xshell-venv` manages your Python virtual environments in code.

`xshell-venv` is an extension to [xshell], the swiss-army knife for writing cross-platform “bash” scripts in Rust.

[xshell]: https://docs.rs/xshell/

## Example

```rust
use xshell_venv::{Shell, VirtualEnv};

let sh = Shell::new()?;
let venv = VirtualEnv::new(&sh, "py3")?;

venv.run("print('Hello World!')")?; // "Hello World!"
```

## Requirements

* Python 3
  * On Windows we look for `python3.exe` or `python.exe`
  * Otherwise we look for `python3` or `python`
* The `venv` package
  * This might be available as `python3-venv` or under a similar name.
    Double check your packages. E.g. on Ubuntu Python 3.8 is available as `python3.8`
    and the corresponding `venv` package is named `python3.8-venv`.

## License

[MIT](LICENSE).

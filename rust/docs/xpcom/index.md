# Using XPCOM within a Rust component

XPCOM (Cross-Platform Component Object Model) is Mozilla's compatibility module
to allow for cross-platform code across all the different programming languages
used in the Firefox and Thunderbird code bases. If you aren't already familiar
with it, the [XPCOM
documentation](https://firefox-source-docs.mozilla.org/xpcom/) on the Firefox
source docs website is a good starting point.

XPCOM can be used in Rust via the `xpcom` crate which can be accessed from the
default Cargo workspace within Thunderbird. If you haven't already done so, make
sure to familiarize yourself with including new Rust code in the workspace and
getting Thunderbird to build it by following [](../new_component.md).

A few internal crates are provided to ease writing and using XPCOM-based
objects:

* `xpcom` (`xpcom/rust/xpcom`) generates Rust types for all interfaces available
  through XPCOM, provides a decorator to associate a Rust `struct` with an XPCOM
  interface, and provides helper functions, macros, traits and structs for
  handling XPCOM objects.
* `nserror` (`xpcom/rust/nserror`) provides the `nsresult` enum used by XPCOM
  objects' methods.
* `nsstring` (`xpcom/rust/nsstring`) provides the string types (`nsACString`,
  `nsCString`, etc.) which map with the corresponding types in XPCOM interface
  definitions.
* `moz_task` (`xpcom/rust/moz_task`) provides traits and utility functions to
  execute asynchronous Rust code on Firefox/Thunderbird's thread pools.

```{toctree}
implement_an_interface
use_xpcom_objects
```

(build_cargo_doc)=
## Build the Cargo documentation for internal crates

The documentation for most internal crates is only available as in-code
documentation (from which HTML documentation can usually be generated through
`cargo doc`).

In order to generate documentation for a crate depending on internal code,
`cargo doc` needs to run with a special `BUILDCONFIG_RS` environment variable
set. The value for this environment variable is the path to the `buildconfig.rs`
file within the build directory (`obj-*`). In most cases, this file will be
located at `obj-[...]/build/rust/mozbuild/buildconfig.rs`.

<div class="note"><div class="admonition-title">Note</div>

`cargo doc` will generate HTML documentation in `comm/rust/target/doc`.

</div>

Internal crates will only be included in the generated documentation if `cargo
doc` is ran from within a crate listing them as its dependencies.

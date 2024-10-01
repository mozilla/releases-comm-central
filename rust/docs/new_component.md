# Adding a Rust crate to Thunderbird

To add new Rust code to Thunderbird, first create a new lib crate under
`comm/rust`, and add the Rust code there.

In this example, we'll call the crate `example_crate`, meaning it will live at
`comm/rust/example_crate`.

Next, modify `comm/rust/Cargo.toml` to add the crate to the members of the Cargo
workspace:

```toml
...

[workspace]
members = [ ..., 'example_crate', ...]

...
```


## Building the crate

If the crate needs to expose symbols, either via FFI or XPCOM, it must be
exposed by the `gkrust` crate. `gkrust` is the crate which is hooked into
Thunderbird's build system, and can expose other crates to be built and linked
alongside it.

<div class="note"><div class="admonition-title">Note</div>

Not every crate requires this. For example, if a crate only exists only to be a
dependency for other Rust crates (and neither C++ nor JavaScript code will
directly interact with it), it can skip this step.

</div>

To get `example_crate` included, let's add it as a path dependency:

```shell
cd comm/rust/gkrust
cargo add example_crate --path ../example_crate
```

Now let's expose the crate to the build system. We do this by exposing it as an
`extern crate` from `gkrust` in `comm/rust/gkrust/src/lib.rs`:

```rust
...

extern crate example_crate;

...
```

Now `./mach build` should build `example_crate`. To learn about how to use XPCOM
in your Rust code to interact with the rest of Thunderbird, head over to
[](xpcom/index).


## Managing a crate's dependencies

### Adding dependencies on internal crates

Dependencies on crates which are internal to Thunderbird (and by extension
Firefox) should be specified as path dependencies. For example, if
`example_crate` were to depend on the `xpcom` crate, which lives in
`xpcom/rust/xpcom`, it would be added with:

```shell
cd comm/rust/example_crate
cargo add xpcom --path ../../../xpcom/rust/xpcom
```


### Synchronizing dependencies

Manually changing the dependencies of a crate in `comm/rust` (by e.g. manually
editing its `Cargo.toml` file) means `comm/rust/Cargo.lock` becomes out of date,
which gets in the way of building. To fix this, run:

```shell
./mach tb-rust sync
```

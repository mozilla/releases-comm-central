# Managing Thunderbird's Cargo workspace

Thunderbird now builds `gkrust` as its own library, using `gkrust-shared` from
mozilla-central to allow us to add our own Rust crates and components.

Note, however, this is a slightly odd arrangement as Cargo doesn't support using
workspaces within the parent directory. As a result, we must keep track of the
first-level dependencies of our crates (i.e. shallow transitive).


## Updating dependencies

To update the version of all dependencies in the workspace, run:

```shell
./mach tb-rust sync
```

This command reads the dependencies from the Cargo workspace in mozilla-central,
adds any dependencies specific to Thunderbird, and regenerates
`comm/rust/Cargo.toml` and `comm/rust/Cargo.lock` accordingly.


## Sync the vendored dependencies

When crate dependencies change, we need to synchronize the dependencies. This is
done to support use from the root of mozilla-central and account for *all* crate
dependencies.

```shell
./mach tb-rust vendor
```

<div class="note"><div class="admonition-title">Note</div>

Under the hood, this command runs `./mach tb-rust sync` to ensure the
workspace's dependencies are up to date, then completely recreates
`comm/rust/.cargo/config.toml.in` and `comm/third_party/rust/`.

</div>

Do **not** directly modify `comm/rust/.cargo/*`!

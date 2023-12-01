# Rust in Thunderbird

Thunderbird now builds `gkrust` as its own library, using `gkrust-shared`
from upstream (Gecko) allowing for Thunderbird-only Rust crates and components.

Note, however, this is a slightly odd arrangement as Cargo doesn't support using
workspaces within the parent directory. As a result, we must keep track of the
first-level dependencies of our crates (ie shallow transitive).

## Updating dependencies

    ./mach tb-rust sync

## Sync the vendored dependencies

When crate dependencies change, we need to synchronise the dependencies. This is done
to support use from the root of mozilla-central and account for *all* crate dependencies.

    ./mach tb-rust vendor

Do **not** directly modify `comm/rust/.cargo/*` !

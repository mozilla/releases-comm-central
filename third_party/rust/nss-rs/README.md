# (UNSTABLE) Gecko API for NSS

nss-rs is intended to provide a safe and idiomatic Rust interface to NSS.  It is based on code from neqo-crypto, but has been factored out of mozilla-central so that it can be used in standalone applications and libraries such as authenticator-rs. That said, it is *primarily* for use in Gecko, and will not be extended to support arbitrary use cases.

This is work in progress and major changes are expected. API stability is NOT a goal, nor is compatibility with any particular Rust version. This crate exists to serve the needs of the limited set of crates that depend on it.

## Building

NSS is located with `pkg-config` by default. If that fails, NSS and NSPR are cloned from `hg.mozilla.org` into `OUT_DIR` and built from source. Set `NSS_DIR` to an absolute path to an NSS checkout to use that instead, and `NSS_PREBUILT` to a value other than `0` if that checkout is already built.

When cross-compiling, `pkg-config` is only consulted if `PKG_CONFIG_ALLOW_CROSS` is set to a value other than `0`, or if `PKG_CONFIG` or `PKG_CONFIG_SYSROOT_DIR` (optionally target-suffixed) is set. Otherwise NSS is built from source.

## GitHub Actions

### `install-nss` — Install NSS for downstream consumers

For projects that depend on this crate, installs the NSS release it requires.

```yaml
- uses: mozilla/nss-rs/install-nss@<ref>
  with:
    working-directory: . # optional; where your Cargo.toml/Cargo.lock live
    target: "" # optional; target for cross-compilation
    token: ${{ secrets.GITHUB_TOKEN }} # optional; avoids rate limits
```

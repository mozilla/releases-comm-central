# (UNSTABLE) Gecko API for NSS

nss-rs is intended to provide a safe and idiomatic Rust interface to NSS.  It is based on code from neqo-crypto, but has been factored out of mozilla-central so that it can be used in standalone applications and libraries such as authenticator-rs. That said, it is *primarily* for use in Gecko, and will not be extended to support arbitrary use cases.

This is work in progress and major changes are expected. API stability is NOT a goal, nor is compatibility with any particular Rust version. This crate exists to serve the needs of the limited set of crates that depend on it.


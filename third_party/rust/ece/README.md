# rust-ece &emsp; [![Build Status]][circleci] [![Latest Version]][crates.io]

[Build Status]: https://circleci.com/gh/mozilla/rust-ece.svg?style=svg
[circleci]: https://circleci.com/gh/mozilla/rust-ece
[Latest Version]: https://img.shields.io/crates/v/ece.svg
[crates.io]: https://crates.io/crates/ece

*This crate has not been security reviewed yet, use at your own risk
([tracking issue](https://github.com/mozilla/rust-ece/issues/18))*.

The [ece](https://crates.io/crates/ece) crate is a Rust implementation of Message Encryption for Web Push
([RFC8291](https://tools.ietf.org/html/rfc8291)) and the HTTP Encrypted Content-Encoding scheme
([RFC8188](https://tools.ietf.org/html/rfc8188)) on which it is based.

It provides low-level cryptographic "plumbing" and is destined to be used by higher-level Web Push libraries, both on
the server and the client side. It is a port of the [ecec](https://github.com/web-push-libs/ecec) C library.

[Full Documentation](https://docs.rs/ece/)

## Implemented schemes

This crate implements both the published Web Push Encryption scheme, and a legacy scheme from earlier drafts
that is still widely used in the wild:

* `aes128gcm`: the scheme described in [RFC8291](https://tools.ietf.org/html/rfc8291) and
  [RFC8188](https://tools.ietf.org/html/rfc8188)
* `aesgcm`: the draft scheme described in
  [draft-ietf-webpush-encryption-04](https://tools.ietf.org/html/draft-ietf-webpush-encryption-04) and
  [draft-ietf-httpbis-encryption-encoding-03](https://tools.ietf.org/html/draft-ietf-httpbis-encryption-encoding-03_)

It does not support, and we have no plans to ever support, the obsolete `aesgcm128` scheme
from [earlier drafts](https://tools.ietf.org/html/draft-thomson-http-encryption-02).

## Usage

To receive messages via WebPush, the receiver must generate an EC keypair and a symmetric authentication secret,
then distribute the public key and authentication secret to the sender:

```rust
let (keypair, auth_secret) = ece::generate_keypair_and_auth_secret()?;
let pubkey = keypair.pub_as_raw();
// Base64-encode the `pubkey` and `auth_secret` bytes and distribute them to the sender.
```

The sender can encrypt a Web Push message to the receiver's public key:

```rust
let ciphertext = ece::encrypt(&pubkey, &auth_secret, b"payload")?;
```

And the receiver can decrypt it using their private key:

```rust
let plaintext = ece::decrypt(&keypair, &auth_secret, &ciphertext)?;
```

That's pretty much all there is to it! It's up to the higher-level library to manage distributing the encrypted payload,
typically by arranging for it to be included in a HTTP response with `Content-Encoding: aes128gcm` header.

### Legacy `aesgcm` encryption

The legacy `aesgcm` scheme is more complicated, because it communicates some encryption parameters in HTTP header fields
rather than as part of the encrypted payload.  When used for encryption, the sender must deal with `Encryption` and
`Crypto-Key` headers in addition to the ciphertext:

```rust
let encrypted_block = ece::legacy::encrypt_aesgcm(pubkey, auth_secret, b"payload")?;
for (header, &value) in encrypted_block.headers().iter() {
  // Set header to corresponding value
}
// Send encrypted_block.body() as the body
```

When receiving an `aesgcm` message, the receiver needs to parse encryption parameters from the `Encryption`
and `Crypto-Key` fields:

```rust
// Parse `rs`, `salt` and `dh` from the `Encryption` and `Crypto-Key` headers.
// You'll need to consult the spec for how to do this; we might add some helpers one day.
let encrypted_block = ece::AesGcmEncryptedBlock::new(dh, rs, salt, ciphertext);
let plaintext = ece::legacy::decrypt_aesgcm(keypair, auth_secret, encrypted_block)?;
```

### Unimplemented Features

* We do not implement streaming encryption or decryption, although the ECE scheme is designed to permit it.
* We only support encrypting or decrypting across multiple records for `aes128gcm`; messages using the
  legacy `aesgcm` scheme must fit in a single record.
* We do not support customizing the record size parameter during encryption, but do check it during decryption.
  * The default record size is 4096 bytes.
* We do not support customizing the number of padding bytes added during encryption.
  * We currently select the padding length at random for each encryption, but this is an implementation detail and
    should not be relied on.

These restrictions might be lifted in future, if it turns out that we need them.

## Cryptographic backends

This crate is designed to use pluggable backend implementations of low-level crypto primitives. different crypto
backends. At the moment only [openssl](https://github.com/sfackler/rust-openssl) is supported.

## Release process

We use [`cargo-release`](https://crates.io/crates/cargo-release) to manage releases. To cut a new release,
make sure you have it installed and then:

1. Start a new branch for the release:
     * `git checkout -b release-vX.Y.Z`
     * `git push -u origin release-vX.Y.Z`
2. Run `cargo release --dry-run -vv [major|minor|patch]` and check that the things
   it's proposing to do seem sensible.
3. Run `cargo release [major|minor|patch]` to prepare, commit, tag and publish the release.
4. Make a PR from your `release-vX.Y.Z` branch to request it be merged to the main branch.

// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use nss_rs::{
    Mode, RecordProtection, RecordProtectionOps as _, SymKey,
    constants::{Cipher, TLS_VERSION_1_3},
    hkdf::import_key,
};

/// The HKDF key material shared across all AEAD integration tests.
pub const SECRET_BYTES: &[u8] = &[
    0x47, 0xb2, 0xea, 0xea, 0x6c, 0x26, 0x6e, 0x32, 0xc0, 0x69, 0x7a, 0x9e, 0x2a, 0x89, 0x8b, 0xdf,
    0x5c, 0x4f, 0xb3, 0xe5, 0xac, 0x34, 0xf0, 0xe5, 0x49, 0xbf, 0x2c, 0x58, 0x58, 0x1a, 0x38, 0x11,
];

pub fn import_secret() -> SymKey {
    import_key(TLS_VERSION_1_3, SECRET_BYTES).expect("make a secret")
}

/// Encrypt/decrypt roundtrip for a single cipher suite, including in-place.
pub fn roundtrip(secret: &SymKey, cipher: Cipher) {
    let enc = RecordProtection::new(TLS_VERSION_1_3, cipher, secret, "quic ", Mode::Encrypt)
        .expect("encrypt context");
    let dec = RecordProtection::new(TLS_VERSION_1_3, cipher, secret, "quic ", Mode::Decrypt)
        .expect("decrypt context");

    let aad = b"associated data";
    let plaintext = b"hello roundtrip";
    let ct_buf = &mut [0u8; 1024][..];
    let ct = enc.encrypt(0, aad, plaintext, ct_buf).expect("encrypt");
    let pt_buf = &mut [0u8; 1024][..];
    let pt = dec.decrypt(0, aad, ct, pt_buf).expect("decrypt");
    assert_eq!(pt, plaintext);

    let mut ip = Vec::from(plaintext as &[u8]);
    ip.resize(plaintext.len() + enc.expansion(), 0);
    enc.encrypt_in_place(1, aad, &mut ip)
        .expect("encrypt_in_place");
    let dec_len = dec
        .decrypt_in_place(1, aad, &mut ip)
        .expect("decrypt_in_place");
    assert_eq!(&ip[..dec_len], plaintext);
}

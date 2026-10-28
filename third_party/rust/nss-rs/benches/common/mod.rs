// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//! Inputs shared by the benchmark targets.

use nss_rs::{
    SymKey,
    constants::{
        Cipher, TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256,
        TLS_VERSION_1_3,
    },
    hkdf,
};

pub const CIPHERS: [(&str, Cipher); 3] = [
    ("aes128gcm", TLS_AES_128_GCM_SHA256),
    ("aes256gcm", TLS_AES_256_GCM_SHA384),
    ("chacha20poly1305", TLS_CHACHA20_POLY1305_SHA256),
];

/// Small packet, QUIC packet and maximum TLS record.
pub const SIZES: [usize; 3] = [64, 1200, 16384];

pub const DATA: &[u8] = b"The quick brown fox jumps over the lazy dog";

pub fn secret() -> SymKey {
    hkdf::import_key(TLS_VERSION_1_3, &[0x5a; 32]).unwrap()
}

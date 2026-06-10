// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{
    fmt::{self, Debug},
    os::raw::{c_char, c_uint},
};

use crate::{
    constants::{Cipher, Version},
    err::Res,
    p11::{CK_MECHANISM_TYPE, PK11SymKey, SymKey},
};

experimental_api!(SSL_HkdfExpandLabelWithMech(
    version: Version,
    cipher: Cipher,
    prk: *mut PK11SymKey,
    handshake_hash: *const u8,
    handshake_hash_len: c_uint,
    label: *const c_char,
    label_len: c_uint,
    mech: CK_MECHANISM_TYPE,
    key_size: c_uint,
    secret: *mut *mut PK11SymKey,
));

#[cfg_attr(feature = "blapi", path = "header_protection_blapi.rs")]
mod header_protection;

/// A QUIC header-protection key.
///
/// Construct with [`Key::extract`]; use with [`Key::mask`].
pub struct Key(header_protection::Key);

const SAMPLE_SIZE: usize = 16;

impl Key {
    pub const SAMPLE_SIZE: usize = SAMPLE_SIZE;

    /// QUIC-specific API for extracting a header-protection key.
    ///
    /// # Errors
    ///
    /// Errors if HKDF fails or if context creation fails.
    ///
    /// # Panics
    ///
    /// When `cipher` is not known to this code.
    pub fn extract(version: Version, cipher: Cipher, prk: &SymKey, label: &str) -> Res<Self> {
        header_protection::Key::extract(version, cipher, prk, label).map(Self)
    }

    /// Duplicate this key, creating a new independent instance.
    ///
    /// # Errors
    ///
    /// Errors if context creation fails.
    pub fn try_clone(&self) -> Res<Self> {
        self.0.try_clone().map(Self)
    }

    /// Generate a header protection mask for QUIC.
    ///
    /// # Errors
    ///
    /// An error is returned if the underlying cryptographic functions fail.
    pub fn mask(&self, sample: &[u8; SAMPLE_SIZE]) -> Res<[u8; SAMPLE_SIZE]> {
        self.0.mask(sample)
    }
}

impl Debug for Key {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "hp::Key")
    }
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use crate::{
        constants::{TLS_AES_128_GCM_SHA256, TLS_VERSION_1_3},
        hkdf,
        hp::Key,
    };

    #[test]
    fn debug_format() {
        test_fixture::fixture_init();
        let prk = hkdf::import_key(TLS_VERSION_1_3, &[0; 32]).unwrap();
        let key = Key::extract(TLS_VERSION_1_3, TLS_AES_128_GCM_SHA256, &prk, "test").unwrap();
        assert_eq!(format!("{key:?}"), "hp::Key");
    }
}

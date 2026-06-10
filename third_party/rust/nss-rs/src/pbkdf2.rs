// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{os::raw::c_int, ptr::null_mut};

use crate::{
    Error, SECItemBorrowed,
    hmac::{HmacAlgorithm, hmac_alg_to_prf_oid},
    p11::{
        PK11_CreatePBEV2AlgorithmID, PK11_PBEKeyGen, PRBool, SECOID_DestroyAlgorithmID, SECOidTag,
        Slot, SymKey,
    },
};

/// Derive a key using PBKDF2.
///
/// Returns the derived key bytes as a `Vec<u8>`.
///
/// # Errors
///
/// Returns an error if inputs have invalid lengths, or if NSS functions fail.
pub fn pbkdf2(
    alg: &HmacAlgorithm,
    password: &[u8],
    salt: &[u8],
    iterations: u32,
    key_len: usize,
) -> Result<Vec<u8>, Error> {
    crate::init()?;

    let iterations = c_int::try_from(iterations)?;
    let key_len_int = c_int::try_from(key_len)?;

    let mut salt_item = SECItemBorrowed::wrap(salt)?;

    let slot = Slot::internal()?;
    let mut pw_item = SECItemBorrowed::wrap(password)?;

    let algid = unsafe {
        PK11_CreatePBEV2AlgorithmID(
            SECOidTag::SEC_OID_PKCS5_PBKDF2,
            hmac_alg_to_prf_oid(alg),
            hmac_alg_to_prf_oid(alg),
            key_len_int,
            iterations,
            salt_item.as_mut(),
        )
    };
    if algid.is_null() {
        return Err(Error::last_nss_error());
    }

    let key_ptr = unsafe {
        PK11_PBEKeyGen(
            *slot,
            algid,
            pw_item.as_mut(),
            PRBool::from(false),
            null_mut(),
        )
    };
    unsafe {
        SECOID_DestroyAlgorithmID(algid, PRBool::from(true));
    }

    let key = SymKey::from_ptr(key_ptr)?;
    let data = key.key_data()?;
    Ok(Vec::from(data))
}

#[cfg(test)]
mod tests {
    use test_fixture::fixture_init;

    use super::*;

    #[test]
    fn rfc_7914_vector_1() {
        fixture_init();
        // RFC 7914 §11 provides PBKDF2-HMAC-SHA256 vectors. Using a common one:
        // password="password", salt="salt", iter=1, dkLen=32.
        let dk = pbkdf2(&HmacAlgorithm::HMAC_SHA2_256, b"password", b"salt", 1, 32).unwrap();
        let expected = [
            0x12, 0x0f, 0xb6, 0xcf, 0xfc, 0xf8, 0xb3, 0x2c, 0x43, 0xe7, 0x22, 0x52, 0x56, 0xc4,
            0xf8, 0x37, 0xa8, 0x65, 0x48, 0xc9, 0x2c, 0xcc, 0x35, 0x48, 0x08, 0x05, 0x98, 0x7c,
            0xb7, 0x0b, 0xe1, 0x7b,
        ];
        assert_eq!(dk, expected);
    }

    #[test]
    fn rfc_7914_vector_iter_2() {
        fixture_init();
        let dk = pbkdf2(&HmacAlgorithm::HMAC_SHA2_256, b"password", b"salt", 2, 32).unwrap();
        let expected = [
            0xae, 0x4d, 0x0c, 0x95, 0xaf, 0x6b, 0x46, 0xd3, 0x2d, 0x0a, 0xdf, 0xf9, 0x28, 0xf0,
            0x6d, 0xd0, 0x2a, 0x30, 0x3f, 0x8e, 0xf3, 0xc2, 0x51, 0xdf, 0xd6, 0xe2, 0xd8, 0x5a,
            0x95, 0x47, 0x4c, 0x43,
        ];
        assert_eq!(dk, expected);
    }

    #[test]
    fn pbkdf2_sha384_vector() {
        fixture_init();
        let dk = pbkdf2(&HmacAlgorithm::HMAC_SHA2_384, b"password", b"salt", 1, 20).unwrap();
        let expected = [
            0xc0, 0xe1, 0x4f, 0x06, 0xe4, 0x9e, 0x32, 0xd7, 0x3f, 0x9f, 0x52, 0xdd, 0xf1, 0xd0,
            0xc5, 0xc7, 0x19, 0x16, 0x09, 0x23,
        ];
        assert_eq!(dk, expected);
    }

    #[test]
    fn pbkdf2_sha512_vector() {
        fixture_init();
        let dk = pbkdf2(&HmacAlgorithm::HMAC_SHA2_512, b"password", b"salt", 1, 20).unwrap();
        let expected = [
            0x86, 0x7f, 0x70, 0xcf, 0x1a, 0xde, 0x02, 0xcf, 0xf3, 0x75, 0x25, 0x99, 0xa3, 0xa5,
            0x3d, 0xc4, 0xaf, 0x34, 0xc7, 0xa6,
        ];
        assert_eq!(dk, expected);
    }

    #[test]
    fn deterministic_across_calls() {
        fixture_init();
        let a = pbkdf2(
            &HmacAlgorithm::HMAC_SHA2_256,
            b"hello",
            b"saltysalt0000000",
            10_000,
            32,
        )
        .unwrap();
        let b = pbkdf2(
            &HmacAlgorithm::HMAC_SHA2_256,
            b"hello",
            b"saltysalt0000000",
            10_000,
            32,
        )
        .unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn different_salt_different_key() {
        fixture_init();
        let a = pbkdf2(
            &HmacAlgorithm::HMAC_SHA2_256,
            b"hello",
            b"saltysalt0000000",
            10_000,
            32,
        )
        .unwrap();
        let b = pbkdf2(
            &HmacAlgorithm::HMAC_SHA2_256,
            b"hello",
            b"saltysalt0000001",
            10_000,
            32,
        )
        .unwrap();
        assert_ne!(a, b);
    }
}

// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#![allow(non_camel_case_types)]

use std::ptr;

use crate::{
    Error, SECItemBorrowed, SymKey,
    err::IntoResult as _,
    hash::{self, HashAlgorithm},
    p11::{
        CK_MECHANISM_TYPE, CKA_SIGN, CKM_SHA256_HMAC, CKM_SHA384_HMAC, CKM_SHA512_HMAC,
        PK11_CreateContextBySymKey, PK11_DigestFinal, PK11_DigestOp, PK11_ImportSymKey, PK11Origin,
        SECOidTag, Slot,
    },
};

//
// Constants
//

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HmacAlgorithm {
    HMAC_SHA2_256,
    HMAC_SHA2_384,
    HMAC_SHA2_512,
}

#[deprecated = "use HmacAlgorithm::hash_alg instead"]
#[expect(clippy::trivially_copy_pass_by_ref, reason = "API compatibility")]
#[must_use]
pub const fn hmac_alg_to_hash_alg(alg: &HmacAlgorithm) -> HashAlgorithm {
    alg.hash_alg()
}

#[deprecated = "use HmacAlgorithm::hmac_len instead"]
#[expect(clippy::trivially_copy_pass_by_ref, reason = "API compatibility")]
#[must_use]
pub const fn hmac_alg_to_hmac_len(alg: &HmacAlgorithm) -> usize {
    alg.hmac_len()
}

/// Calculate the HMAC of `data` using a `key` as bytes.
///
/// If using the same `key` multiple times, use [`HmacAlgorithm::import_key()`] and
/// [`HmacAlgorithm::hmac()`] instead.
#[expect(clippy::trivially_copy_pass_by_ref, reason = "API compatibility")]
pub fn hmac(alg: &HmacAlgorithm, key: &[u8], data: &[u8]) -> Result<Vec<u8>, Error> {
    let symkey = alg.import_key(key)?;
    alg.hmac(&symkey, data)
}

impl HmacAlgorithm {
    /// Get the [`CK_MECHANISM_TYPE`][] for this [`HmacAlgorithm`][].
    #[must_use]
    const fn ckm(self) -> CK_MECHANISM_TYPE {
        match self {
            Self::HMAC_SHA2_256 => CKM_SHA256_HMAC,
            Self::HMAC_SHA2_384 => CKM_SHA384_HMAC,
            Self::HMAC_SHA2_512 => CKM_SHA512_HMAC,
        }
    }

    /// Get the [`HashAlgorithm`][] for this [`HmacAlgorithm`][].
    #[must_use]
    pub const fn hash_alg(self) -> HashAlgorithm {
        match self {
            Self::HMAC_SHA2_256 => HashAlgorithm::SHA2_256,
            Self::HMAC_SHA2_384 => HashAlgorithm::SHA2_384,
            Self::HMAC_SHA2_512 => HashAlgorithm::SHA2_512,
        }
    }

    #[must_use]
    pub(crate) const fn prf_oid(self) -> SECOidTag::Type {
        match self {
            Self::HMAC_SHA2_256 => SECOidTag::SEC_OID_HMAC_SHA256,
            Self::HMAC_SHA2_384 => SECOidTag::SEC_OID_HMAC_SHA384,
            Self::HMAC_SHA2_512 => SECOidTag::SEC_OID_HMAC_SHA512,
        }
    }

    /// Get the length of the hash returned by this [`HmacAlgorithm`][].
    #[must_use]
    pub const fn hmac_len(self) -> usize {
        let hash_alg = self.hash_alg();
        hash::hash_alg_to_hash_len(&hash_alg)
    }

    /// Import key material for use with HMAC.
    pub fn import_key(self, key: &[u8]) -> Result<SymKey, Error> {
        crate::init()?;

        let slot = Slot::internal()?;
        let sym_key = unsafe {
            PK11_ImportSymKey(
                *slot,
                self.ckm(),
                PK11Origin::PK11_OriginUnwrap,
                CKA_SIGN,
                SECItemBorrowed::wrap(key)?.as_mut(),
                ptr::null_mut(),
            )
        }
        .into_result()?;
        Ok(sym_key)
    }

    /// Calculate the HMAC of `data` using a `key` as [`SymKey`][].
    pub fn hmac(self, key: &SymKey, data: &[u8]) -> Result<Vec<u8>, Error> {
        crate::init()?;

        let data_len = u32::try_from(data.len())?;

        let param = SECItemBorrowed::make_empty();
        let context =
            unsafe { PK11_CreateContextBySymKey(self.ckm(), CKA_SIGN, **key, param.as_ref()) }
                .into_result()?;

        unsafe { PK11_DigestOp(*context, data.as_ptr(), data_len) }.into_result()?;

        let expected_len = self.hmac_len();
        let expected_len_u32 = expected_len.try_into()?;
        let mut digest = vec![0u8; expected_len];
        let mut digest_len = 0u32;
        unsafe {
            PK11_DigestFinal(
                *context,
                digest.as_mut_ptr(),
                &raw mut digest_len,
                expected_len_u32,
            )
        }
        .into_result()?;

        if digest_len != expected_len_u32 {
            return Err(Error::Internal);
        }

        Ok(digest)
    }
}

// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::convert::TryFrom as _;

use crate::{
    Error,
    err::IntoResult as _,
    init, p11,
    p11::{PK11_HashBuf, SECOidTag},
};

//
// Constants
//

pub enum HashAlgorithm {
    SHA2_256,
    SHA2_384,
    SHA2_512,
}

const fn hash_alg_to_oid(alg: &HashAlgorithm) -> SECOidTag::Type {
    match alg {
        HashAlgorithm::SHA2_256 => SECOidTag::SEC_OID_SHA256,
        HashAlgorithm::SHA2_384 => SECOidTag::SEC_OID_SHA384,
        HashAlgorithm::SHA2_512 => SECOidTag::SEC_OID_SHA512,
    }
}

#[must_use]
pub const fn hash_alg_to_hash_len(alg: &HashAlgorithm) -> usize {
    match alg {
        HashAlgorithm::SHA2_256 => p11::SHA256_LENGTH as usize,
        HashAlgorithm::SHA2_384 => p11::SHA384_LENGTH as usize,
        HashAlgorithm::SHA2_512 => p11::SHA512_LENGTH as usize,
    }
}

//
// Hash function
//

pub fn hash(alg: &HashAlgorithm, data: &[u8]) -> Result<Vec<u8>, Error> {
    init()?;

    let data_len: i32 = match i32::try_from(data.len()) {
        Ok(data_len) => data_len,
        _ => return Err(Error::Internal),
    };
    let expected_len = hash_alg_to_hash_len(alg);
    let mut digest = vec![0u8; expected_len];
    unsafe {
        PK11_HashBuf(
            hash_alg_to_oid(alg),
            digest.as_mut_ptr(),
            data.as_ptr(),
            data_len,
        )
        .into_result()?;
    };
    Ok(digest)
}

// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#![allow(non_camel_case_types, reason = "C enum naming")]

use std::{
    convert::TryFrom as _,
    marker::PhantomData,
    os::raw::{c_char, c_int, c_uint},
    ptr::null_mut,
};

use pkcs11_bindings::{CK_ULONG, CKA_DERIVE, CKA_SIGN, CKM_HKDF_DERIVE, CKM_HKDF_KEY_GEN};

use crate::{
    Error, SECItem, SECItemBorrowed, SECItemType,
    constants::{
        Cipher, TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256,
        TLS_VERSION_1_3, Version,
    },
    err::Res,
    p11::{
        self, CK_ATTRIBUTE_TYPE, CK_BBOOL, CK_INVALID_HANDLE, CK_MECHANISM_TYPE,
        CKF_HKDF_SALT_DATA, CKF_HKDF_SALT_NULL, CKM_HKDF_DATA, PK11_ImportDataKey, PK11Origin,
        PK11SymKey, Slot, SymKey, random,
    },
    ssl::CK_OBJECT_HANDLE,
};

experimental_api!(SSL_HkdfExtract(
    version: Version,
    cipher: Cipher,
    salt: *mut PK11SymKey,
    ikm: *mut PK11SymKey,
    prk: *mut *mut PK11SymKey,
));
experimental_api!(SSL_HkdfExpandLabel(
    version: Version,
    cipher: Cipher,
    prk: *mut PK11SymKey,
    handshake_hash: *const u8,
    handshake_hash_len: c_uint,
    label: *const c_char,
    label_len: c_uint,
    secret: *mut *mut PK11SymKey,
));

#[derive(Clone, Copy, Debug)]

pub enum HkdfError {
    InvalidPrkLength,
    InvalidLength,
    InternalError,
}

#[derive(Clone, Copy, Debug)]
pub enum HkdfAlgorithm {
    HKDF_SHA2_256,
    HKDF_SHA2_384,
    HKDF_SHA2_512,
}

#[derive(Clone, Copy, Debug)]
pub enum KeyMechanism {
    Hkdf,
}

impl KeyMechanism {
    fn mech(self) -> CK_MECHANISM_TYPE {
        CK_MECHANISM_TYPE::from(match self {
            Self::Hkdf => CKM_HKDF_DERIVE,
        })
    }

    const fn len(self) -> usize {
        match self {
            Self::Hkdf => 0, // Let the underlying module decide.
        }
    }
}
#[derive(Clone, Copy, Debug)]

pub(crate) struct ParamItem<'a, T> {
    item: SECItem,
    marker: PhantomData<&'a T>,
}

impl<'a, T: Sized + 'a> ParamItem<'a, T> {
    pub fn new(v: &'a mut T) -> Result<Self, HkdfError> {
        let item = SECItem {
            type_: SECItemType::siBuffer,
            data: std::ptr::from_mut::<T>(v).cast::<u8>(),
            len: c_uint::try_from(size_of::<T>()).map_err(|_| HkdfError::InvalidLength)?,
        };
        Ok(Self {
            item,
            marker: PhantomData,
        })
    }

    pub const fn ptr(&mut self) -> *mut SECItem {
        std::ptr::addr_of_mut!(self.item)
    }
}

const MAX_KEY_SIZE: usize = 48;
const fn key_size(version: Version, cipher: Cipher) -> Res<usize> {
    if version != TLS_VERSION_1_3 {
        return Err(Error::UnsupportedVersion);
    }
    let size = match cipher {
        TLS_AES_128_GCM_SHA256 | TLS_CHACHA20_POLY1305_SHA256 => 32,
        TLS_AES_256_GCM_SHA384 => 48,
        _ => return Err(Error::UnsupportedCipher),
    };
    debug_assert!(size <= MAX_KEY_SIZE);
    Ok(size)
}

/// Generate a random key of the right size for the given suite.
///
/// # Errors
///
/// If the ciphersuite or protocol version is not supported.
pub fn generate_key(version: Version, cipher: Cipher) -> Res<SymKey> {
    // With generic_const_expr, this becomes:
    //   import_key(version, &random::<{ key_size(version, cipher) }>())
    import_key(
        version,
        &random::<MAX_KEY_SIZE>()[0..key_size(version, cipher)?],
    )
}

/// Import a symmetric key for use with HKDF.
///
/// # Errors
///
/// Errors returned if the key buffer is an incompatible size or the NSS functions fail.
pub fn import_key(version: Version, buf: &[u8]) -> Res<SymKey> {
    if version != TLS_VERSION_1_3 {
        return Err(Error::UnsupportedVersion);
    }
    let slot = Slot::internal()?;
    let key_ptr = unsafe {
        PK11_ImportDataKey(
            *slot,
            CK_MECHANISM_TYPE::from(CKM_HKDF_DERIVE),
            PK11Origin::PK11_OriginUnwrap,
            CK_ATTRIBUTE_TYPE::from(CKA_DERIVE),
            SECItemBorrowed::wrap(buf)?.as_mut(),
            null_mut(),
        )
    };
    SymKey::from_ptr(key_ptr)
}

/// Extract a PRK from the given salt and IKM using the algorithm defined in RFC 5869.
///
/// # Errors
///
/// Errors returned if inputs are too large or the NSS functions fail.
pub fn extract(
    version: Version,
    cipher: Cipher,
    salt: Option<&SymKey>,
    ikm: &SymKey,
) -> Res<SymKey> {
    let mut prk: *mut PK11SymKey = null_mut();
    let salt_ptr: *mut PK11SymKey = salt.map_or(null_mut(), |s| **s);
    unsafe { SSL_HkdfExtract(version, cipher, salt_ptr, **ikm, &raw mut prk) }?;
    SymKey::from_ptr(prk)
}

/// Expand a PRK using the HKDF-Expand-Label function defined in RFC 8446.
///
/// # Errors
///
/// Errors returned if inputs are too large or the NSS functions fail.
pub fn expand_label(
    version: Version,
    cipher: Cipher,
    prk: &SymKey,
    handshake_hash: &[u8],
    label: &str,
) -> Res<SymKey> {
    let l = label.as_bytes();
    let mut secret: *mut PK11SymKey = null_mut();

    // Note that this doesn't allow for passing null() for the handshake hash.
    // A zero-length slice produces an identical result.
    unsafe {
        SSL_HkdfExpandLabel(
            version,
            cipher,
            **prk,
            handshake_hash.as_ptr(),
            c_uint::try_from(handshake_hash.len())?,
            l.as_ptr().cast(),
            c_uint::try_from(l.len())?,
            &raw mut secret,
        )
    }?;
    SymKey::from_ptr(secret)
}

pub struct Hkdf {
    kdf: HkdfAlgorithm,
}

impl Hkdf {
    #[must_use]
    pub const fn new(kdf: HkdfAlgorithm) -> Self {
        Self { kdf }
    }

    #[expect(clippy::unused_self)]
    pub fn import_secret(&self, ikm: &[u8]) -> Result<SymKey, HkdfError> {
        crate::init().map_err(|_| HkdfError::InternalError)?;

        let slot = Slot::internal().map_err(|_| HkdfError::InternalError)?;
        let ikm_item = SECItemBorrowed::wrap(ikm).map_err(|_| HkdfError::InternalError)?;
        let ikm_item_ptr = std::ptr::from_ref(ikm_item.as_ref()).cast_mut();

        let ptr = unsafe {
            p11::PK11_ImportSymKey(
                *slot,
                CK_MECHANISM_TYPE::from(CKM_HKDF_KEY_GEN),
                PK11Origin::PK11_OriginUnwrap,
                CK_ATTRIBUTE_TYPE::from(CKA_SIGN),
                ikm_item_ptr,
                null_mut(),
            )
        };
        let s = SymKey::from_ptr(ptr).map_err(|_| HkdfError::InternalError)?;
        Ok(s)
    }

    fn mech(&self) -> CK_MECHANISM_TYPE {
        CK_MECHANISM_TYPE::from(match self.kdf {
            HkdfAlgorithm::HKDF_SHA2_256 => p11::CKM_SHA256,
            HkdfAlgorithm::HKDF_SHA2_384 => p11::CKM_SHA384,
            HkdfAlgorithm::HKDF_SHA2_512 => p11::CKM_SHA512,
        })
    }

    pub fn extract(&self, salt: &[u8], ikm: &SymKey) -> Result<SymKey, HkdfError> {
        crate::init().map_err(|_| HkdfError::InternalError)?;

        let salt_type = if salt.is_empty() {
            CKF_HKDF_SALT_NULL
        } else {
            CKF_HKDF_SALT_DATA
        };
        let mut params = p11::CK_HKDF_PARAMS {
            bExtract: CK_BBOOL::from(true),
            bExpand: CK_BBOOL::from(false),
            prfHashMechanism: self.mech(),
            ulSaltType: CK_ULONG::from(salt_type),
            pSalt: salt.as_ptr().cast_mut(), // const-cast = bad API
            ulSaltLen: CK_ULONG::try_from(salt.len()).map_err(|_| HkdfError::InvalidLength)?,
            hSaltKey: CK_OBJECT_HANDLE::from(CK_INVALID_HANDLE),
            pInfo: null_mut(),
            ulInfoLen: 0,
        };
        let mut params_item = ParamItem::new(&mut params)?;
        let ptr = unsafe {
            p11::PK11_Derive(
                **ikm,
                CK_MECHANISM_TYPE::from(CKM_HKDF_DERIVE),
                params_item.ptr(),
                CK_MECHANISM_TYPE::from(CKM_HKDF_DERIVE),
                CK_MECHANISM_TYPE::from(CKA_DERIVE),
                0,
            )
        };

        let prk = SymKey::from_ptr(ptr).map_err(|_| HkdfError::InternalError)?;
        Ok(prk)
    }

    // NB: `info` must outlive the returned value.
    fn expand_params(&self, info: &[u8]) -> p11::CK_HKDF_PARAMS {
        p11::CK_HKDF_PARAMS {
            bExtract: CK_BBOOL::from(false),
            bExpand: CK_BBOOL::from(true),
            prfHashMechanism: self.mech(),
            ulSaltType: CK_ULONG::from(CKF_HKDF_SALT_NULL),
            pSalt: null_mut(),
            ulSaltLen: 0,
            hSaltKey: CK_OBJECT_HANDLE::from(CK_INVALID_HANDLE),
            pInfo: info.as_ptr().cast_mut(), // const-cast = bad API
            ulInfoLen: CK_ULONG::try_from(info.len()).expect("Integer overflow"),
        }
    }

    pub fn expand_key(
        &self,
        prk: &SymKey,
        info: &[u8],
        key_mech: KeyMechanism,
    ) -> Result<SymKey, HkdfError> {
        crate::init().map_err(|_| HkdfError::InternalError)?;

        let mut params = self.expand_params(info);
        let mut params_item = ParamItem::new(&mut params)?;
        let ptr = unsafe {
            p11::PK11_Derive(
                **prk,
                CK_MECHANISM_TYPE::from(CKM_HKDF_DERIVE),
                params_item.ptr(),
                key_mech.mech(),
                CK_MECHANISM_TYPE::from(CKA_DERIVE),
                c_int::try_from(key_mech.len()).map_err(|_| HkdfError::InvalidLength)?,
            )
        };
        let okm = SymKey::from_ptr(ptr).map_err(|_| HkdfError::InternalError)?;
        Ok(okm)
    }

    pub fn expand_data(&self, prk: &SymKey, info: &[u8], len: usize) -> Result<Vec<u8>, HkdfError> {
        crate::init().map_err(|_| HkdfError::InternalError)?;

        let mut params = self.expand_params(info);
        let mut params_item = ParamItem::new(&mut params)?;
        let ptr = unsafe {
            p11::PK11_Derive(
                **prk,
                CK_MECHANISM_TYPE::from(CKM_HKDF_DATA),
                params_item.ptr(),
                CK_MECHANISM_TYPE::from(CKM_HKDF_DERIVE),
                CK_MECHANISM_TYPE::from(CKA_DERIVE),
                c_int::try_from(len).map_err(|_| HkdfError::InvalidLength)?,
            )
        };
        let k = SymKey::from_ptr(ptr).map_err(|_| HkdfError::InternalError)?;
        let r = Vec::from(k.key_data().map_err(|_| HkdfError::InternalError)?);
        Ok(r)
    }
}

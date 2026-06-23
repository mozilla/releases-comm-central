// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// Bindings to NSS's freebl AEAD primitives, bypassing the PKCS#11 session
// layer.
//
// Functions are accessed through FREEBL_GetVector() rather than as direct
// symbol references, because on some platforms (e.g. FreeBSD) freebl only
// exports FREEBL_GetVector.

#[cfg(feature = "gecko")]
use std::ffi::CStr;
use std::{
    os::raw::{c_int, c_uchar, c_uint, c_ulong, c_void},
    sync::OnceLock,
};

use log::error;

use crate::{Error, aead::Mode, err::Res};

// NSS_AES = 0 (ECB), NSS_AES_GCM = 4, AES_BLOCK_SIZE = 16 (from blapit.h)
pub const NSS_AES: c_int = 0;
pub const NSS_AES_GCM: c_int = 4;
pub const AES_BLOCK_SIZE: c_uint = 16;

// Opaque freebl cipher contexts.
#[repr(C)]
pub struct AESContext {
    _private: [u8; 0],
}

#[repr(C)]
pub struct ChaCha20Poly1305Context {
    _private: [u8; 0],
}

// GCM message-level params (PKCS#11 v3, pkcs11t.h).
// For CKG_NO_GENERATE (ivGenerator = 0), pIv/ulIvLen supply the full nonce.
// For encrypt, pTag is the output tag buffer; for decrypt, pTag is the input
// tag to verify. ulTagBits = TAG_LEN * 8 = 128.
//
// NSS's pkcs11t.h pulls in pkcs11p.h which applies `#pragma pack(push,
// cryptoki, 1)` on all platforms.  On LP64 all six fields are 8 bytes wide so
// packing is a no-op (sizeof = 48).  On Windows LLP64 (CK_ULONG = 4 bytes)
// packing removes the natural 4-byte padding before `pTag` (sizeof = 32).
#[repr(C, packed)]
#[derive(Copy, Clone)]
#[expect(non_snake_case, reason = "PKCS#11 naming conventions.")]
pub struct CK_GCM_MESSAGE_PARAMS {
    pub pIv: *mut c_uchar,
    pub ulIvLen: c_ulong,
    pub ulIvFixedBits: c_ulong,
    pub ivGenerator: c_ulong, // CK_GENERATOR_FUNCTION; 0 = CKG_NO_GENERATE
    pub pTag: *mut c_uchar,
    pub ulTagBits: c_ulong,
}

// LP64: pointer == c_ulong == 8 bytes, no padding even packed → size = 6 × 8.
// Windows LLP64: packed size = 32, which != 6 × 4 = 24, so skip the check.
#[cfg(not(target_os = "windows"))]
const _: () = assert!(size_of::<CK_GCM_MESSAGE_PARAMS>() == 6 * size_of::<c_ulong>());

// Encrypt and decrypt share this signature; direction is baked in at
// construction time by storing either pointer.
pub type ChaChaOpFn = unsafe extern "C" fn(
    *const ChaCha20Poly1305Context,
    *mut c_uchar,
    *mut c_uint,
    c_uint,
    *const c_uchar,
    c_uint,
    *const c_uchar,
    c_uint,
    *const c_uchar,
    c_uint,
    *mut c_uchar,
) -> c_int;

// Full FREEBLVectorStr layout generated from lib/freebl/loader.h.
// AESContext and ChaCha20Poly1305Context are blocklisted so the definitions
// above are used. See the regeneration instructions in vector.rs.
#[expect(
    clippy::type_complexity,
    dead_code,
    non_camel_case_types,
    non_snake_case,
    reason = "generated code in vector.rs"
)]
mod generated {
    use super::{AESContext, ChaCha20Poly1305Context};
    // PLArenaPool is NSPR-internal; only forward-declared in freebl headers.
    // KyberParams is an enum defined in kyber.h; underlying type is c_uint.
    // Both appear in FREEBLVectorStr fields we don't extract.
    #[repr(C)]
    pub struct PLArenaPool {
        _unused: [u8; 0],
    }
    pub type KyberParams = ::core::ffi::c_uint;
    include!("vector.rs");
}
use generated::FREEBLVectorStr;

// Structurally identical to the anonymous types in FREEBLVectorStr
// (SECStatus = c_int, PRBool = c_int, PRUint32 = c_uint = u32).
type AesCreateFn = unsafe extern "C" fn(
    *const c_uchar,
    *const c_uchar,
    c_int,
    c_int,
    c_uint,
    c_uint,
) -> *mut AESContext;
type AesDestroyFn = unsafe extern "C" fn(*mut AESContext, c_int);
type AesEncryptFn = unsafe extern "C" fn(
    *mut AESContext,
    *mut c_uchar,
    *mut c_uint,
    c_uint,
    *const c_uchar,
    c_uint,
) -> c_int;
type AesAeadFn = unsafe extern "C" fn(
    *mut AESContext,
    *mut c_uchar,
    *mut c_uint,
    c_uint,
    *const c_uchar,
    c_uint,
    *mut c_void,
    c_uint,
    *const c_uchar,
    c_uint,
) -> c_int;
type ChaChaCreateFn =
    unsafe extern "C" fn(*const c_uchar, c_uint, c_uint) -> *mut ChaCha20Poly1305Context;
type ChaChaDestroyFn = unsafe extern "C" fn(*mut ChaCha20Poly1305Context, c_int);
type ChaCha20XorFn = unsafe extern "C" fn(
    *mut c_uchar,
    *const c_uchar,
    c_uint,
    *const c_uchar,
    *const c_uchar,
    c_uint,
) -> c_int;

// Extracted, non-nullable function pointers with idiomatic Rust names.
struct FreeblFns {
    aes_create: AesCreateFn,
    aes_destroy: AesDestroyFn,
    aes_encrypt: AesEncryptFn,
    aes_aead: AesAeadFn,
    chacha_create: ChaChaCreateFn,
    chacha_destroy: ChaChaDestroyFn,
    chacha_encrypt: ChaChaOpFn,
    chacha_decrypt: ChaChaOpFn,
    chacha_xor: ChaCha20XorFn,
}

#[cfg(feature = "gecko")]
mod nspr_lib {
    include!(concat!(env!("OUT_DIR"), "/nspr_lib.rs"));
}

#[cfg(not(feature = "gecko"))]
unsafe extern "C" {
    fn FREEBL_GetVector() -> *const FREEBLVectorStr;
}

static FREEBL: OnceLock<Res<FreeblFns>> = OnceLock::new();

fn freebl_result() -> Res<&'static FreeblFns> {
    FREEBL
        .get_or_init(load_freebl_fns)
        .as_ref()
        .map_err(Clone::clone)
}

pub fn init() -> Res<()> {
    freebl_result().map(|_| ())
}

/// # Panics
/// If freebl was not successfully initialised via [`init`].
fn freebl() -> &'static FreeblFns {
    freebl_result().expect("freebl not initialised")
}

fn require<F>(f: Option<F>, name: &str) -> Res<F> {
    f.ok_or_else(|| {
        error!("freebl: {name} not in vector");
        Error::Internal
    })
}

fn load_freebl_fns() -> Res<FreeblFns> {
    #[cfg(feature = "gecko")]
    let raw = freebl_vector()?;
    #[cfg(not(feature = "gecko"))]
    // SAFETY: FREEBL_GetVector returns a valid aligned pointer, or null on failure.
    let raw = unsafe { FREEBL_GetVector() };
    let v = unsafe { raw.as_ref() }.ok_or_else(|| {
        error!("freebl: FREEBL_GetVector() returned null");
        Error::Internal
    })?;
    let min = core::mem::offset_of!(FREEBLVectorStr, p_AES_AEAD) + size_of::<Option<AesAeadFn>>();
    if usize::from(v.length) < min {
        error!("freebl: vector too short ({} < {min})", v.length);
        return Err(Error::Internal);
    }
    Ok(FreeblFns {
        aes_create: require(v.p_AES_CreateContext, "AES_CreateContext")?,
        aes_destroy: require(v.p_AES_DestroyContext, "AES_DestroyContext")?,
        aes_encrypt: require(v.p_AES_Encrypt, "AES_Encrypt")?,
        aes_aead: require(v.p_AES_AEAD, "AES_AEAD")?,
        chacha_create: require(
            v.p_ChaCha20Poly1305_CreateContext,
            "ChaCha20Poly1305_CreateContext",
        )?,
        chacha_destroy: require(
            v.p_ChaCha20Poly1305_DestroyContext,
            "ChaCha20Poly1305_DestroyContext",
        )?,
        chacha_encrypt: require(v.p_ChaCha20Poly1305_Encrypt, "ChaCha20Poly1305_Encrypt")?,
        chacha_decrypt: require(v.p_ChaCha20Poly1305_Decrypt, "ChaCha20Poly1305_Decrypt")?,
        chacha_xor: require(v.p_ChaCha20_Xor, "ChaCha20_Xor")?,
    })
}

// Use NSPR (matching NSS's own loader.c) rather than a direct link.
#[cfg(feature = "gecko")]
fn freebl_vector() -> Res<*const FREEBLVectorStr> {
    use nspr_lib::{PR_FindFunctionSymbol, PR_LoadLibrary, PR_UnloadLibrary};
    type GetVectorFn = unsafe extern "C" fn() -> *const FREEBLVectorStr;

    // Library names in preference order, from NSS's blname.c.
    let libs: &[&CStr] = if cfg!(target_os = "linux") {
        &[c"libfreeblpriv3.so", c"libfreebl3.so"]
    } else if cfg!(target_os = "macos") {
        &[c"libfreebl3.dylib"]
    } else if cfg!(windows) {
        &[c"freebl3.dll"]
    } else {
        &[c"libfreebl3.so"]
    };

    let handle = libs
        .iter()
        .find_map(|lib| {
            let h = unsafe { PR_LoadLibrary(lib.as_ptr().cast()) };
            (!h.is_null()).then_some(h)
        })
        .ok_or_else(|| {
            error!("freebl: failed to load any of {:?}", libs);
            Error::Internal
        })?;

    let sym = unsafe { PR_FindFunctionSymbol(handle, c"FREEBL_GetVector".as_ptr().cast()) };
    let Some(sym) = sym else {
        error!("freebl: FREEBL_GetVector not found");
        let _ = unsafe { PR_UnloadLibrary(handle) };
        return Err(Error::Internal);
    };

    // SAFETY: sym is FREEBL_GetVector; transmute needed for data-ptr → fn-ptr.
    let f: GetVectorFn = unsafe { std::mem::transmute(sym) };
    Ok(unsafe { f() })
}

#[expect(non_snake_case, reason = "Matches the freebl C API.")]
unsafe fn AES_CreateContext(
    key: *const c_uchar,
    iv: *const c_uchar,
    mode: c_int,
    encrypt: c_int,
    keylen: c_uint,
    blocklen: c_uint,
) -> *mut AESContext {
    unsafe { (freebl().aes_create)(key, iv, mode, encrypt, keylen, blocklen) }
}

/// Create an `AesCtx` for the given AES `mode` and `encrypt` direction.
///
/// `key` supplies both the key bytes and the key length via its slice length.
/// The IV is always `null` — ECB needs none, and GCM supplies the IV
/// per-operation via the params struct passed to `AES_AEAD`.
#[expect(
    clippy::redundant_pub_crate,
    reason = "pub(crate) signals intent; the module is also pub(crate) which Clippy treats as equivalent"
)]
pub(crate) fn aes_context(key: &[u8], mode: c_int, encrypt: bool) -> Res<AesCtx> {
    debug_assert!(
        key.len() == 16 || key.len() == 32,
        "AES key must be 16 or 32 bytes, got {}",
        key.len()
    );
    AesCtx::from_ptr(unsafe {
        AES_CreateContext(
            key.as_ptr(),
            std::ptr::null(),
            mode,
            c_int::from(encrypt),
            c_uint::try_from(key.len())?,
            AES_BLOCK_SIZE,
        )
    })
}

#[expect(
    clippy::redundant_pub_crate,
    non_snake_case,
    reason = "pub(crate) signals intent; the module is also pub(crate) which Clippy treats as equivalent"
)]
pub(crate) unsafe fn AES_Encrypt(
    cx: *mut AESContext,
    output: *mut c_uchar,
    output_len: *mut c_uint,
    max_output_len: c_uint,
    input: *const c_uchar,
    input_len: c_uint,
) -> c_int {
    unsafe { (freebl().aes_encrypt)(cx, output, output_len, max_output_len, input, input_len) }
}

#[expect(
    clippy::too_many_arguments,
    non_snake_case,
    reason = "Matches the 10-argument freebl C API."
)]
pub unsafe fn AES_AEAD(
    cx: *mut AESContext,
    output: *mut c_uchar,
    outputLen: *mut c_uint,
    maxOutputLen: c_uint,
    input: *const c_uchar,
    inputLen: c_uint,
    params: *mut c_void,
    paramsLen: c_uint,
    aad: *const c_uchar,
    aadLen: c_uint,
) -> c_int {
    unsafe {
        (freebl().aes_aead)(
            cx,
            output,
            outputLen,
            maxOutputLen,
            input,
            inputLen,
            params,
            paramsLen,
            aad,
            aadLen,
        )
    }
}

#[expect(non_snake_case, reason = "Matches the freebl C API.")]
pub unsafe fn ChaCha20Poly1305_CreateContext(
    key: *const c_uchar,
    keyLen: c_uint,
    tagLen: c_uint,
) -> *mut ChaCha20Poly1305Context {
    unsafe { (freebl().chacha_create)(key, keyLen, tagLen) }
}

#[expect(
    clippy::redundant_pub_crate,
    non_snake_case,
    reason = "pub(crate) signals intent; the module is also pub(crate) which Clippy treats as equivalent"
)]
pub(crate) unsafe fn ChaCha20_Xor(
    output: *mut c_uchar,
    block: *const c_uchar,
    len: c_uint,
    k: *const c_uchar,
    nonce: *const c_uchar,
    ctr: c_uint,
) -> c_int {
    unsafe { (freebl().chacha_xor)(output, block, len, k, nonce, ctr) }
}

/// Returns the encrypt or decrypt function pointer for ChaCha20-Poly1305.
/// The caller stores this at construction time to bake in the direction.
pub fn chacha20_poly1305_op(mode: Mode) -> ChaChaOpFn {
    let f = freebl();
    match mode {
        Mode::Encrypt => f.chacha_encrypt,
        Mode::Decrypt => f.chacha_decrypt,
    }
}

unsafe fn destroy_aes_context(cx: *mut AESContext) {
    unsafe {
        (freebl().aes_destroy)(cx, 1 /* PR_TRUE */);
    }
}

unsafe fn destroy_chacha20_context(ctx: *mut ChaCha20Poly1305Context) {
    unsafe {
        (freebl().chacha_destroy)(ctx, 1 /* PR_TRUE */);
    }
}

scoped_ptr!(AesCtx, AESContext, destroy_aes_context);
scoped_ptr!(
    ChaCha20Ctx,
    ChaCha20Poly1305Context,
    destroy_chacha20_context
);

// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// Blapi backend for RecordProtection: calls freebl AES-GCM and ChaCha20-Poly1305
// primitives directly, bypassing the PKCS#11 session layer.
//
// NOTE: this bypasses softoken's FIPS power-on self-test gate.  Intentional for
// neqo (non-FIPS) in exchange for lower per-packet overhead.

use std::{
    fmt,
    os::raw::{c_uint, c_ulong},
};

use zeroize::{ZeroizeOnDrop, Zeroizing};

use super::{
    AeadAlgorithms, Mode, NONCE_LEN, RecordProtectionOps, TAG_LEN, expand_label_buf, split_tag,
    xor_nonce,
};
use crate::{
    Cipher, Error, Res, SymKey, Version,
    err::{sec::SEC_ERROR_BAD_DATA, secstatus_to_res},
    freebl::{self, AesCtx, ChaCha20Ctx, ChaChaOpFn},
};

// Compile-time C-type conversions for the constants used in every freebl call.
#[expect(
    clippy::cast_possible_truncation,
    reason = "NONCE_LEN = 12 and TAG_LEN = 16 both fit in u32"
)]
const NONCE_LEN_C: c_uint = NONCE_LEN as c_uint;
#[expect(
    clippy::cast_possible_truncation,
    reason = "NONCE_LEN = 12 and TAG_LEN = 16 both fit in u32"
)]
const TAG_LEN_C: c_uint = TAG_LEN as c_uint;
// On Windows c_ulong is u32; on other platforms it is u64, so
// cast_possible_truncation only fires on Windows.
#[cfg_attr(
    target_os = "windows",
    expect(
        clippy::cast_possible_truncation,
        reason = "NONCE_LEN = 12 fits in u32"
    )
)]
const NONCE_LEN_UL: c_ulong = NONCE_LEN as c_ulong;
#[cfg_attr(
    target_os = "windows",
    expect(
        clippy::cast_possible_truncation,
        reason = "TAG_LEN * 8 = 128 fits in u32"
    )
)]
const TAG_BITS_UL: c_ulong = (TAG_LEN * 8) as c_ulong;
#[expect(
    clippy::cast_possible_truncation,
    reason = "CK_GCM_MESSAGE_PARAMS is a small fixed struct"
)]
const GCM_PARAMS_LEN_C: c_uint = size_of::<freebl::CK_GCM_MESSAGE_PARAMS>() as c_uint;

enum RecordCipher {
    // AES-GCM bakes direction into the context at creation time via the
    // `encrypt` parameter to `AES_CreateContext`.
    Aes(AesCtx),
    // ChaCha20-Poly1305 bakes direction into the function pointer at
    // construction time; the context itself is direction-agnostic.
    ChaCha(ChaCha20Ctx, ChaChaOpFn),
}

/// Dispatch an AEAD operation to the appropriate freebl primitive.
///
/// # Safety
///
/// `output`, `tag`, and `input` must be valid for `output_max`, `TAG_LEN`,
/// and `input_len` bytes respectively.  `output` and `input` may overlap
/// (in-place); `tag` must not overlap the `output` region.
#[expect(
    clippy::too_many_arguments,
    reason = "Thin wrapper over two 10-argument C functions."
)]
unsafe fn aead_op(
    cipher: &RecordCipher,
    nonce: &[u8; NONCE_LEN],
    aad: &[u8],
    output: *mut u8,
    output_max: c_uint,
    tag: *mut u8,
    input: *const u8,
    input_len: c_uint,
) -> Res<usize> {
    let mut out_len: c_uint = 0;
    let aad_len = c_uint::try_from(aad.len())?;
    match cipher {
        RecordCipher::Aes(ctx) => {
            let mut params = freebl::CK_GCM_MESSAGE_PARAMS {
                pIv: nonce.as_ptr().cast_mut(), // NSS only reads pIv for CKG_NO_GENERATE
                ulIvLen: NONCE_LEN_UL,
                ulIvFixedBits: 0,
                ivGenerator: 0,
                pTag: tag,
                ulTagBits: TAG_BITS_UL,
            };
            secstatus_to_res(unsafe {
                freebl::AES_AEAD(
                    **ctx,
                    output,
                    &raw mut out_len,
                    output_max,
                    input,
                    input_len,
                    (&raw mut params).cast(),
                    GCM_PARAMS_LEN_C,
                    aad.as_ptr(),
                    aad_len,
                )
            })?;
        }
        RecordCipher::ChaCha(ctx, f) => {
            secstatus_to_res(unsafe {
                f(
                    **ctx,
                    output,
                    &raw mut out_len,
                    output_max,
                    input,
                    input_len,
                    nonce.as_ptr(),
                    NONCE_LEN_C,
                    aad.as_ptr(),
                    aad_len,
                    tag,
                )
            })?;
        }
    }
    Ok(usize::try_from(out_len)?)
}

// blapi holds nonce_base outside NSS-managed memory, so zero it on drop;
// the PKCS#11 backend relies on the SymKey lifecycle for this instead.
#[derive(ZeroizeOnDrop)]
pub struct RecordProtection {
    #[zeroize(skip)]
    cipher: RecordCipher,
    nonce_base: [u8; NONCE_LEN],
}

impl RecordProtection {
    /// Create a new AEAD instance for the given direction.
    ///
    /// # Errors
    ///
    /// Returns `Error` when the underlying crypto operations fail.
    pub fn new(
        version: Version,
        cipher: Cipher,
        secret: &SymKey,
        prefix: &str,
        mode: Mode,
    ) -> Res<Self> {
        // Moves into RecordProtection (ZeroizeOnDrop), no Zeroizing needed.
        let nonce_base: [u8; NONCE_LEN] =
            expand_label_buf(version, cipher, secret, &format!("{prefix}iv"))?;
        let key_label = format!("{prefix}key");

        let record_cipher = match AeadAlgorithms::try_from(cipher)? {
            AeadAlgorithms::Aes128Gcm => {
                let key =
                    Zeroizing::new(expand_label_buf::<16>(version, cipher, secret, &key_label)?);
                RecordCipher::Aes(freebl::aes_context(
                    &key[..],
                    freebl::NSS_AES_GCM,
                    mode == Mode::Encrypt,
                )?)
            }
            AeadAlgorithms::Aes256Gcm => {
                let key =
                    Zeroizing::new(expand_label_buf::<32>(version, cipher, secret, &key_label)?);
                RecordCipher::Aes(freebl::aes_context(
                    &key[..],
                    freebl::NSS_AES_GCM,
                    mode == Mode::Encrypt,
                )?)
            }
            AeadAlgorithms::ChaCha20Poly1305 => {
                let key =
                    Zeroizing::new(expand_label_buf::<32>(version, cipher, secret, &key_label)?);
                let ctx = ChaCha20Ctx::from_ptr(unsafe {
                    freebl::ChaCha20Poly1305_CreateContext(key.as_ptr(), 32, TAG_LEN_C)
                })?;
                RecordCipher::ChaCha(ctx, freebl::chacha20_poly1305_op(mode))
            }
        };

        Ok(Self {
            cipher: record_cipher,
            nonce_base,
        })
    }
}

impl RecordProtectionOps for RecordProtection {
    fn expansion(&self) -> usize {
        TAG_LEN
    }

    fn encrypt<'a>(
        &self,
        count: u64,
        aad: &[u8],
        input: &[u8],
        output: &'a mut [u8],
    ) -> Res<&'a [u8]> {
        if output.len()
            < input
                .len()
                .checked_add(TAG_LEN)
                .ok_or(Error::IntegerOverflow)?
        {
            return Err(Error::from(SEC_ERROR_BAD_DATA));
        }
        let input_len = c_uint::try_from(input.len())?;
        let out_ptr = output.as_mut_ptr();
        let nonce = xor_nonce(&self.nonce_base, count);
        let out_len = unsafe {
            aead_op(
                &self.cipher,
                &nonce,
                aad,
                out_ptr,
                input_len,
                out_ptr.add(input_len as usize),
                input.as_ptr(),
                input_len,
            )
        }?;
        if out_len != input.len() {
            return Err(Error::Internal);
        }
        Ok(&output[..out_len + TAG_LEN])
    }

    fn encrypt_in_place(&self, count: u64, aad: &[u8], data: &mut [u8]) -> Res<usize> {
        if data.len() < self.expansion() {
            return Err(Error::from(SEC_ERROR_BAD_DATA));
        }
        let pt_len = data.len() - self.expansion();
        let data_ptr = data.as_mut_ptr();
        let pt_len_c = c_uint::try_from(pt_len)?;
        let nonce = xor_nonce(&self.nonce_base, count);
        let out_len = unsafe {
            aead_op(
                &self.cipher,
                &nonce,
                aad,
                data_ptr,
                pt_len_c,
                data_ptr.add(pt_len),
                data_ptr.cast_const(),
                pt_len_c,
            )
        }?;
        if out_len != pt_len {
            return Err(Error::Internal);
        }
        Ok(data.len())
    }

    fn decrypt<'a>(
        &self,
        count: u64,
        aad: &[u8],
        input: &[u8],
        output: &'a mut [u8],
    ) -> Res<&'a [u8]> {
        let (ct_len, mut tag) = split_tag(input)?;
        if output.len() < ct_len {
            return Err(Error::from(SEC_ERROR_BAD_DATA));
        }
        let ct_len_c = c_uint::try_from(ct_len)?;
        let nonce = xor_nonce(&self.nonce_base, count);
        let out_len = unsafe {
            aead_op(
                &self.cipher,
                &nonce,
                aad,
                output.as_mut_ptr(),
                ct_len_c,
                tag.as_mut_ptr(),
                input.as_ptr(),
                ct_len_c,
            )
        }?;
        Ok(&output[..out_len])
    }

    fn decrypt_in_place(&self, count: u64, aad: &[u8], data: &mut [u8]) -> Res<usize> {
        let (ct_len, mut tag) = split_tag(data)?;
        let ct_len_c = c_uint::try_from(ct_len)?;
        let data_ptr = data.as_mut_ptr();
        let nonce = xor_nonce(&self.nonce_base, count);
        let out_len = unsafe {
            aead_op(
                &self.cipher,
                &nonce,
                aad,
                data_ptr,
                ct_len_c,
                tag.as_mut_ptr(),
                data_ptr.cast_const(),
                ct_len_c,
            )
        }?;
        if out_len != ct_len {
            return Err(Error::Internal);
        }
        Ok(out_len)
    }
}

impl fmt::Debug for RecordProtection {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[AEAD Context]")
    }
}

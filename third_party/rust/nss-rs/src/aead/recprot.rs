// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{
    fmt,
    os::raw::{c_int, c_uint},
};

use super::{
    AeadAlgorithms, COUNTER_LEN, Mode, NONCE_LEN, RecordProtectionOps, TAG_LEN, c_int_len,
    expand_label, expand_label_buf, split_tag, xor_nonce,
};
use crate::{
    Cipher, Error, Res, SECItemBorrowed, SymKey, Version,
    err::{sec::SEC_ERROR_BAD_DATA, secstatus_to_res},
    p11::{
        CK_ATTRIBUTE_TYPE, CK_GENERATOR_FUNCTION, CK_MECHANISM_TYPE, CKG_NO_GENERATE, Context,
        PK11_AEADOp, PK11_CreateContextBySymKey,
    },
};

fn cipher_mech_and_key_len(cipher: Cipher) -> Res<(CK_MECHANISM_TYPE, c_uint)> {
    let spec = AeadAlgorithms::try_from(cipher)?;
    Ok((spec.p11_mech(), spec.key_len()))
}

fn make_ctx(
    mech: CK_MECHANISM_TYPE,
    op: CK_ATTRIBUTE_TYPE,
    key: &SymKey,
    nonce_base: &[u8; NONCE_LEN],
) -> Res<Context> {
    let ptr = unsafe {
        PK11_CreateContextBySymKey(
            mech,
            op,
            **key,
            SECItemBorrowed::wrap(nonce_base.as_slice())?.as_ref(),
        )
    };
    Context::from_ptr(ptr)
}

/// Calls `PK11_AEADOp` with the fixed parameters for this module (`CKG_NO_GENERATE`, no
/// counter generation) and returns the number of output bytes written.
///
/// # Safety
///
/// `output`, `tag`, and `input` must be valid for `output_max`, `TAG_LEN`, and `input_len`
/// bytes respectively. `output` and `input` may fully overlap (in-place operation); `tag`
/// must not overlap with the `output` region.
#[expect(
    clippy::too_many_arguments,
    reason = "Thin wrapper over a 14-argument C function."
)]
unsafe fn aead_op(
    ctx: &Context,
    nonce_base: &[u8; NONCE_LEN],
    count: u64,
    aad: &[u8],
    output: *mut u8,
    output_max: usize,
    tag: *mut u8,
    input: *const u8,
    input_len: usize,
) -> Res<usize> {
    let mut nonce = xor_nonce(nonce_base, count);
    let mut out_len: c_int = 0;
    secstatus_to_res(unsafe {
        PK11_AEADOp(
            **ctx,
            CK_GENERATOR_FUNCTION::from(CKG_NO_GENERATE),
            c_int_len(NONCE_LEN - COUNTER_LEN)?,
            nonce.as_mut_ptr(),
            c_int_len(NONCE_LEN)?,
            aad.as_ptr(),
            c_int_len(aad.len())?,
            output,
            &raw mut out_len,
            c_int_len(output_max)?,
            tag,
            c_int_len(TAG_LEN)?,
            input,
            c_int_len(input_len)?,
        )
    })?;
    Ok(usize::try_from(out_len)?)
}

pub struct RecordProtection {
    ctx: Context,
    nonce_base: [u8; NONCE_LEN],
}

impl RecordProtection {
    /// Create a new AEAD instance.
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
        let (mech, key_len) = cipher_mech_and_key_len(cipher)?;
        let key = expand_label(
            version,
            cipher,
            secret,
            &format!("{prefix}key"),
            mech,
            key_len,
        )?;
        let nonce_base: [u8; NONCE_LEN] =
            expand_label_buf(version, cipher, secret, &format!("{prefix}iv"))?;
        let ctx = make_ctx(mech, mode.p11mode(), &key, &nonce_base)?;
        Ok(Self { ctx, nonce_base })
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
        let out_ptr = output.as_mut_ptr();
        let out_len = unsafe {
            aead_op(
                &self.ctx,
                &self.nonce_base,
                count,
                aad,
                out_ptr,
                input.len(),
                out_ptr.add(input.len()),
                input.as_ptr(),
                input.len(),
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
        let out_len = unsafe {
            aead_op(
                &self.ctx,
                &self.nonce_base,
                count,
                aad,
                data_ptr,
                pt_len,
                data_ptr.add(pt_len),
                data_ptr.cast_const(),
                pt_len,
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
        let out_len = unsafe {
            aead_op(
                &self.ctx,
                &self.nonce_base,
                count,
                aad,
                output.as_mut_ptr(),
                output.len(),
                tag.as_mut_ptr(),
                input.as_ptr(),
                ct_len,
            )
        }?;
        Ok(&output[..out_len])
    }

    fn decrypt_in_place(&self, count: u64, aad: &[u8], data: &mut [u8]) -> Res<usize> {
        let (ct_len, mut tag) = split_tag(data)?;
        let data_ptr = data.as_mut_ptr();
        let out_len = unsafe {
            aead_op(
                &self.ctx,
                &self.nonce_base,
                count,
                aad,
                data_ptr,
                data.len(),
                tag.as_mut_ptr(),
                data_ptr.cast_const(),
                ct_len,
            )
        }?;
        if out_len != ct_len {
            return Err(Error::Internal);
        }
        Ok(ct_len)
    }
}

impl fmt::Debug for RecordProtection {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[AEAD Context]")
    }
}

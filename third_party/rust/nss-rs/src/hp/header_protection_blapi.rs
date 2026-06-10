// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

// freebl backend for hp::Key: calls AES_Encrypt and ChaCha20_Xor directly,
// bypassing the PKCS#11 session layer.

use std::os::raw::c_uint;

use zeroize::ZeroizeOnDrop;

use super::SAMPLE_SIZE;
use crate::{
    aead::{AeadAlgorithms, expand_label_buf},
    constants::{Cipher, Version},
    err::{Res, secstatus_to_res},
    freebl,
    p11::SymKey,
};

#[expect(
    clippy::cast_possible_truncation,
    reason = "SAMPLE_SIZE = 16 fits in c_uint"
)]
const SAMPLE_LEN: c_uint = SAMPLE_SIZE as c_uint;

// blapi holds raw key bytes outside NSS-managed memory, so zero them on drop;
// the PKCS#11 backend relies on SymKey for this instead.
#[derive(ZeroizeOnDrop)]
pub enum Key {
    Aes128 {
        #[zeroize(skip)]
        ctx: freebl::AesCtx,
        key_bytes: [u8; 16],
    },
    Aes256 {
        #[zeroize(skip)]
        ctx: freebl::AesCtx,
        key_bytes: [u8; 32],
    },
    Chacha([u8; 32]),
}

impl Key {
    pub fn extract(version: Version, cipher: Cipher, prk: &SymKey, label: &str) -> Res<Self> {
        Ok(match AeadAlgorithms::try_from(cipher)? {
            AeadAlgorithms::Aes128Gcm => {
                // Named for aes_context; moves into Key (ZeroizeOnDrop), no Zeroizing needed.
                let key_bytes: [u8; 16] = expand_label_buf(version, cipher, prk, label)?;
                Self::Aes128 {
                    ctx: freebl::aes_context(&key_bytes, freebl::NSS_AES, true)?,
                    key_bytes,
                }
            }
            AeadAlgorithms::Aes256Gcm => {
                let key_bytes: [u8; 32] = expand_label_buf(version, cipher, prk, label)?;
                Self::Aes256 {
                    ctx: freebl::aes_context(&key_bytes, freebl::NSS_AES, true)?,
                    key_bytes,
                }
            }
            AeadAlgorithms::ChaCha20Poly1305 => {
                Self::Chacha(expand_label_buf(version, cipher, prk, label)?)
            }
        })
    }

    pub fn try_clone(&self) -> Res<Self> {
        Ok(match self {
            Self::Aes128 { key_bytes, .. } => Self::Aes128 {
                ctx: freebl::aes_context(key_bytes, freebl::NSS_AES, true)?,
                key_bytes: *key_bytes,
            },
            Self::Aes256 { key_bytes, .. } => Self::Aes256 {
                ctx: freebl::aes_context(key_bytes, freebl::NSS_AES, true)?,
                key_bytes: *key_bytes,
            },
            Self::Chacha(key_bytes) => Self::Chacha(*key_bytes),
        })
    }

    pub fn mask(&self, sample: &[u8; SAMPLE_SIZE]) -> Res<[u8; SAMPLE_SIZE]> {
        let mut output = [0u8; SAMPLE_SIZE];
        match self {
            // Both AES key sizes use the same ECB block operation for HP.
            Self::Aes128 { ctx, .. } | Self::Aes256 { ctx, .. } => {
                let mut output_len: c_uint = 0;
                // SAFETY: NSS guarantees that concurrent access to a context is safe.
                // For this case in particular, AES-ECB does not mutate the context and
                // no inter-call state is retained.
                secstatus_to_res(unsafe {
                    freebl::AES_Encrypt(
                        **ctx,
                        output.as_mut_ptr(),
                        &raw mut output_len,
                        SAMPLE_LEN,
                        sample.as_ptr(),
                        SAMPLE_LEN,
                    )
                })?;
                debug_assert_eq!(output_len as usize, output.len());
                Ok(output)
            }
            Self::Chacha(key_bytes) => {
                // RFC 9001 §5.4.4: counter = sample[0..4] as little-endian u32,
                // nonce = sample[4..16].
                // ChaCha20_Xor reads a 12-byte nonce implicitly; assert the coupling.
                const _: () = assert!(
                    SAMPLE_SIZE - 4 == 12,
                    "ChaCha20_Xor expects a 12-byte nonce"
                );
                let ctr = u32::from_le_bytes([sample[0], sample[1], sample[2], sample[3]]);
                let nonce = &sample[4..];
                let zeros = [0u8; SAMPLE_SIZE];
                secstatus_to_res(unsafe {
                    freebl::ChaCha20_Xor(
                        output.as_mut_ptr(),
                        zeros.as_ptr(),
                        SAMPLE_LEN,
                        key_bytes.as_ptr(),
                        nonce.as_ptr(),
                        ctr,
                    )
                })?;
                Ok(output)
            }
        }
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * This supports the now obsolete HTTP-ECE Draft 02 "aesgcm" content
 * type. There are a number of providers that still use this format,
 * and there's no real mechanism to return the client supported crypto
 * versions.
 *
 * */

//! Web Push encryption structure for the legacy AESGCM encoding scheme
//! ([Web Push Encryption Draft 4](https://tools.ietf.org/html/draft-ietf-webpush-encryption-04))
//!
//! This module is meant for advanced use. For simple encryption/decryption, use the top-level
//! [`encrypt_aesgcm`](crate::legacy::encrypt_aesgcm) and [`decrypt_aesgcm`](crate::legacy::decrypt_aesgcm)
//! functions.

use crate::{
    common::*,
    crypto::{self, Cryptographer, LocalKeyPair, RemotePublicKey},
    error::*,
};
use base64::Engine;
use byteorder::{BigEndian, ByteOrder};

pub(crate) const ECE_AESGCM_PAD_SIZE: usize = 2;

const ECE_WEBPUSH_AESGCM_KEYPAIR_LENGTH: usize = 134; // (2 + Raw Key Length) * 2
const ECE_WEBPUSH_AESGCM_AUTHINFO: &str = "Content-Encoding: auth\0";

// a DER prefixed key is "\04" + ECE_WEBPUSH_RAW_KEY_LENGTH
const ECE_WEBPUSH_RAW_KEY_LENGTH: usize = 65;
const ECE_WEBPUSH_IKM_LENGTH: usize = 32;

/// Struct representing the result of encrypting with the "aesgcm" scheme.
///
/// Since the "aesgcm" scheme needs to represent some data in HTTP headers and
/// other data in the encoded body, we need to represent it with a structure
/// rather than just with raw bytes.
///
pub struct AesGcmEncryptedBlock {
    pub(crate) dh: Vec<u8>,
    pub(crate) salt: Vec<u8>,
    pub(crate) rs: u32,
    pub(crate) ciphertext: Vec<u8>,
}

impl AesGcmEncryptedBlock {
    fn aesgcm_rs(rs: u32) -> u32 {
        if rs > u32::max_value() - ECE_TAG_LENGTH as u32 {
            return 0;
        }
        rs + ECE_TAG_LENGTH as u32
    }

    pub fn new(
        dh: &[u8],
        salt: &[u8],
        rs: u32,
        ciphertext: Vec<u8>,
    ) -> Result<AesGcmEncryptedBlock> {
        Ok(AesGcmEncryptedBlock {
            dh: dh.to_owned(),
            salt: salt.to_owned(),
            rs: Self::aesgcm_rs(rs),
            ciphertext,
        })
    }

    /// Return the headers Hash.
    /// If you're using VAPID, provide the `p256ecdsa` public key that signed the Json Web Token
    /// so it can be included in the `Crypto-Key` field.
    ///
    /// Disclaimer : You will need to manually add the Authorization field for VAPID containing the JSON Web Token
    pub fn headers(&self, vapid_public_key: Option<&[u8]>) -> Vec<(&'static str, String)> {
        let mut result = Vec::new();
        let mut rs = "".to_owned();
        let dh = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&self.dh);
        let crypto_key = match vapid_public_key {
            Some(public_key) => format!(
                "dh={}; p256ecdsa={}",
                dh,
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(public_key)
            ),
            None => format!("dh={}", dh),
        };
        result.push(("Crypto-Key", crypto_key));
        if self.rs > 0 {
            rs = format!(";rs={}", self.rs);
        }
        result.push((
            "Encryption",
            format!(
                "salt={}{}",
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&self.salt),
                rs
            ),
        ));
        result
    }

    /// Encode the body as a String.
    pub fn body(&self) -> String {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&self.ciphertext)
    }
}

/// Encrypts a Web Push message using the "aesgcm" scheme, with an explicit sender key.
///
/// It is the caller's responsibility to ensure that this function is used correctly,
/// where "correctly" means important cryptographic details like:
///
///    * use a new ephemeral local keypair for each encryption
///    * use a randomly-generated salt
///
pub(crate) fn encrypt(
    local_prv_key: &dyn LocalKeyPair,
    remote_pub_key: &dyn RemotePublicKey,
    auth_secret: &[u8],
    plaintext: &[u8],
    mut params: WebPushParams,
) -> Result<AesGcmEncryptedBlock> {
    // Check parameters, including doing the random salt thing.
    // Probably could move into the WebPushParams struct?
    let cryptographer = crypto::holder::get_cryptographer();

    if plaintext.is_empty() {
        return Err(Error::ZeroPlaintext);
    }

    let salt = params.take_or_generate_salt(cryptographer)?;
    let (key, nonce) = derive_key_and_nonce(
        cryptographer,
        EceMode::Encrypt,
        local_prv_key,
        remote_pub_key,
        auth_secret,
        &salt,
    )?;

    // Each record must contain at least some padding, for recording the padding size.
    let pad_length = std::cmp::max(params.pad_length, ECE_AESGCM_PAD_SIZE);

    // For this legacy scheme, we only support encrypting a single record.
    // The record size in this scheme is the size of the plaintext plus padding,
    // and the scheme requires that the final block be of a size less than `rs`.
    if plaintext.len() + pad_length >= params.rs as usize {
        return Err(Error::PlaintextTooLong);
    }

    // Pad out the plaintext.
    // The first two bytes of padding are big-endian padding length,
    // followed by the rest of the padding as zero bytes,
    // followed by the plaintext.
    let mut padded_plaintext = vec![0; pad_length + plaintext.len()];
    BigEndian::write_u16(
        &mut padded_plaintext,
        (pad_length - ECE_AESGCM_PAD_SIZE) as u16,
    );
    padded_plaintext[pad_length..].copy_from_slice(plaintext);

    // Now we can encrypt it.
    let iv = generate_iv_for_record(&nonce, 0);
    let cryptographer = crypto::holder::get_cryptographer();
    let ciphertext = cryptographer.aes_gcm_128_encrypt(&key, &iv, &padded_plaintext)?;

    // Encapsulate the crypto parameters in headers to return to caller.
    let raw_local_pub_key = local_prv_key.pub_as_raw()?;
    Ok(AesGcmEncryptedBlock {
        salt,
        dh: raw_local_pub_key,
        rs: params.rs,
        ciphertext,
    })
}

/// Decrypts a Web Push message encrypted using the "aesgcm" scheme.
///
pub(crate) fn decrypt(
    local_prv_key: &dyn LocalKeyPair,
    auth_secret: &[u8],
    block: &AesGcmEncryptedBlock,
) -> Result<Vec<u8>> {
    let cryptographer = crypto::holder::get_cryptographer();

    let sender_key = cryptographer.import_public_key(&block.dh)?;

    let (key, nonce) = derive_key_and_nonce(
        cryptographer,
        EceMode::Decrypt,
        local_prv_key,
        &*sender_key,
        auth_secret,
        block.salt.as_ref(),
    )?;

    // We only support receipt of a single record for this legacy scheme.
    // Recall that the final block must be strictly less than `rs` in size.
    if block.ciphertext.len() - ECE_TAG_LENGTH >= block.rs as usize {
        return Err(Error::MultipleRecordsNotSupported);
    }
    if block.ciphertext.len() <= ECE_TAG_LENGTH + ECE_AESGCM_PAD_SIZE {
        return Err(Error::BlockTooShort);
    }

    let iv = generate_iv_for_record(&nonce, 0);
    let padded_plaintext = cryptographer.aes_gcm_128_decrypt(&key, &iv, &block.ciphertext)?;

    // The first two bytes are a big-endian u16 padding size,
    // then that many zero bytes,
    // then the plaintext.
    let num_padding_bytes =
        (((padded_plaintext[0] as u16) << 8) | padded_plaintext[1] as u16) as usize;
    if num_padding_bytes + 2 >= padded_plaintext.len() {
        return Err(Error::DecryptPadding);
    }
    if padded_plaintext[2..(2 + num_padding_bytes)]
        .iter()
        .any(|b| *b != 0u8)
    {
        return Err(Error::DecryptPadding);
    }

    Ok(padded_plaintext[(2 + num_padding_bytes)..].to_owned())
}

/// Derives the "aesgcm" decryption key and nonce given the receiver private
/// key, sender public key, authentication secret, and sender salt.
fn derive_key_and_nonce(
    cryptographer: &dyn Cryptographer,
    ece_mode: EceMode,
    local_prv_key: &dyn LocalKeyPair,
    remote_pub_key: &dyn RemotePublicKey,
    auth_secret: &[u8],
    salt: &[u8],
) -> Result<KeyAndNonce> {
    if auth_secret.len() != ECE_WEBPUSH_AUTH_SECRET_LENGTH {
        return Err(Error::InvalidAuthSecret);
    }
    if salt.len() != ECE_SALT_LENGTH {
        return Err(Error::InvalidSalt);
    }

    let shared_secret = cryptographer.compute_ecdh_secret(remote_pub_key, local_prv_key)?;
    let raw_remote_pub_key = remote_pub_key.as_raw()?;
    let raw_local_pub_key = local_prv_key.pub_as_raw()?;

    let keypair = match ece_mode {
        EceMode::Encrypt => encode_keys(&raw_remote_pub_key, &raw_local_pub_key),
        EceMode::Decrypt => encode_keys(&raw_local_pub_key, &raw_remote_pub_key),
    }?;
    let keyinfo = generate_info("aesgcm", &keypair)?;
    let nonceinfo = generate_info("nonce", &keypair)?;
    let ikm = cryptographer.hkdf_sha256(
        auth_secret,
        &shared_secret,
        ECE_WEBPUSH_AESGCM_AUTHINFO.as_bytes(),
        ECE_WEBPUSH_IKM_LENGTH,
    )?;
    let key = cryptographer.hkdf_sha256(salt, &ikm, &keyinfo, ECE_AES_KEY_LENGTH)?;
    let nonce = cryptographer.hkdf_sha256(salt, &ikm, &nonceinfo, ECE_NONCE_LENGTH)?;
    Ok((key, nonce))
}

// Encode the input keys for inclusion in key-derivation info string.
fn encode_keys(raw_key1: &[u8], raw_key2: &[u8]) -> Result<Vec<u8>> {
    let mut combined = vec![0u8; ECE_WEBPUSH_AESGCM_KEYPAIR_LENGTH];

    if raw_key1.len() > ECE_WEBPUSH_RAW_KEY_LENGTH || raw_key2.len() > ECE_WEBPUSH_RAW_KEY_LENGTH {
        return Err(Error::InvalidKeyLength);
    }
    // length prefix each key
    combined[0] = 0;
    combined[1] = 65;
    combined[2..67].copy_from_slice(raw_key1);
    combined[67] = 0;
    combined[68] = 65;
    combined[69..].copy_from_slice(raw_key2);
    Ok(combined)
}

// The "aesgcm" IKM info string is "WebPush: info", followed by the
// receiver and sender public keys prefixed by their lengths.
fn generate_info(encoding: &str, keypair: &[u8]) -> Result<Vec<u8>> {
    let info_str = format!("Content-Encoding: {}\0P-256\0", encoding);
    let offset = info_str.len();
    let mut info = vec![0u8; offset + keypair.len()];
    info[0..offset].copy_from_slice(info_str.as_bytes());
    info[offset..offset + ECE_WEBPUSH_AESGCM_KEYPAIR_LENGTH].copy_from_slice(keypair);
    Ok(info)
}

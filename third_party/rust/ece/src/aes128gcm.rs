/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Web Push encryption using the AES128GCM encoding scheme ([RFC8591](https://tools.ietf.org/html/rfc8291)).
//!
//! This module is meant for advanced use. For simple encryption/decryption, use the crate's top-level
//! [`encrypt`](crate::encrypt) and [`decrypt`](crate::decrypt) functions.

use crate::{
    common::*,
    crypto::{self, LocalKeyPair, RemotePublicKey},
    error::*,
    Cryptographer,
};
use byteorder::{BigEndian, ByteOrder};

// Each record has a 16 byte authentication tag and 1 padding delimiter byte.
// Thus, a record size of less than 18 could never store any plaintext.
const ECE_AES128GCM_MIN_RS: u32 = 18;
const ECE_AES128GCM_HEADER_LENGTH: usize = 21;
pub(crate) const ECE_AES128GCM_PAD_SIZE: usize = 1;

const ECE_WEBPUSH_AES128GCM_IKM_INFO_PREFIX: &str = "WebPush: info\0";
const ECE_WEBPUSH_AES128GCM_IKM_INFO_LENGTH: usize = 144; // 14 (prefix len) + 65 (pub key len) * 2;

const ECE_WEBPUSH_IKM_LENGTH: usize = 32;
const ECE_AES128GCM_KEY_INFO: &str = "Content-Encoding: aes128gcm\0";
const ECE_AES128GCM_NONCE_INFO: &str = "Content-Encoding: nonce\0";

/// Encrypts a Web Push message using the "aes128gcm" scheme, with an explicit sender key.
///
/// It is the caller's responsibility to ensure that this function is used correctly,
/// where "correctly" means important cryptographic details like:
///
///    * use a new ephemeral local keypair for each encryption
///    * use a randomly-generated salt
///
/// In general-purpose AES128GM ECE, the "keyid" field in the header may be up to 255 octects
/// and provides a string that allows the application to find the right key material in some
/// application-defined way. We only currently support the specific scheme used by WebPush, where
/// the "keyid" is an ephemeral ECDH public key and always has a fixed length.
///
pub(crate) fn encrypt(
    local_prv_key: &dyn LocalKeyPair,
    remote_pub_key: &dyn RemotePublicKey,
    auth_secret: &[u8],
    plaintext: &[u8],
    mut params: WebPushParams,
) -> Result<Vec<u8>> {
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

    // Encode the ephemeral public key in the "kid" header field.
    let keyid = local_prv_key.pub_as_raw()?;
    if keyid.len() != ECE_WEBPUSH_PUBLIC_KEY_LENGTH {
        return Err(Error::InvalidKeyLength);
    }

    let header = Header {
        salt: &salt,
        rs: params.rs,
        keyid: &keyid,
    };

    let records = split_into_records(plaintext, params.pad_length, params.rs as usize)?;

    let mut ciphertext = vec![0; header.encoded_size() + records.total_ciphertext_size()];
    let mut offset = 0;

    offset += header.write_into(&mut ciphertext);
    for record in records {
        offset += record.encrypt_into(cryptographer, &key, &nonce, &mut ciphertext[offset..])?;
    }
    assert!(offset == ciphertext.len());

    Ok(ciphertext)
}

/// Decrypts a Web Push message encrypted using the "aes128gcm" scheme.
///
pub(crate) fn decrypt(
    local_prv_key: &dyn LocalKeyPair,
    auth_secret: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>> {
    let cryptographer = crypto::holder::get_cryptographer();
    if ciphertext.is_empty() {
        return Err(Error::ZeroCiphertext);
    }

    // Buffer into which to write the output.
    // This will avoid any reallocations because plaintext will always be smaller than ciphertext.
    // We could calculate a tighter bound if memory usage is an issue in future.
    let mut output = Vec::<u8>::with_capacity(ciphertext.len());

    let header = Header::read_from(ciphertext)?;
    if ciphertext.len() == header.encoded_size() {
        return Err(Error::ZeroCiphertext);
    }

    // The `keyid` field must contain the serialized ephemeral public key.
    if header.keyid.len() != ECE_WEBPUSH_PUBLIC_KEY_LENGTH {
        return Err(Error::InvalidKeyLength);
    }
    let remote_pub_key = cryptographer.import_public_key(header.keyid)?;

    let (key, nonce) = derive_key_and_nonce(
        cryptographer,
        EceMode::Decrypt,
        local_prv_key,
        &*remote_pub_key,
        auth_secret,
        header.salt,
    )?;

    // We'll re-use this buffer as scratch space for decrypting each record.
    // This is nice for memory usage, but actually the main motivation is to have the decryption
    // output a `PlaintextRecord` struct, which holds a borrowed slice of plaintext.
    // TODO: pre-allocate the final output buffer, and let `decrypt_from` write directly into it.
    let mut plaintext_buffer = vec![0u8; (header.rs as usize) - ECE_TAG_LENGTH];

    let records = ciphertext[header.encoded_size()..].chunks(header.rs as usize);

    let mut seen_final_record = false;
    for (sequence_number, ciphertext) in records.enumerate() {
        // The record marked as final must actually be the final record.
        // We check this inline in the loop because the loop consumes ownership of `records`,
        // which means we can't do a separate "did we consume all the records?" check after loop termination.
        // There's probably a way, but I didn't find it.
        if seen_final_record {
            return Err(Error::DecryptPadding);
        }
        let record = PlaintextRecord::decrypt_from(
            cryptographer,
            &key,
            &nonce,
            sequence_number,
            ciphertext,
            plaintext_buffer.as_mut_slice(),
        )?;
        if record.is_final {
            seen_final_record = true;
        }
        output.extend(record.plaintext)
    }
    if !seen_final_record {
        return Err(Error::DecryptTruncated);
    }

    Ok(output)
}

/// Encapsulates header data for aes128gcm encryption scheme.
///
/// The header is always written at the start of the encrypted data, like so:
///
/// ```txt
///    +-----------+--------+-----------+---------------+
///    | salt (16) | rs (4) | idlen (1) | keyid (idlen) |
///    +-----------+--------+-----------+---------------+
/// ```
///
/// To avoid copying data when parsing, this struct stores references to its
/// field, borrowed from the underlying data.
///
pub(crate) struct Header<'a> {
    salt: &'a [u8],
    rs: u32,
    keyid: &'a [u8],
}

impl<'a> Header<'a> {
    /// Read a `Header` from the data at the start of the given input buffer.
    ///
    fn read_from(input: &'a [u8]) -> Result<Header<'a>> {
        if input.len() < ECE_AES128GCM_HEADER_LENGTH {
            return Err(Error::HeaderTooShort);
        }

        let keyid_len = input[ECE_AES128GCM_HEADER_LENGTH - 1] as usize;
        if input.len() < ECE_AES128GCM_HEADER_LENGTH + keyid_len {
            return Err(Error::HeaderTooShort);
        }

        let salt = &input[0..ECE_SALT_LENGTH];
        let rs = BigEndian::read_u32(&input[ECE_SALT_LENGTH..]);
        if rs < ECE_AES128GCM_MIN_RS {
            return Err(Error::InvalidRecordSize);
        }
        let keyid = &input[ECE_AES128GCM_HEADER_LENGTH..ECE_AES128GCM_HEADER_LENGTH + keyid_len];

        Ok(Header { salt, rs, keyid })
    }

    /// Write this `Header` at the start of the given output buffer.
    ///
    /// This assumes that the buffer has sufficient space for the data, and will
    /// panic (via Rust's runtime safety checks) if it does not.
    ///
    /// Returns the number of bytes written.
    ///
    pub fn write_into(&self, output: &mut [u8]) -> usize {
        output[0..ECE_SALT_LENGTH].copy_from_slice(self.salt);
        BigEndian::write_u32(&mut output[ECE_SALT_LENGTH..], self.rs);
        output[ECE_AES128GCM_HEADER_LENGTH - 1] = self.keyid.len() as u8;
        output[ECE_AES128GCM_HEADER_LENGTH..ECE_AES128GCM_HEADER_LENGTH + self.keyid.len()]
            .copy_from_slice(self.keyid);
        self.encoded_size()
    }

    /// Get the size occupied by this header when written to the encrypted data.
    ///
    pub fn encoded_size(&self) -> usize {
        ECE_AES128GCM_HEADER_LENGTH + self.keyid.len()
    }
}

/// Struct representing an individual plaintext record.
///
/// The encryption process splits up the input plaintext to fixed-size records,
/// each of which is encrypted independently. This struct encapsulates all the
/// data about a particular record. This diagram from the RFC may help you to
/// visualize how this data gets encrypted:
///
/// ```txt
///   +-----------+             content
///   |   data    |             any length up to rs-17 octets
///   +-----------+
///        |
///        v
///   +-----------+-----+       add a delimiter octet (0x01 or 0x02)
///   |   data    | pad |       then 0x00-valued octets to rs-16
///   +-----------+-----+       (or less on the last record)
///            |
///            v
///   +--------------------+    encrypt with AEAD_AES_128_GCM;
///   |    ciphertext      |    final size is rs;
///   +--------------------+    the last record can be smaller
/// ```
///
/// To avoid copying data when chunking a plaintext into multiple records, this struct
/// stores a reference to its portion of the plaintext, borrowed from the underlying data.
///
struct PlaintextRecord<'a> {
    /// The plaintext, to go at the start of the record.
    plaintext: &'a [u8],
    /// The amount of padding to be added to the end of the record.
    /// Always >= 1 in practice, because the first byte of padding is a delimiter.
    padding: usize,
    /// The position of this record in the overall sequence of records for some data.
    sequence_number: usize,
    /// Whether this is the final record in the data.
    is_final: bool,
}

impl<'a> PlaintextRecord<'a> {
    /// Decrypt a single record from the given ciphertext, into its corresponding plaintext.
    ///
    /// The caller must provide a buffer with sufficient space to store the decrypted plaintext,
    /// and this method will panic (via Rust's runtime safety checks) if there is insufficient
    /// space available.
    ///
    pub(crate) fn decrypt_from(
        cryptographer: &dyn Cryptographer,
        key: &[u8],
        nonce: &[u8],
        sequence_number: usize,
        ciphertext: &[u8],
        plaintext_buffer: &'a mut [u8],
    ) -> Result<Self> {
        if ciphertext.len() <= ECE_TAG_LENGTH {
            return Err(Error::BlockTooShort);
        }
        let iv = generate_iv_for_record(nonce, sequence_number);
        // It would be nice if we could decrypt directly into `plaintext_buffer` here,
        // but that will require some refactoring in the crypto backend.
        let padded_plaintext = cryptographer.aes_gcm_128_decrypt(key, &iv, ciphertext)?;
        // Scan backwards for the first non-zero byte from the end of the data, which delimits the padding.
        let padding_delimiter_idx = padded_plaintext
            .iter()
            .rposition(|&b| b != 0u8)
            .ok_or(Error::DecryptPadding)?;
        // The padding delimiter tells is whether this is the final record.
        let is_final = match padded_plaintext[padding_delimiter_idx] {
            1 => false,
            2 => true,
            _ => return Err(Error::DecryptPadding),
        };
        // Everything before the padding delimiter is the plaintext.
        plaintext_buffer[0..padding_delimiter_idx]
            .copy_from_slice(&padded_plaintext[0..padding_delimiter_idx]);
        // That's it!
        Ok(PlaintextRecord {
            plaintext: &plaintext_buffer[0..padding_delimiter_idx],
            padding: padded_plaintext.len() - padding_delimiter_idx,
            sequence_number,
            is_final,
        })
    }

    /// Encrypt this record into the given output buffer.
    ///
    /// The caller must provide a buffer with sufficient space to store the encrypted data,
    /// and this method will panic (via Rust's runtime safety checks) if there is insufficient
    /// space available.
    ///
    /// Returns the number of bytes written.
    ///
    pub(crate) fn encrypt_into(
        &self,
        cryptographer: &dyn Cryptographer,
        key: &[u8],
        nonce: &[u8],
        output: &mut [u8],
    ) -> Result<usize> {
        // We're going to use the output buffer as scratch space for padding the plaintext.
        // Since the ciphertext is always longer than the plaintext, there will definitely
        // be enough space.
        let padded_plaintext_len = self.plaintext.len() + self.padding;
        // Plaintext goes at the start of the buffer.
        output[0..self.plaintext.len()].copy_from_slice(self.plaintext);
        // The first byte of padding is always the delimiter.
        assert!(self.padding >= 1);
        output[self.plaintext.len()] = if self.is_final { 2 } else { 1 };
        // And the rest of the padding is all zeroes.
        output[self.plaintext.len() + 1..padded_plaintext_len].fill(0);
        // Now we can encrypt!
        let iv = generate_iv_for_record(nonce, self.sequence_number);
        let ciphertext =
            cryptographer.aes_gcm_128_encrypt(key, &iv, &output[0..padded_plaintext_len])?;
        output[0..ciphertext.len()].copy_from_slice(&ciphertext);
        Ok(ciphertext.len())
    }
}

/// Iterator returning record-sized chunks of plaintext + padding.
///
/// Given a plaintext, an amount of padding data to add, and a target encrypted record
/// size, this function returns an iterator of `PlaintextRecord` structs such that:
///
///    * The encrypted size of each plaintext chunk plus its padding will be equal
///      to the given record size, except for the final record which may be shorter.
///
///    * Each record has at least one padding byte; if necessary, additional padding
///      bytes will be inserted beyond what was requested by the caller in order
///      to meet this requirement. (This ensures each record has enough room for the
///      padding delimiter byte).
///
///    * The plaintext is distributed as evenly as possible between records. Records
///      consisting entirely of padding will only be produced in degenerate cases such
///      as where the caller requested far more padding than available plaintext, or
///      where the requested total size falls just beyond a record boundary.
///
fn split_into_records(
    plaintext: &[u8],
    pad_length: usize,
    rs: usize,
) -> Result<PlaintextRecordIterator<'_>> {
    // Adjust for encryption overhead.
    if rs < ECE_AES128GCM_MIN_RS as usize {
        return Err(Error::InvalidRecordSize);
    }
    let rs = rs - ECE_TAG_LENGTH;
    // Ensure we have enough padding to give at least one byte of it to each record.
    // This is the only reason why we might expand the padding beyond what was requested.
    let mut min_num_records = plaintext.len() / (rs - 1);
    if plaintext.len() % (rs - 1) != 0 {
        min_num_records += 1;
    }
    let pad_length = std::cmp::max(pad_length, min_num_records);
    // Knowing the total data size, determines the number of records.
    let total_size = plaintext.len() + pad_length;
    let mut num_records = total_size / rs;
    let size_of_final_record = total_size % rs;
    if size_of_final_record > 0 {
        num_records += 1;
    }
    assert!(
        num_records >= min_num_records,
        "record chunking error: we miscalculated the minimum number of records ({} < {})",
        num_records,
        min_num_records,
    );
    // Evenly distribute the plaintext between that many records.
    // There may of course be some leftover that won't distribute evenly.
    let plaintext_per_record = plaintext.len() / num_records;
    let mut extra_plaintext = plaintext.len() % num_records;
    // If the final record is very small, we might not be able to fit
    // the recommended number of plaintext bytes, so redistribute them.
    // (Remember, the final block must contain at least one padding byte).
    if size_of_final_record > 0 && plaintext_per_record > size_of_final_record - 1 {
        extra_plaintext += plaintext_per_record - (size_of_final_record - 1)
    }
    // And now we can iterate!
    Ok(PlaintextRecordIterator {
        plaintext,
        pad_length,
        plaintext_per_record,
        extra_plaintext,
        rs,
        sequence_number: 0,
        num_records,
        total_size,
    })
}

/// The underlying iterator implementation for `split_into_records`.
///
struct PlaintextRecordIterator<'a> {
    /// The plaintext that remains to be split.
    plaintext: &'a [u8],
    /// The amount of padding that remains to be split.
    pad_length: usize,
    /// The amount of plaintext to put in each record.
    plaintext_per_record: usize,
    /// The amount of leftover plaintext that could not be distributed evenly.
    extra_plaintext: usize,
    /// The total number of bytes that will be produced by this iterator.
    total_size: usize,
    /// The target unencrypted record size.
    rs: usize,
    /// The total number of records that will be produced.
    num_records: usize,
    /// The sequence number of the next record to be produced.
    sequence_number: usize,
}

impl<'a> PlaintextRecordIterator<'a> {
    pub(crate) fn total_ciphertext_size(&self) -> usize {
        self.total_size + self.num_records * ECE_TAG_LENGTH
    }
}

impl<'a> Iterator for PlaintextRecordIterator<'a> {
    type Item = PlaintextRecord<'a>;
    fn next(&mut self) -> Option<Self::Item> {
        let records_remaining = self.num_records - self.sequence_number;
        // We stop iterating when we've produced all records.
        if records_remaining == 0 {
            assert!(
                self.plaintext.is_empty(),
                "record chunking error: the plaintext was not fully consumed"
            );
            assert!(
                self.extra_plaintext == 0,
                "record chunking error: the extra plaintext was not fully consumed"
            );
            assert!(
                self.pad_length == 0,
                "record chunking error: the padding was not fully consumed"
            );
            return None;
        }
        // Allocate a chunk of plaintext to this record.
        // We target `plaintext_per_record` bytes per record, but it's a little
        // more complicated than that...
        let mut plaintext_share = self.plaintext_per_record;
        if plaintext_share > self.plaintext.len() {
            // ...because the final record is allowed to be smaller.
            assert!(
                records_remaining == 1,
                "record chunking error: the plaintext was consumed too early"
            );
            plaintext_share = self.plaintext.len();
        } else {
            // ...because non-final records need to consume any extra plaintext.
            if self.extra_plaintext > 0 {
                // The extra plaintext must be distributed as evenly as possible
                // amongst all but the final record.
                let mut extra_share = self.extra_plaintext / (records_remaining - 1);
                if self.extra_plaintext % (records_remaining - 1) != 0 {
                    extra_share += 1;
                }
                plaintext_share += extra_share;
                self.extra_plaintext -= extra_share;
            }
        }
        let plaintext = &self.plaintext[0..plaintext_share];
        self.plaintext = &self.plaintext[plaintext_share..];
        // Fill the rest of the record with padding.
        let padding_share = std::cmp::min(self.pad_length, self.rs - plaintext_share);
        self.pad_length -= padding_share;
        assert!(
            padding_share > 0,
            "record chunking error: the padding was consumed too early"
        );
        // Check where we are in the iteration.
        let sequence_number = self.sequence_number;
        self.sequence_number += 1;
        let is_final = self.sequence_number == self.num_records;
        assert!(
            is_final || plaintext.len() + padding_share == self.rs,
            "record chunking error: non-final record is too short"
        );
        // That's a record!
        Some(PlaintextRecord {
            plaintext,
            padding: padding_share,
            sequence_number,
            is_final,
        })
    }
}

/// Derives the "aes128gcm" decryption key and nonce given the receiver private
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

    // The "aes128gcm" scheme includes the sender and receiver public keys in
    // the info string when deriving the Web Push IKM.
    let ikm_info = match ece_mode {
        EceMode::Encrypt => generate_info(&raw_remote_pub_key, &raw_local_pub_key),
        EceMode::Decrypt => generate_info(&raw_local_pub_key, &raw_remote_pub_key),
    }?;
    let ikm = cryptographer.hkdf_sha256(
        auth_secret,
        &shared_secret,
        &ikm_info,
        ECE_WEBPUSH_IKM_LENGTH,
    )?;
    let key = cryptographer.hkdf_sha256(
        salt,
        &ikm,
        ECE_AES128GCM_KEY_INFO.as_bytes(),
        ECE_AES_KEY_LENGTH,
    )?;
    let nonce = cryptographer.hkdf_sha256(
        salt,
        &ikm,
        ECE_AES128GCM_NONCE_INFO.as_bytes(),
        ECE_NONCE_LENGTH,
    )?;
    Ok((key, nonce))
}

// The "aes128gcm" IKM info string is "WebPush: info\0", followed by the
// receiver and sender public keys.
fn generate_info(
    raw_recv_pub_key: &[u8],
    raw_sender_pub_key: &[u8],
) -> Result<[u8; ECE_WEBPUSH_AES128GCM_IKM_INFO_LENGTH]> {
    let mut info = [0u8; ECE_WEBPUSH_AES128GCM_IKM_INFO_LENGTH];
    let prefix = ECE_WEBPUSH_AES128GCM_IKM_INFO_PREFIX.as_bytes();
    let mut offset = prefix.len();
    info[0..offset].copy_from_slice(prefix);
    info[offset..offset + ECE_WEBPUSH_PUBLIC_KEY_LENGTH].copy_from_slice(raw_recv_pub_key);
    offset += ECE_WEBPUSH_PUBLIC_KEY_LENGTH;
    info[offset..].copy_from_slice(raw_sender_pub_key);
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_into_records_17_0_20() {
        let records = split_into_records(&[0u8; 17], 0, 20 + ECE_TAG_LENGTH)
            .unwrap()
            .collect::<Vec<_>>();
        // Should fit comfortably into a single record.
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].plaintext.len(), 17);
        assert_eq!(records[0].padding, 1);
        assert_eq!(records[0].sequence_number, 0);
        assert!(records[0].is_final);
    }

    #[test]
    fn test_split_into_records_15_0_6() {
        let records = split_into_records(&[0u8; 15], 0, 6 + ECE_TAG_LENGTH)
            .unwrap()
            .collect::<Vec<_>>();
        // Should fit exactly across three records.
        assert_eq!(records.len(), 3);

        assert_eq!(records[0].plaintext.len(), 5);
        assert_eq!(records[0].padding, 1);
        assert_eq!(records[0].sequence_number, 0);
        assert!(!records[0].is_final);

        assert_eq!(records[1].plaintext.len(), 5);
        assert_eq!(records[1].padding, 1);
        assert_eq!(records[1].sequence_number, 1);
        assert!(!records[1].is_final);

        assert_eq!(records[2].plaintext.len(), 5);
        assert_eq!(records[2].padding, 1);
        assert_eq!(records[2].sequence_number, 2);
        assert!(records[2].is_final);
    }

    fn split_and_summarize(payload_len: usize, padding: usize, rs: usize) -> Vec<(usize, usize)> {
        split_into_records(&vec![0u8; payload_len], padding, rs + ECE_TAG_LENGTH)
            .unwrap()
            .map(|record| (record.plaintext.len(), record.padding))
            .collect()
    }

    #[test]
    fn test_split_into_records_8_2_3() {
        // Should expand to 4 bytes of padding, then return 4 equal records
        // with two bytes of plaintext and one byte of padding.
        assert_eq!(
            split_and_summarize(8, 2, 3),
            vec![(2, 1), (2, 1), (2, 1), (2, 1)]
        );
    }

    #[test]
    fn test_split_into_records_8_0_8() {
        // Should expand to 2 bytes of padding, 2 records.
        // The last record is only size 2, so can only fit 1 plaintext byte.
        assert_eq!(split_and_summarize(8, 0, 8), vec![(7, 1), (1, 1)]);
    }

    #[test]
    fn test_split_into_records_24_6_8() {
        // Total length of 30, 4 records.
        // Ideally we'd have 6 bytes of plaintext in each, but the final record
        // is only length 6 so it can't hold more than 5 bytes of plaintext.
        assert_eq!(
            split_and_summarize(24, 6, 8),
            vec![(7, 1), (6, 2), (6, 2), (5, 1)]
        );
    }

    #[test]
    fn test_split_into_records_8_6_3() {
        // Total length 14, 4 records, the last only 2 bytes long.
        // But we can still spread the plaintext so that there's some in each record.
        assert_eq!(
            split_and_summarize(8, 6, 3),
            vec![(2, 1), (2, 1), (2, 1), (1, 2), (1, 1)]
        );
    }

    #[test]
    fn test_split_into_records_3_25_8() {
        // Total length of 28, meaning 4 records.
        // One of the records will have to be only padding.
        assert_eq!(
            split_and_summarize(3, 25, 8),
            vec![(1, 7), (1, 7), (1, 7), (0, 4)]
        );
    }

    #[test]
    fn test_split_into_records_3_35_8() {
        // Total length of 38, meaning 5 records.
        // Two of the records will have to be only padding.
        assert_eq!(
            split_and_summarize(3, 35, 8),
            vec![(1, 7), (1, 7), (1, 7), (0, 8), (0, 6)]
        );
    }

    #[test]
    fn test_split_into_records_19_6_8() {
        // Total length of 25, 4 records with the final record being only a single byte.
        // It therefore can only be padding.
        assert_eq!(
            split_and_summarize(19, 6, 8),
            vec![(7, 1), (6, 2), (6, 2), (0, 1)]
        );
    }
}

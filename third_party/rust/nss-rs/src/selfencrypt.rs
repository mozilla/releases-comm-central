// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{fmt::Write as _, io::Write as _, mem};

use log::{info, trace};

use crate::{
    RecordProtection,
    constants::{Cipher, Version},
    err::{Error, Res},
    hkdf,
    p11::{SymKey, random},
};

#[must_use]
pub fn hex<A: AsRef<[u8]>>(buf: A) -> String {
    let mut ret = String::with_capacity(buf.as_ref().len() * 2);
    for b in buf.as_ref() {
        write!(&mut ret, "{b:02x}").expect("write OK");
    }
    ret
}

#[derive(Debug)]
pub struct SelfEncrypt {
    version: Version,
    cipher: Cipher,
    key_id: u8,
    key: SymKey,
    old_key: Option<SymKey>,
}

impl SelfEncrypt {
    const VERSION: u8 = 1;
    const SALT_LENGTH: usize = 16;

    /// # Errors
    ///
    /// Failure to generate a new HKDF key using NSS results in an error.
    pub fn new(version: Version, cipher: Cipher) -> Res<Self> {
        let key = hkdf::generate_key(version, cipher)?;
        Ok(Self {
            version,
            cipher,
            key_id: 0,
            key,
            old_key: None,
        })
    }

    fn make_aead(&self, k: &SymKey, salt: &[u8]) -> Res<RecordProtection> {
        debug_assert_eq!(salt.len(), Self::SALT_LENGTH);
        let salt = hkdf::import_key(self.version, salt)?;
        let secret = hkdf::extract(self.version, self.cipher, Some(&salt), k)?;
        RecordProtection::new(self.version, self.cipher, &secret, "neqo self")
    }

    /// Rotate keys.  This causes any previous key that is being held to be replaced by the current
    /// key.
    ///
    /// # Errors
    ///
    /// Failure to generate a new HKDF key using NSS results in an error.
    pub fn rotate(&mut self) -> Res<()> {
        let new_key = hkdf::generate_key(self.version, self.cipher)?;
        self.old_key = Some(mem::replace(&mut self.key, new_key));
        let (kid, _) = self.key_id.overflowing_add(1);
        self.key_id = kid;
        info!("[SelfEncrypt] Rotated keys to {}", self.key_id);
        Ok(())
    }

    /// Seal an item using the underlying key.  This produces a single buffer that contains
    /// the encrypted `plaintext`, plus a version number and salt.
    /// `aad` is only used as input to the AEAD, it is not included in the output; the
    /// caller is responsible for carrying the AAD as appropriate.
    ///
    /// # Errors
    ///
    /// Failure to protect using NSS AEAD APIs produces an error.
    pub fn seal(&self, aad: &[u8], plaintext: &[u8]) -> Res<Vec<u8>> {
        // Format is:
        // struct {
        //   uint8 version;
        //   uint8 key_id;
        //   uint8 salt[16];
        //   opaque aead_encrypted(plaintext)[length as expanded];
        // };
        // AAD covers the entire header, plus the value of the AAD parameter that is provided.
        let salt = random::<{ Self::SALT_LENGTH }>();
        let cipher = self.make_aead(&self.key, &salt)?;
        let encoded_len = 2 + salt.len() + plaintext.len() + cipher.expansion();

        let mut enc = Vec::<u8>::with_capacity(encoded_len);
        enc.write_all(&[Self::VERSION])
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));
        enc.write_all(&[self.key_id])
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));
        enc.write_all(&salt)
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));

        let mut extended_aad = enc.clone();
        extended_aad
            .write_all(aad)
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));

        let offset = enc.len();
        let mut output: Vec<u8> = enc;
        output.resize(encoded_len, 0);
        cipher.encrypt(0, extended_aad.as_ref(), plaintext, &mut output[offset..])?;
        trace!(
            "[SelfEncrypt] seal {} {} -> {}",
            hex(aad),
            hex(plaintext),
            hex(&output)
        );
        Ok(output)
    }

    const fn select_key(&self, kid: u8) -> Option<&SymKey> {
        if kid == self.key_id {
            Some(&self.key)
        } else {
            let (prev_key_id, _) = self.key_id.overflowing_sub(1);
            if kid == prev_key_id {
                self.old_key.as_ref()
            } else {
                None
            }
        }
    }

    /// Open the protected `ciphertext`.
    ///
    /// # Errors
    ///
    /// Returns an error when the self-encrypted object is invalid;
    /// when the keys have been rotated; or when NSS fails.
    #[expect(clippy::similar_names, reason = "aad is similar to aead.")]
    pub fn open(&self, aad: &[u8], ciphertext: &[u8]) -> Res<Vec<u8>> {
        const OFFSET: usize = 2 + SelfEncrypt::SALT_LENGTH;
        if *ciphertext.first().ok_or(Error::SelfEncrypt)? != Self::VERSION {
            return Err(Error::SelfEncrypt);
        }
        let Some(key) = self.select_key(*ciphertext.get(1).ok_or(Error::SelfEncrypt)?) else {
            return Err(Error::SelfEncrypt);
        };
        let salt = ciphertext.get(2..OFFSET).ok_or(Error::SelfEncrypt)?;

        let mut extended_aad = Vec::<u8>::with_capacity(OFFSET + aad.len());
        extended_aad
            .write_all(&ciphertext[..OFFSET])
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));
        extended_aad
            .write_all(aad)
            .unwrap_or_else(|_| unreachable!("Buffer has enough capacity."));

        let aead = self.make_aead(key, salt)?;
        // NSS insists on having extra space available for decryption.
        let padded_len = ciphertext.len() - OFFSET;
        let mut output = vec![0; padded_len];
        let decrypted =
            aead.decrypt(0, extended_aad.as_ref(), &ciphertext[OFFSET..], &mut output)?;
        let final_len = decrypted.len();
        output.truncate(final_len);
        trace!(
            "[SelfEncrypt] open {} {} -> {}",
            hex(aad),
            hex(ciphertext),
            hex(&output)
        );
        Ok(output)
    }
}

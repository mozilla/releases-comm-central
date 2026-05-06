/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub use crate::aesgcm::AesGcmEncryptedBlock;
use crate::{aesgcm, common::WebPushParams, crypto::EcKeyComponents, error::*};

/// Encrypt a block using legacy AESGCM encoding.
///
/// * `remote_pub` : The public key of the remote message recipient
/// * `remote_auth` : The authentication secret of the remote message recipient
/// * `data` : the data to encrypt
///
/// You should only use this function if you know that you definitely need
/// to use the legacy format. The [`encrypt`](crate::encrypt) function should
/// be preferred where possible.
///
pub fn encrypt_aesgcm(
    remote_pub: &[u8],
    remote_auth: &[u8],
    data: &[u8],
) -> Result<AesGcmEncryptedBlock> {
    let cryptographer = crate::crypto::holder::get_cryptographer();
    let remote_key = cryptographer.import_public_key(remote_pub)?;
    let local_key_pair = cryptographer.generate_ephemeral_keypair()?;
    let params = WebPushParams::new_for_plaintext(data, aesgcm::ECE_AESGCM_PAD_SIZE);
    aesgcm::encrypt(&*local_key_pair, &*remote_key, remote_auth, data, params)
}

/// Decrypt a block using legacy AESGCM encoding.
///
/// * `components` : The public and private key components of the local message recipient
/// * `auth` : The authentication secret of the remote message recipient
/// * `data` : The encrypted data block
///
/// You should only use this function if you know that you definitely need
/// to use the legacy format. The [`decrypt`](crate::decrypt) function should
/// be preferred where possible.
///
pub fn decrypt_aesgcm(
    components: &EcKeyComponents,
    auth: &[u8],
    data: &AesGcmEncryptedBlock,
) -> Result<Vec<u8>> {
    let cryptographer = crate::crypto::holder::get_cryptographer();
    let priv_key = cryptographer.import_key_pair(components).unwrap();
    aesgcm::decrypt(&*priv_key, auth, data)
}

#[cfg(all(test, feature = "backend-openssl"))]
mod aesgcm_tests {
    use super::*;
    use base64::Engine;
    use hex;

    #[derive(Debug)]
    struct AesGcmTestPayload {
        dh: String,
        salt: String,
        rs: u32,
        ciphertext: String,
    }

    #[allow(clippy::too_many_arguments)]
    fn try_encrypt(
        private_key: &str,
        public_key: &str,
        remote_pub_key: &str,
        auth_secret: &str,
        salt: &str,
        pad_length: usize,
        rs: u32,
        plaintext: &str,
    ) -> Result<AesGcmTestPayload> {
        let cryptographer = crate::crypto::holder::get_cryptographer();
        let private_key = hex::decode(private_key).unwrap();
        let public_key = hex::decode(public_key).unwrap();
        let ec_key = EcKeyComponents::new(private_key, public_key);
        let local_key_pair = cryptographer.import_key_pair(&ec_key)?;
        let remote_pub_key = hex::decode(remote_pub_key).unwrap();
        let remote_pub_key = cryptographer.import_public_key(&remote_pub_key).unwrap();
        let auth_secret = hex::decode(auth_secret).unwrap();
        let salt = Some(hex::decode(salt).unwrap());
        let plaintext = plaintext.as_bytes();
        let params = WebPushParams {
            rs,
            pad_length,
            salt,
        };
        let encrypted_block = aesgcm::encrypt(
            &*local_key_pair,
            &*remote_pub_key,
            &auth_secret,
            plaintext,
            params,
        )?;
        Ok(AesGcmTestPayload {
            dh: hex::encode(encrypted_block.dh),
            salt: hex::encode(encrypted_block.salt),
            rs: encrypted_block.rs,
            ciphertext: hex::encode(encrypted_block.ciphertext),
        })
    }

    fn try_decrypt(
        private_key: &str,
        public_key: &str,
        auth_secret: &str,
        payload: &AesGcmTestPayload,
    ) -> Result<String> {
        let private_key = hex::decode(private_key).unwrap();
        let public_key = hex::decode(public_key).unwrap();
        let ec_key = EcKeyComponents::new(private_key, public_key);
        let plaintext = decrypt_aesgcm(
            &ec_key,
            &hex::decode(auth_secret).unwrap(),
            &AesGcmEncryptedBlock::new(
                &hex::decode(&payload.dh).unwrap(),
                &hex::decode(&payload.salt).unwrap(),
                payload.rs,
                hex::decode(&payload.ciphertext).unwrap(),
            )?,
        )?;
        Ok(String::from_utf8(plaintext).unwrap())
    }

    #[test]
    fn test_e2e() {
        let (local_key, remote_key) = crate::generate_keys().unwrap();
        let plaintext = b"There was a green mouse, running in the grass";
        let mut auth_secret = vec![0u8; 16];
        let cryptographer = crate::crypto::holder::get_cryptographer();
        cryptographer.random_bytes(&mut auth_secret).unwrap();
        let remote_public = cryptographer
            .import_public_key(&remote_key.pub_as_raw().unwrap())
            .unwrap();
        let params = WebPushParams::default();
        let encrypted_block = aesgcm::encrypt(
            &*local_key,
            &*remote_public,
            &auth_secret,
            plaintext,
            params,
        )
        .unwrap();
        let decrypted = aesgcm::decrypt(&*remote_key, &auth_secret, &encrypted_block).unwrap();
        assert_eq!(decrypted, plaintext.to_vec());
    }

    #[test]
    fn test_conv_fn() -> Result<()> {
        let (local_key, auth) = crate::generate_keypair_and_auth_secret()?;
        let plaintext = b"There was a little ship that had never sailed";
        let encoded = encrypt_aesgcm(&local_key.pub_as_raw()?, &auth, plaintext).unwrap();
        let decoded = decrypt_aesgcm(&local_key.raw_components()?, &auth, &encoded)?;
        assert_eq!(decoded, plaintext.to_vec());
        Ok(())
    }

    #[test]
    fn try_encrypt_ietf_rfc() {
        // Test data from [IETF Web Push Encryption Draft 5](https://tools.ietf.org/html/draft-ietf-webpush-encryption-04#section-5)
        let encrypted_block = try_encrypt(
            "9c249c7a4f90a448e638e953fab437f27673bdd3e5a9ad34672d22ea6d8e26f6",
            "04da110db6fce091a6f20e59e42171bab4aab17589d7522d7d71166152c4f3963b0989038d7b0811ce1aab161a4351bc06a917089e833e90eb5ad7568ff9ae8075",
            "042124063ccbf19dc2fa88b643ba04e6dd8da7ea7ba2c8c62e0f77a943f4c2fa914f6d44116c9fd1c40341c6a440cab3e2140a60e4378a5da735972de078005105",
            "476f6f20676f6f206727206a6f6f6221",
            "96781aadbc8a7cca22f59ef9c585e692",
            0,
            4096,
            "I am the walrus",
        ).unwrap();
        assert_eq!(
            encrypted_block.ciphertext,
            "ea7a80414304f2136ac39277925f1ca55549ca55ca62a64e7ac7991bc52e78aa40"
        );
    }

    #[test]
    fn test_decrypt_ietf_rfc() {
        // Test data from [IETF Web Push Encryption Draft 5](https://tools.ietf.org/html/draft-ietf-webpush-encryption-04#section-5)
        let plaintext = try_decrypt(
            "f455a5d79fd05100160da0f7937979d19059409e1abb6ec5d55e05d2e2d20ff3",
            "042124063ccbf19dc2fa88b643ba04e6dd8da7ea7ba2c8c62e0f77a943f4c2fa914f6d44116c9fd1c40341c6a440cab3e2140a60e4378a5da735972de078005105",
            "476f6f20676f6f206727206a6f6f6221",
            &AesGcmTestPayload {
                ciphertext : "ea7a80414304f2136ac39277925f1ca55549ca55ca62a64e7ac7991bc52e78aa40".to_owned(),
                salt : "96781aadbc8a7cca22f59ef9c585e692".to_owned(),
                dh : "04da110db6fce091a6f20e59e42171bab4aab17589d7522d7d71166152c4f3963b0989038d7b0811ce1aab161a4351bc06a917089e833e90eb5ad7568ff9ae8075".to_owned(),
                rs : 4096,
            }
        ).unwrap();
        assert_eq!(plaintext, "I am the walrus");
    }

    // We have some existing test data in b64, and some in hex,
    // and it's easy to make a second `try_decrypt` helper function
    // than to re-encode all the data.
    fn try_decrypt_b64(
        priv_key: &str,
        pub_key: &str,
        auth_secret: &str,
        block: &AesGcmEncryptedBlock,
    ) -> Result<String> {
        // The AesGcmEncryptedBlock is composed from the `Crypto-Key` & `Encryption` headers, and post body
        // The Block will attempt to decode the base64 strings for dh & salt, so no additional action needed.
        // Since the body is most likely not encoded, it is expected to be a raw buffer of [u8]
        let priv_key_raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(priv_key)?;
        let pub_key_raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(pub_key)?;
        let ec_key = EcKeyComponents::new(priv_key_raw, pub_key_raw);
        let auth_secret = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(auth_secret)?;
        let plaintext = decrypt_aesgcm(&ec_key, &auth_secret, block)?;
        Ok(String::from_utf8(plaintext).unwrap())
    }

    #[test]
    fn test_decode() {
        use base64::Engine;

        // generated the content using pywebpush, which verified against the client.
        let auth_raw = "LsuUOBKVQRY6-l7_Ajo-Ag";
        let priv_key_raw = "yerDmA9uNFoaUnSt2TkWWLwPseG1qtzS2zdjUl8Z7tc";
        let pub_key_raw = "BLBlTYure2QVhJCiDt4gRL0JNmUBMxtNB5B6Z1hDg5h-Epw6mVFV4whoYGBlWNY-ENR1FObkGFyMf7-6ZMHMAxw";

        // Incoming Crypto-Key: dh=
        let dh = "BJvcyzf8ocm6F7lbFePebtXU7OHkmylXN9FL2g-yBHwUKqo6cD-FP1h5SHEQQ-xEgJl-F0xEEmSaEx2-qeJHYmk";
        // Incoming Encryption: salt=
        let salt = "8qX1ZgkLD50LHgocZdPKZQ";
        // Incoming Body (this is normally raw bytes. It's encoded here for presentation)
        let ciphertext = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode("8Vyes671P_VDf3G2e6MgY6IaaydgR-vODZZ7L0ZHbpCJNVaf_2omEms2tiPJiU22L3BoECKJixiOxihcsxWMjTgAcplbvfu1g6LWeP4j8dMAzJionWs7OOLif6jBKN6LGm4EUw9e26EBv9hNhi87-HaEGbfBMGcLvm1bql1F").unwrap();
        let plaintext = "Amidst the mists and coldest frosts I thrust my fists against the\nposts and still demand to see the ghosts.\n";

        let block = AesGcmEncryptedBlock::new(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(dh)
                .unwrap(),
            &base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(salt)
                .unwrap(),
            4096,
            ciphertext,
        )
        .unwrap();

        let result = try_decrypt_b64(priv_key_raw, pub_key_raw, auth_raw, &block).unwrap();

        assert!(result == plaintext)
    }

    #[test]
    fn test_decode_padding() {
        use base64::Engine;

        // generated the content using pywebpush, which verified against the client.
        let auth_raw = "LsuUOBKVQRY6-l7_Ajo-Ag";
        let priv_key_raw = "yerDmA9uNFoaUnSt2TkWWLwPseG1qtzS2zdjUl8Z7tc";
        let pub_key_raw = "BLBlTYure2QVhJCiDt4gRL0JNmUBMxtNB5B6Z1hDg5h-Epw6mVFV4whoYGBlWNY-ENR1FObkGFyMf7-6ZMHMAxw";

        // Incoming Crypto-Key: dh=
        let dh = "BCX7KJ_1Em-LjeB56E2KDoMjKDhTaDhjv8c6dwbvZQZ_Gsfp3AT54x2zYUPcBwd1GVyGsk55ProJ98cFrVxrPz4";
        // Incoming Encryption-Key: salt=
        let salt = "x2I2OZpSCoe-Cc5UW36Nng";
        // Incoming Body (this is normally raw bytes. It's encoded here for presentation)
        let ciphertext = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode("Ua3-WW5kTbt11dBTiXBP6_hLBYhBNOtDFfue5QHMTd2DicL0wutDnt5z9pjRJ76w562egPq5qro95YLnsX0NWGmDQbsQ0Azds6jcBGsxHPt0p5GELAtR4AJj2OsB_LV7dTuGHN2SqsyXLARjTFN2wsF3xWhmuw").unwrap();
        let plaintext = "Tabs are the real indent";

        let block = AesGcmEncryptedBlock::new(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(dh)
                .unwrap(),
            &base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(salt)
                .unwrap(),
            4096,
            ciphertext,
        )
        .unwrap();

        let result = try_decrypt_b64(priv_key_raw, pub_key_raw, auth_raw, &block).unwrap();

        assert!(result == plaintext)
    }
}

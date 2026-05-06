/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#![warn(rust_2018_idioms)]

mod aes128gcm;
mod aesgcm;
mod common;
pub mod crypto;
mod error;
pub mod legacy;

pub use crate::{
    crypto::{Cryptographer, EcKeyComponents, LocalKeyPair, RemotePublicKey},
    error::*,
};

use crate::{
    aes128gcm::ECE_AES128GCM_PAD_SIZE,
    common::{WebPushParams, ECE_WEBPUSH_AUTH_SECRET_LENGTH},
};

/// Generate a local ECE key pair and authentication secret.
///
pub fn generate_keypair_and_auth_secret(
) -> Result<(Box<dyn LocalKeyPair>, [u8; ECE_WEBPUSH_AUTH_SECRET_LENGTH])> {
    let cryptographer = crypto::holder::get_cryptographer();
    let local_key_pair = cryptographer.generate_ephemeral_keypair()?;
    let mut auth_secret = [0u8; ECE_WEBPUSH_AUTH_SECRET_LENGTH];
    cryptographer.random_bytes(&mut auth_secret)?;
    Ok((local_key_pair, auth_secret))
}

/// Encrypt a block using the AES128GCM encryption scheme.
///
/// * `remote_pub` : The public key of the remote message recipient
/// * `remote_auth` : The authentication secret of the remote message recipient
/// * `data` : The data to encrypt
///
/// For the equivalent function using legacy AESGCM encryption scheme
/// use [`legacy::encrypt_aesgcm`](crate::legacy::encrypt_aesgcm).
///
pub fn encrypt(remote_pub: &[u8], remote_auth: &[u8], data: &[u8]) -> Result<Vec<u8>> {
    let cryptographer = crypto::holder::get_cryptographer();
    let remote_key = cryptographer.import_public_key(remote_pub)?;
    let local_key_pair = cryptographer.generate_ephemeral_keypair()?;
    let params = WebPushParams::new_for_plaintext(data, ECE_AES128GCM_PAD_SIZE);
    aes128gcm::encrypt(&*local_key_pair, &*remote_key, remote_auth, data, params)
}

/// Decrypt a block using the AES128GCM encryption scheme.
///
/// * `components` : The public and private key components of the local message recipient
/// * `auth` : The authentication secret of the remote message recipient
/// * `data` : The encrypted data block
///
/// For the equivalent function using legacy AESGCM encryption scheme
/// use [`legacy::decrypt_aesgcm`](crate::legacy::decrypt_aesgcm).
///
pub fn decrypt(components: &EcKeyComponents, auth: &[u8], data: &[u8]) -> Result<Vec<u8>> {
    let cryptographer = crypto::holder::get_cryptographer();
    let priv_key = cryptographer.import_key_pair(components).unwrap();
    aes128gcm::decrypt(&*priv_key, auth, data)
}

/// Generate a pair of keys; useful for writing tests.
///
#[cfg(all(test, feature = "backend-openssl"))]
fn generate_keys() -> Result<(Box<dyn LocalKeyPair>, Box<dyn LocalKeyPair>)> {
    let cryptographer = crypto::holder::get_cryptographer();
    let local_key = cryptographer.generate_ephemeral_keypair()?;
    let remote_key = cryptographer.generate_ephemeral_keypair()?;
    Ok((local_key, remote_key))
}

#[cfg(all(test, feature = "backend-openssl"))]
mod aes128gcm_tests {
    use super::common::ECE_TAG_LENGTH;
    use super::*;

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
    ) -> Result<String> {
        let cryptographer = crypto::holder::get_cryptographer();
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
        let ciphertext = aes128gcm::encrypt(
            &*local_key_pair,
            &*remote_pub_key,
            &auth_secret,
            plaintext,
            params,
        )?;
        Ok(hex::encode(ciphertext))
    }

    fn try_decrypt(
        private_key: &str,
        public_key: &str,
        auth_secret: &str,
        payload: &str,
    ) -> Result<String> {
        let private_key = hex::decode(private_key).unwrap();
        let public_key = hex::decode(public_key).unwrap();
        let ec_key = EcKeyComponents::new(private_key, public_key);
        let plaintext = decrypt(
            &ec_key,
            &hex::decode(auth_secret).unwrap(),
            &hex::decode(payload).unwrap(),
        )?;
        Ok(String::from_utf8(plaintext).unwrap())
    }

    #[test]
    fn test_keygen() {
        let cryptographer = crypto::holder::get_cryptographer();
        cryptographer.generate_ephemeral_keypair().unwrap();
    }

    #[test]
    fn test_e2e_through_public_api() {
        let (remote_key, auth_secret) = generate_keypair_and_auth_secret().unwrap();
        let plaintext = b"When I grow up, I want to be a watermelon";
        let ciphertext =
            encrypt(&remote_key.pub_as_raw().unwrap(), &auth_secret, plaintext).unwrap();
        let decrypted = decrypt(
            &remote_key.raw_components().unwrap(),
            &auth_secret,
            &ciphertext,
        )
        .unwrap();
        assert_eq!(decrypted, plaintext.to_vec());
    }

    #[test]
    fn test_e2e_large_plaintext() {
        let (remote_key, auth_secret) = generate_keypair_and_auth_secret().unwrap();
        let plaintext = [0; 5000];
        let ciphertext =
            encrypt(&remote_key.pub_as_raw().unwrap(), &auth_secret, &plaintext).unwrap();
        let decrypted = decrypt(
            &remote_key.raw_components().unwrap(),
            &auth_secret,
            &ciphertext,
        )
        .unwrap();
        assert_eq!(decrypted, plaintext.to_vec());
    }

    #[test]
    fn test_e2e_with_different_record_sizes_and_padding() {
        let (local_key, remote_key) = generate_keys().unwrap();
        let plaintext = b"When I grow up, I want to be a watermelon";
        let mut auth_secret = vec![0u8; 16];
        let cryptographer = crypto::holder::get_cryptographer();
        cryptographer.random_bytes(&mut auth_secret).unwrap();
        let remote_public = cryptographer
            .import_public_key(&remote_key.pub_as_raw().unwrap())
            .unwrap();
        let plen = plaintext.len();
        // Try a variety of different record sizes. The numbers here aren't particularly deeply
        // considered, just a selection of numbers that might be interesting. (Although they did
        // trigger a bunch of interesting edge-cases during development, which is re-assuring).
        for plaintext_rs in &[2, 3, 7, 8, plen - 1, plen, plen + 1, 1024, 8192] {
            let rs = (*plaintext_rs + ECE_TAG_LENGTH) as u32;
            // Try a variety of padding lengths. Again, not deeply considered numbers.
            for pad_length in &[0, 1, 2, 8, 37, 127, 128] {
                let pad_length = *pad_length;
                let params = WebPushParams {
                    rs,
                    pad_length,
                    ..WebPushParams::default()
                };
                let ciphertext = aes128gcm::encrypt(
                    &*local_key,
                    &*remote_public,
                    &auth_secret,
                    plaintext,
                    params,
                )
                .unwrap();
                let decrypted =
                    aes128gcm::decrypt(&*remote_key, &auth_secret, &ciphertext).unwrap();
                assert_eq!(decrypted, plaintext.to_vec());
            }
        }
    }

    #[test]
    fn test_conv_fn() -> Result<()> {
        let (local_key, auth) = generate_keypair_and_auth_secret()?;
        let plaintext = b"Mary had a little lamb, with some nice mint jelly";
        let encoded = encrypt(&local_key.pub_as_raw()?, &auth, plaintext).unwrap();
        let decoded = decrypt(&local_key.raw_components()?, &auth, &encoded)?;
        assert_eq!(decoded, plaintext.to_vec());
        Ok(())
    }

    #[test]
    fn try_encrypt_ietf_rfc() {
        let ciphertext = try_encrypt(
            "c9f58f89813e9f8e872e71f42aa64e1757c9254dcc62b72ddc010bb4043ea11c",
            "04fe33f4ab0dea71914db55823f73b54948f41306d920732dbb9a59a53286482200e597a7b7bc260ba1c227998580992e93973002f3012a28ae8f06bbb78e5ec0f",
            "042571b2becdfde360551aaf1ed0f4cd366c11cebe555f89bcb7b186a53339173168ece2ebe018597bd30479b86e3c8f8eced577ca59187e9246990db682008b0e",
            "05305932a1c7eabe13b6cec9fda48882",
            "0c6bfaadad67958803092d454676f397",
            0,
            4096,
            "When I grow up, I want to be a watermelon",
        ).unwrap();
        assert_eq!(ciphertext, "0c6bfaadad67958803092d454676f397000010004104fe33f4ab0dea71914db55823f73b54948f41306d920732dbb9a59a53286482200e597a7b7bc260ba1c227998580992e93973002f3012a28ae8f06bbb78e5ec0ff297de5b429bba7153d3a4ae0caa091fd425f3b4b5414add8ab37a19c1bbb05cf5cb5b2a2e0562d558635641ec52812c6c8ff42e95ccb86be7cd");
    }

    #[test]
    fn test_decrypt_ietf_rfc() {
        let plaintext = try_decrypt(
            "ab5757a70dd4a53e553a6bbf71ffefea2874ec07a6b379e3c48f895a02dc33de",
            "042571b2becdfde360551aaf1ed0f4cd366c11cebe555f89bcb7b186a53339173168ece2ebe018597bd30479b86e3c8f8eced577ca59187e9246990db682008b0e",
            "05305932a1c7eabe13b6cec9fda48882",
            "0c6bfaadad67958803092d454676f397000010004104fe33f4ab0dea71914db55823f73b54948f41306d920732dbb9a59a53286482200e597a7b7bc260ba1c227998580992e93973002f3012a28ae8f06bbb78e5ec0ff297de5b429bba7153d3a4ae0caa091fd425f3b4b5414add8ab37a19c1bbb05cf5cb5b2a2e0562d558635641ec52812c6c8ff42e95ccb86be7cd"
        ).unwrap();
        assert_eq!(plaintext, "When I grow up, I want to be a watermelon");
    }

    #[test]
    fn test_decrypt_rs_18_pad_0() {
        let plaintext = try_decrypt(
            "27433fab8970b3cb5284b61183efb46286562cd2a7330d8cae960911a5571d0c",
            "04515d4326355652399da24b2be9241e633b5cf14faf0cf3a6fd60317b954c0a2f4848548004b27b0cf7480bc810c6bec03a8fb79c8ea00fc8b05e00f8834563ef",
            "d65a04df95f2db5e604839f717dcde79",
            "7caebdbc20938ee340a946f1bd4f68f100000012410437cfdb5223d9f95eaa02f6ed940ff22eaf05b3622e949dc3ce9f335e6ef9b26aeaacca0f74080a8b364592f2ccc6d5eddd43004b70b91887d144d9fa93f16c3bc7ea68f4fd547a94eca84b16e138a6080177"
        ).unwrap();
        assert_eq!(plaintext, "1");
    }

    #[test]
    fn test_decrypt_missing_header_block() {
        let err = try_decrypt(
            "1be83f38332ef09681faf3f307b1ff2e10cab78cc7cdab683ac0ee92ac3f6ee1",
            "04dba991ca215343f36bdd3e857cafde3d18bf57f1835b2833bad414f0884162051ac96a0b24490037d07cf528e4e18e100a1a64eb744748544bf1e220dabacf2c",
            "3471bb98481e02533bf39542bcf3dba4",
            "45b74d2b69be9b074de3b35aa87e7c15611d",
        )
        .unwrap_err();
        match err {
            Error::HeaderTooShort => {}
            _ => panic!("Unexpected error {:?}", err),
        };
    }

    #[test]
    fn test_decrypt_truncated_sender_key() {
        let err = try_decrypt(
            "ce88e8e0b3057a4752eb4c8fa931eb621c302da5ad03b81af459cf6735560cae",
            "04a325d99084c40de0ce722a042c448d94a32691721ca79e3cf745e78c69886194b02cea19224176795a9d4dbbb2073af2ccd6fa6f0a4c7c4968556be502a3ba81",
            "5c31e0d96d9a139899ac0969d359f740",
            "de5b696b87f1a15cb6adebdd79d6f99e000000120100b6bc1826c37c9f73dd6b4859c2b505181952",
        )
        .unwrap_err();
        match err {
            Error::InvalidKeyLength => {}
            _ => panic!("Unexpected error {:?}", err),
        };
    }

    #[test]
    fn test_decrypt_truncated_auth_secret() {
        let err = try_decrypt(
            "60c7636a517de7039a0ac2d0e3064400794c78e7e049398129a227cee0f9a801",
            "04fdd04128a85c05896d7f81fe118bdcb887b9f3c1ff4183adc4c824d128607300e986b2dfb5a610e5af43e408a00730584f93e3dfddfc44737d5f08fb2d6f8916",
            "355a38cd6d9bef15990e2d3308dbd600",
            "8115f4988b8c392a7bacb43c8f1ac5650000001241041994483c541e9bc39a6af03ff713aa7745c284e138a42a2435b797b20c4b698cf5118b4f8555317c190eabebfab749c164d3f6bdebe0d441719131a357d8890a13c4dbd4b16ff3dd5a83f7c91ad6e040ac42730a7f0b3cd3245e9f8d6ff31c751d410cfd"
        ).unwrap_err();
        match err {
            Error::OpenSSLError(_) => {}
            _ => panic!("Unexpected error {:?}", err),
        };
    }

    #[test]
    fn test_decrypt_early_final_record() {
        let err = try_decrypt(
            "5dda1d918bc407ba3cda12cb8014d49aa7e0269002820304466bc80034ca9240",
            "04c95c6520dad11e8f6a1bf8031a40c2a4ee1045c1903be06a1dfa7f829cceb2de02481ae6bd0476121b12c5532d0b231788077efa0683a5bfe0d62339b251cb35",
            "40c241fde4269ee1e6d725592d982718",
            "dbe215507d1ad3d2eaeabeae6e874d8f0000001241047bc4343f34a8348cdc4e462ffc7c40aa6a8c61a739c4c41d45125505f70e9fc5f9efa86852dd488dcf8e8ea2cafb75e07abd5ee7c9d5c038bafef079571b0bda294411ce98c76dd031c0e580577a4980a375e45ed30429be0e2ee9da7e6df8696d01b8ec"
        ).unwrap_err();
        match err {
            Error::DecryptPadding => {}
            _ => panic!("Unexpected error {:?}", err),
        };
    }
}

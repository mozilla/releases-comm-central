/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::error::*;
use std::any::Any;

pub(crate) mod holder;
#[cfg(feature = "backend-openssl")]
mod openssl;

#[cfg(not(feature = "backend-openssl"))]
pub use holder::{set_boxed_cryptographer, set_cryptographer};

pub trait RemotePublicKey: Send + Sync + 'static {
    /// Export the key component in the
    /// binary uncompressed point representation.
    fn as_raw(&self) -> Result<Vec<u8>>;
    /// For downcasting purposes.
    fn as_any(&self) -> &dyn Any;
}

pub trait LocalKeyPair: Send + Sync + 'static {
    /// Export the public key component in the
    /// binary uncompressed point representation.
    fn pub_as_raw(&self) -> Result<Vec<u8>>;
    /// Export the raw components of the keypair.
    fn raw_components(&self) -> Result<EcKeyComponents>;
    /// For downcasting purposes.
    fn as_any(&self) -> &dyn Any;
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "serializable-keys",
    derive(serde::Serialize, serde::Deserialize)
)]
#[derive(Default)]
pub enum EcCurve {
    #[default]
    P256,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(
    feature = "serializable-keys",
    derive(serde::Serialize, serde::Deserialize)
)]
pub struct EcKeyComponents {
    // The curve is only kept in case the ECE standard changes in the future.
    curve: EcCurve,
    // The `d` value of the EC Key.
    private_key: Vec<u8>,
    // The uncompressed x,y-representation of the public component of the EC Key.
    public_key: Vec<u8>,
}

impl EcKeyComponents {
    pub fn new<T: Into<Vec<u8>>>(private_key: T, public_key: T) -> Self {
        EcKeyComponents {
            private_key: private_key.into(),
            public_key: public_key.into(),
            curve: Default::default(),
        }
    }
    pub fn curve(&self) -> &EcCurve {
        &self.curve
    }
    /// The `d` value of the EC Key.
    pub fn private_key(&self) -> &[u8] {
        &self.private_key
    }
    /// The uncompressed x,y-representation of the public component of the EC Key.
    pub fn public_key(&self) -> &[u8] {
        &self.public_key
    }
}

pub trait Cryptographer: Send + Sync + 'static {
    /// Generate a random ephemeral local key pair.
    fn generate_ephemeral_keypair(&self) -> Result<Box<dyn LocalKeyPair>>;
    /// Import a local keypair from its raw components.
    fn import_key_pair(&self, components: &EcKeyComponents) -> Result<Box<dyn LocalKeyPair>>;
    /// Import the public key component in the binary uncompressed point representation.
    fn import_public_key(&self, raw: &[u8]) -> Result<Box<dyn RemotePublicKey>>;
    fn compute_ecdh_secret(
        &self,
        remote: &dyn RemotePublicKey,
        local: &dyn LocalKeyPair,
    ) -> Result<Vec<u8>>;
    fn hkdf_sha256(&self, salt: &[u8], secret: &[u8], info: &[u8], len: usize) -> Result<Vec<u8>>;
    /// Should return [ciphertext, auth_tag].
    fn aes_gcm_128_encrypt(&self, key: &[u8], iv: &[u8], data: &[u8]) -> Result<Vec<u8>>;
    fn aes_gcm_128_decrypt(
        &self,
        key: &[u8],
        iv: &[u8],
        ciphertext_and_tag: &[u8],
    ) -> Result<Vec<u8>>;
    fn random_bytes(&self, dest: &mut [u8]) -> Result<()>;
}

/// Run a small suite of tests to check that a `Cryptographer` backend is working correctly.
///
/// You should only use this is you're implementing a custom `Cryptographer` and want to check
/// that it is working as intended. This function will panic if the tests fail.
///
#[cfg(any(test, feature = "backend-test-helper"))]
pub fn test_cryptographer<T: Cryptographer>(cryptographer: T) {
    use crate::{aes128gcm, common::WebPushParams};

    // These are test data from the RFC.
    let plaintext = "When I grow up, I want to be a watermelon";
    let ciphertext = hex::decode("0c6bfaadad67958803092d454676f397000010004104fe33f4ab0dea71914db55823f73b54948f41306d920732dbb9a59a53286482200e597a7b7bc260ba1c227998580992e93973002f3012a28ae8f06bbb78e5ec0ff297de5b429bba7153d3a4ae0caa091fd425f3b4b5414add8ab37a19c1bbb05cf5cb5b2a2e0562d558635641ec52812c6c8ff42e95ccb86be7cd").unwrap();

    // First, a trial encryption.
    let private_key =
        hex::decode("c9f58f89813e9f8e872e71f42aa64e1757c9254dcc62b72ddc010bb4043ea11c").unwrap();
    let public_key = hex::decode("04fe33f4ab0dea71914db55823f73b54948f41306d920732dbb9a59a53286482200e597a7b7bc260ba1c227998580992e93973002f3012a28ae8f06bbb78e5ec0f").unwrap();
    let ec_key = EcKeyComponents::new(private_key, public_key);
    let local_key_pair = cryptographer.import_key_pair(&ec_key).unwrap();

    let remote_pub_key = hex::decode("042571b2becdfde360551aaf1ed0f4cd366c11cebe555f89bcb7b186a53339173168ece2ebe018597bd30479b86e3c8f8eced577ca59187e9246990db682008b0e").unwrap();
    let remote_pub_key = cryptographer.import_public_key(&remote_pub_key).unwrap();
    let auth_secret = hex::decode("05305932a1c7eabe13b6cec9fda48882").unwrap();

    let params = WebPushParams {
        rs: 4096,
        pad_length: 0,
        salt: Some(hex::decode("0c6bfaadad67958803092d454676f397").unwrap()),
    };

    assert_eq!(
        aes128gcm::encrypt(
            &*local_key_pair,
            &*remote_pub_key,
            &auth_secret,
            plaintext.as_bytes(),
            params,
        )
        .unwrap(),
        ciphertext
    );

    // Now, a trial decryption.
    let private_key =
        hex::decode("ab5757a70dd4a53e553a6bbf71ffefea2874ec07a6b379e3c48f895a02dc33de").unwrap();
    let public_key = hex::decode("042571b2becdfde360551aaf1ed0f4cd366c11cebe555f89bcb7b186a53339173168ece2ebe018597bd30479b86e3c8f8eced577ca59187e9246990db682008b0e").unwrap();
    let ec_key = EcKeyComponents::new(private_key, public_key);
    let local_key_pair = cryptographer.import_key_pair(&ec_key).unwrap();

    assert_eq!(
        aes128gcm::decrypt(&*local_key_pair, &auth_secret, ciphertext.as_ref(),).unwrap(),
        plaintext.as_bytes()
    );
}

#[cfg(all(test, feature = "backend-openssl"))]
mod tests {
    use super::*;

    // All of the tests in this crate exercise the default backend, so running this here
    // doesn't tell us anyting more about the default backend. Instead, it tells us whether
    // the `test_cryptographer` function is working correctly!
    #[test]
    fn test_default_cryptograher() {
        test_cryptographer(super::openssl::OpensslCryptographer);
    }
}

#![deny(warnings, clippy::pedantic)]
#![allow(clippy::missing_errors_doc)] // I'm too lazy
#![cfg_attr(
    not(all(feature = "client", feature = "server")),
    allow(dead_code, unused_imports)
)]
#[cfg(all(feature = "nss", feature = "rust-hpke"))]
compile_error!("features \"nss\" and \"rust-hpke\" are mutually incompatible");

mod config;
mod crypto;
mod err;
pub mod hpke;
#[cfg(feature = "nss")]
mod nss;
#[cfg(feature = "rust-hpke")]
mod rand;
#[cfg(feature = "rust-hpke")]
mod rh;
#[cfg(feature = "stream")]
mod stream;

use std::{
    cmp::max,
    convert::TryFrom,
    io::{Cursor, Read},
    mem::size_of,
};

use byteorder::{NetworkEndian, WriteBytesExt};
use crypto::{Decrypt, Encrypt};
use log::trace;

#[cfg(feature = "nss")]
use crate::nss::{
    aead::{Aead, Mode, NONCE_LEN},
    hkdf::{Hkdf, KeyMechanism},
    hpke::{Config as HpkeConfig, Exporter, HpkeR, HpkeS},
    random, PublicKey, SymKey,
};
#[cfg(feature = "stream")]
use crate::stream::{ClientRequest as StreamClient, ServerRequest as ServerRequestStream};
pub use crate::{
    config::{KeyConfig, SymmetricSuite},
    err::Error,
};
use crate::{err::Res, hpke::Aead as AeadId};
#[cfg(feature = "rust-hpke")]
use crate::{
    rand::random,
    rh::{
        aead::{Aead, Mode, NONCE_LEN},
        hkdf::{Hkdf, KeyMechanism},
        hpke::{Config as HpkeConfig, Exporter, HpkeR, HpkeS, PublicKey},
        SymKey,
    },
};

/// The request header is a `KeyId` and 2 each for KEM, KDF, and AEAD identifiers
const REQUEST_HEADER_LEN: usize = size_of::<KeyId>() + 6;
const INFO_REQUEST: &[u8] = b"message/bhttp request";
const LABEL_RESPONSE: &[u8] = b"message/bhttp response";
const INFO_KEY: &[u8] = b"key";
const INFO_NONCE: &[u8] = b"nonce";

/// The type of a key identifier.
pub type KeyId = u8;

pub fn init() {
    #[cfg(feature = "nss")]
    nss::init();
}

/// Construct the info parameter we use to initialize an `HpkeS` instance.
fn build_info(label: &[u8], key_id: KeyId, config: HpkeConfig) -> Res<Vec<u8>> {
    let mut info = Vec::with_capacity(label.len() + 1 + REQUEST_HEADER_LEN);
    info.extend_from_slice(label);
    info.push(0);
    info.write_u8(key_id)?;
    info.write_u16::<NetworkEndian>(u16::from(config.kem()))?;
    info.write_u16::<NetworkEndian>(u16::from(config.kdf()))?;
    info.write_u16::<NetworkEndian>(u16::from(config.aead()))?;
    trace!("HPKE info: {}", hex::encode(&info));
    Ok(info)
}

/// This is the sort of information we expect to receive from the receiver.
/// This might not be necessary if we agree on a format.
#[cfg(feature = "client")]
pub struct ClientRequest {
    key_id: KeyId,
    config: HpkeConfig,
    pk: PublicKey,
}

#[cfg(feature = "client")]
impl ClientRequest {
    /// Construct a `ClientRequest` from a specific `KeyConfig` instance.
    pub fn from_config(config: &mut KeyConfig) -> Res<Self> {
        // TODO(mt) choose the best config, not just the first.
        let selected = config.select(config.symmetric[0])?;
        Ok(Self {
            key_id: config.key_id,
            config: selected,
            pk: config.pk.clone(),
        })
    }

    /// Reads an encoded configuration and constructs a single use client sender.
    /// See `KeyConfig::decode` for the structure details.
    pub fn from_encoded_config(encoded_config: &[u8]) -> Res<Self> {
        let mut config = KeyConfig::decode(encoded_config)?;
        Self::from_config(&mut config)
    }

    /// Reads an encoded list of configurations and constructs a single use client sender
    /// from the first supported configuration.
    /// See `KeyConfig::decode_list` for the structure details.
    pub fn from_encoded_config_list(encoded_config_list: &[u8]) -> Res<Self> {
        let mut configs = KeyConfig::decode_list(encoded_config_list)?;
        if let Some(mut config) = configs.pop() {
            Self::from_config(&mut config)
        } else {
            Err(Error::Unsupported)
        }
    }

    /// Encapsulate a request.  This consumes this object.
    /// This produces a response handler and the bytes of an encapsulated request.
    pub fn encapsulate(self, request: &[u8]) -> Res<(Vec<u8>, ClientResponse)> {
        // Build the info, which contains the message header.
        let info = build_info(INFO_REQUEST, self.key_id, self.config)?;
        let mut hpke = HpkeS::new(self.config, &self.pk, &info)?;

        let header = Vec::from(&info[INFO_REQUEST.len() + 1..]);
        debug_assert_eq!(header.len(), REQUEST_HEADER_LEN);

        let extra = hpke.config().kem().n_enc() + hpke.config().aead().n_t() + request.len();
        let expected_len = header.len() + extra;

        let mut enc_request = header;
        enc_request.reserve_exact(extra);

        let enc = hpke.enc()?;
        enc_request.extend_from_slice(&enc);

        let mut ct = hpke.seal(&[], request)?;
        enc_request.append(&mut ct);

        debug_assert_eq!(expected_len, enc_request.len());
        Ok((enc_request, ClientResponse::new(hpke, enc)))
    }

    #[cfg(feature = "stream")]
    pub fn encapsulate_stream<S>(self, dst: S) -> Res<StreamClient<S>> {
        StreamClient::start(dst, self.config, self.key_id, &self.pk)
    }
}

/// A server can handle multiple requests.
/// It holds a single key pair and can generate a configuration.
/// (A more complex server would have multiple key pairs. This is simple.)
#[cfg(feature = "server")]
#[derive(Debug, Clone)]
pub struct Server {
    config: KeyConfig,
}

#[cfg(feature = "server")]
impl Server {
    /// Create a new server configuration.
    /// # Panics
    /// If the configuration doesn't include a private key.
    pub fn new(config: KeyConfig) -> Res<Self> {
        assert!(config.sk.is_some());
        Ok(Self { config })
    }

    /// Get the configuration that this server uses.
    #[must_use]
    pub fn config(&self) -> &KeyConfig {
        &self.config
    }

    fn decode_request_header(&self, r: &mut Cursor<&[u8]>, label: &[u8]) -> Res<(HpkeR, Vec<u8>)> {
        let hpke_config = self.config.decode_hpke_config(r)?;
        let sym = SymmetricSuite::new(hpke_config.kdf(), hpke_config.aead());
        let config = self.config.select(sym)?;
        let info = build_info(label, self.config.key_id, hpke_config)?;

        let mut enc = vec![0; config.kem().n_enc()];
        r.read_exact(&mut enc)?;

        Ok((
            HpkeR::new(
                config,
                &self.config.pk,
                self.config.sk.as_ref().unwrap(),
                &enc,
                &info,
            )?,
            enc,
        ))
    }

    /// Remove encapsulation on a request.
    /// # Panics
    /// Not as a consequence of this code, but Rust won't know that for sure.
    pub fn decapsulate(&self, enc_request: &[u8]) -> Res<(Vec<u8>, ServerResponse)> {
        if enc_request.len() <= REQUEST_HEADER_LEN {
            return Err(Error::Truncated);
        }
        let mut r = Cursor::new(enc_request);
        let (mut hpke, enc) = self.decode_request_header(&mut r, INFO_REQUEST)?;

        let request = hpke.open(&[], &enc_request[usize::try_from(r.position())?..])?;
        Ok((request, ServerResponse::new(&hpke, &enc)?))
    }

    /// Remove encapsulation on a streamed request.
    #[cfg(feature = "stream")]
    pub fn decapsulate_stream<S>(self, src: S) -> ServerRequestStream<S> {
        ServerRequestStream::new(self.config, src)
    }
}

fn entropy(config: HpkeConfig) -> usize {
    max(config.aead().n_n(), config.aead().n_k())
}

fn export_secret<E: Exporter>(exp: &E, label: &[u8], cfg: HpkeConfig) -> Res<SymKey> {
    exp.export(label, entropy(cfg))
}

fn make_aead(mode: Mode, cfg: HpkeConfig, secret: &SymKey, enc: &[u8], nonce: &[u8]) -> Res<Aead> {
    let mut salt = enc.to_vec();
    salt.extend_from_slice(nonce);

    let hkdf = Hkdf::new(cfg.kdf());
    let prk = hkdf.extract(&salt, secret)?;

    let key = hkdf.expand_key(&prk, INFO_KEY, KeyMechanism::Aead(cfg.aead()))?;
    let iv = hkdf.expand_data(&prk, INFO_NONCE, cfg.aead().n_n())?;
    let nonce_base = <[u8; NONCE_LEN]>::try_from(iv).unwrap();

    Aead::new(mode, cfg.aead(), &key, nonce_base)
}

/// An object for encapsulating responses.
/// The only way to obtain one of these is through `Server::decapsulate()`.
#[cfg(feature = "server")]
pub struct ServerResponse {
    response_nonce: Vec<u8>,
    aead: Aead,
}

#[cfg(feature = "server")]
impl ServerResponse {
    fn new(hpke: &HpkeR, enc: &[u8]) -> Res<Self> {
        let response_nonce = random(entropy(hpke.config()));
        let aead = make_aead(
            Mode::Encrypt,
            hpke.config(),
            &export_secret(hpke, LABEL_RESPONSE, hpke.config())?,
            enc,
            &response_nonce,
        )?;
        Ok(Self {
            response_nonce,
            aead,
        })
    }

    /// Consume this object by encapsulating a response.
    pub fn encapsulate(mut self, response: &[u8]) -> Res<Vec<u8>> {
        let mut enc_response = self.response_nonce;
        let mut ct = self.aead.seal(&[], response)?;
        enc_response.append(&mut ct);
        Ok(enc_response)
    }
}

#[cfg(feature = "server")]
impl std::fmt::Debug for ServerResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ServerResponse")
    }
}

/// An object for decapsulating responses.
/// The only way to obtain one of these is through `ClientRequest::encapsulate()`.
#[cfg(feature = "client")]
pub struct ClientResponse {
    hpke: HpkeS,
    enc: Vec<u8>,
}

#[cfg(feature = "client")]
impl ClientResponse {
    /// Private method for constructing one of these.
    /// Doesn't do anything because we don't have the nonce yet, so
    /// the work that can be done is limited.
    fn new(hpke: HpkeS, enc: Vec<u8>) -> Self {
        Self { hpke, enc }
    }

    /// Consume this object by decapsulating a response.
    pub fn decapsulate(self, enc_response: &[u8]) -> Res<Vec<u8>> {
        let mid = entropy(self.hpke.config());
        if mid >= enc_response.len() {
            return Err(Error::Truncated);
        }
        let (response_nonce, ct) = enc_response.split_at(mid);
        let mut aead = make_aead(
            Mode::Decrypt,
            self.hpke.config(),
            &export_secret(&self.hpke, LABEL_RESPONSE, self.hpke.config())?,
            &self.enc,
            response_nonce,
        )?;
        aead.open(&[], ct) // 0 is the sequence number
    }
}

#[cfg(all(test, feature = "client", feature = "server"))]
mod test {
    use std::{fmt::Debug, io::ErrorKind};

    use log::trace;

    use crate::{
        config::SymmetricSuite,
        err::Res,
        hpke::{Aead, Kdf, Kem},
        ClientRequest, Error, KeyConfig, KeyId, Server,
    };

    pub const KEY_ID: KeyId = 1;
    pub const KEM: Kem = Kem::X25519Sha256;
    pub const SYMMETRIC: &[SymmetricSuite] = &[
        SymmetricSuite::new(Kdf::HkdfSha256, Aead::Aes128Gcm),
        SymmetricSuite::new(Kdf::HkdfSha256, Aead::ChaCha20Poly1305),
    ];

    pub const REQUEST: &[u8] = &[
        0x00, 0x03, 0x47, 0x45, 0x54, 0x05, 0x68, 0x74, 0x74, 0x70, 0x73, 0x0b, 0x65, 0x78, 0x61,
        0x6d, 0x70, 0x6c, 0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x01, 0x2f,
    ];
    pub const RESPONSE: &[u8] = &[0x01, 0x40, 0xc8];

    pub fn init() {
        crate::init();
        _ = env_logger::try_init(); // ignore errors here
    }

    pub fn make_config() -> KeyConfig {
        KeyConfig::new(KEY_ID, KEM, Vec::from(SYMMETRIC)).unwrap()
    }

    #[test]
    fn request_response() {
        init();

        let server_config = make_config();
        let server = Server::new(server_config).unwrap();
        let encoded_config = server.config().encode().unwrap();
        trace!("Config: {}", hex::encode(&encoded_config));

        let client = ClientRequest::from_encoded_config(&encoded_config).unwrap();
        let (enc_request, client_response) = client.encapsulate(REQUEST).unwrap();
        trace!("Request: {}", hex::encode(REQUEST));
        trace!("Encapsulated Request: {}", hex::encode(&enc_request));

        let (request, server_response) = server.decapsulate(&enc_request).unwrap();
        assert_eq!(&request[..], REQUEST);

        let enc_response = server_response.encapsulate(RESPONSE).unwrap();
        trace!("Encapsulated Response: {}", hex::encode(&enc_response));

        let response = client_response.decapsulate(&enc_response).unwrap();
        assert_eq!(&response[..], RESPONSE);
        trace!("Response: {}", hex::encode(RESPONSE));
    }

    #[test]
    fn two_requests() {
        init();

        let server_config = make_config();
        let server = Server::new(server_config).unwrap();
        let encoded_config = server.config().encode().unwrap();

        let client1 = ClientRequest::from_encoded_config(&encoded_config).unwrap();
        let (enc_request1, client_response1) = client1.encapsulate(REQUEST).unwrap();
        let client2 = ClientRequest::from_encoded_config(&encoded_config).unwrap();
        let (enc_request2, client_response2) = client2.encapsulate(REQUEST).unwrap();
        assert_ne!(enc_request1, enc_request2);

        let (request1, server_response1) = server.decapsulate(&enc_request1).unwrap();
        assert_eq!(&request1[..], REQUEST);
        let (request2, server_response2) = server.decapsulate(&enc_request2).unwrap();
        assert_eq!(&request2[..], REQUEST);

        let enc_response1 = server_response1.encapsulate(RESPONSE).unwrap();
        let enc_response2 = server_response2.encapsulate(RESPONSE).unwrap();
        assert_ne!(enc_response1, enc_response2);

        let response1 = client_response1.decapsulate(&enc_response1).unwrap();
        assert_eq!(&response1[..], RESPONSE);
        let response2 = client_response2.decapsulate(&enc_response2).unwrap();
        assert_eq!(&response2[..], RESPONSE);
    }

    fn assert_truncated<T: Debug>(res: Res<T>) {
        match res.unwrap_err() {
            Error::Truncated => {}
            #[cfg(feature = "rust-hpke")]
            Error::Aead(_) => {}
            #[cfg(feature = "nss")]
            Error::Crypto(_) => {}
            Error::Io(e) => assert_eq!(e.kind(), ErrorKind::UnexpectedEof),
            e => panic!("unexpected error type: {e:?}"),
        }
    }

    fn request_truncated(cut: usize) {
        init();

        let server_config = make_config();
        let server = Server::new(server_config).unwrap();
        let encoded_config = server.config().encode().unwrap();

        let client = ClientRequest::from_encoded_config(&encoded_config).unwrap();
        let (enc_request, _) = client.encapsulate(REQUEST).unwrap();

        let res = server.decapsulate(&enc_request[..cut]);
        assert_truncated(res);
    }

    #[test]
    fn request_truncated_header() {
        request_truncated(4);
    }

    #[test]
    fn request_truncated_enc() {
        // header is 7, enc is 32
        request_truncated(24);
    }

    #[test]
    fn request_truncated_ct() {
        // header and enc is 39, aead needs at least 16 more
        request_truncated(42);
    }

    fn response_truncated(cut: usize) {
        init();

        let server_config = make_config();
        let server = Server::new(server_config).unwrap();
        let encoded_config = server.config().encode().unwrap();

        let client = ClientRequest::from_encoded_config(&encoded_config).unwrap();
        let (enc_request, client_response) = client.encapsulate(REQUEST).unwrap();

        let (request, server_response) = server.decapsulate(&enc_request).unwrap();
        assert_eq!(&request[..], REQUEST);

        let enc_response = server_response.encapsulate(RESPONSE).unwrap();

        let res = client_response.decapsulate(&enc_response[..cut]);
        assert_truncated(res);
    }

    #[test]
    fn response_truncated_ct() {
        // nonce is 16, aead needs at least 16 more
        response_truncated(20);
    }

    #[test]
    fn response_truncated_nonce() {
        response_truncated(7);
    }

    #[cfg(feature = "rust-hpke")]
    #[test]
    fn derive_key_pair() {
        const IKM: &[u8] = &[
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
        ];
        const EXPECTED_CONFIG: &[u8] = &[
            0x01, 0x00, 0x20, 0xfc, 0x01, 0x38, 0x93, 0x64, 0x10, 0x31, 0x1a, 0x0c, 0x64, 0x1a,
            0x5c, 0xa0, 0x86, 0x39, 0x1d, 0xe8, 0xe7, 0x03, 0x82, 0x33, 0x3f, 0x6d, 0x64, 0x49,
            0x25, 0x21, 0xad, 0x7d, 0xc7, 0x8a, 0x5d, 0x00, 0x08, 0x00, 0x01, 0x00, 0x01, 0x00,
            0x01, 0x00, 0x03,
        ];

        init();

        let config = KeyConfig::decode(EXPECTED_CONFIG).unwrap();

        let new_config = KeyConfig::derive(KEY_ID, KEM, Vec::from(SYMMETRIC), IKM).unwrap();
        assert_eq!(config.key_id, new_config.key_id);
        assert_eq!(config.kem, new_config.kem);
        assert_eq!(config.symmetric, new_config.symmetric);

        let server = Server::new(new_config).unwrap();
        let encoded_config = server.config().encode().unwrap();
        assert_eq!(EXPECTED_CONFIG, encoded_config);
    }

    #[test]
    fn request_from_config_list() {
        init();

        let server_config = make_config();
        let server = Server::new(server_config).unwrap();
        let encoded_config = server.config().encode().unwrap();

        let mut header: [u8; 2] = [0; 2];
        header[0] = u8::try_from((encoded_config.len() & 0xFF00) >> 8).unwrap();
        header[1] = u8::try_from(encoded_config.len() & 0xFF).unwrap();
        let mut encoded_config_list = Vec::new();
        encoded_config_list.extend(header.to_vec());
        encoded_config_list.extend(encoded_config);

        let client = ClientRequest::from_encoded_config_list(&encoded_config_list).unwrap();
        let (enc_request, client_response) = client.encapsulate(REQUEST).unwrap();

        let (request, server_response) = server.decapsulate(&enc_request).unwrap();
        assert_eq!(&request[..], REQUEST);

        let enc_response = server_response.encapsulate(RESPONSE).unwrap();

        let response = client_response.decapsulate(&enc_response).unwrap();
        assert_eq!(&response[..], RESPONSE);
    }
}

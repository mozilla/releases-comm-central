use crate::crypto::CryptoError;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("Unparseable Hawk header: {0}")]
    HeaderParseError(String),

    #[error("Invalid url: {0}")]
    InvalidUrl(String),

    #[error("Missing `ts` attribute in Hawk header")]
    MissingTs,

    #[error("Missing `nonce` attribute in Hawk header")]
    MissingNonce,

    #[error("{0}")]
    InvalidBewit(#[source] InvalidBewit),

    #[error("{0}")]
    Io(#[source] std::io::Error),

    #[error("Base64 Decode error: {0}")]
    Decode(String),

    #[error("Crypto error: {0}")]
    Crypto(#[source] CryptoError),
}

#[derive(thiserror::Error, Debug, PartialEq)]
pub enum InvalidBewit {
    #[error("Multiple bewits in URL")]
    Multiple,
    #[error("Invalid bewit format")]
    Format,
    #[error("Invalid bewit id")]
    Id,
    #[error("Invalid bewit exp")]
    Exp,
    #[error("Invalid bewit mac")]
    Mac,
    #[error("Invalid bewit ext")]
    Ext,
}

impl Error {
    // this cannot be a `From<..>` implementation as that publicly exposes the version of base64
    // used in this crate.
    pub(crate) fn from_base64_error(e: base64::DecodeError) -> Self {
        Error::Decode(e.to_string())
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

impl From<CryptoError> for Error {
    fn from(e: CryptoError) -> Self {
        Error::Crypto(e)
    }
}

impl From<InvalidBewit> for Error {
    fn from(e: InvalidBewit) -> Self {
        Error::InvalidBewit(e)
    }
}

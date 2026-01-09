use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[cfg(feature = "rust-hpke")]
    #[error("a problem occurred with the AEAD")]
    Aead(#[from] aead::Error),
    #[cfg(feature = "stream")]
    #[error("a stream chunk was larger than the maximum allowed size")]
    ChunkTooLarge,
    #[cfg(feature = "nss")]
    #[error("a problem occurred during cryptographic processing: {0}")]
    Crypto(#[from] crate::nss::Error),
    #[cfg(feature = "stream")]
    #[error("a stream contained data after the last chunk")]
    ExtraData,
    #[error("an error was found in the format")]
    Format,
    #[cfg(feature = "rust-hpke")]
    #[error("a problem occurred with HPKE: {0}")]
    Hpke(#[from] ::hpke::HpkeError),
    #[error("an internal error occurred")]
    Internal,
    #[error("the wrong type of key was provided for the selected KEM")]
    InvalidKeyType,
    #[error("the wrong KEM was specified")]
    InvalidKem,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("the key ID was invalid")]
    KeyId,
    #[cfg(feature = "stream")]
    #[error("the object was not ready")]
    NotReady,
    #[error("the configuration contained too many symmetric suites")]
    TooManySymmetricSuites,
    #[error("a field was truncated")]
    Truncated,
    #[error("the configuration was not supported")]
    Unsupported,
    #[cfg(feature = "stream")]
    #[error("writes are not supported after closing")]
    WriteAfterClose,
}

impl From<std::num::TryFromIntError> for Error {
    fn from(_v: std::num::TryFromIntError) -> Self {
        Self::TooManySymmetricSuites
    }
}

pub type Res<T> = Result<T, Error>;

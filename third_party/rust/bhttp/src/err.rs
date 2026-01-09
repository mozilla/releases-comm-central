#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("a request used the CONNECT method")]
    ConnectUnsupported,
    #[error("a field contained invalid Unicode: {0}")]
    CharacterEncoding(#[from] std::string::FromUtf8Error),
    #[error("read a response when expecting a request")]
    ExpectedRequest,
    #[error("read a request when expecting a response")]
    ExpectedResponse,
    #[error("a field contained an integer value that was out of range: {0}")]
    IntRange(#[from] std::num::TryFromIntError),
    #[error("the mode of the message was invalid")]
    InvalidMode,
    #[error("the status code of a response needs to be in 100..=599")]
    InvalidStatus,
    #[cfg(feature = "stream")]
    #[error("a method was called when the message was in the wrong state")]
    InvalidState,
    #[error("IO error {0}")]
    Io(#[from] std::io::Error),
    #[cfg(feature = "stream")]
    #[error("the size of a vector exceeded the limit that was set")]
    LimitExceeded,
    #[error("a field or line was missing a necessary character 0x{0:x}")]
    Missing(u8),
    #[error("a URL was missing a key component")]
    MissingUrlComponent,
    #[error("an obs-fold line was the first line of a field section")]
    ObsFold,
    #[error("a field contained a non-integer value: {0}")]
    ParseInt(#[from] std::num::ParseIntError),
    #[error("a field was truncated")]
    Truncated,
    #[error("a message included the Upgrade field")]
    UpgradeUnsupported,
    #[error("a URL could not be parsed into components: {0}")]
    #[cfg(feature = "http")]
    UrlParse(#[from] url::ParseError),
}

pub type Res<T> = Result<T, Error>;

use std::{fmt, io};

/// `Result` from std, with the error type defaulting to xshell_venv's [`Error`].
pub type Result<T, E = Error> = std::result::Result<T, E>;

/// An error returned by an `xshell` operation.
pub enum Error {
    PythonNotDetected(&'static str),
    Xshell(xshell::Error),
    Io(io::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::PythonNotDetected(s) => write!(f, "{}", s),
            Error::Xshell(e) => write!(f, "{}", e),
            Error::Io(e) => write!(f, "{}", e),
        }
    }
}

impl From<xshell::Error> for Error {
    fn from(error: xshell::Error) -> Error {
        Error::Xshell(error)
    }
}

impl From<&'static str> for Error {
    fn from(msg: &'static str) -> Error {
        Error::PythonNotDetected(msg)
    }
}

impl From<io::Error> for Error {
    fn from(value: io::Error) -> Self {
        Error::Io(value)
    }
}

impl fmt::Debug for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}
impl std::error::Error for Error {}

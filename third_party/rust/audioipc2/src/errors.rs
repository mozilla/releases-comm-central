// Copyright © 2017 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

use std::fmt;

#[derive(Debug)]
pub enum Error {
    Bincode(bincode::Error),
    Io(std::io::Error),
    Cubeb(cubeb::Error),
    Disconnected,
    Other(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Bincode(e) => write!(f, "Bincode error: {e}"),
            Error::Io(e) => write!(f, "IO error: {e}"),
            Error::Cubeb(e) => write!(f, "Cubeb error: {e}"),
            Error::Disconnected => write!(f, "Disconnected"),
            Error::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Error::Bincode(e) => Some(e),
            Error::Io(e) => Some(e),
            Error::Cubeb(e) => Some(e),
            Error::Disconnected => None,
            Error::Other(_) => None,
        }
    }
}

impl From<bincode::Error> for Error {
    fn from(err: bincode::Error) -> Self {
        Error::Bincode(err)
    }
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Io(err)
    }
}

impl From<cubeb::Error> for Error {
    fn from(err: cubeb::Error) -> Self {
        Error::Cubeb(err)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

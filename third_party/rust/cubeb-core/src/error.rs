use ffi;
use std::ffi::NulError;
use std::os::raw::c_int;
use std::{error, fmt};

pub type Result<T> = ::std::result::Result<T, Error>;

/// An enumeration of possible errors that can happen when working with cubeb.
#[derive(PartialEq, Eq, Clone, Debug, Copy)]
pub enum Error {
    /// GenericError
    Error = ffi::CUBEB_ERROR as isize,
    /// Requested format is invalid
    InvalidFormat = ffi::CUBEB_ERROR_INVALID_FORMAT as isize,
    /// Requested parameter is invalid
    InvalidParameter = ffi::CUBEB_ERROR_INVALID_PARAMETER as isize,
    /// Requested operation is not supported
    NotSupported = ffi::CUBEB_ERROR_NOT_SUPPORTED as isize,
    /// Requested device is unavailable
    DeviceUnavailable = ffi::CUBEB_ERROR_DEVICE_UNAVAILABLE as isize,
}

impl Error {
    pub fn wrap(code: c_int) -> Result<()> {
        let inner = match code {
            ffi::CUBEB_OK => return Ok(()),
            ffi::CUBEB_ERROR_INVALID_FORMAT => Error::InvalidFormat,
            ffi::CUBEB_ERROR_INVALID_PARAMETER => Error::InvalidParameter,
            ffi::CUBEB_ERROR_NOT_SUPPORTED => Error::NotSupported,
            ffi::CUBEB_ERROR_DEVICE_UNAVAILABLE => Error::DeviceUnavailable,
            // Everything else is just the generic error
            _ => {
                debug_assert!(code == Error::Error as c_int);
                Error::Error
            }
        };

        Err(inner)
    }
}

impl error::Error for Error {
    fn description(&self) -> &str {
        match self {
            Error::Error => "Error",
            Error::InvalidFormat => "Invalid format",
            Error::InvalidParameter => "Invalid parameter",
            Error::NotSupported => "Not supported",
            Error::DeviceUnavailable => "Device unavailable",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl From<NulError> for Error {
    fn from(_: NulError) -> Error {
        Error::Error
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ffi;

    #[test]
    fn test_from_raw() {
        macro_rules! test {
            ( $($raw:ident => $err:ident),* ) => {{
                $(
                    let e = Error::wrap(ffi::$raw);
                    assert_eq!(e.unwrap_err() as c_int, ffi::$raw);
                )*
            }};
        }
        test!(CUBEB_ERROR => Error,
              CUBEB_ERROR_INVALID_FORMAT => InvalidFormat,
              CUBEB_ERROR_INVALID_PARAMETER => InvalidParameter,
              CUBEB_ERROR_NOT_SUPPORTED => NotSupported,
              CUBEB_ERROR_DEVICE_UNAVAILABLE => DeviceUnavailable
        );
    }
}

use core::ffi::c_int;

#[cfg(feature = "unix_stream")]
pub use unix_stream::UnixStream;

#[cfg(feature = "unix_stream")]
mod unix_stream;

pub type Result<T> = core::result::Result<T, Error>;

pub trait Io: core::fmt::Debug {
    fn read_exact(&mut self, buf: &mut [u8]) -> Result<()>;
    fn write_all(&mut self, buf: &[u8]) -> Result<()>;
}

#[derive(Debug, serde::Deserialize, serde::Serialize, thiserror::Error)]
pub enum Error {
    #[error("an OS error occurred. Errno: {0}")]
    OsError(c_int),
    #[error("unexpected end-of-file reached")]
    UnexpectedEof,
}

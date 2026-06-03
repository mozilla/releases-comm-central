//! Common module reader types.
use {
    crate::process_reader::{CopyFromProcessError, ProcessReader},
    std::borrow::Cow,
};

#[cfg(any(target_os = "linux", target_os = "android"))]
pub use crate::linux::module_reader::*;

#[cfg(target_os = "windows")]
pub use crate::windows::module_reader::*;

#[cfg(target_os = "macos")]
pub use crate::mac::module_reader::*;

pub struct ProcessModuleMemoryReader<'a> {
    pub(super) reader: &'a ProcessReader,
    pub(super) start_address: u64,
}

impl<'a> ProcessModuleMemoryReader<'a> {
    pub fn new(reader: &'a ProcessReader, start_address: usize) -> Self {
        Self {
            reader,
            start_address: start_address as u64,
        }
    }
    pub fn read(&self, offset: u64, length: u64) -> Result<Cow<'a, [u8]>, ModuleMemoryReadError> {
        let inner = || {
            let address = self
                .start_address
                .checked_add(offset)
                .ok_or(ReadError::Overflow)?;
            let address = usize::try_from(address).map_err(|_| ReadError::Overflow)?;
            let length = usize::try_from(length).map_err(|_| ReadError::Overflow)?;
            let length =
                std::num::NonZeroUsize::new(length).ok_or(ReadError::ZeroLengthProcessRead)?;
            self.reader
                .read_to_vec(address, length)
                .map(Cow::Owned)
                .map_err(ReadError::CopyError)
        };

        inner().map_err(|error| ModuleMemoryReadError {
            start_address: Some(self.start_address),
            offset,
            length,
            error,
        })
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
#[error("Error reading {length} bytes at {offset:#x}{}: {error}",
    .start_address.map(|s| format!(" (module start address {s:#x})")).unwrap_or_default()
)]
pub struct ModuleMemoryReadError {
    pub offset: u64,
    pub length: u64,
    pub start_address: Option<u64>,
    #[source]
    pub error: ReadError,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum ReadError {
    #[error("Attempted to read 0 bytes from process memory")]
    ZeroLengthProcessRead,
    #[error("Read overflowed the address space")]
    Overflow,
    #[error("Read was out of slice memory bounds")]
    OutOfBounds,
    #[error(transparent)]
    CopyError(#[from] CopyFromProcessError),
}

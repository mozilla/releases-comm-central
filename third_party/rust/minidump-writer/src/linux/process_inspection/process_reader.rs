use super::{
    Error, ProcessInspector,
    maps_reader::{MappingInfo, MapsReaderError},
};
use crate::module_reader::ProcessModuleMemoryReader;

use plain::Plain;

pub type ProcessHandle = libc::pid_t;

#[derive(Debug)]
pub struct ProcessReader<'a>(&'a dyn ProcessReaderBackend);

impl<'a> ProcessReader<'a> {
    /// Read memory from the process into the given buffer.
    ///
    /// Returns the number of bytes read.
    pub fn read(&self, src: usize, dst: &mut [u8]) -> Result<usize, CopyFromProcessError> {
        self.0.read_at(src, dst)
    }

    /// Read memory from the process until the buffer is filled.
    ///
    /// This is a convenience wrapper around [`ProcessReader::read`]. Unlike
    /// [`read`](Self::read), this method does not return successful short
    /// reads. It repeatedly calls [`read`](Self::read), advancing `address`
    /// and the output buffer by the number of bytes read, until the entire buffer
    /// has been filled.
    ///
    /// If an underlying read fails before the buffer is filled, this method returns
    /// that error as is. If an underlying read succeeds but returns `0`
    /// bytes before the buffer is filled, this method returns
    /// [`CopyFromProcessError::Backend`] containing [`Error::UnexpectedEndOfFile`].
    ///
    /// On success, all of `buf` has been filled with bytes read from the target
    /// process.
    ///
    /// # Errors
    ///
    /// Returns whichever error [`read`](Self::read) would return.
    ///
    /// In addition, returns [`CopyFromProcessError::Backend`] containing
    /// [`Error::UnexpectedEndOfFile`] if an underlying read returns `0` bytes
    /// before the buffer is full, and [`CopyFromProcessError::Backend`] containing
    /// [`Error::AddressOverflowed`] if advancing the read address by the number of
    /// bytes read would wrap past the end of the address space.
    ///
    /// If this method returns an error, `buf` may have been partially overwritten.
    /// The error type does not report how many bytes were read before the failure.
    pub fn read_exact(
        &self,
        mut src: usize,
        mut dst: &mut [u8],
    ) -> Result<(), CopyFromProcessError> {
        if dst.is_empty() {
            return Ok(());
        }

        loop {
            let bytes_read = self.read(src, dst)?;
            if bytes_read == 0 {
                return Err(CopyFromProcessError::Backend(Error::UnexpectedEndOfFile));
            }
            if bytes_read == dst.len() {
                return Ok(());
            }
            src = src
                .checked_add(bytes_read)
                .ok_or(CopyFromProcessError::Backend(Error::AddressOverflowed))?;
            dst = &mut dst[bytes_read..];
        }
    }

    /// Reads a plain-old-data value of type `T` from the target process at
    /// `address`.
    ///
    /// This reads exactly `size_of::<T>()` bytes into a freshly zeroed `T` using
    /// [`read_exact`](Self::read_exact). The [`Plain`] bound guarantees that
    /// every possible bit pattern is a valid `T`, so the bytes read from the
    /// target process are always a valid value.
    ///
    /// # Errors
    ///
    /// See [`read_exact`](Self::read_exact) for the possible errors.
    pub fn read_pod<T: Plain>(&self, address: usize) -> Result<T, CopyFromProcessError> {
        // Safety: `Plain` is an unsafe trait that may only be implemented on
        // types for which every possible bit pattern is valid, so there is
        // nothing we could read from the other process that isn't a valid value
        // for `T`.
        let mut pod: T = unsafe { core::mem::zeroed() };
        let bytes = unsafe {
            core::slice::from_raw_parts_mut(
                core::ptr::from_mut(&mut pod).cast::<u8>(),
                size_of::<T>(),
            )
        };
        self.read_exact(address, bytes)?;
        Ok(pod)
    }

    /// Read `count` consecutive plain-old-data values of type `T` starting at
    /// `address`.
    pub fn read_pod_vec<T: Plain>(
        &self,
        mut address: usize,
        count: usize,
    ) -> Result<Vec<T>, CopyFromProcessError> {
        let mut v = Vec::with_capacity(count);
        for _ in 0..count {
            v.push(self.read_pod(address)?);
            address += std::mem::size_of::<T>();
        }
        Ok(v)
    }

    /// Read bytes from the process starting at `address` into `buf` up to and
    /// including the first `terminator` byte (or until a read returns no bytes).
    ///
    /// Returns the number of bytes appended to `buf`.
    pub fn read_until(
        &self,
        mut address: usize,
        terminator: u8,
        buf: &mut Vec<u8>,
    ) -> Result<usize, CopyFromProcessError> {
        let start_len = buf.len();
        let mut b = [0u8];
        while self.read(address, &mut b)? > 0 {
            buf.push(b[0]);
            if b[0] == terminator {
                break;
            }
            address += 1;
        }
        Ok(buf.len() - start_len)
    }

    /// Find the address at which a module with the given name is loaded in the process.
    pub fn find_module(
        &self,
        module_name: &str,
    ) -> Result<ProcessModuleMemoryReader<'_>, FindModuleError> {
        MappingInfo::for_pid(
            self.0.process_inspector(),
            self.0
                .process_inspector()
                .pid()
                .map_err(FindModuleError::GetTargetPidFailed)?,
            None,
        )?
        .into_iter()
        .find_map(|m| {
            let mmem = ProcessModuleMemoryReader::new(self, m.start_address);
            let name = m.name.as_ref().and_then(|s| s.to_str())?;
            if name == module_name {
                return Some(mmem);
            }
            // Check whether the SO_NAME matches the module name.
            //
            // For now, only check the SO_NAME of Android APKS, because libraries may be mapped
            // directly from within an APK. See bug 1982902.
            #[cfg(target_os = "android")]
            if name.ends_with(".apk")
                && let Ok(so_name) = crate::module_reader::read_soname_from_module(&mmem)
                && so_name == name
            {
                return Some(mmem);
            }

            None
        })
        .ok_or(FindModuleError::ModuleNotFound)
    }
    pub(crate) fn new(backend: &'a dyn ProcessReaderBackend) -> Self {
        Self(backend)
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum CopyFromProcessError {
    #[error("an error occurred calling ProcessReader")]
    Backend(Error),
    #[error("an invalid argument was passed")]
    InvalidArgument,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FindModuleError {
    #[error("Module not found")]
    ModuleNotFound,
    #[error("Failed to read process module mappings")]
    MappingError(#[from] MapsReaderError),
    #[error("Failed to get PID of target process")]
    GetTargetPidFailed(#[source] Error),
}

pub(crate) trait ProcessReaderBackend: core::fmt::Debug {
    fn process_inspector(&self) -> &dyn ProcessInspector;
    fn read_at(&self, src: usize, dst: &mut [u8]) -> Result<usize, CopyFromProcessError>;
}

use super::error::{OpenFailed, ReadAtFailed, ReadExactAtError};
use core::{
    ffi::{CStr, c_int},
    fmt,
};

pub(crate) struct ByteSliceWriter<'a>(Option<&'a mut [u8]>);

impl<'a> ByteSliceWriter<'a> {
    pub(crate) fn new(b: &'a mut [u8]) -> Self {
        Self(Some(b))
    }
}

impl<'a> fmt::Write for ByteSliceWriter<'a> {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        let buf = self.0.take().unwrap();
        let (dst, tail) = buf.split_at_mut_checked(s.len()).ok_or(fmt::Error)?;
        dst.copy_from_slice(s.as_bytes());
        self.0 = Some(tail);
        Ok(())
    }
}

#[derive(Debug)]
pub(crate) struct File(c_int);

impl File {
    pub(crate) fn open(path: &CStr) -> Result<Self, OpenFailed> {
        loop {
            let rv = unsafe { libc::open64(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC, 0) };
            if rv != -1 {
                return Ok(Self(rv));
            }
            let err = errno();
            if err != libc::EINTR {
                return Err(OpenFailed(err));
            }
        }
    }
    pub(crate) fn read_exact_at(
        &self,
        position: usize,
        buf: &mut [u8],
    ) -> Result<(), ReadExactAtError> {
        let mut offset = 0;

        while offset < buf.len() {
            let position = position
                .checked_add(offset)
                .ok_or(ReadExactAtError::AddressOverflow)?;
            let bytes_read = self
                .read_at(position, &mut buf[offset..])
                .map_err(ReadExactAtError::ReadAt)?;
            if bytes_read == 0 {
                return Err(ReadExactAtError::UnexpectedEof { position });
            }
            offset += bytes_read;
        }

        Ok(())
    }
    pub(crate) fn read_at(&self, position: usize, buf: &mut [u8]) -> Result<usize, ReadAtFailed> {
        let position =
            libc::off64_t::try_from(position).map_err(|_| ReadAtFailed::AddressOutOfBounds)?;

        loop {
            let rv = unsafe { libc::pread64(self.0, buf.as_mut_ptr().cast(), buf.len(), position) };
            if rv != -1 {
                return Ok(usize::try_from(rv).unwrap());
            }
            let err = errno();
            if err != libc::EINTR {
                return Err(ReadAtFailed::Syscall(err));
            }
        }
    }
}

impl Drop for File {
    fn drop(&mut self) {
        unsafe {
            let rv = libc::close(self.0);
            if rv == -1 {
                // Not much we can really do here
            }
        }
    }
}

pub(crate) fn errno() -> c_int {
    unsafe { *errno_location() }
}

pub(crate) fn set_errno(value: c_int) {
    unsafe { *errno_location() = value };
}

#[cfg(target_os = "linux")]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno_location() }
}

#[cfg(target_os = "android")]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno() }
}

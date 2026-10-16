use super::super::io;
use crate::wrapper::{OwnedFd, errno};
use core::ffi::c_int;
use io::{Error, Result};

#[derive(Debug)]
pub struct UnixStream(OwnedFd);

impl UnixStream {
    pub fn pair() -> Result<(UnixStream, UnixStream)> {
        let mut fds = [0; 2];
        let rv = unsafe { libc::socketpair(libc::AF_UNIX, libc::SOCK_STREAM, 0, fds.as_mut_ptr()) };
        if rv == -1 {
            return Err(Error::OsError(errno()));
        }
        let stream0 = unsafe { Self::from_raw_fd(fds[0]) };
        let stream1 = unsafe { Self::from_raw_fd(fds[1]) };
        Ok((stream0, stream1))
    }

    /// # Safety
    ///
    /// 'fd' must be a valid UNIX stream socket
    pub unsafe fn from_raw_fd(fd: c_int) -> Self {
        unsafe { Self(OwnedFd::new(fd)) }
    }

    pub fn as_raw_fd(&self) -> c_int {
        self.0.as_raw_fd()
    }

    fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        let rv = unsafe { libc::read(self.0.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) };
        if rv == -1 {
            return Err(Error::OsError(errno()));
        }
        let bytes_read = usize::try_from(rv).unwrap();
        Ok(bytes_read)
    }

    fn write(&mut self, buf: &[u8]) -> Result<usize> {
        let rv = unsafe { libc::write(self.0.as_raw_fd(), buf.as_ptr().cast(), buf.len()) };
        if rv == -1 {
            return Err(Error::OsError(errno()));
        }
        let bytes_written = usize::try_from(rv).unwrap();
        Ok(bytes_written)
    }
}

impl io::Io for UnixStream {
    fn read_exact(&mut self, mut buf: &mut [u8]) -> Result<()> {
        while !buf.is_empty() {
            let bytes_read = self.read(buf)?;
            if bytes_read == 0 {
                return Err(Error::UnexpectedEof);
            }
            buf = &mut buf[bytes_read..];
        }
        Ok(())
    }

    fn write_all(&mut self, mut buf: &[u8]) -> Result<()> {
        while !buf.is_empty() {
            let bytes_written = self.write(buf)?;
            assert_ne!(bytes_written, 0);
            buf = &buf[bytes_written..];
        }
        Ok(())
    }
}

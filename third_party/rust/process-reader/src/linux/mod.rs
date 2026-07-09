//! Read memory from another Linux or Android process.
//!
//! `process-reader` is a small `no_std` helper crate for copying raw bytes from a
//! target process into caller-provided buffers. It is intended for crash-reporting
//! and minidump-writing code that needs to inspect a process without taking a
//! dependency on the standard library.
//!
//! The main entry point is [`ProcessReader`]. A reader can either be created in
//! automatic mode with [`ProcessReader::new`], or pinned to one of the supported
//! Linux/Android mechanisms:
//!
//! - [`ProcessReader::for_virtual_mem`] uses `process_vm_readv(2)`.
//! - [`ProcessReader::for_file`] uses `/proc/<pid>/mem`.
//! - [`ProcessReader::for_ptrace`] uses `ptrace(PTRACE_PEEKDATA)`.
//!
//! # Read semantics
//!
//! [`ProcessReader::read_at`] attempts to copy bytes from a virtual address in the
//! target process into the caller's buffer. It returns the number of bytes copied,
//! in the range `0..=buf.len()`. That number may be smaller than the buffer
//! length. A short successful read is returned as `Ok(n)`, not as an error, and
//! callers should only interpret `buf[..n]` as bytes read by the call.
//!
//! The target process may modify its memory while it is being read. This crate
//! does not suspend the target or provide snapshot consistency.
//!
//! # Strategy selection
//!
//! [`ProcessReader::new`] tries the strategies in this order: `process_vm_readv`,
//! `/proc/<pid>/mem`, then `ptrace(PTRACE_PEEKDATA)`. The first strategy that
//! returns `Ok(_)` for a non-empty request selects the strategy for that reader,
//! even if that successful read is shorter than the requested buffer.
//! Future reads through the same reader use the selected strategy directly; they
//! do not fall back to other strategies if the selected strategy later fails for a
//! different address.
//!
//! This keeps the common path small and predictable, but callers should create a
//! new [`ProcessReader`] if they want to retry automatic strategy selection after
//! a strategy-specific failure.
//!
//! # Error model
//!
//! [`ProcessReader::read_at`] returns [`ReadError`] only when the selected strategy
//! reports an error, or when automatic strategy selection cannot get any strategy
//! to return a successful read. Short successful reads are reported as `Ok(n)`.
//!
//! When exactly one strategy failed, [`core::error::Error::source`] returns that
//! strategy's lower-level error. When automatic selection fails because every
//! strategy failed, there is no single root cause, so `source()` returns `None`.
//! Use [`ReadError::virtual_mem_error`], [`ReadError::file_error`], and
//! [`ReadError::ptrace_error`] to inspect the individual strategy failures.
//!
//! The contents of the destination buffer are unspecified after an error. Some
//! strategies can fail after writing part of the requested range, and errors do
//! not report how many bytes were copied before the failure.
//!
//! # Platform support
//!
//! This crate supports Linux and Android. Other operating systems fail to compile.
//! The intended Android targets are contemporary Android systems; very old Android
//! releases are not part of the supported configuration.
//!
//! # Example
//!
//! ```no_run
//! # fn example() -> Result<(), process_reader::ReadError> {
//! use process_reader::ProcessReader;
//!
//! let pid = 12345 as libc::pid_t;
//! let reader = ProcessReader::new(pid);
//!
//! let mut bytes = [0u8; 16];
//! let bytes_read = reader.read_at(0x1000, &mut bytes)?;
//! let bytes = &bytes[..bytes_read];
//! # let _ = bytes;
//! # Ok(())
//! # }
//! ```

use self::{error::*, wrapper::*};
use core::{
    cell::OnceCell,
    ffi::{CStr, c_long, c_void},
    fmt::Write,
    mem::size_of,
    ptr,
};

pub use error::{ReadError, ReadExactError};

mod error;
mod wrapper;

const PTRACE_PEEKDATA_LEN: usize = size_of::<c_long>();

/// Reads raw bytes from another Linux or Android process.
///
/// A `ProcessReader` is bound to a single target process ID. It can either
/// choose a read strategy automatically with [`ProcessReader::new`], or be
/// constructed with a fixed strategy using [`ProcessReader::for_virtual_mem`],
/// [`ProcessReader::for_file`], or [`ProcessReader::for_ptrace`].
///
/// The type does not interpret the bytes it reads. It only copies bytes from the
/// target process into the caller's buffer and reports how many bytes were copied.
///
/// # Process state and permissions
///
/// The operating system still enforces the usual Linux/Android access checks.
/// Depending on the chosen strategy, the caller may need suitable ptrace-style
/// permissions, ownership, dumpability, capabilities, or an already-stopped
/// tracee.
///
/// `ProcessReader` does not suspend the target process, attach to it, detach from
/// it, or otherwise manage target process lifetime. It also does not provide a
/// consistent snapshot if the target process mutates memory while it is being
/// read.
#[derive(Debug)]
pub struct ProcessReader {
    pid: libc::pid_t,
    style: OnceCell<Style>,
}

impl ProcessReader {
    /// Creates a reader that automatically chooses a process-memory read strategy.
    ///
    /// The first non-empty call to [`read_at`](Self::read_at) tries the supported
    /// strategies in this order:
    ///
    /// 1. `process_vm_readv(2)`
    /// 2. `/proc/<pid>/mem`
    /// 3. `ptrace(PTRACE_PEEKDATA)`
    ///
    /// The first strategy that returns `Ok(_)` is cached and used for all
    /// subsequent reads through this `ProcessReader`. A successful read may be
    /// shorter than the requested buffer; a short successful read still selects
    /// the strategy. Subsequent reads do not fall back to another strategy if the
    /// cached strategy fails.
    ///
    /// Empty reads succeed immediately, return `Ok(0)`, and do not select a
    /// strategy.
    ///
    /// # Panics
    ///
    /// Panics if `pid < 0`. Passing a negative PID is treated as a caller logic
    /// error.
    pub fn new(pid: libc::pid_t) -> Self {
        Self::assert_valid_pid(pid);
        Self {
            pid,
            style: OnceCell::new(),
        }
    }

    /// Creates a reader pinned to the `process_vm_readv(2)` strategy.
    ///
    /// Reads performed through the returned reader use only `process_vm_readv`.
    /// They do not fall back to `/proc/<pid>/mem` or `ptrace`.
    ///
    /// This is generally the fastest strategy when the kernel permits it. It can
    /// also return a short successful read if `process_vm_readv` transfers fewer
    /// bytes than requested.
    ///
    /// # Panics
    ///
    /// Panics if `pid < 0`. Passing a negative PID is treated as a caller logic
    /// error.
    pub fn for_virtual_mem(pid: libc::pid_t) -> Self {
        Self::assert_valid_pid(pid);
        Self {
            pid,
            style: OnceCell::from(Style::VirtualMem),
        }
    }

    /// Creates a reader pinned to the `/proc/<pid>/mem` strategy.
    ///
    /// This constructor opens `/proc/<pid>/mem` immediately and keeps the file
    /// descriptor open for the lifetime of the returned reader. Reads performed
    /// through the returned reader use only that file descriptor and do not fall
    /// back to `process_vm_readv` or `ptrace`.
    ///
    /// This strategy currently attempts to fill the whole requested buffer. On
    /// success, [`read_at`](Self::read_at) returns `Ok(buf.len())`. If the file
    /// read fails or reaches EOF before the buffer is filled, `read_at` returns an
    /// error, and the buffer may have been partially overwritten.
    ///
    /// # Errors
    ///
    /// Returns [`ReadError`] if `/proc/<pid>/mem` could not be opened.
    ///
    /// # Panics
    ///
    /// Panics if `pid < 0`. Passing a negative PID is treated as a caller logic
    /// error.
    pub fn for_file(pid: libc::pid_t) -> Result<Self, ReadError> {
        Self::assert_valid_pid(pid);
        let file = Self::open_mem_file_for_pid(pid)
            .map_err(FileStrategyError::Open)
            .map_err(|e| ReadError(ReadErrorInner::FileStrategy(e)))?;
        Ok(Self {
            pid,
            style: OnceCell::from(Style::File(file)),
        })
    }

    /// Creates a reader pinned to the `ptrace(PTRACE_PEEKDATA)` strategy.
    ///
    /// Reads performed through the returned reader use only
    /// `ptrace(PTRACE_PEEKDATA)`. They do not fall back to `process_vm_readv` or
    /// `/proc/<pid>/mem`.
    ///
    /// This constructor does not call `PTRACE_ATTACH`, `PTRACE_SEIZE`,
    /// `waitpid`, `PTRACE_CONT`, or `PTRACE_DETACH`. The caller must arrange any
    /// required ptrace relationship and stopped tracee state before reading.
    ///
    /// The requested address does not need to be word-aligned; the implementation
    /// performs aligned `PTRACE_PEEKDATA` reads internally and copies the requested
    /// byte range out of those words.
    ///
    /// This strategy currently attempts to fill the whole requested buffer. On
    /// success, [`read_at`](Self::read_at) returns `Ok(buf.len())`. If a ptrace
    /// read fails before the buffer is filled, `read_at` returns an error, and the
    /// buffer may have been partially overwritten.
    ///
    /// # Panics
    ///
    /// Panics if `pid < 0`. Passing a negative PID is treated as a caller logic
    /// error.
    pub fn for_ptrace(pid: libc::pid_t) -> Self {
        Self::assert_valid_pid(pid);
        Self {
            pid,
            style: OnceCell::from(Style::Ptrace),
        }
    }

    /// Reads from another process until `buf` is completely filled.
    ///
    /// This is a convenience wrapper around [`ProcessReader::read_at`]. Unlike
    /// [`read_at`](Self::read_at), this method does not return successful short
    /// reads. It repeatedly calls [`read_at`](Self::read_at), advancing `address`
    /// and the output buffer by the number of bytes read, until the entire buffer
    /// has been filled.
    ///
    /// If an underlying read fails before the buffer is filled, this method returns
    /// [`ReadExactError::Read`]. If an underlying read succeeds but returns `0`
    /// bytes before the buffer is filled, this method returns
    /// [`ReadExactError::UnexpectedEof`].
    ///
    /// On success, all of `buf` has been filled with bytes read from the target
    /// process.
    ///
    /// # Strategy selection
    ///
    /// This method uses [`ProcessReader::read_at`] internally, so it follows the
    /// same strategy-selection rules. In particular, a reader created with
    /// [`ProcessReader::new`] caches the first strategy that succeeds for a
    /// non-empty read, even if that read is short. Later reads performed by this
    /// method continue using the selected strategy.
    ///
    /// # Errors
    ///
    /// Returns [`ReadExactError::Read`] if [`read_at`](Self::read_at) returns an
    /// error before the buffer is full.
    ///
    /// Returns [`ReadExactError::UnexpectedEof`] if [`read_at`](Self::read_at)
    /// returns `Ok(0)` before the buffer is full. A zero-length successful read is
    /// treated as an exact-read failure because this method could not make forward
    /// progress.
    ///
    /// If this method returns an error, `buf` may have been partially overwritten.
    /// This error type does not report how many bytes were read before the failure.
    ///
    /// # Panics
    ///
    /// Panics if a successful partial read leaves bytes remaining in `buf`, but
    /// advancing the read address by the number of bytes read would wrap past the
    /// end of the address space.
    pub fn read_exact_at(
        &self,
        mut address: usize,
        mut buf: &mut [u8],
    ) -> Result<(), ReadExactError> {
        if buf.is_empty() {
            return Ok(());
        }

        loop {
            let bytes_read = self.read_at(address, buf).map_err(ReadExactError::Read)?;
            if bytes_read == 0 {
                return Err(ReadExactError::UnexpectedEof);
            }
            if bytes_read == buf.len() {
                return Ok(());
            }
            address = address
                .checked_add(bytes_read)
                .expect("requested read will wrap past end of address space");
            buf = &mut buf[bytes_read..];
        }
    }

    /// Attempts to read bytes from the target process at `address`.
    ///
    /// This method copies bytes from `address` in the target process into `buf`
    /// and returns the number of bytes copied. The returned length is in the
    /// range `0..=buf.len()` and may be smaller than `buf.len()`. A short
    /// successful read is returned as `Ok(n)`, not as an error, and callers should
    /// only interpret `buf[..n]` as bytes read by this call.
    ///
    /// If `buf` is empty, this method returns `Ok(0)` without performing a system
    /// call and without selecting a strategy for readers created with
    /// [`ProcessReader::new`].
    ///
    /// The `address` is a virtual address in the target process, not in the
    /// calling process.
    ///
    /// # Strategy behavior
    ///
    /// For readers created with [`ProcessReader::new`], the first `Ok(_)` from a
    /// non-empty read request selects a strategy for the reader. A successful
    /// read may be shorter than the requested buffer, and a short successful read
    /// still selects the strategy. Future reads use that selected strategy only.
    ///
    /// Readers created with [`ProcessReader::for_virtual_mem`],
    /// [`ProcessReader::for_file`], or [`ProcessReader::for_ptrace`] always use
    /// only the requested strategy.
    ///
    /// The `process_vm_readv(2)` strategy returns the byte count reported by
    /// `process_vm_readv`. The `/proc/<pid>/mem` and `ptrace(PTRACE_PEEKDATA)`
    /// strategies currently attempt to fill the whole buffer and return
    /// `Ok(buf.len())` on success.
    ///
    /// # Errors
    ///
    /// Returns [`ReadError`] if the selected strategy reports an error, or if
    /// automatic strategy selection cannot get any strategy to return success.
    ///
    /// A failed read may have partially overwritten `buf`, and the error does not
    /// report how many bytes were copied before the failure. Callers should not
    /// rely on the contents of `buf` after an error.
    pub fn read_at(&self, address: usize, buf: &mut [u8]) -> Result<usize, ReadError> {
        if buf.is_empty() {
            return Ok(0);
        }

        if let Some(style) = self.style.get() {
            return match style {
                Style::VirtualMem => {
                    Self::vmem(self.pid, address, buf).map_err(ReadErrorInner::VirtualMemStrategy)
                }
                Style::File(file) => Self::file(file, address, buf)
                    .map(|()| buf.len())
                    .map_err(ReadErrorInner::FileStrategy),
                Style::Ptrace => Self::ptrace(self.pid, address, buf)
                    .map(|()| buf.len())
                    .map_err(ReadErrorInner::PtraceStrategy),
            }
            .map_err(ReadError);
        }

        const DOUBLE_INIT_MSG: &str = "somehow ProcessReader::style initialized twice";

        let vmem_err = match Self::vmem(self.pid, address, buf) {
            Ok(len) => {
                self.style.set(Style::VirtualMem).expect(DOUBLE_INIT_MSG);
                return Ok(len);
            }
            Err(e) => e,
        };

        let file_err = match Self::open_mem_file_for_pid(self.pid) {
            Ok(file) => match Self::file(&file, address, buf) {
                Ok(()) => {
                    self.style.set(Style::File(file)).expect(DOUBLE_INIT_MSG);
                    return Ok(buf.len());
                }
                Err(e) => e,
            },
            Err(e) => FileStrategyError::Open(e),
        };

        let ptrace_err = match Self::ptrace(self.pid, address, buf) {
            Ok(()) => {
                self.style.set(Style::Ptrace).expect(DOUBLE_INIT_MSG);
                return Ok(buf.len());
            }
            Err(e) => e,
        };

        Err(ReadError(ReadErrorInner::AllStrategies {
            vmem_err,
            file_err,
            ptrace_err,
        }))
    }
    fn assert_valid_pid(pid: libc::pid_t) {
        assert!(pid >= 0, "pid must be a non-negative process ID");
    }
    fn open_mem_file_for_pid(pid: libc::pid_t) -> Result<File, OpenFailed> {
        // The max length of a string that looks like "/proc/{pid}/mem\0"
        //
        // "/proc/" = 6 bytes
        // "<pid>" = a 32-bit non-negative signed integer. Max: 2147483647 -> 10 bytes
        // "/mem" = 4 bytes
        // null terminator = 1 byte
        const MAX_PROC_MEM_LEN: usize = 6 + 10 + 4 + 1;

        let mut path_c_str = [0u8; MAX_PROC_MEM_LEN];
        let path_c_str = {
            let mut writer = ByteSliceWriter::new(&mut path_c_str);
            write!(writer, "/proc/{pid}/mem\0").unwrap();
            CStr::from_bytes_until_nul(&path_c_str).unwrap()
        };

        File::open(path_c_str)
    }
    fn vmem(
        pid: libc::pid_t,
        address: usize,
        buf: &mut [u8],
    ) -> Result<usize, ProcessVmReadvFailed> {
        let mut local_iov = [libc::iovec {
            iov_base: buf.as_mut_ptr().cast(),
            iov_len: buf.len(),
        }];

        let mut remote_iov = [libc::iovec {
            iov_base: address as *mut _,
            iov_len: buf.len(),
        }];

        let rv = unsafe {
            libc::process_vm_readv(
                pid,
                local_iov.as_mut_ptr(),
                local_iov.len().try_into().unwrap(),
                remote_iov.as_mut_ptr(),
                remote_iov.len().try_into().unwrap(),
                0,
            )
        };
        if rv == -1 {
            return Err(ProcessVmReadvFailed(errno()));
        }

        let bytes_read = usize::try_from(rv).unwrap();
        Ok(bytes_read)
    }
    fn file(fd: &File, position: usize, buf: &mut [u8]) -> Result<(), FileStrategyError> {
        fd.read_exact_at(position, buf)
            .map_err(FileStrategyError::Read)
    }
    fn ptrace(pid: libc::pid_t, address: usize, buf: &mut [u8]) -> Result<(), PtraceError> {
        let mut reader = PtraceReader::new(pid, address)?;
        reader.read_exact(buf)
    }
}

struct PtraceReader {
    pid: libc::pid_t,
    position: usize,
    buffer: [u8; PTRACE_PEEKDATA_LEN],
    buffer_pos: usize,
}

impl PtraceReader {
    fn new(pid: libc::pid_t, position: usize) -> Result<Self, PtraceError> {
        let requested_position = position;
        let position = requested_position / PTRACE_PEEKDATA_LEN * PTRACE_PEEKDATA_LEN;
        let buffer = Self::ptrace_peekdata(pid, position)?;
        let buffer_pos = requested_position - position;
        Ok(Self {
            pid,
            position,
            buffer,
            buffer_pos,
        })
    }
    fn read_exact(&mut self, mut buf: &mut [u8]) -> Result<(), PtraceError> {
        while !buf.is_empty() {
            let bytes_read = self.read(buf)?;
            assert!(bytes_read > 0);
            buf = &mut buf[bytes_read..];
        }
        Ok(())
    }
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, PtraceError> {
        let buffered_bytes = self.fill_buf()?;

        let bytes_to_read = usize::min(buf.len(), buffered_bytes.len());
        buf[0..bytes_to_read].copy_from_slice(&buffered_bytes[0..bytes_to_read]);
        self.buffer_pos += bytes_to_read;

        Ok(bytes_to_read)
    }
    fn fill_buf(&mut self) -> Result<&[u8], PtraceError> {
        if self.buffer_pos == PTRACE_PEEKDATA_LEN {
            self.position = self
                .position
                .checked_add(PTRACE_PEEKDATA_LEN)
                .ok_or(PtraceError::AddressOverflow)?;

            self.buffer = Self::ptrace_peekdata(self.pid, self.position)?;
            self.buffer_pos = 0;
        }
        Ok(&self.buffer[self.buffer_pos..PTRACE_PEEKDATA_LEN])
    }
    fn ptrace_peekdata(
        pid: libc::pid_t,
        position: usize,
    ) -> Result<[u8; PTRACE_PEEKDATA_LEN], PtraceError> {
        set_errno(0);
        let rv = unsafe {
            // ptrace is vararg, so best to explicitly declare types
            let addr: *mut c_void = position as *mut _;
            let data: *mut c_void = ptr::null_mut();
            libc::ptrace(libc::PTRACE_PEEKDATA, pid, addr, data)
        };
        let err = errno();
        if rv == -1 && err != 0 {
            return Err(PtraceError::Syscall {
                errno: err,
                position,
            });
        }
        Ok(rv.to_ne_bytes())
    }
}

#[derive(Debug)]
enum Style {
    VirtualMem,
    File(File),
    Ptrace,
}

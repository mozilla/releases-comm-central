use core::{
    error::Error as StdError,
    ffi::c_int,
    fmt::{Display, Formatter, Result as FmtResult},
};

/// An error returned while reading memory from a target process.
///
/// `ReadError` is intentionally a small public wrapper around private strategy
/// errors. Its [`Display`] implementation describes the high-level failure. Its
/// [`core::error::Error::source`] implementation returns a lower-level source
/// when there is exactly one failed strategy, including failures from forced
/// strategies and failures from a strategy selected by an automatic reader.
///
/// Short successful reads are not represented by `ReadError`; they are returned
/// from [`crate::ProcessReader::read_at`] as `Ok(n)` where `n` is smaller than
/// the requested buffer length.
///
/// When [`crate::ProcessReader::new`] tries every strategy and all of them fail,
/// there is no single source error. In that case
/// [`core::error::Error::source`] returns `None`, and callers can inspect each
/// branch with
/// [`ReadError::virtual_mem_error`], [`ReadError::file_error`], and
/// [`ReadError::ptrace_error`].
///
/// If the `serde` feature is enabled, this type implements `Serialize` and
/// `Deserialize`.
#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub struct ReadError(pub(crate) ReadErrorInner);

impl ReadError {
    /// Returns the error from the `process_vm_readv(2)` strategy, if present.
    ///
    /// This returns `Some` when a reader forced to or cached on
    /// [`crate::ProcessReader::for_virtual_mem`] fails, and when automatic
    /// strategy selection fails after attempting `process_vm_readv`.
    ///
    /// It returns `None` when the error does not contain a `process_vm_readv`
    /// failure.
    pub fn virtual_mem_error(&self) -> Option<&(dyn StdError + 'static)> {
        match &self.0 {
            ReadErrorInner::AllStrategies { vmem_err, .. } => Some(vmem_err),
            ReadErrorInner::VirtualMemStrategy(e) => Some(e),
            _ => None,
        }
    }

    /// Returns the error from the `/proc/<pid>/mem` strategy, if present.
    ///
    /// This returns `Some` when a reader forced to or cached on
    /// [`crate::ProcessReader::for_file`] fails, and when automatic strategy
    /// selection fails after attempting to use `/proc/<pid>/mem`.
    ///
    /// It returns `None` when the error does not contain a `/proc/<pid>/mem`
    /// failure.
    pub fn file_error(&self) -> Option<&(dyn StdError + 'static)> {
        match &self.0 {
            ReadErrorInner::AllStrategies { file_err, .. } => Some(file_err),
            ReadErrorInner::FileStrategy(e) => Some(e),
            _ => None,
        }
    }

    /// Returns the error from the `ptrace(PTRACE_PEEKDATA)` strategy, if present.
    ///
    /// This returns `Some` when a reader forced to or cached on
    /// [`crate::ProcessReader::for_ptrace`] fails, and when automatic strategy
    /// selection fails after attempting `ptrace(PTRACE_PEEKDATA)`.
    ///
    /// It returns `None` when the error does not contain a ptrace failure.
    pub fn ptrace_error(&self) -> Option<&(dyn StdError + 'static)> {
        match &self.0 {
            ReadErrorInner::AllStrategies { ptrace_err, .. } => Some(ptrace_err),
            ReadErrorInner::PtraceStrategy(e) => Some(e),
            _ => None,
        }
    }
}

impl Display for ReadError {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        use ReadErrorInner as E;
        match &self.0 {
            E::AllStrategies { .. } => write!(f, "all process reading strategies failed"),
            E::VirtualMemStrategy(_) => write!(f, "virtual memory strategy failed"),
            E::FileStrategy(_) => write!(f, "file strategy failed"),
            E::PtraceStrategy(_) => write!(f, "ptrace strategy failed"),
        }
    }
}

impl StdError for ReadError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        use ReadErrorInner as E;
        match &self.0 {
            E::AllStrategies { .. } => None,
            E::VirtualMemStrategy(e) => Some(e),
            E::FileStrategy(e) => Some(e),
            E::PtraceStrategy(e) => Some(e),
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) enum ReadErrorInner {
    AllStrategies {
        vmem_err: ProcessVmReadvFailed,
        file_err: FileStrategyError,
        ptrace_err: PtraceError,
    },
    VirtualMemStrategy(ProcessVmReadvFailed),
    FileStrategy(FileStrategyError),
    PtraceStrategy(PtraceError),
}

/// Error returned by [`ProcessReader::read_exact_at`].
///
/// [`ProcessReader::read_exact_at`] is built on top of
/// [`ProcessReader::read_at`]. It repeatedly performs partial reads until the
/// caller's buffer is full. This error reports why that exact read could not be
/// completed.
#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub enum ReadExactError {
    /// An underlying call to [`ProcessReader::read_at`] failed before the buffer
    /// was completely filled.
    ///
    /// The wrapped [`ReadError`] describes the strategy that failed, or the set
    /// of strategies that failed if automatic strategy selection had not yet
    /// chosen a strategy.
    Read(ReadError),
    /// The reader stopped making progress before the buffer was completely
    /// filled.
    ///
    /// This occurs when [`ProcessReader::read_at`] returns `Ok(0)` while
    /// `read_exact_at` still has bytes left to read.
    UnexpectedEof,
}

impl Display for ReadExactError {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            Self::Read(_) => write!(f, "an error occurred before filling entire buffer"),
            Self::UnexpectedEof => write!(f, "unexpected end-of-file before filling entire buffer"),
        }
    }
}

impl StdError for ReadExactError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            Self::Read(e) => Some(e),
            Self::UnexpectedEof => None,
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) struct ProcessVmReadvFailed(pub(crate) c_int);

impl Display for ProcessVmReadvFailed {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        write!(f, "process_vm_readv() returned an error code: {}", self.0)
    }
}

impl StdError for ProcessVmReadvFailed {}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) enum FileStrategyError {
    Open(OpenFailed),
    Read(ReadExactAtError),
}

impl Display for FileStrategyError {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            Self::Open(_) => write!(f, "failed to open /proc/<pid>/mem file"),
            Self::Read(_) => write!(f, "failed to read /proc/<pid>/mem file"),
        }
    }
}

impl StdError for FileStrategyError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            Self::Open(e) => Some(e),
            Self::Read(e) => Some(e),
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) struct OpenFailed(pub(crate) c_int);

impl Display for OpenFailed {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        write!(f, "open64() returned an error code: {}", self.0)
    }
}

impl StdError for OpenFailed {}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) enum ReadExactAtError {
    ReadAt(ReadAtFailed),
    AddressOverflow,
    UnexpectedEof { position: usize },
}

impl Display for ReadExactAtError {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            Self::ReadAt(_) => write!(f, "I/O error reading file"),
            Self::AddressOverflow => write!(
                f,
                "the given address/length pair overflowed the machine's memory range"
            ),
            Self::UnexpectedEof { position } => write!(
                f,
                "unexpected end-of-file encountered at position: {position}"
            ),
        }
    }
}

impl StdError for ReadExactAtError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            Self::ReadAt(e) => Some(e),
            Self::AddressOverflow => None,
            Self::UnexpectedEof { .. } => None,
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) enum ReadAtFailed {
    Syscall(c_int),
    AddressOutOfBounds,
}

impl Display for ReadAtFailed {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            Self::Syscall(errno) => write!(f, "pread64() returned an error code: {errno}"),
            Self::AddressOutOfBounds => {
                write!(f, "requested address was out-of-bounds for pread64()")
            }
        }
    }
}

impl StdError for ReadAtFailed {}

#[derive(Debug)]
#[cfg_attr(feature = "serde", derive(serde::Deserialize, serde::Serialize))]
pub(crate) enum PtraceError {
    Syscall { errno: c_int, position: usize },
    AddressOverflow,
}

impl Display for PtraceError {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            Self::Syscall { errno, position } => write!(
                f,
                "ptrace(PTRACE_PEEKDATA) returned an error code at position {position}: {errno}",
            ),
            Self::AddressOverflow => write!(
                f,
                "the given address/length pair overflowed the machine's memory range"
            ),
        }
    }
}

impl StdError for PtraceError {}

use core::ffi::c_int;

#[derive(Debug, thiserror::Error, serde::Serialize, serde::Deserialize)]
pub enum Error {
    #[error("failed to send SIGSTOP to process: {0}")]
    SigStopFailed(c_int),
    #[error("failed to send SIGCONT to process: {0}")]
    SigContFailed(c_int),
    #[error("failed to attach to process: {0}")]
    PtraceAttachFailed(c_int),
    #[error("failed to detach from process: {0}")]
    PtraceDetachFailed(c_int),
    #[error("failed to peek at process user section: {0}")]
    PtracePeekUserFailed(c_int),
    #[error("failed waiting for thread to stop: {0}")]
    WaitPidFailed(c_int),
    #[error("unexpected status returned waiting for thread to stop: {0}")]
    UnexpectedStatus(c_int),
    #[error("failed to reinject signal {0} into stopped process: {1}")]
    ReinjectFailed(c_int, c_int),
    #[error("failed to stat file: {0}")]
    StatFailed(c_int),
    #[error("failed to open file: {0}")]
    OpenFileFailed(c_int),
    #[error("failed to read file: {0}")]
    ReadFileFailed(c_int),
    #[error("failed to open directory: {0}")]
    OpenDirFailed(c_int),
    #[error("I/O error reading directory: {0}")]
    ReadDirFailed(c_int),
    #[error("failed to read link: {0}")]
    ReadLinkFailed(c_int),
    #[error("buffer too small")]
    BufferTooSmall,
    #[error("not supported")]
    NotSupported,
    #[error("failed to get registers: {0}")]
    GetRegistersFailed(c_int),
    #[error("failed to map memory: {0}")]
    MMapfailed(c_int),
    #[error("the start position of a mapping is past its end position")]
    StartPositionPastEnd,
    #[error("mapping too large to fit in memory")]
    MappingTooLarge,
    #[error("index was out of bounds")]
    IndexOutOfBounds,
    #[error("process_vm_readv failed: {0}")]
    ProcessVmReadvFailed(c_int),
    #[error("failed to peek at process data: {0}")]
    PtracePeekDataFailed(c_int),
    #[error("ProcessReader returned an error")]
    ProcessReader(#[source] process_reader::ReadError),
}

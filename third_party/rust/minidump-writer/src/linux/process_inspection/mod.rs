use super::super::linux;
use crate::module_reader::{ModuleMemoryReadError, ReadError, ReadModuleMemory};
use linux::maps_reader;
use process_backend::{ProcessReader as _, Stat, local, regs::*, remote};
use process_reader::{CopyFromProcessError, ProcessReader, ProcessReaderBackend};
use std::{
    borrow::Cow,
    ffi::{CString, OsString, c_int},
    io,
    os::unix::ffi::OsStringExt,
    path::PathBuf,
};

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
use process_backend::PTRACE_DATA_LEN;

pub(crate) use process_backend::regs;

pub use process_backend::ProcessReaderKind;

pub mod process_reader;

pub mod remote_process_inspection {
    use process_backend::remote::executor::resources::*;

    pub mod executor {
        pub use process_backend::remote::executor::{Error, Resources, run};
    }

    pub use process_backend::remote::{io, transport};

    pub const ARGS_BUFFER_LEN: usize = super::MAX_INPUT_PATH_LEN;
    pub const OUTPUT_BUFFER_LEN: usize = SCRATCH_BUFFER_LEN;

    // All of these are arbitrary and may need to be adjusted
    const MAX_SIMULTANEOUS_OPEN_FILES: usize = 5;
    const MAX_SIMULTANEOUS_OPEN_DIRS: usize = 5;
    const MAX_SIMULTANEOUS_OPEN_MODULE_MEMORY_READERS: usize = 5;
    const SCRATCH_BUFFER_LEN: usize =
        if super::MAX_SYMLINK_TARGET_LEN > super::MAX_DIRECTORY_NAME_LENGTH {
            super::MAX_SYMLINK_TARGET_LEN
        } else {
            super::MAX_DIRECTORY_NAME_LENGTH
        };

    pub struct ExecutorResources {
        file_readers: [FileReader; MAX_SIMULTANEOUS_OPEN_FILES],
        dir_readers: [DirReader; MAX_SIMULTANEOUS_OPEN_DIRS],
        mapped_module_memory_readers:
            [MappedModuleMemoryReader; MAX_SIMULTANEOUS_OPEN_MODULE_MEMORY_READERS],
        scratch_buf: [u8; SCRATCH_BUFFER_LEN],
    }

    impl ExecutorResources {
        pub const fn const_new() -> ExecutorResources {
            ExecutorResources {
                file_readers: FileReader::new_array(),
                dir_readers: DirReader::new_array(),
                mapped_module_memory_readers: MappedModuleMemoryReader::new_array(),
                scratch_buf: [0; SCRATCH_BUFFER_LEN],
            }
        }

        pub const fn as_mut(&mut self) -> Resources<'_> {
            Resources {
                file_readers: &mut self.file_readers,
                dir_readers: &mut self.dir_readers,
                mapped_module_memory_readers: &mut self.mapped_module_memory_readers,
                scratch_buf: &mut self.scratch_buf,
            }
        }
    }
}

pub(crate) type Result<T> = core::result::Result<T, Error>;

// These are arbitrary choices and are probably way bigger than they need to be.
// They probably could be optimized further...

// The longest path that may be passed as an argument to any of the APIs that
// take a PathBuf arg. Realistically, even this is a fairly conservative number.
const MAX_INPUT_PATH_LEN: usize = 1024;

// The longest symlink we'd ever expect to get from a call to read_link()
const MAX_SYMLINK_TARGET_LEN: usize = 1024;

/// The longest directory name we'd expect to see from a read_dir() iterator
const MAX_DIRECTORY_NAME_LENGTH: usize = 256;

pub(crate) fn local(pid: libc::pid_t) -> Box<dyn ProcessInspector> {
    set_process_backend_drop_fail_handler();
    Box::new(local::Backend::new(pid))
}

pub(crate) fn remote<'t, T: remote_process_inspection::transport::Backend + 't>(
    transport: T,
) -> Box<dyn ProcessInspector + 't> {
    set_process_backend_drop_fail_handler();
    Box::new(remote::backend::Backend::new(transport))
}

pub trait ProcessInspector: core::fmt::Debug {
    fn process_reader<'a>(&'a self) -> ProcessReader<'a>;
    fn pid(&self) -> Result<libc::pid_t>;
    fn stop_process(&self) -> Result<()>;
    fn continue_process(&self) -> Result<()>;
    fn suspend_thread(&self, tid: libc::pid_t) -> Result<()>;
    fn resume_thread(&self, tid: libc::pid_t) -> Result<()>;
    fn map_module_into_memory<'a>(
        &'a self,
        path: PathBuf,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader<'a>>;
    fn stat_file(&self, path: PathBuf) -> Result<Stat>;
    fn read_file<'a>(&'a self, path: PathBuf) -> Result<FileReader<'a>>;
    fn read_dir<'a>(&'a self, path: PathBuf) -> Result<DirReader<'a>>;
    fn read_link(&self, path: PathBuf) -> Result<PathBuf>;
    fn get_gen_regs(&self, tid: libc::pid_t) -> Result<GenRegs>;
    fn get_fp_regs(&self, tid: libc::pid_t) -> Result<FpRegs>;

    #[cfg(target_arch = "x86")]
    fn get_fpx_regs(&self, tid: libc::pid_t) -> Result<FpxRegs>;

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    fn ptrace_peekuser(&self, addr: usize) -> Result<[u8; PTRACE_DATA_LEN]>;

    fn force_process_reader_kind(&mut self, kind: ProcessReaderKind) -> Result<()>;

    fn fail_one_syscall_with(&self, errno: core::ffi::c_int);
}

fn path_to_cstring(path: PathBuf) -> Result<CString> {
    let c_path = CString::new(path.into_os_string().into_vec()).unwrap();
    if c_path.as_bytes_with_nul().len() <= MAX_INPUT_PATH_LEN {
        Ok(c_path)
    } else {
        Err(Error::InputPathTooLong)
    }
}

impl<B: process_backend::Backend> ProcessInspector for B {
    fn process_reader<'a>(&'a self) -> ProcessReader<'a> {
        ProcessReader::new(self)
    }

    fn pid(&self) -> Result<libc::pid_t> {
        B::pid(self).map_err(Error::Backend)
    }

    fn stop_process(&self) -> Result<()> {
        B::stop_process(self).map_err(Error::Backend)
    }

    fn continue_process(&self) -> Result<()> {
        B::continue_process(self).map_err(Error::Backend)
    }

    fn suspend_thread(&self, tid: libc::pid_t) -> Result<()> {
        B::suspend_thread(self, tid).map_err(Error::Backend)
    }

    fn resume_thread(&self, tid: libc::pid_t) -> Result<()> {
        B::resume_thread(self, tid).map_err(Error::Backend)
    }

    fn map_module_into_memory<'a>(
        &'a self,
        path: PathBuf,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader<'a>> {
        let c_path = CString::new(path.into_os_string().into_vec()).unwrap();
        let reader = B::map_module_into_memory(self, &c_path, offset).map_err(Error::Backend)?;
        Ok(MappedModuleMemoryReader(Box::new(reader)))
    }

    fn stat_file(&self, path: PathBuf) -> Result<Stat> {
        let c_path = path_to_cstring(path)?;
        B::stat_file(self, &c_path).map_err(Error::Backend)
    }

    fn read_file<'a>(&'a self, path: PathBuf) -> Result<FileReader<'a>> {
        let c_path = path_to_cstring(path)?;
        let reader = B::read_file(self, &c_path).map_err(Error::Backend)?;
        Ok(FileReader(Box::new(reader)))
    }

    fn read_dir<'a>(&'a self, path: PathBuf) -> Result<DirReader<'a>> {
        let c_path = path_to_cstring(path)?;
        let reader = B::read_dir(self, &c_path).map_err(Error::Backend)?;
        Ok(DirReader(Box::new(reader)))
    }

    fn read_link(&self, path: PathBuf) -> Result<PathBuf> {
        let c_path = path_to_cstring(path)?;
        let mut buf = vec![0u8; MAX_SYMLINK_TARGET_LEN];
        let len = B::read_link(self, &c_path, &mut buf).map_err(Error::Backend)?;
        buf.truncate(len);
        Ok(PathBuf::from(OsString::from_vec(buf)))
    }
    fn get_gen_regs(&self, tid: libc::pid_t) -> Result<GenRegs> {
        B::get_gen_regs(self, tid).map_err(Error::Backend)
    }

    fn get_fp_regs(&self, tid: libc::pid_t) -> Result<FpRegs> {
        B::get_fp_regs(self, tid).map_err(Error::Backend)
    }

    #[cfg(target_arch = "x86")]
    fn get_fpx_regs(&self, tid: libc::pid_t) -> Result<FpxRegs> {
        B::get_fpx_regs(self, tid).map_err(Error::Backend)
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    fn ptrace_peekuser(&self, addr: usize) -> Result<[u8; PTRACE_DATA_LEN]> {
        B::ptrace_peekuser(self, addr).map_err(Error::Backend)
    }

    fn force_process_reader_kind(&mut self, kind: ProcessReaderKind) -> Result<()> {
        B::force_process_reader_kind(self, kind).map_err(Error::Backend)
    }

    #[doc(hidden)]
    fn fail_one_syscall_with(&self, errno: c_int) {
        B::fail_one_syscall_with(self, errno)
    }
}

impl<B: process_backend::Backend> ProcessReaderBackend for B {
    fn process_inspector(&self) -> &dyn ProcessInspector {
        self
    }

    fn read_at(
        &self,
        src: usize,
        dst: &mut [u8],
    ) -> core::result::Result<usize, CopyFromProcessError> {
        B::process_reader(self)
            .read_at(src, dst)
            .map_err(|e| CopyFromProcessError::Backend(Error::Backend(e)))
    }
}

#[derive(Debug)]
pub struct FileReader<'a>(Box<dyn process_backend::FileReader + 'a>);

impl<'a> io::Read for FileReader<'a> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.0
            .read(buf)
            .map_err(Error::Backend)
            .map_err(io::Error::other)
    }
}

#[derive(Debug)]
pub struct DirReader<'a>(Box<dyn process_backend::DirReader + 'a>);

impl<'a> Iterator for DirReader<'a> {
    type Item = Result<OsString>;
    fn next(&mut self) -> Option<Self::Item> {
        let mut buf = vec![0; MAX_DIRECTORY_NAME_LENGTH];
        match self.0.read_next_name(&mut buf).map_err(Error::Backend) {
            Ok(0) => None,
            Ok(len) => {
                buf.truncate(len);
                Some(Ok(OsString::from_vec(buf)))
            }
            Err(e) => Some(Err(e)),
        }
    }
}

#[derive(Debug)]
pub struct MappedModuleMemoryReader<'a>(Box<dyn process_backend::MappedModuleMemoryReader + 'a>);

impl<'a> MappedModuleMemoryReader<'a> {
    pub fn read_exact_at(&self, mut offset: usize, mut buf: &mut [u8]) -> Result<()> {
        if buf.is_empty() {
            return Ok(());
        }

        loop {
            let bytes_read = self.0.read_at(offset, buf).map_err(Error::Backend)?;
            if bytes_read == 0 {
                return Err(Error::UnexpectedEndOfBuffer);
            }

            if bytes_read == buf.len() {
                return Ok(());
            }

            offset = offset
                .checked_add(bytes_read)
                .ok_or(Error::AddressOverflowed)?;
            buf = &mut buf[bytes_read..];
        }
    }
    pub fn len(&self) -> Result<usize> {
        self.0.len().map_err(Error::Backend)
    }
}

impl<'a> ReadModuleMemory for MappedModuleMemoryReader<'a> {
    fn read(
        &self,
        offset: u64,
        length: u64,
    ) -> core::result::Result<Cow<'_, [u8]>, ModuleMemoryReadError> {
        let result = (|| {
            let (offset, length) = match (usize::try_from(offset), usize::try_from(length)) {
                (Ok(o), Ok(l)) => (o, l),
                _ => return Err(ReadError::OutOfBounds),
            };

            let mut buf = vec![0u8; length];

            self.read_exact_at(offset, &mut buf)
                .map_err(ReadError::PlatformSpecific)?;

            Ok(buf)
        })();

        result
            .map(Cow::Owned)
            .map_err(|error| ModuleMemoryReadError {
                offset,
                length,
                start_address: None,
                error,
            })
    }
    fn absolute_to_relative(&self, addr: u64) -> Option<u64> {
        Some(addr)
    }
    /// Calculates the absolute address of the specified relative address
    fn relative_to_absolute(&self, addr: u64) -> Option<u64> {
        Some(addr)
    }
    fn is_process_memory(&self) -> bool {
        false
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum Error {
    #[error("an error occurred running the backend")]
    Backend(#[source] process_backend::Error),
    #[error("an address overflowed")]
    AddressOverflowed,
    #[error("unexpected end of buffer reached")]
    UnexpectedEndOfBuffer,
    #[error("got an unexpected end of file")]
    UnexpectedEndOfFile,
    #[error("a path argument was too long")]
    InputPathTooLong,
}

fn set_process_backend_drop_fail_handler() {
    fn drop_fail_handler(args: core::fmt::Arguments<'_>) {
        log::error!("a drop() error occurred in process-backend: {args}");
    }
    const HANDLER: process_backend::DropFailHandler =
        process_backend::DropFailHandler::new(drop_fail_handler);
    HANDLER.install_global();
}

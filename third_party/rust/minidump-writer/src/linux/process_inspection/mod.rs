use self::process_reader::ProcessReader;
use super::maps_reader;
use crate::module_reader::{ModuleMemoryReadError, ReadError, ReadModuleMemory};
use core::ffi::c_int;
use failspot::failspot;
use process_backend::{MAX_PATH_LEN, local, regs::*};
use std::{
    borrow::Cow,
    ffi::{CString, OsString},
    io,
    os::unix::ffi::OsStringExt,
    path::PathBuf,
};

pub use process_backend::regs;

pub mod process_reader;

#[derive(Debug)]
pub struct ProcessInspector {
    pid: libc::pid_t,
    backend: Backend,
}

#[derive(Debug)]
pub enum Backend {
    Local {
        backend: local::Backend,
        process_reader_backend: local::ProcessReader,
    },
}

impl ProcessInspector {
    pub fn local(pid: libc::pid_t) -> Self {
        let backend = local::Backend::new(pid);
        let process_reader_backend = backend.process_reader();

        ProcessInspector {
            pid,
            backend: Backend::Local {
                backend,
                process_reader_backend,
            },
        }
    }
    pub fn process_reader(&self) -> ProcessReader<'_> {
        ProcessReader::new(self)
    }
    pub fn stop_process(&self) -> Result<(), Error> {
        failspot!(if StopProcess {
            return Err(Error::Local(local::Error::SigStopFailed(libc::EPERM)));
        });

        match &self.backend {
            Backend::Local { backend, .. } => backend.stop_process().map_err(Error::Local),
        }
    }

    pub fn continue_process(&self) -> Result<(), Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.continue_process().map_err(Error::Local),
        }
    }

    pub fn suspend_thread(&self, tid: libc::pid_t) -> Result<(), Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.suspend_thread(tid).map_err(Error::Local),
        }
    }

    pub fn resume_thread(&self, tid: libc::pid_t) -> Result<(), Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.resume_thread(tid).map_err(Error::Local),
        }
    }

    pub fn map_module_into_memory(
        &self,
        path: impl Into<PathBuf>,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader, Error> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();
        match &self.backend {
            Backend::Local { backend, .. } => backend
                .map_module_into_memory(&c_path, offset)
                .map(MappedModuleMemoryReader::Local)
                .map_err(Error::Local),
        }
    }

    pub fn stat_file(&self, path: impl Into<PathBuf>) -> Result<libc::stat, Error> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();
        match &self.backend {
            Backend::Local { backend, .. } => backend.stat_file(&c_path).map_err(Error::Local),
        }
    }

    pub fn read_file(&self, path: impl Into<PathBuf>) -> Result<FileReader, Error> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();
        match &self.backend {
            Backend::Local { backend, .. } => backend
                .read_file(&c_path)
                .map(FileReader::Local)
                .map_err(Error::Local),
        }
    }

    pub fn read_dir(&self, path: impl Into<PathBuf>) -> Result<DirReader, Error> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();
        match &self.backend {
            Backend::Local { backend, .. } => backend
                .read_dir(&c_path)
                .map(DirReader::Local)
                .map_err(Error::Local),
        }
    }

    pub fn read_link(&self, path: impl Into<PathBuf>) -> Result<PathBuf, Error> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();

        let mut buf = vec![0u8; MAX_PATH_LEN];

        let len = match &self.backend {
            Backend::Local { backend, .. } => {
                backend.read_link(&c_path, &mut buf).map_err(Error::Local)?
            }
        };

        buf.truncate(len);
        Ok(PathBuf::from(OsString::from_vec(buf)))
    }

    pub fn get_gen_regs(&self, tid: libc::pid_t) -> Result<GenRegs, Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.get_gen_regs(tid).map_err(Error::Local),
        }
    }

    pub fn get_fp_regs(&self, tid: libc::pid_t) -> Result<FpRegs, Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.get_fp_regs(tid).map_err(Error::Local),
        }
    }

    #[cfg(target_arch = "x86")]
    pub fn get_fpx_regs(&self, tid: libc::pid_t) -> Result<FpxRegs, Error> {
        match &self.backend {
            Backend::Local { backend, .. } => backend.get_fpx_regs(tid).map_err(Error::Local),
        }
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    pub fn ptrace_peekuser(
        &self,
        pid: libc::pid_t,
        addr: usize,
    ) -> Result<[u8; core::mem::size_of::<libc::c_long>()], Error> {
        match &self.backend {
            Backend::Local { backend, .. } => {
                backend.ptrace_peekuser(pid, addr).map_err(Error::Local)
            }
        }
    }
}

#[derive(Debug)]
pub enum FileReader {
    Local(local::FileReader),
}

impl io::Read for FileReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Local(l) => l.read(buf).map_err(Error::Local),
        }
        .map_err(io::Error::other)
    }
}

#[derive(Debug)]
pub enum DirReader {
    Local(local::DirReader),
}

impl Iterator for DirReader {
    type Item = Result<OsString, Error>;
    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Local(l) => match l.read_name().map_err(Error::Local) {
                Ok(Some(name_bytes)) => Some(Ok(OsString::from_vec(name_bytes.to_vec()))),
                Ok(None) => None,
                Err(e) => Some(Err(e)),
            },
        }
    }
}

#[doc(hidden)]
impl ProcessInspector {
    pub fn fail_one_syscall_with(&self, errno: c_int) {
        match &self.backend {
            Backend::Local { backend, .. } => backend.fail_one_syscall_with(errno),
        }
    }
}

#[derive(Debug)]
pub enum MappedModuleMemoryReader {
    Local(local::MappedModuleMemoryReader),
}

impl MappedModuleMemoryReader {
    pub fn read(&self, offset: u64, length: u64) -> Result<&[u8], Error> {
        match self {
            Self::Local(l) => l.read(offset, length).map_err(Error::Local),
        }
    }
    pub fn len(&self) -> Result<usize, Error> {
        match self {
            Self::Local(l) => l.len().map_err(Error::Local),
        }
    }
    pub fn is_empty(&self) -> Result<bool, Error> {
        match self {
            Self::Local(l) => l.is_empty().map_err(Error::Local),
        }
    }
}

impl ReadModuleMemory for MappedModuleMemoryReader {
    fn read(&self, offset: u64, length: u64) -> Result<Cow<'_, [u8]>, ModuleMemoryReadError> {
        self.read(offset, length)
            .map(Cow::Borrowed)
            .map_err(|e| ModuleMemoryReadError {
                offset,
                length,
                start_address: None,
                error: ReadError::PlatformSpecific(e),
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

#[derive(Debug, thiserror::Error, serde::Serialize, serde::Deserialize)]
pub enum Error {
    #[error("an error occurred running a syscall directly")]
    Local(#[source] local::Error),
}

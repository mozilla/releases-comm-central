use crate::{
    ProcessReaderKind, Stat,
    regs::*,
    wrapper::{OwnedFd, errno, set_errno},
};
use core::{
    cell::RefCell,
    ffi::{CStr, c_int, c_long, c_void},
    mem, ptr,
};
use libc::pid_t;
use syscall_invoker::SyscallInvoker;

pub use error::Error;
pub use module_reader::MappedModuleMemoryReader;

mod error;
mod module_reader;
mod syscall_invoker;

pub type Result<T> = core::result::Result<T, Error>;

#[derive(Debug)]
pub struct Backend {
    pid: pid_t,
    process_reader: process_reader::ProcessReader,
    syscall_invoker: RefCell<SyscallInvoker>,
}

impl Backend {
    pub fn new(pid: libc::pid_t) -> Self {
        Self {
            pid,
            process_reader: process_reader::ProcessReader::new(pid),
            syscall_invoker: Default::default(),
        }
    }
    pub fn pid(&self) -> libc::pid_t {
        self.pid
    }
    pub fn process_reader(&self) -> ProcessReader<'_> {
        ProcessReader(&self.process_reader)
    }
    pub fn stop_process(&self) -> Result<()> {
        self.standard_syscall(|| unsafe { libc::kill(self.pid, libc::SIGSTOP) })
            .map_err(Error::SigStopFailed)?;
        Ok(())
    }

    pub fn continue_process(&self) -> Result<()> {
        self.standard_syscall(|| unsafe { libc::kill(self.pid, libc::SIGCONT) })
            .map_err(Error::SigContFailed)?;
        Ok(())
    }

    pub fn suspend_thread(&self, tid: libc::pid_t) -> Result<()> {
        self.standard_syscall(|| unsafe {
            ptrace(libc::PTRACE_ATTACH, tid, ptr::null_mut(), ptr::null_mut())
        })
        .map_err(Error::PtraceAttachFailed)?;

        loop {
            let mut status = 0;
            if let Err(e) =
                self.standard_syscall(|| unsafe { libc::waitpid(tid, &mut status, libc::__WALL) })
            {
                if e == libc::EINTR {
                    continue;
                }
                self.ptrace_detach(tid)?;
                Err(Error::WaitPidFailed(e))?;
            }

            if !libc::WIFSTOPPED(status) {
                Err(Error::UnexpectedStatus(status))?;
            }

            let signal = libc::WSTOPSIG(status);

            // Any signal will stop the thread, make sure it is SIGSTOP. Otherwise, this
            // signal will be delivered after PTRACE_DETACH, and the thread will enter
            // the "T (stopped)" state.
            if signal == libc::SIGSTOP {
                break;
            }

            // Signals other than SIGSTOP that are received need to be reinjected,
            // or they will otherwise get lost.
            self.standard_syscall(|| unsafe {
                ptrace(libc::PTRACE_CONT, tid, ptr::null_mut(), signal as *mut _)
            })
            .map_err(|e| Error::ReinjectFailed(signal, e))?;
        }

        Ok(())
    }

    pub fn resume_thread(&self, tid: libc::pid_t) -> Result<()> {
        self.ptrace_detach(tid)
    }

    pub fn map_module_into_memory(
        &self,
        path: &CStr,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader> {
        MappedModuleMemoryReader::new(&mut self.syscall_invoker.borrow_mut(), path, offset)
    }

    pub fn stat_file(&self, path: &CStr) -> Result<Stat> {
        let mut output = unsafe { mem::zeroed::<libc::stat>() };
        self.standard_syscall(|| unsafe { libc::stat(path.as_ptr(), &mut output) })
            .map_err(Error::StatFailed)?;
        Ok(Stat {
            st_mode: output.st_mode,
        })
    }

    pub fn read_file(&self, path: &CStr) -> Result<FileReader> {
        self.open_file(path).map(FileReader)
    }

    pub fn read_dir(&self, path: &CStr) -> Result<DirReader> {
        self.special_syscall(|| unsafe {
            let dirp = libc::opendir(path.as_ptr());
            if dirp.is_null() {
                return Err(());
            }
            Ok(dirp)
        })
        .map(|dirp| DirReader { dirp, eof: false })
        .map_err(Error::OpenDirFailed)
    }

    pub fn read_link(&self, path: &CStr, buf: &mut [u8]) -> Result<usize> {
        let bytes_read = self
            .standard_syscall(|| unsafe {
                libc::readlink(path.as_ptr(), buf.as_mut_ptr().cast(), buf.len())
            })
            .map_err(Error::ReadLinkFailed)?;

        let bytes_read = usize::try_from(bytes_read).unwrap();
        if bytes_read == buf.len() {
            Err(Error::BufferTooSmall)?;
        }

        Ok(bytes_read)
    }

    pub fn get_gen_regs(&self, tid: libc::pid_t) -> Result<GenRegs> {
        self.get_regs::<GenRegsTag>(tid)
    }
    pub fn get_fp_regs(&self, tid: libc::pid_t) -> Result<FpRegs> {
        self.get_regs::<FpRegsTag>(tid)
    }

    #[cfg(target_arch = "x86")]
    pub fn get_fpx_regs(&self, tid: libc::pid_t) -> Result<FpxRegs> {
        self.get_regs::<FpxRegsTag>(tid)
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    pub fn ptrace_peekuser(&self, addr: usize) -> Result<[u8; crate::PTRACE_DATA_LEN]> {
        self.special_syscall(|| unsafe {
            set_errno(0);
            let rv = ptrace(
                libc::PTRACE_PEEKUSER,
                self.pid,
                addr as *mut _,
                core::ptr::null_mut(),
            );
            if rv == -1 && errno() != 0 {
                return Err(());
            }
            Ok(rv.to_ne_bytes())
        })
        .map_err(Error::PtracePeekUserFailed)
    }

    pub fn force_process_reader_kind(&mut self, kind: ProcessReaderKind) -> Result<()> {
        use ProcessReaderKind as K;
        self.process_reader = match kind {
            K::Unspecified => process_reader::ProcessReader::new(self.pid),
            K::VirtualMem => process_reader::ProcessReader::for_virtual_mem(self.pid),
            K::File => {
                process_reader::ProcessReader::for_file(self.pid).map_err(Error::ProcessReader)?
            }
            K::Ptrace => process_reader::ProcessReader::for_ptrace(self.pid),
        };
        Ok(())
    }

    fn open_file(&self, path: &CStr) -> Result<OwnedFd> {
        self.standard_syscall(|| unsafe {
            libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC, 0)
        })
        .map(|fd| unsafe { OwnedFd::new(fd) })
        .map_err(Error::OpenFileFailed)
    }

    fn get_regs<T: PtraceRegisterSet>(&self, tid: libc::pid_t) -> Result<T::Output> {
        let getregset_error = match self.ptrace_getregset::<T>(tid) {
            Ok(output) => return Ok(output),
            Err(e) => e,
        };

        let legacy_error = match self.ptrace_getregs_legacy::<T>(tid) {
            Ok(output) => return Ok(output),
            Err(e) => e,
        };

        Err(Error::GetRegistersFailed {
            getregset_error,
            legacy_error,
        })
    }

    fn ptrace_getregs_legacy<T: PtraceRegisterSet>(
        &self,
        tid: libc::pid_t,
    ) -> core::result::Result<T::Output, PtraceGetRegsLegacyError> {
        let Some(request) = T::LEGACY_REQUEST else {
            return Err(PtraceGetRegsLegacyError::NotSupported);
        };

        let mut output = T::Output::default();
        self.standard_syscall(|| unsafe {
            ptrace(
                request,
                tid,
                core::ptr::null_mut(),
                (&raw mut output).cast(),
            )
        })
        .map_err(PtraceGetRegsLegacyError::PtraceFailed)?;
        Ok(output)
    }

    fn ptrace_getregset<T: PtraceRegisterSet>(
        &self,
        tid: libc::pid_t,
    ) -> core::result::Result<T::Output, PtraceGetRegSetError> {
        let output_size = size_of::<T::Output>();
        assert!(T::KERNEL_SIZE <= output_size);

        let mut output = T::Output::default();
        let mut io = libc::iovec {
            iov_base: (&raw mut output).cast(),
            iov_len: T::KERNEL_SIZE,
        };

        self.standard_syscall(|| unsafe {
            ptrace(
                libc::PTRACE_GETREGSET,
                tid,
                T::NOTE.0 as *mut _,
                (&raw mut io).cast(),
            )
        })
        .map_err(PtraceGetRegSetError::PtraceFailed)?;

        if T::KERNEL_SIZE != io.iov_len {
            return Err(PtraceGetRegSetError::UnexpectedRegisterSetSize(
                T::KERNEL_SIZE,
                io.iov_len,
            ));
        }

        Ok(output)
    }

    fn ptrace_detach(&self, tid: libc::pid_t) -> Result<()> {
        self.standard_syscall(|| unsafe {
            ptrace(libc::PTRACE_DETACH, tid, ptr::null_mut(), ptr::null_mut())
        })
        .map_err(Error::PtraceDetachFailed)?;
        Ok(())
    }

    fn standard_syscall<T, F>(&self, f: F) -> core::result::Result<T, c_int>
    where
        F: FnOnce() -> T,
        T: From<i8> + core::cmp::PartialEq,
    {
        self.syscall_invoker.borrow_mut().invoke_standard(f)
    }

    fn special_syscall<T, F>(&self, f: F) -> core::result::Result<T, c_int>
    where
        F: FnOnce() -> core::result::Result<T, ()>,
    {
        self.syscall_invoker.borrow_mut().invoke(f)
    }

    #[cfg(feature = "testing")]
    pub fn fail_one_syscall_with(&self, errno: c_int) {
        self.syscall_invoker
            .borrow_mut()
            .fail_one_syscall_with(errno);
    }
}

impl crate::Backend for Backend {
    type ProcessReader<'a> = ProcessReader<'a>;

    type FileReader<'a> = FileReader;

    type DirReader<'a> = DirReader;

    type MappedModuleMemoryReader<'a> = MappedModuleMemoryReader;

    fn pid(&self) -> crate::Result<libc::pid_t> {
        Ok(Backend::pid(self))
    }

    fn process_reader<'a>(&'a self) -> Self::ProcessReader<'a> {
        Backend::process_reader(self)
    }

    fn stop_process(&self) -> crate::Result<()> {
        Backend::stop_process(self).map_err(crate::Error::Local)
    }

    fn continue_process(&self) -> crate::Result<()> {
        Backend::continue_process(self).map_err(crate::Error::Local)
    }

    fn suspend_thread(&self, tid: libc::pid_t) -> crate::Result<()> {
        Backend::suspend_thread(self, tid).map_err(crate::Error::Local)
    }

    fn resume_thread(&self, tid: libc::pid_t) -> crate::Result<()> {
        Backend::resume_thread(self, tid).map_err(crate::Error::Local)
    }

    fn map_module_into_memory<'a>(
        &'a self,
        path: &CStr,
        offset: u64,
    ) -> crate::Result<Self::MappedModuleMemoryReader<'a>> {
        Backend::map_module_into_memory(self, path, offset).map_err(crate::Error::Local)
    }

    fn stat_file(&self, path: &CStr) -> crate::Result<Stat> {
        Backend::stat_file(self, path).map_err(crate::Error::Local)
    }

    fn read_file<'a>(&'a self, path: &CStr) -> crate::Result<Self::FileReader<'a>> {
        Backend::read_file(self, path).map_err(crate::Error::Local)
    }

    fn read_dir<'a>(&'a self, path: &CStr) -> crate::Result<Self::DirReader<'a>> {
        Backend::read_dir(self, path).map_err(crate::Error::Local)
    }

    fn read_link(&self, path: &CStr, buf: &mut [u8]) -> crate::Result<usize> {
        Backend::read_link(self, path, buf).map_err(crate::Error::Local)
    }

    fn get_gen_regs(&self, tid: libc::pid_t) -> crate::Result<GenRegs> {
        Backend::get_gen_regs(self, tid).map_err(crate::Error::Local)
    }

    fn get_fp_regs(&self, tid: libc::pid_t) -> crate::Result<FpRegs> {
        Backend::get_fp_regs(self, tid).map_err(crate::Error::Local)
    }

    #[cfg(target_arch = "x86")]
    fn get_fpx_regs(&self, tid: libc::pid_t) -> crate::Result<FpxRegs> {
        Backend::get_fpx_regs(self, tid).map_err(crate::Error::Local)
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    fn ptrace_peekuser(&self, addr: usize) -> crate::Result<[u8; crate::PTRACE_DATA_LEN]> {
        Backend::ptrace_peekuser(self, addr).map_err(crate::Error::Local)
    }

    fn force_process_reader_kind(&mut self, kind: ProcessReaderKind) -> crate::Result<()> {
        Backend::force_process_reader_kind(self, kind).map_err(crate::Error::Local)
    }

    #[cfg(feature = "testing")]
    fn fail_one_syscall_with(&self, errno: c_int) {
        Backend::fail_one_syscall_with(self, errno)
    }
}

#[derive(Debug)]
pub struct FileReader(OwnedFd);

impl FileReader {
    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        let rv = unsafe { libc::read(self.0.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) };
        if rv == -1 {
            return Err(Error::ReadFileFailed(errno()));
        }
        Ok(rv.try_into().unwrap())
    }
    pub fn read_at(&self, buf: &mut [u8], offset: u64) -> Result<usize> {
        let rv = unsafe {
            libc::pread(
                self.0.as_raw_fd(),
                buf.as_mut_ptr().cast(),
                buf.len(),
                offset.try_into().unwrap(),
            )
        };
        if rv == -1 {
            return Err(Error::ReadFileFailed(errno()));
        }
        Ok(rv.try_into().unwrap())
    }
}

impl crate::FileReader for FileReader {
    fn read(&mut self, buf: &mut [u8]) -> crate::Result<usize> {
        FileReader::read(self, buf).map_err(crate::Error::Local)
    }
}

#[derive(Debug)]
pub struct DirReader {
    dirp: *mut libc::DIR,
    eof: bool,
}

impl DirReader {
    pub fn read_next_name(&mut self) -> Result<Option<&[u8]>> {
        if self.eof {
            return Ok(None);
        }

        loop {
            set_errno(0);
            let dirent = unsafe { libc::readdir(self.dirp) };
            if dirent.is_null() {
                if errno() == 0 {
                    self.eof = true;
                    return Ok(None);
                }
                return Err(Error::ReadDirFailed(errno()));
            }

            // The dirent structure is not guaranteed to be fully initialized, so it's only safe to
            // read it through pointers
            //
            // SAFETY: the dirent structure is guaranteed to exist until we call readdir() again
            // or closedir(), which we prevent by holding `&mut self` while `&[u8]` is alive.
            let name_bytes =
                unsafe { CStr::from_ptr((&raw const (*dirent).d_name).cast()).to_bytes() };

            if name_bytes == b"." || name_bytes == b".." {
                continue;
            }

            return Ok(Some(name_bytes));
        }
    }
}

impl Drop for DirReader {
    fn drop(&mut self) {
        let rv = unsafe { libc::closedir(self.dirp) };
        if rv == -1 {
            report_drop_failed!("failed to close directory: {}", errno());
        }
    }
}

impl crate::DirReader for DirReader {
    fn read_next_name(&mut self, buf: &mut [u8]) -> crate::Result<usize> {
        let Some(name) = DirReader::read_next_name(self).map_err(crate::Error::Local)? else {
            return Ok(0);
        };
        let buf = buf
            .get_mut(0..name.len())
            .ok_or(crate::Error::BufferTooSmall)?;
        buf.copy_from_slice(name);
        Ok(name.len())
    }
}

#[derive(Debug)]
pub struct ProcessReader<'a>(&'a process_reader::ProcessReader);

impl<'a> ProcessReader<'a> {
    pub fn read_at(&self, address: usize, buf: &mut [u8]) -> Result<usize> {
        self.0.read_at(address, buf).map_err(Error::ProcessReader)
    }
}

impl<'a> crate::ProcessReader for ProcessReader<'a> {
    fn read_at(&self, address: usize, buf: &mut [u8]) -> crate::Result<usize> {
        ProcessReader::read_at(self, address, buf).map_err(crate::Error::Local)
    }
}

/// This is just a typesafe wrapper around ptrace(), which is vararg... But this is Rust, and
/// playing loosey-goosey with types is really more of a C thing ;)
unsafe fn ptrace(
    request: PtraceRequestType,
    pid: libc::pid_t,
    addr: *mut c_void,
    data: *mut c_void,
) -> c_long {
    unsafe { libc::ptrace(request, pid, addr, data) }
}

#[derive(Debug, thiserror::Error, serde::Deserialize, serde::Serialize)]
pub enum PtraceGetRegSetError {
    #[error("ptrace returned error code: {0}")]
    PtraceFailed(c_int),
    #[error("unexpected size for register set. Expected: {0}, actual: {0}")]
    UnexpectedRegisterSetSize(usize, usize),
}

#[derive(Debug, thiserror::Error, serde::Deserialize, serde::Serialize)]
pub enum PtraceGetRegsLegacyError {
    #[error("ptrace returned error code: {0}")]
    PtraceFailed(c_int),
    #[error("legacy API not supported on this architecture")]
    NotSupported,
}

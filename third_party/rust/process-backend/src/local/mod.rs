use crate::regs::*;
use core::{
    cell::RefCell,
    ffi::{CStr, c_int, c_long, c_void},
    mem, ptr,
};
use libc::pid_t;
use syscall_invoker::SyscallInvoker;

pub use self::{error::Error, module_reader::MappedModuleMemoryReader};

mod error;
mod module_reader;
mod syscall_invoker;

#[cfg(target_env = "gnu")]
type PtraceRequestType = core::ffi::c_uint;

#[cfg(not(target_env = "gnu"))]
type PtraceRequestType = core::ffi::c_int;

#[derive(Debug)]
pub struct Backend {
    pid: pid_t,
    syscall_invoker: RefCell<SyscallInvoker>,
}

impl Backend {
    pub fn new(pid: libc::pid_t) -> Self {
        Self {
            pid,
            syscall_invoker: Default::default(),
        }
    }
    pub fn process_reader(&self) -> ProcessReader {
        ProcessReader(process_reader::ProcessReader::new(self.pid))
    }
    pub fn stop_process(&self) -> Result<(), Error> {
        self.standard_syscall(|| unsafe { libc::kill(self.pid, libc::SIGSTOP) })
            .map_err(Error::SigStopFailed)?;
        Ok(())
    }

    pub fn continue_process(&self) -> Result<(), Error> {
        self.standard_syscall(|| unsafe { libc::kill(self.pid, libc::SIGCONT) })
            .map_err(Error::SigContFailed)?;
        Ok(())
    }

    pub fn suspend_thread(&self, tid: libc::pid_t) -> Result<(), Error> {
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

    pub fn resume_thread(&self, tid: libc::pid_t) -> Result<(), Error> {
        self.ptrace_detach(tid)
    }

    pub fn map_module_into_memory(
        &self,
        path: &CStr,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader, Error> {
        MappedModuleMemoryReader::new(&mut self.syscall_invoker.borrow_mut(), path, offset)
    }

    pub fn stat_file(&self, path: &CStr) -> Result<libc::stat, Error> {
        let mut output = unsafe { mem::zeroed::<libc::stat>() };
        self.standard_syscall(|| unsafe { libc::stat(path.as_ptr(), &mut output) })
            .map_err(Error::StatFailed)?;
        Ok(output)
    }

    pub fn read_file(&self, path: &CStr) -> Result<FileReader, Error> {
        self.open_file(path).map(FileReader)
    }

    pub fn read_dir(&self, path: &CStr) -> Result<DirReader, Error> {
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

    pub fn read_link(&self, path: &CStr, buf: &mut [u8]) -> Result<usize, Error> {
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

    pub fn get_gen_regs(&self, tid: libc::pid_t) -> Result<GenRegs, Error> {
        self.getregset(tid).or_else(|_| self.getregs(tid))
    }

    pub fn get_fp_regs(&self, tid: libc::pid_t) -> Result<FpRegs, Error> {
        self.getfpregset(tid).or_else(|_| self.getfpregs(tid))
    }

    #[cfg(target_arch = "x86")]
    pub fn get_fpx_regs(&self, tid: libc::pid_t) -> Result<FpxRegs, Error> {
        const PTRACE_GETFPXREGS: PtraceRequestType = 18;
        unsafe { self.ptrace_getregs::<FpxRegs>(PTRACE_GETFPXREGS, tid) }
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    pub fn ptrace_peekuser(
        &self,
        pid: libc::pid_t,
        addr: usize,
    ) -> Result<[u8; mem::size_of::<libc::c_long>()], Error> {
        self.special_syscall(|| unsafe {
            set_errno(0);
            let rv = ptrace(
                libc::PTRACE_PEEKUSER,
                pid,
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

    pub fn process_reader_for_virtual_mem(&self) -> ProcessReader {
        ProcessReader(process_reader::ProcessReader::for_virtual_mem(self.pid))
    }

    pub fn process_reader_for_file(&self) -> Result<ProcessReader, Error> {
        process_reader::ProcessReader::for_file(self.pid)
            .map(ProcessReader)
            .map_err(Error::ProcessReader)
    }

    pub fn process_reader_for_ptrace(&self) -> ProcessReader {
        ProcessReader(process_reader::ProcessReader::for_ptrace(self.pid))
    }

    fn open_file(&self, path: &CStr) -> Result<OwnedFd, Error> {
        self.standard_syscall(|| unsafe {
            libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC, 0)
        })
        .map(|fd| unsafe { OwnedFd::new(fd) })
        .map_err(Error::OpenFileFailed)
    }

    fn getregset(&self, _pid: libc::pid_t) -> Result<GenRegs, Error> {
        #[cfg(target_arch = "arm")]
        {
            Err(Error::NotSupported)
        }
        #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
        {
            const NT_PRSTATUS: usize = 1;
            self.ptrace_getregset(NT_PRSTATUS, _pid)
        }
    }

    fn getregs(&self, pid: libc::pid_t) -> Result<GenRegs, Error> {
        const PTRACE_GETREGS: PtraceRequestType = 12;
        unsafe { self.ptrace_getregs::<GenRegs>(PTRACE_GETREGS, pid) }
    }

    fn getfpregset(&self, pid: libc::pid_t) -> Result<FpRegs, Error> {
        #[cfg(target_arch = "arm")]
        {
            const NT_ARM_VFP: usize = 0x400;
            self.ptrace_getregset(NT_ARM_VFP, pid)
        }
        #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
        {
            const NT_PRFPREGSET: usize = 2;
            self.ptrace_getregset(NT_PRFPREGSET, pid)
        }
    }

    fn getfpregs(&self, _pid: libc::pid_t) -> Result<FpRegs, Error> {
        #[cfg(target_arch = "arm")]
        {
            Err(Error::NotSupported)
        }
        #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
        {
            const PTRACE_GETFPREGS: PtraceRequestType = 14;
            unsafe { self.ptrace_getregs::<FpRegs>(PTRACE_GETFPREGS, _pid) }
        }
    }

    /// Safety: RequestType and T must agree on the size of the returned type
    unsafe fn ptrace_getregs<T>(
        &self,
        request: PtraceRequestType,
        pid: libc::pid_t,
    ) -> Result<T, Error> {
        let mut output = mem::MaybeUninit::<T>::uninit();
        self.standard_syscall(|| unsafe {
            ptrace(
                request,
                pid,
                core::ptr::null_mut(),
                output.as_mut_ptr().cast(),
            )
        })
        .map_err(Error::GetRegistersFailed)?;
        Ok(unsafe { output.assume_init() })
    }

    fn ptrace_getregset<T>(&self, regset_type: usize, pid: libc::pid_t) -> Result<T, Error> {
        let mut output = mem::MaybeUninit::<T>::uninit();
        let mut io = libc::iovec {
            iov_base: output.as_mut_ptr().cast(),
            iov_len: mem::size_of::<T>(),
        };

        self.standard_syscall(|| unsafe {
            ptrace(
                libc::PTRACE_GETREGSET,
                pid,
                regset_type as *mut _,
                (&raw mut io).cast(),
            )
        })
        .map_err(Error::GetRegistersFailed)?;

        // PTRACE_GETREGSET returns the number of bytes actually read in iov_len. Need to ensure
        // all bytes of T are actually initialized
        if io.iov_len != mem::size_of::<T>() {
            Err(Error::GetRegistersFailed(libc::EINVAL))?;
        }

        Ok(unsafe { output.assume_init() })
    }

    fn ptrace_detach(&self, tid: libc::pid_t) -> Result<(), Error> {
        self.standard_syscall(|| unsafe {
            ptrace(libc::PTRACE_DETACH, tid, ptr::null_mut(), ptr::null_mut())
        })
        .map_err(Error::PtraceDetachFailed)?;
        Ok(())
    }

    fn standard_syscall<T, F>(&self, f: F) -> Result<T, c_int>
    where
        F: FnOnce() -> T,
        T: From<i8> + core::cmp::PartialEq,
    {
        self.syscall_invoker.borrow_mut().invoke_standard(f)
    }

    fn special_syscall<T, F>(&self, f: F) -> Result<T, c_int>
    where
        F: FnOnce() -> Result<T, ()>,
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

#[derive(Debug)]
pub struct FileReader(OwnedFd);

impl FileReader {
    pub fn read(&mut self, buf: &mut [u8]) -> Result<usize, Error> {
        let rv = unsafe { libc::read(self.0.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len()) };
        if rv == -1 {
            return Err(Error::ReadFileFailed(errno()));
        }
        Ok(rv.try_into().unwrap())
    }
    pub fn read_at(&self, buf: &mut [u8], offset: u64) -> Result<usize, Error> {
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

#[derive(Debug)]
pub struct DirReader {
    dirp: *mut libc::DIR,
    eof: bool,
}

impl DirReader {
    pub fn read_name(&mut self) -> Result<Option<&[u8]>, Error> {
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
            log::debug!("failed to close directory: {}", errno());
        }
    }
}

#[derive(Debug)]
pub struct ProcessReader(process_reader::ProcessReader);

impl ProcessReader {
    pub fn read_at(&self, address: usize, buf: &mut [u8]) -> Result<usize, Error> {
        self.0.read_at(address, buf).map_err(Error::ProcessReader)
    }
}

#[derive(Debug)]
struct OwnedFd(c_int);

impl OwnedFd {
    // SAFETY: Must be a valid fd
    pub unsafe fn new(fd: c_int) -> Self {
        Self(fd)
    }
    pub fn as_raw_fd(&self) -> c_int {
        self.0
    }
}

impl Drop for OwnedFd {
    fn drop(&mut self) {
        let rv = unsafe { libc::close(self.0) };
        if rv == -1 {
            log::error!("failed to close file: {}", errno());
        }
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

fn errno() -> c_int {
    unsafe { *errno_location() }
}

fn set_errno(value: c_int) {
    unsafe {
        *errno_location() = value;
    }
}

#[cfg(target_os = "android")]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno() }
}

#[cfg(not(target_os = "android"))]
fn errno_location() -> *mut c_int {
    unsafe { libc::__errno_location() }
}

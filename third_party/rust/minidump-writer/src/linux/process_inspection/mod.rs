use {
    super::{
        Pid, maps_reader,
        module_reader::{ModuleReaderError, ReadModuleMemory},
        serializers::{self, *},
    },
    crate::serializers::*,
    core::{ffi::c_void, mem},
    module_reader::MappedModuleMemoryReader,
    nix::{
        errno::Errno,
        sys::{ptrace, signal, wait},
        unistd::Pid as NixPid,
    },
    process_reader::ProcessReader,
    regs::*,
    std::{
        ffi::{CString, OsString},
        fs::{self, File},
        io::{self, Read},
        os::unix::ffi::OsStringExt,
        path::{Path, PathBuf},
    },
};

pub mod process_reader;
pub mod regs;

mod module_reader;

#[cfg(target_env = "gnu")]
type PtraceRequestType = core::ffi::c_uint;

#[cfg(not(target_env = "gnu"))]
type PtraceRequestType = core::ffi::c_int;

#[derive(Debug)]
pub struct ProcessInspector {
    pid: libc::pid_t,
    process_reader: ProcessReader,
}

impl ProcessInspector {
    pub fn local(pid: libc::pid_t) -> Self {
        ProcessInspector {
            pid,
            process_reader: ProcessReader::new(pid),
        }
    }

    pub fn process_reader(&self) -> &ProcessReader {
        &self.process_reader
    }

    pub fn stop_process(&self) -> Result<(), Errno> {
        signal::kill(NixPid::from_raw(self.pid), Some(signal::SIGSTOP))
    }

    pub fn continue_process(&self) -> Result<(), Errno> {
        signal::kill(NixPid::from_raw(self.pid), Some(signal::SIGCONT))
    }

    pub fn suspend_thread(&self, tid: libc::pid_t) -> Result<(), SuspendResumeThreadError> {
        let tid = NixPid::from_raw(tid);
        ptrace::attach(tid).map_err(SuspendResumeThreadError::PtraceAttachFailed)?;
        loop {
            match wait::waitpid(tid, Some(wait::WaitPidFlag::__WALL)) {
                Ok(status) => {
                    let wait::WaitStatus::Stopped(_, signal) = status else {
                        return Err(SuspendResumeThreadError::UnexpectedStatus(status));
                    };

                    // Any signal will stop the thread, make sure it is SIGSTOP. Otherwise, this
                    // signal will be delivered after PTRACE_DETACH, and the thread will enter
                    // the "T (stopped)" state.
                    if signal == signal::SIGSTOP {
                        break;
                    }

                    // Signals other than SIGSTOP that are received need to be reinjected,
                    // or they will otherwise get lost.
                    ptrace::cont(tid, signal)
                        .map_err(|e| SuspendResumeThreadError::ReinjectFailed(e, signal))?;
                }
                Err(Errno::EINTR) => (),
                Err(e) => {
                    ptrace_detach(tid).map_err(SuspendResumeThreadError::PtraceDetachFailed)?;
                    return Err(SuspendResumeThreadError::WaitPidFailed(e));
                }
            }
        }
        Ok(())
    }

    pub fn resume_thread(&self, tid: libc::pid_t) -> Result<(), SuspendResumeThreadError> {
        let tid = NixPid::from_raw(tid);
        ptrace_detach(tid).map_err(SuspendResumeThreadError::PtraceDetachFailed)
    }

    pub fn read_memory_mapped_module(
        &self,
        path: impl AsRef<Path>,
        offset: u64,
    ) -> Result<MappedModuleMemoryReader, ModuleReaderError> {
        MappedModuleMemoryReader::new(path.as_ref(), offset)
    }

    pub fn stat_file(&self, path: impl Into<PathBuf>) -> io::Result<libc::stat> {
        let c_path = CString::new(path.into().into_os_string().into_vec()).unwrap();

        let mut output = unsafe { mem::zeroed::<libc::stat>() };
        let rv = unsafe { libc::stat(c_path.as_ptr(), &mut output) };
        if rv == -1 {
            return Err(io::Error::last_os_error());
        }
        Ok(output)
    }

    pub fn read_file(&self, path: impl AsRef<Path>) -> io::Result<FileReader> {
        File::open(path).map(FileReader)
    }

    pub fn read_dir(&self, path: impl AsRef<Path>) -> io::Result<DirReader> {
        fs::read_dir(path).map(DirReader)
    }

    pub fn read_link(&self, path: impl AsRef<Path>) -> io::Result<PathBuf> {
        fs::read_link(path)
    }

    pub fn path_exists(&self, path: impl AsRef<Path>) -> bool {
        path.as_ref().exists()
    }

    pub fn get_gen_regs(&self, tid: libc::pid_t) -> nix::Result<GenRegs> {
        getregset(tid).or_else(|_| getregs(tid))
    }

    pub fn get_fp_regs(&self, tid: libc::pid_t) -> nix::Result<FpRegs> {
        getfpregset(tid).or_else(|_| getfpregs(tid))
    }

    #[cfg(target_arch = "x86")]
    pub fn get_fpx_regs(&self, tid: libc::pid_t) -> nix::Result<FpxRegs> {
        const PTRACE_GETFPXREGS: PtraceRequestType = 18;
        unsafe { ptrace_getregs::<FpxRegs>(PTRACE_GETFPXREGS, tid) }
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    pub fn ptrace_peekuser(
        &self,
        pid: libc::pid_t,
        addr: usize,
    ) -> nix::Result<[u8; mem::size_of::<libc::c_long>()]> {
        // Since ptrace() is vararg, best to explicitly state arg types
        let addr: *mut libc::c_void = addr as *mut libc::c_void;
        let data: *mut libc::c_void = core::ptr::null_mut();
        Errno::set_raw(0);
        let rv = unsafe { libc::ptrace(libc::PTRACE_PEEKUSER, pid, addr, data) };
        if rv == -1 && Errno::last_raw() != 0 {
            Err(Errno::last())
        } else {
            Ok(rv.to_ne_bytes())
        }
    }
}

#[derive(Debug)]
pub struct FileReader(File);

impl Read for FileReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.0.read(buf)
    }
}

#[derive(Debug)]
pub struct DirReader(fs::ReadDir);

impl Iterator for DirReader {
    type Item = io::Result<OsString>;
    fn next(&mut self) -> Option<Self::Item> {
        self.0
            .next()
            .map(|result| result.map(|entry| entry.file_name()))
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum SuspendResumeThreadError {
    #[error("failed to attach to process")]
    PtraceAttachFailed(
        #[source]
        #[serde(serialize_with = "serialize_nix_error")]
        Errno,
    ),
    #[error("failed to detach from process")]
    PtraceDetachFailed(
        #[source]
        #[serde(serialize_with = "serialize_nix_error")]
        Errno,
    ),
    #[error("received an unexpected status: {0:?}")]
    UnexpectedStatus(#[serde(serialize_with = "serialize_debug_string")] wait::WaitStatus),
    #[error("failed to reinject irrelevant signal: {1:?}")]
    ReinjectFailed(
        #[source]
        #[serde(serialize_with = "serialize_nix_error")]
        Errno,
        #[serde(serialize_with = "serialize_debug_string")] signal::Signal,
    ),
    #[error("failed waiting for process state to change")]
    WaitPidFailed(
        #[source]
        #[serde(serialize_with = "serialize_nix_error")]
        Errno,
    ),
}

fn getregset(_pid: libc::pid_t) -> nix::Result<GenRegs> {
    #[cfg(target_arch = "arm")]
    {
        Err(Errno::ENOTSUP)
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
    {
        const NT_PRSTATUS: usize = 1;
        ptrace_getregset(NT_PRSTATUS, _pid)
    }
}

fn getregs(pid: libc::pid_t) -> nix::Result<GenRegs> {
    const PTRACE_GETREGS: PtraceRequestType = 12;
    unsafe { ptrace_getregs::<GenRegs>(PTRACE_GETREGS, pid) }
}

fn getfpregset(pid: libc::pid_t) -> nix::Result<FpRegs> {
    #[cfg(target_arch = "arm")]
    {
        const NT_ARM_VFP: usize = 0x400;
        ptrace_getregset(NT_ARM_VFP, pid)
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
    {
        const NT_PRFPREGSET: usize = 2;
        ptrace_getregset(NT_PRFPREGSET, pid)
    }
}

fn getfpregs(_pid: libc::pid_t) -> nix::Result<FpRegs> {
    #[cfg(target_arch = "arm")]
    {
        Err(Errno::ENOTSUP)
    }
    #[cfg(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64"))]
    {
        const PTRACE_GETFPREGS: PtraceRequestType = 14;
        unsafe { ptrace_getregs::<FpRegs>(PTRACE_GETFPREGS, _pid) }
    }
}

/// Safety: RequestType and T must agree on the size of the returned type
unsafe fn ptrace_getregs<T>(request: PtraceRequestType, pid: libc::pid_t) -> nix::Result<T> {
    let mut output = mem::MaybeUninit::<T>::uninit();

    // Since ptrace() is vararg, best to explicitly state arg types
    let addr: *mut c_void = core::ptr::null_mut();
    let data: *mut c_void = output.as_mut_ptr().cast();
    let res = unsafe { libc::ptrace(request, pid, addr, data) };
    Errno::result(res)?;
    Ok(unsafe { output.assume_init() })
}

fn ptrace_getregset<T>(regset_type: usize, pid: libc::pid_t) -> nix::Result<T> {
    let mut output = mem::MaybeUninit::<T>::uninit();
    let mut io = libc::iovec {
        iov_base: output.as_mut_ptr().cast(),
        iov_len: mem::size_of::<T>(),
    };

    // Since ptrace() is vararg, best to explicitly state arg types
    let addr: *mut c_void = regset_type as *mut c_void;
    let data: *mut c_void = (&raw mut io).cast();
    let res = unsafe { libc::ptrace(libc::PTRACE_GETREGSET, pid, addr, data) };
    Errno::result(res)?;

    // PTRACE_GETREGSET returns the number of bytes actually read in iov_len. Need to ensure
    // all bytes of T are actually initialized
    if io.iov_len != mem::size_of::<T>() {
        return Err(Errno::EINVAL);
    }

    Ok(unsafe { output.assume_init() })
}

fn ptrace_detach(tid: NixPid) -> Result<(), Errno> {
    ptrace::detach(tid, None).or_else(|e| {
        // errno is set to ESRCH if the pid no longer exists, but we don't want to error in that
        // case.
        if e == nix::Error::ESRCH {
            Ok(())
        } else {
            Err(e)
        }
    })
}

#[doc(hidden)]
impl ProcessInspector {
    pub fn force_pr_reset(&mut self) {
        self.process_reader = ProcessReader::new(self.pid)
    }
    pub fn force_pr_virtual_mem(&mut self) {
        self.process_reader = ProcessReader::for_virtual_mem(self.pid)
    }
    pub fn force_pr_file(&mut self) -> std::io::Result<()> {
        self.process_reader = ProcessReader::for_file(self.pid)?;
        Ok(())
    }
    pub fn force_pr_ptrace(&mut self) {
        self.process_reader = ProcessReader::for_ptrace(self.pid);
    }
}

use super::super::executor;
use crate::{ProcessReaderKind, regs::*, wrapper::Stat};
use executor::{Error, Executor, Result, remote};
use remote::wire;
use wire::{CStrWithNull, HandlesRequests};

impl HandlesRequests for &mut Executor<'_> {
    fn GetPid<'args, 'output>(self, _args: ()) -> Result<libc::pid_t>
    where
        Self: 'output,
    {
        Ok(self.local_backend.pid())
    }

    fn ProcessReaderReadAt<'args, 'output>(
        self,
        args: wire::ProcessReaderReadAtArgs,
    ) -> Result<&'output [u8]>
    where
        Self: 'output,
    {
        let scratch_buf = borrow_with_limit(self.scratch_buf, args.requested_len);

        let bytes_read = self
            .local_backend
            .process_reader()
            .read_at(args.address, scratch_buf)
            .map_err(Error::Local)?;

        Ok(&scratch_buf[0..bytes_read])
    }

    fn StopProcess<'args, 'output>(self, _args: ()) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend.stop_process().map_err(Error::Local)
    }

    fn ContinueProcess<'args, 'output>(self, _args: ()) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend.continue_process().map_err(Error::Local)
    }

    fn SuspendThread<'args, 'output>(self, tid: libc::pid_t) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend.suspend_thread(tid).map_err(Error::Local)
    }

    fn ResumeThread<'args, 'output>(self, tid: libc::pid_t) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend.resume_thread(tid).map_err(Error::Local)
    }

    fn MappedModuleMemoryReaderOpen<'args, 'output>(
        self,
        args: wire::MappedModuleMemoryReaderOpenArgs,
    ) -> Result<usize>
    where
        Self: 'output,
    {
        let reader = self
            .local_backend
            .map_module_into_memory(&args.path, args.offset)
            .map_err(Error::Local)?;
        self.mapped_module_memory_readers
            .assign_slot(reader)
            .ok_or(Error::MappedModuleMemoryReaderSlotsExhausted)
    }

    fn MappedModuleMemoryReaderReadAt<'args, 'output>(
        self,
        args: wire::MappedModuleMemoryReaderReadAtArgs,
    ) -> Result<&'output [u8]>
    where
        Self: 'output,
    {
        let reader = self
            .mapped_module_memory_readers
            .get_slot_mut(args.handle)
            .ok_or(Error::EmptyMappedModuleMemoryReaderSlotRequested)?;
        reader
            .read_at(args.offset, args.requested_len)
            .map_err(Error::Local)
    }

    fn MappedModuleMemoryReaderLen<'args, 'output>(self, handle: usize) -> Result<usize>
    where
        Self: 'output,
    {
        let reader = self
            .mapped_module_memory_readers
            .get_slot_mut(handle)
            .ok_or(Error::EmptyMappedModuleMemoryReaderSlotRequested)?;
        Ok(reader.len())
    }

    fn MappedModuleMemoryReaderClose<'args, 'output>(self, handle: usize) -> Result<()>
    where
        Self: 'output,
    {
        let _reader = self
            .mapped_module_memory_readers
            .free_slot(handle)
            .ok_or(Error::EmptyMappedModuleMemoryReaderSlotRequested)?;
        Ok(())
    }

    fn StatFile<'args, 'output>(self, path: CStrWithNull<'_>) -> Result<Stat>
    where
        Self: 'output,
    {
        self.local_backend.stat_file(&path).map_err(Error::Local)
    }

    fn FileReaderOpen<'args, 'output>(self, path: CStrWithNull<'_>) -> Result<usize>
    where
        Self: 'output,
    {
        let reader = self.local_backend.read_file(&path).map_err(Error::Local)?;
        self.file_readers
            .assign_slot(reader)
            .ok_or(Error::FileReaderSlotsExhausted)
    }

    fn FileReaderRead<'args, 'output>(self, args: wire::FileReaderArgs) -> Result<&'output [u8]>
    where
        Self: 'output,
    {
        let scratch_buf = borrow_with_limit(self.scratch_buf, args.requested_len);

        let reader = self
            .file_readers
            .get_slot_mut(args.handle)
            .ok_or(Error::EmptyFileSlotRequested)?;

        let bytes_read = reader.read(scratch_buf).map_err(Error::Local)?;

        Ok(&scratch_buf[0..bytes_read])
    }

    fn FileReaderClose<'args, 'output>(self, handle: usize) -> Result<()>
    where
        Self: 'output,
    {
        let _reader = self
            .file_readers
            .free_slot(handle)
            .ok_or(Error::EmptyFileSlotRequested)?;
        Ok(())
    }

    fn DirReaderOpen<'args, 'output>(self, path: CStrWithNull<'_>) -> Result<usize>
    where
        Self: 'output,
    {
        let reader = self.local_backend.read_dir(&path).map_err(Error::Local)?;
        self.dir_readers
            .assign_slot(reader)
            .ok_or(Error::DirReaderSlotsExhausted)
    }

    fn DirReaderRead<'args, 'output>(self, handle: usize) -> Result<Option<&'output [u8]>>
    where
        Self: 'output,
    {
        let reader = self
            .dir_readers
            .get_slot_mut(handle)
            .ok_or(Error::EmptyDirSlotRequested)?;

        reader.read_next_name().map_err(Error::Local)
    }

    fn DirReaderClose<'args, 'output>(self, handle: usize) -> Result<()>
    where
        Self: 'output,
    {
        let _reader = self
            .dir_readers
            .free_slot(handle)
            .ok_or(Error::EmptyDirSlotRequested)?;
        Ok(())
    }

    fn ReadLink<'args, 'output>(self, args: wire::ReadLinkArgs<'_>) -> Result<&'output [u8]>
    where
        Self: 'output,
    {
        let scratch_buf = borrow_with_limit(self.scratch_buf, args.requested_len);

        let bytes_read = self
            .local_backend
            .read_link(&args.path, scratch_buf)
            .map_err(Error::Local)?;

        Ok(&scratch_buf[0..bytes_read])
    }

    fn GetGenRegs<'args, 'output>(self, tid: libc::pid_t) -> Result<GenRegs>
    where
        Self: 'output,
    {
        self.local_backend.get_gen_regs(tid).map_err(Error::Local)
    }

    fn GetFpRegs<'args, 'output>(self, tid: libc::pid_t) -> Result<FpRegs>
    where
        Self: 'output,
    {
        self.local_backend.get_fp_regs(tid).map_err(Error::Local)
    }

    #[cfg(target_arch = "x86")]
    fn GetFpxRegs<'args, 'output>(self, tid: libc::pid_t) -> Result<FpxRegs>
    where
        Self: 'output,
    {
        self.local_backend.get_fpx_regs(tid).map_err(Error::Local)
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    fn PtracePeekUser<'args, 'output>(self, addr: usize) -> Result<[u8; crate::PTRACE_DATA_LEN]>
    where
        Self: 'output,
    {
        self.local_backend
            .ptrace_peekuser(addr)
            .map_err(Error::Local)
    }

    fn ForceProcessReaderKind<'args, 'output>(self, kind: ProcessReaderKind) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend
            .force_process_reader_kind(kind)
            .map_err(Error::Local)
    }

    #[cfg(feature = "testing")]
    fn FailOneSyscallWith<'args, 'output>(self, errno: core::ffi::c_int) -> Result<()>
    where
        Self: 'output,
    {
        self.local_backend.fail_one_syscall_with(errno);
        Ok(())
    }

    fn Quit<'args, 'output>(self, _args: ()) -> Result<()>
    where
        Self: 'output,
    {
        self.quit = true;
        Ok(())
    }
}

fn borrow_with_limit(buf: &mut [u8], limit: usize) -> &mut [u8] {
    let len = usize::min(buf.len(), limit);
    &mut buf[0..len]
}

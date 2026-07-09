use {
    super::{Error, OwnedFd, SyscallInvoker, errno},
    core::{
        ffi::{CStr, c_void},
        mem, ptr,
    },
};

#[derive(Debug)]
pub struct MappedModuleMemoryReader {
    mapped: Mapped,
    ptr: *mut u8,
    len: usize,
}

impl MappedModuleMemoryReader {
    pub fn new(
        syscall_invoker: &mut SyscallInvoker,
        path: &CStr,
        start_position: u64,
    ) -> Result<Self, Error> {
        let fd = Self::open_file(syscall_invoker, path)?;

        // So far, we only ever map files from the start position to EOF - We never specify a
        // max length anywhere.
        let end_position = Self::get_file_size(syscall_invoker, &fd)?;

        if start_position > end_position {
            Err(Error::StartPositionPastEnd)?;
        }

        // a mmap() mapping must start on a page-aligned offset within the file
        let page_size = Self::get_page_size();
        let offset_into_page = start_position % page_size;
        let aligned_start_position = start_position - offset_into_page;
        let mmap_length = usize::try_from(end_position - aligned_start_position)
            .map_err(|_| Error::MappingTooLarge)?;

        let mapped = Self::map_memory(syscall_invoker, &fd, aligned_start_position, mmap_length)?;

        // Contrary to what you might expect, it's fine to close the fd once the mapping has
        // been established
        drop(fd);

        // Now that we have our page-aligned memory mapped, back-calculate the (ptr, len) pair
        // for the actual slice the user asked for.

        let slice_offset_into_mapping = usize::try_from(offset_into_page).unwrap();
        let ptr = unsafe { mapped.ptr.cast::<u8>().add(slice_offset_into_mapping) };
        let len = mmap_length - slice_offset_into_mapping;

        Ok(MappedModuleMemoryReader { mapped, ptr, len })
    }
    pub fn read(&self, offset: u64, length: u64) -> Result<&[u8], Error> {
        (|| {
            let offset = usize::try_from(offset).ok()?;
            let length = usize::try_from(length).ok()?;
            let end = offset.checked_add(length)?;
            self.as_slice().get(offset..end)
        })()
        .ok_or(Error::IndexOutOfBounds)
    }
    pub fn len(&self) -> Result<usize, Error> {
        Ok(self.as_slice().len())
    }
    pub fn is_empty(&self) -> Result<bool, Error> {
        self.len().map(|l| l == 0)
    }
    fn open_file(syscall_invoker: &mut SyscallInvoker, path: &CStr) -> Result<OwnedFd, Error> {
        syscall_invoker
            .invoke_standard(|| unsafe {
                libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC, 0)
            })
            .map(|fd| unsafe { OwnedFd::new(fd) })
            .map_err(Error::OpenFileFailed)
    }
    fn get_file_size(syscall_invoker: &mut SyscallInvoker, fd: &OwnedFd) -> Result<u64, Error> {
        let mut stat: libc::stat = unsafe { mem::zeroed() };

        syscall_invoker
            .invoke_standard(|| unsafe { libc::fstat(fd.as_raw_fd(), &mut stat) })
            .map_err(Error::StatFailed)?;

        Ok(u64::try_from(stat.st_size).unwrap())
    }
    fn get_page_size() -> u64 {
        let page_size = u64::try_from(unsafe { libc::sysconf(libc::_SC_PAGESIZE) }).unwrap();
        assert!(page_size > 0);
        page_size
    }
    fn map_memory(
        syscall_invoker: &mut SyscallInvoker,
        fd: &OwnedFd,
        page_aligned_start_position: u64,
        len: usize,
    ) -> Result<Mapped, Error> {
        // Linux requires the mapping length to be non-zero, even though we want to support
        // zero-length mappings -- So we just make it a one-byte mapping (and ignore the byte).
        let len = usize::max(len, 1);

        // Rust/LLVM cannot support a single object larger than `isize::MAX`, which is
        // 2GiB on 32-bit systems. It is possible to map files larger than that, but there is a
        // bunch of special handling that needs to be done to avoid accidentally telling LLVM that
        // the mapped memory might be a single object with the same provenance.
        //
        // Luckily, we won't be accessing files that are larger than 2GiB, so we can skip all that
        // nastiness by disallowing a mapping larger than `isize::MAX`.
        //
        // See https://doc.rust-lang.org/stable/std/ptr/index.html#allocation and
        // https://doc.rust-lang.org/stable/std/primitive.pointer.html#method.offset

        if len > isize::MAX as usize {
            Err(Error::MappingTooLarge)?;
        }

        syscall_invoker
            .invoke(|| unsafe {
                let ptr = libc::mmap(
                    ptr::null_mut(),
                    len,
                    libc::PROT_READ,
                    libc::MAP_SHARED,
                    fd.as_raw_fd(),
                    page_aligned_start_position.try_into().unwrap(),
                );
                if ptr == libc::MAP_FAILED {
                    return Err(());
                }
                Ok(Mapped { ptr, len })
            })
            .map_err(Error::MMapfailed)
    }
    fn as_slice(&self) -> &[u8] {
        // The compiler will warn that we're not using `mapped` at all, but technically this
        // function does use it -- it just isn't captured by the semantics. This is basically
        // a no-op just to show that we do, in fact, use it.
        let _mapped_used = &self.mapped;
        unsafe { core::slice::from_raw_parts(self.ptr, self.len) }
    }
}

#[derive(Debug)]
struct Mapped {
    ptr: *mut c_void,
    len: usize,
}

impl Drop for Mapped {
    fn drop(&mut self) {
        let rv = unsafe { libc::munmap(self.ptr, self.len) };
        if rv == -1 {
            log::error!("failed to unmap memory: {}", errno());
        }
    }
}

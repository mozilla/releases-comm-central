#[cfg(any(target_os = "linux", target_os = "android"))]
pub use crate::linux::process_reader::*;

#[cfg(target_os = "windows")]
pub use crate::windows::process_reader::*;

#[cfg(target_os = "macos")]
pub use crate::mac::process_reader::*;

use std::{ffi::CString, mem::MaybeUninit};

impl ProcessReader {
    #[inline]
    pub fn read_to_vec(
        &self,
        src: usize,
        length: std::num::NonZeroUsize,
    ) -> Result<Vec<u8>, CopyFromProcessError> {
        let mut output = vec![0u8; length.into()];
        let bytes_read = self.read(src, &mut output)?;
        output.truncate(bytes_read);
        Ok(output)
    }

    #[inline]
    pub fn read_all(&self, src: usize, dst: &mut [u8]) -> Result<(), CopyFromProcessError> {
        let mut offset = 0;
        while offset < dst.len() {
            offset += self.read(src + offset, &mut dst[offset..])?;
        }
        Ok(())
    }

    #[inline]
    pub fn read_all_to_vec(
        &self,
        src: usize,
        length: usize,
    ) -> Result<Vec<u8>, CopyFromProcessError> {
        let mut output = vec![0u8; length];
        self.read_all(src, &mut output)?;
        Ok(output)
    }

    pub fn copy_nul_terminated_string(
        &self,
        address: usize,
    ) -> Result<CString, CopyFromProcessError> {
        // Try copying the string word-by-word first, this is considerably
        // faster than one byte at a time.
        if let Ok(string) = self.copy_nul_terminated_string_word_by_word(address) {
            return Ok(string);
        }

        // Reading the string one word at a time failed, let's try again one
        // byte at a time. It's slow but it might work in situations where the
        // string alignment causes word-by-word access to straddle page
        // boundaries.
        let mut string = Vec::<u8>::new();
        let mut c = 1u8;

        while c != 0 {
            self.read(address + string.len(), std::slice::from_mut(&mut c))?;
            string.push(c);
        }

        // SAFETY: If we reach this point we've read at least one byte and we
        // know that the last one we read is nul.
        Ok(unsafe { CString::from_vec_with_nul_unchecked(string) })
    }

    fn copy_nul_terminated_string_word_by_word(
        &self,
        address: usize,
    ) -> Result<CString, CopyFromProcessError> {
        const WORD_SIZE: usize = size_of::<usize>();
        let mut string = Vec::<u8>::new();
        let mut word_bytes = [0u8; WORD_SIZE];

        loop {
            let read_byte_len = self.read(address + string.len(), &mut word_bytes)?;
            // SAFETY: at most WORD_SIZE bytes are indexed
            let mut read_bytes =
                unsafe { word_bytes.get_unchecked(..std::cmp::min(read_byte_len, WORD_SIZE)) };
            let nul_terminator = read_bytes.iter().position(|&e| e == 0);
            if let Some(nul_terminator) = nul_terminator {
                // +1 to include the nul terminator
                read_bytes = &read_bytes[..nul_terminator + 1];
            }
            string.extend(read_bytes);

            if nul_terminator.is_some() {
                break;
            }
        }

        // SAFETY: If we reach this point we've read at least one byte and we
        // know that the last one we read is nul.
        Ok(unsafe { CString::from_vec_with_nul_unchecked(string) })
    }

    #[inline]
    pub fn copy_object_uninit<T>(
        &self,
        src: usize,
    ) -> Result<MaybeUninit<T>, CopyFromProcessError> {
        let mut object = MaybeUninit::<T>::uninit();
        self.read_all(src, uninit_as_bytes_mut(&mut object))?;
        Ok(object)
    }

    /// # Safety
    /// The caller must ensure that the object will be in an initialized, valid state.
    #[inline]
    pub unsafe fn copy_object<T>(&self, src: usize) -> Result<T, CopyFromProcessError> {
        self.copy_object_uninit(src)
            .map(|object| unsafe { object.assume_init() })
    }

    #[inline]
    pub fn copy_array_uninit<T>(
        &self,
        src: usize,
        num: usize,
    ) -> Result<Vec<MaybeUninit<T>>, CopyFromProcessError> {
        let mut v = Vec::with_capacity(num);
        for _ in 0..num {
            v.push(MaybeUninit::<T>::uninit());
        }
        self.read_all(src, uninit_slice_as_bytes_mut(&mut v))?;
        Ok(v)
    }

    /// # Safety
    /// The caller must ensure that the objects will be in an initialized, valid state.
    #[inline]
    pub unsafe fn copy_array<T>(
        &self,
        src: usize,
        num: usize,
    ) -> Result<Vec<T>, CopyFromProcessError> {
        self.copy_array_uninit(src, num)
            .map(|v| unsafe { std::mem::transmute::<Vec<MaybeUninit<T>>, Vec<T>>(v) })
    }
}

fn uninit_as_bytes_mut<T>(elem: &mut MaybeUninit<T>) -> &mut [u8] {
    // SAFETY: elem is at least size_of::<T>() bytes, and MaybeUninit<T> has no validity guarantees
    // (so providing a mutable slice of bytes is sound)
    unsafe { std::slice::from_raw_parts_mut(elem.as_mut_ptr() as *mut u8, size_of::<T>()) }
}

fn uninit_slice_as_bytes_mut<T>(slice: &mut [MaybeUninit<T>]) -> &mut [u8] {
    // SAFETY: the slice is at least size_of::<T>()*len() bytes, and MaybeUninit<T> has no validity
    // guarantees (so providing a mutable slice of bytes is sound)
    unsafe {
        std::slice::from_raw_parts_mut(slice.as_mut_ptr() as *mut u8, size_of::<T>() * slice.len())
    }
}

/*
#[derive(Debug, Error)]
pub enum ProcessReaderError {
    #[error("Could not convert address {0}")]
    ConvertAddressError(#[from] std::num::TryFromIntError),
    #[error("Could not parse address {0}")]
    ParseAddressError(#[from] std::num::ParseIntError),
    #[cfg(target_os = "windows")]
    #[error("Cannot enumerate the target process's modules")]
    EnumProcessModulesError,
    #[error("goblin failed to parse a module")]
    GoblinError(#[from] goblin::error::Error),
    #[error("Address was out of bounds")]
    InvalidAddress,
    #[error("Could not read from the target process address space")]
    ReadFromProcessError(#[from] ReadError),
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    #[error("Section was not found")]
    SectionNotFound,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("Could not attach to the target process")]
    AttachError(#[from] PtraceError),
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("Note not found")]
    NoteNotFound,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("SONAME not found")]
    SoNameNotFound,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("waitpid() failed when attaching to the process")]
    WaitPidError,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("Could not parse a line in /proc/<pid>/maps")]
    ProcMapsParseError,
    #[error("Module not found")]
    ModuleNotFound,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("IO error for file {0}")]
    IOError(#[from] std::io::Error),
    #[cfg(target_os = "macos")]
    #[error("Failure when requesting the task information")]
    TaskInfoError,
    #[cfg(target_os = "macos")]
    #[error("The task dyld information format is unknown or invalid")]
    ImageFormatError,
}

#[derive(Debug, Error)]
pub enum ReadError {
    #[cfg(target_os = "macos")]
    #[error("mach call failed")]
    MachError,
    #[cfg(any(target_os = "linux", target_os = "android"))]
    #[error("ptrace-specific error")]
    PtraceError(#[from] PtraceError),
    #[cfg(target_os = "windows")]
    #[error("ReadProcessMemory failed")]
    ReadProcessMemoryError,
}

#[cfg(any(target_os = "linux", target_os = "android"))]
#[derive(Debug, Error)]
pub enum PtraceError {
    #[error("Could not read from the target process address space")]
    ReadError(#[source] std::io::Error),
    #[error("Could not trace the process")]
    TraceError(#[source] std::io::Error),
}
*/

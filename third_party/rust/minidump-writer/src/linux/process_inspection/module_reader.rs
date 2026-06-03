use {
    super::{ModuleReaderError as Error, ReadModuleMemory},
    crate::module_reader::ModuleMemoryReadError,
    memmap2::{Mmap, MmapOptions},
    std::{borrow::Cow, fs::File, path::Path},
};

pub struct MappedModuleMemoryReader(Mmap);

impl MappedModuleMemoryReader {
    pub fn new(path: &Path, offset: u64) -> Result<Self, Error> {
        File::open(path)
            .map_err(Error::FileError)
            .and_then(|file| unsafe {
                MmapOptions::new()
                    .offset(offset)
                    .map(&file)
                    .map_err(Error::MapError)
            })
            .map(Self)
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
}

impl ReadModuleMemory for MappedModuleMemoryReader {
    fn read<'a>(
        &'a self,
        offset: u64,
        length: u64,
    ) -> Result<Cow<'a, [u8]>, ModuleMemoryReadError> {
        let inner = || {
            use crate::module_reader::ReadError as E;
            let offset = usize::try_from(offset).map_err(|_| E::Overflow)?;
            let length = usize::try_from(length).map_err(|_| E::Overflow)?;
            let end = offset.checked_add(length).ok_or(E::Overflow)?;
            self.0
                .get(offset..end)
                .map(Cow::Borrowed)
                .ok_or(E::OutOfBounds)
        };

        inner().map_err(|error| ModuleMemoryReadError {
            start_address: None,
            offset,
            length,
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

use crate::local;

/// Resources required by the executor.
///
/// The resources here place hard limits on how many simultaneous file, directory, and module
/// readers can be open, as well as a hard limit on the size of the buffer used by certain
/// operations.
///
/// See remote/wire.rs `operations!()` macro for notes on buffer sizing
#[derive(Debug)]
pub struct Resources<'a> {
    pub file_readers: &'a mut [FileReader],
    pub dir_readers: &'a mut [DirReader],
    pub mapped_module_memory_readers: &'a mut [MappedModuleMemoryReader],
    pub scratch_buf: &'a mut [u8],
}

#[derive(Debug)]
pub struct FileReader(Option<local::FileReader>);

impl FileReader {
    pub const fn new_array<const N: usize>() -> [Self; N] {
        [const { Self(None) }; N]
    }
}

#[derive(Debug)]
pub struct DirReader(Option<local::DirReader>);

impl DirReader {
    pub const fn new_array<const N: usize>() -> [Self; N] {
        [const { Self(None) }; N]
    }
}

#[derive(Debug)]
pub struct MappedModuleMemoryReader(Option<local::MappedModuleMemoryReader>);

impl MappedModuleMemoryReader {
    pub const fn new_array<const N: usize>() -> [Self; N] {
        [const { Self(None) }; N]
    }
}

#[derive(Debug)]
pub(super) struct Pool<'a, S>(&'a mut [S]);

impl<'a, S: Slot> Pool<'a, S> {
    pub(super) fn new(s: &'a mut [S]) -> Self {
        Self(s)
    }
    pub(super) fn assign_slot(&mut self, resource: S::Resource) -> Option<usize> {
        for (idx, slot) in self.0.iter_mut().map(Slot::inner).enumerate() {
            if slot.is_none() {
                *slot = Some(resource);
                return Some(idx);
            }
        }
        None
    }
    pub(super) fn get_slot_mut(&mut self, idx: usize) -> Option<&mut S::Resource> {
        self.0.get_mut(idx)?.inner().as_mut()
    }
    pub(super) fn free_slot(&mut self, idx: usize) -> Option<S::Resource> {
        self.0.get_mut(idx)?.inner().take()
    }
}

pub(super) trait Slot {
    type Resource;
    fn inner(&mut self) -> &mut Option<Self::Resource>;
}

impl Slot for FileReader {
    type Resource = local::FileReader;
    fn inner(&mut self) -> &mut Option<Self::Resource> {
        &mut self.0
    }
}

impl Slot for DirReader {
    type Resource = local::DirReader;
    fn inner(&mut self) -> &mut Option<Self::Resource> {
        &mut self.0
    }
}

impl Slot for MappedModuleMemoryReader {
    type Resource = local::MappedModuleMemoryReader;
    fn inner(&mut self) -> &mut Option<Self::Resource> {
        &mut self.0
    }
}

use crate::module_reader::{ModuleMemoryReadError, ProcessModuleMemoryReader};
use crate::serializers::*;
use goblin::container::{Container, Ctx, Endian};
use goblin::mach::{
    self,
    header::{Header, Header64, MH_DYLIB, MH_EXECUTE, MH_MAGIC_64},
    load_command::{LC_SEGMENT_64, LoadCommandHeader, Section64, SegmentCommand64},
};
use scroll::ctx::{SizeWith, TryFromCtx};

const DATA_SEGMENT: &[u8; 16] = b"__DATA\0\0\0\0\0\0\0\0\0\0";

pub struct ModuleReader<'a> {
    module_memory: ProcessModuleMemoryReader<'a>,
    header: Header,
    context: Ctx,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum ModuleReaderError {
    #[error(transparent)]
    ReadModuleMemory(#[from] ModuleMemoryReadError),
    #[error("failed to parse MachO memory: {0}")]
    GoblinParsing(
        #[from]
        #[serde(serialize_with = "serialize_generic_error")]
        goblin::error::Error,
    ),
    #[error("failed to parse MachO memory: {0}")]
    ScrollParsing(
        #[from]
        #[serde(serialize_with = "serialize_scroll_error")]
        scroll::Error,
    ),
    #[error("failed to derive parsing context from MachO memory")]
    MissingCtx,
}

macro_rules! read_scroll {
    ( $T:ty , $mem:expr , $offset:expr , $ctx:expr ) => {{
        let bytes = $mem.read($offset, <$T>::size_with(&$ctx) as u64)?;
        let (value, _) = <$T>::try_from_ctx(bytes.as_ref(), $ctx)?;
        value
    }};
}

macro_rules! read_scroll_array {
    ( $T:ty , $mem:expr , $offset:expr , $count:expr , $ctx:expr ) => {{
        let bytes = $mem.read($offset, (<$T>::size_with(&$ctx) * $count) as u64)?;
        let mut vals = Vec::with_capacity($count);
        let mut offset = 0;
        for _ in 0..$count {
            let (value, bytes_read) = <$T>::try_from_ctx(&bytes[offset..], $ctx)?;
            offset += bytes_read;
            vals.push(value);
        }
        vals
    }};
}

impl ProcessModuleMemoryReader<'_> {
    /// Read an array of values using scroll traits.
    ///
    /// See `read_scroll` for an explanation of the return form.
    #[inline]
    pub fn read_scroll_array<T, Ctx, F, R, Error>(
        &self,
        offset: u64,
        count: usize,
        ctx: Ctx,
        result: F,
    ) -> Result<R, ModuleReaderError>
    where
        T: scroll::ctx::SizeWith<Ctx> + for<'b> scroll::ctx::TryFromCtx<'b, Ctx>,
        Ctx: Copy,
        F: for<'b> FnOnce(
            Result<Vec<T>, <T as scroll::ctx::TryFromCtx<'b, Ctx>>::Error>,
        ) -> Result<R, ModuleReaderError>,
        Error: From<ModuleMemoryReadError>,
    {
        let bytes = self.read(offset, (T::size_with(&ctx) * count) as u64)?;
        let mut vals = Vec::with_capacity(count);
        let mut offset = 0;
        for _ in 0..count {
            let (value, bytes_read) = match T::try_from_ctx(&bytes[offset..], ctx) {
                Ok(v) => v,
                Err(e) => return result(Err(e)),
            };
            offset += bytes_read;
            vals.push(value);
        }
        result(Ok(vals))
    }
}

impl<'a> ModuleReader<'a> {
    pub fn new(module_memory: ProcessModuleMemoryReader<'a>) -> Result<Self, ModuleReaderError> {
        let header_size = Header::size_with(&Ctx::new(Container::Big, Endian::default()));
        let header_data = module_memory.read(0, header_size as u64)?;
        let (_, ctx) = mach::parse_magic_and_ctx(&header_data, 0)?;
        let ctx = ctx.ok_or(ModuleReaderError::MissingCtx)?;
        let (header, _) = Header::try_from_ctx(&header_data, ctx)?;
        Ok(Self {
            module_memory,
            header,
            context: ctx,
        })
    }

    pub fn find_section(
        &self,
        section_name: &[u8; 16],
    ) -> Result<Option<usize>, ModuleReaderError> {
        if self.header.magic == MH_MAGIC_64
            && (self.header.filetype == MH_EXECUTE || self.header.filetype == MH_DYLIB)
        {
            let mut offset = Header64::size_with(&self.context.le) as u64;
            let end_of_commands = offset + self.header.sizeofcmds as u64;

            while offset < end_of_commands {
                let command = read_scroll!(
                    LoadCommandHeader,
                    &self.module_memory,
                    offset,
                    self.context.le
                );

                if command.cmd == LC_SEGMENT_64 {
                    let result = self.find_section_in_segment(offset, section_name);
                    if let Ok(Some(_)) = &result {
                        return result;
                    }
                }

                offset += command.cmdsize as u64;
            }
        }

        Ok(None)
    }

    fn find_section_in_segment(
        &self,
        segment_offset: u64,
        section_name: &[u8; 16],
    ) -> Result<Option<usize>, ModuleReaderError> {
        let segment = read_scroll!(
            SegmentCommand64,
            &self.module_memory,
            segment_offset,
            self.context.le
        );

        if segment.segname.eq(DATA_SEGMENT) {
            let sections_offset =
                segment_offset + SegmentCommand64::size_with(&self.context.le) as u64;
            let sections = read_scroll_array!(
                Section64,
                self.module_memory,
                sections_offset,
                segment.nsects as usize,
                self.context.le
            );
            for section in &sections {
                if section.sectname.eq(section_name) {
                    return Ok(Some(section.offset as usize));
                }
            }
        }

        Ok(None)
    }
}

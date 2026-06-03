use {
    crate::{
        module_reader::{ModuleMemoryReadError, ProcessModuleMemoryReader},
        serializers::*,
    },
    goblin::pe::header::Header,
    std::borrow::Cow,
};

pub struct ModuleReader<'a> {
    first_page: Cow<'a, [u8]>,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum ModuleReaderError {
    #[error(transparent)]
    ReadModuleMemory(#[from] ModuleMemoryReadError),
    #[error("failed to parse PE memory: {0}")]
    GoblinParsing(
        #[from]
        #[serde(serialize_with = "serialize_generic_error")]
        goblin::error::Error,
    ),
}

impl<'a> ModuleReader<'a> {
    pub fn new(module_memory: ProcessModuleMemoryReader<'a>) -> Result<Self, ModuleReaderError> {
        // We read only the first page from the module, this should be more than
        // enough to read the header and section list. In the future we might do
        // this incrementally but for now goblin requires an array to parse
        // so we can't do it just yet.
        const PAGE_SIZE: u64 = 4096;
        let bytes = module_memory.read(0, PAGE_SIZE)?;

        Ok(Self { first_page: bytes })
    }

    pub fn find_section(&self, section_name: &[u8; 8]) -> Result<Option<usize>, ModuleReaderError> {
        let header = Header::parse(&self.first_page)?;
        // Skip the PE header so we can parse the sections
        let optional_header_offset = header.dos_header.pe_pointer as usize
            + goblin::pe::header::SIZEOF_PE_MAGIC
            + goblin::pe::header::SIZEOF_COFF_HEADER;
        let offset =
            &mut (optional_header_offset + header.coff_header.size_of_optional_header as usize);

        let sections = header.coff_header.sections(&self.first_page, offset)?;

        for section in sections {
            if section.name.eq(section_name) {
                return Ok(Some(section.virtual_address as usize));
            }
        }

        Ok(None)
    }
}

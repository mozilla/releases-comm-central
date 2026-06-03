use {
    super::{process_inspection::ProcessInspector, serializers::*},
    crate::module_reader::{ModuleMemoryReadError, ProcessModuleMemoryReader},
    crate::{minidump_format::GUID, serializers::*},
    goblin::{
        container::{Container, Ctx, Endian},
        elf,
    },
    std::{
        borrow::Cow,
        ffi::{CStr, OsString},
        path::Path,
    },
};

type Error = ModuleReaderError;

const NOTE_SECTION_NAME: &[u8] = b".note.gnu.build-id\0";

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum ModuleReaderError {
    #[error("failed to read module file ({path}): {error}")]
    MapFile {
        path: std::path::PathBuf,
        #[source]
        #[serde(serialize_with = "serialize_io_error")]
        error: std::io::Error,
    },
    #[error(transparent)]
    ReadModuleMemory(#[from] ModuleMemoryReadError),
    #[error("failed to parse ELF memory: {0}")]
    Parsing(
        #[from]
        #[serde(serialize_with = "serialize_goblin_error")]
        goblin::error::Error,
    ),
    #[error("no build id notes in program headers")]
    NoProgramHeaderNote,
    #[error("no string table available to locate note sections")]
    NoStrTab,
    #[error("no build id note sections")]
    NoSectionNote,
    #[error("the ELF data contains no program headers")]
    NoProgramHeaders,
    #[error("the ELF data contains no sections")]
    NoSections,
    #[error("the ELF data does not have a .text section from which to generate a build id")]
    NoTextSection,
    #[error(
        "failed to calculate build id\n\
    ... from program headers: {program_headers}\n\
    ... from sections: {section}\n\
    ... from the text section: {section}"
    )]
    NoBuildId {
        program_headers: Box<Self>,
        section: Box<Self>,
        generated: Box<Self>,
    },
    #[error("no dynamic string table section")]
    NoDynStrSection,
    #[error("a string in the strtab did not have a terminating nul byte")]
    StrTabNoNulByte,
    #[error("no SONAME found in dynamic linking information")]
    NoSoNameEntry,
    #[error("no dynamic linking information section")]
    NoDynamicSection,
    #[error(
        "failed to retrieve soname\n\
    ... from program headers: {program_headers}\n\
    ... from sections: {section}"
    )]
    NoSoName {
        program_headers: Box<Self>,
        section: Box<Self>,
    },
    #[error("Not safe to open mapping {}", .0.to_string_lossy())]
    NotSafeToOpenMapping(OsString),
    #[error("Mmapped file empty or not an ELF file")]
    MmapSanityCheckFailed,
    #[error("Linux gate location doesn't fit in the required integer type")]
    LinuxGateNotConvertable(
        #[source]
        #[serde(skip)]
        std::num::TryFromIntError,
    ),
    #[error("IO Error")]
    FileError(
        #[source]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
    #[error("failed to map file")]
    MapError(
        #[source]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
}

#[inline]
fn is_executable_section(header: &elf::SectionHeader) -> bool {
    header.sh_type == elf::section_header::SHT_PROGBITS
        && header.sh_flags & u64::from(elf::section_header::SHF_ALLOC) != 0
        && header.sh_flags & u64::from(elf::section_header::SHF_EXECINSTR) != 0
}

/// Return bytes to use as a build id, computed by hashing the given data.
///
/// This provides `size_of::<GUID>` bytes to keep identifiers produced by this function compatible
/// with other build ids.
fn build_id_from_bytes(data: &[u8]) -> Vec<u8> {
    // Only provide mem::size_of(MDGUID) bytes to keep identifiers produced by this
    // function backwards-compatible.
    data.chunks(std::mem::size_of::<GUID>()).fold(
        vec![0u8; std::mem::size_of::<GUID>()],
        |mut bytes, chunk| {
            bytes
                .iter_mut()
                .zip(chunk.iter())
                .for_each(|(b, c)| *b ^= *c);
            bytes
        },
    )
}

// `name` should be null-terminated
fn section_header_with_name<'sc, MM: ReadModuleMemory>(
    section_headers: &'sc elf::SectionHeaders,
    strtab_index: usize,
    name: &[u8],
    module_memory: &MM,
) -> Result<Option<&'sc elf::SectionHeader>, Error> {
    let strtab_section_header = section_headers
        .get(strtab_index)
        .and_then(|hdr| (hdr.sh_type == elf::section_header::SHT_STRTAB).then_some(hdr))
        .ok_or(Error::NoStrTab)?;

    for header in section_headers {
        let sh_name = header.sh_name as u64;
        if sh_name >= strtab_section_header.sh_size {
            log::warn!("invalid sh_name offset for {name:?}");
            continue;
        }
        if sh_name + name.len() as u64 >= strtab_section_header.sh_size {
            // This can't be a match.
            continue;
        }
        let n = module_memory.read(strtab_section_header.sh_offset + sh_name, name.len() as u64)?;
        if name == &*n {
            return Ok(Some(header));
        }
    }
    Ok(None)
}

pub fn read_build_id_from_file(
    process_inspector: &ProcessInspector,
    path: &Path,
) -> Result<Vec<u8>, Error> {
    let module_memory_reader = process_inspector.read_memory_mapped_module(path, 0)?;
    read_build_id_from_module(module_memory_reader)
}

pub fn read_build_id_from_module(module_memory: impl ReadModuleMemory) -> Result<Vec<u8>, Error> {
    let reader = ModuleReader::new(module_memory)?;
    let program_headers = match reader.build_id_from_program_headers() {
        Ok(v) => return Ok(v),
        Err(e) => Box::new(e),
    };
    let section = match reader.build_id_from_section() {
        Ok(v) => return Ok(v),
        Err(e) => Box::new(e),
    };
    let generated = match reader.build_id_generate_from_text() {
        Ok(v) => return Ok(v),
        Err(e) => Box::new(e),
    };
    Err(Error::NoBuildId {
        program_headers,
        section,
        generated,
    })
}

pub fn read_soname_from_file(
    process_inspector: &ProcessInspector,
    path: &Path,
    offset: usize,
) -> Result<String, Error> {
    let offset = u64::try_from(offset).map_err(Error::LinuxGateNotConvertable)?;

    // It is unsafe to attempt to open a mapped file that lives under /dev,
    // because the semantics of the open may be driver-specific so we'd risk
    // hanging the crash dumper. And a file in /dev/ almost certainly has no
    // ELF file identifier anyways.
    if path.starts_with("/dev/") {
        return Err(Error::NotSafeToOpenMapping(path.as_os_str().to_os_string()));
    }

    let module_memory_reader = process_inspector.read_memory_mapped_module(path, offset)?;

    if module_memory_reader.is_empty() || module_memory_reader.len() < elf::header::SELFMAG {
        return Err(Error::MmapSanityCheckFailed);
    }

    read_soname_from_module(module_memory_reader)
}

pub fn read_soname_from_module(module_memory: impl ReadModuleMemory) -> Result<String, Error> {
    let reader = ModuleReader::new(module_memory)?;
    let program_headers = match reader.soname_from_program_headers() {
        Ok(v) => return Ok(v),
        Err(e) => Box::new(e),
    };
    let section = match reader.soname_from_sections() {
        Ok(v) => return Ok(v),
        Err(e) => Box::new(e),
    };
    Err(Error::NoSoName {
        program_headers,
        section,
    })
}

struct DynIter<'a> {
    data: &'a [u8],
    offset: usize,
    ctx: Ctx,
}

impl<'a> DynIter<'a> {
    pub fn new(data: &'a [u8], ctx: Ctx) -> Self {
        DynIter {
            data,
            offset: 0,
            ctx,
        }
    }
}

impl Iterator for DynIter<'_> {
    type Item = Result<elf::dynamic::Dyn, Error>;

    fn next(&mut self) -> Option<Self::Item> {
        use scroll::Pread;
        let dyn_: elf::dynamic::Dyn = match self.data.gread_with(&mut self.offset, self.ctx) {
            Ok(v) => v,
            Err(e) => return Some(Err(e.into())),
        };
        if dyn_.d_tag == elf::dynamic::DT_NULL {
            None
        } else {
            Some(Ok(dyn_))
        }
    }
}

pub struct ModuleReader<MM> {
    module_memory: MM,
    header: elf::Header,
    context: Ctx,
}

impl<MM: ReadModuleMemory> ModuleReader<MM> {
    pub fn new(module_memory: MM) -> Result<ModuleReader<MM>, Error> {
        // We could use `Ctx::default()` (which defaults to the native system), however to be extra
        // permissive we'll just use a 64-bit ("Big") context which would result in the largest
        // possible header size.
        let header_size = elf::Header::size(Ctx::new(Container::Big, Endian::default()));
        let header_data = module_memory.read(0, header_size as u64)?;
        let header = elf::Elf::parse_header(&header_data)?;
        let context = Ctx::new(header.container()?, header.endianness()?);

        Ok(Self {
            module_memory,
            header,
            context,
        })
    }

    /// Find a note referenced by the program headers.
    pub fn find_program_note(
        &self,
        note_type: u32,
        note_size: usize,
        note_name: &str,
    ) -> Result<Option<Vec<u8>>, Error> {
        let program_headers = self.read_program_headers()?;
        for header in program_headers {
            if header.p_type != elf::program_header::PT_NOTE
                || (header.p_flags & elf::program_header::PF_R) == 0
                || (header.p_memsz as usize) < note_size
            {
                continue;
            }

            if let Some(data) = self.find_note(
                header.p_offset,
                header.p_filesz,
                header.p_align,
                note_type,
                note_size,
                note_name,
            )? {
                return Ok(Some(data));
            }
        }
        Ok(None)
    }

    /// Read the SONAME using program headers to locate dynamic library information.
    pub fn soname_from_program_headers(&self) -> Result<String, Error> {
        let program_headers = self.read_program_headers()?;

        let dynamic_segment_header = program_headers
            .iter()
            .find(|h| h.p_type == elf::program_header::PT_DYNAMIC)
            .ok_or(Error::NoDynamicSection)?;

        let dynamic_section = self.read_segment(dynamic_segment_header)?;

        let mut soname_strtab_offset = None;
        let mut strtab_addr = None;
        let mut strtab_size = None;
        for dyn_ in DynIter::new(&dynamic_section, self.context) {
            let dyn_ = dyn_?;
            match dyn_.d_tag {
                elf::dynamic::DT_SONAME => soname_strtab_offset = Some(dyn_.d_val),
                elf::dynamic::DT_STRTAB => strtab_addr = Some(dyn_.d_val),
                elf::dynamic::DT_STRSZ => strtab_size = Some(dyn_.d_val),
                _ => (),
            }
        }

        match (strtab_addr, strtab_size, soname_strtab_offset) {
            (None, _, _) | (_, None, _) => Err(Error::NoDynStrSection),
            (_, _, None) => Err(Error::NoSoNameEntry),
            (Some(addr), Some(size), Some(offset)) => {
                // If loaded in memory, the address will be altered to be absolute.
                if offset < size {
                    self.read_name_from_strtab(
                        self.module_memory
                            .absolute_to_relative(addr)
                            .unwrap_or(addr),
                        size,
                        offset,
                    )
                } else {
                    log::warn!("soname strtab offset ({offset}) exceeds strtab size ({size})");
                    Err(Error::NoSoNameEntry)
                }
            }
        }
    }

    /// Read the SONAME using section headers to locate dynamic library information.
    pub fn soname_from_sections(&self) -> Result<String, Error> {
        let section_headers = self.read_section_headers()?;

        let dynamic_section_header = section_headers
            .iter()
            .find(|h| h.sh_type == elf::section_header::SHT_DYNAMIC)
            .ok_or(Error::NoDynamicSection)?;

        let dynstr_section_header =
            match section_headers.get(dynamic_section_header.sh_link as usize) {
                Some(header) if header.sh_type == elf::section_header::SHT_STRTAB => header,
                _ => section_header_with_name(
                    &section_headers,
                    self.header.e_shstrndx as usize,
                    b".dynstr\0",
                    &self.module_memory,
                )?
                .ok_or(Error::NoDynStrSection)?,
            };

        let dynamic_section = self.module_memory.read(
            self.section_offset(dynamic_section_header),
            dynamic_section_header.sh_size,
        )?;

        for dyn_ in DynIter::new(&dynamic_section, self.context) {
            let dyn_ = dyn_?;
            if dyn_.d_tag == elf::dynamic::DT_SONAME {
                let name_offset = dyn_.d_val;
                if name_offset < dynstr_section_header.sh_size {
                    return self.read_name_from_strtab(
                        self.section_offset(dynstr_section_header),
                        dynstr_section_header.sh_size,
                        name_offset,
                    );
                } else {
                    log::warn!(
                        "soname offset ({name_offset}) exceeds dynstr section size ({})",
                        dynstr_section_header.sh_size
                    );
                }
            }
        }

        Err(Error::NoSoNameEntry)
    }

    /// Read the build id from a program header note.
    pub fn build_id_from_program_headers(&self) -> Result<Vec<u8>, Error> {
        let program_headers = self.read_program_headers()?;
        for header in program_headers {
            if header.p_type != elf::program_header::PT_NOTE {
                continue;
            }
            if let Ok(Some(result)) =
                self.find_build_id_note(header.p_offset, header.p_filesz, header.p_align)
            {
                return Ok(result);
            }
        }
        Err(Error::NoProgramHeaderNote)
    }

    /// Read the build id from a notes section.
    pub fn build_id_from_section(&self) -> Result<Vec<u8>, Error> {
        let section_headers = self.read_section_headers()?;

        let header = section_header_with_name(
            &section_headers,
            self.header.e_shstrndx as usize,
            NOTE_SECTION_NAME,
            &self.module_memory,
        )?
        .ok_or(Error::NoSectionNote)?;

        match self.find_build_id_note(header.sh_offset, header.sh_size, header.sh_addralign) {
            Ok(Some(v)) => Ok(v),
            Ok(None) => Err(Error::NoSectionNote),
            Err(e) => Err(e),
        }
    }

    /// Generate a build id by hashing the first page of the text section.
    pub fn build_id_generate_from_text(&self) -> Result<Vec<u8>, Error> {
        let Some(text_header) = self
            .read_section_headers()?
            .into_iter()
            .find(is_executable_section)
        else {
            return Err(Error::NoTextSection);
        };

        // Take at most one page of the text section (we assume page size is 4096 bytes).
        let len = std::cmp::min(4096, text_header.sh_size);
        let text_data = self.module_memory.read(text_header.sh_offset, len)?;
        Ok(build_id_from_bytes(&text_data))
    }

    fn read_segment<'a>(&'a self, header: &elf::ProgramHeader) -> Result<Cow<'a, [u8]>, Error> {
        let (offset, size) = if self.module_memory.is_process_memory() {
            (header.p_vaddr, header.p_memsz)
        } else {
            (header.p_offset, header.p_filesz)
        };

        self.module_memory.read(offset, size).map_err(|e| e.into())
    }

    fn read_name_from_strtab(
        &self,
        strtab_offset: u64,
        strtab_size: u64,
        name_offset: u64,
    ) -> Result<String, Error> {
        assert!(name_offset < strtab_size);
        let name = self
            .module_memory
            .read(strtab_offset + name_offset, strtab_size - name_offset)?;
        CStr::from_bytes_until_nul(&name)
            .map(|s| s.to_string_lossy().into_owned())
            .map_err(|_| Error::StrTabNoNulByte)
    }

    fn section_offset(&self, header: &elf::SectionHeader) -> u64 {
        if self.module_memory.is_process_memory() {
            header.sh_addr
        } else {
            header.sh_offset
        }
    }

    fn read_program_headers(&self) -> Result<elf::ProgramHeaders, Error> {
        if self.header.e_phoff == 0 {
            return Err(Error::NoProgramHeaders);
        }
        let program_headers_data = self.module_memory.read(
            self.header.e_phoff,
            self.header.e_phentsize as u64 * self.header.e_phnum as u64,
        )?;
        let program_headers = elf::ProgramHeader::parse(
            &program_headers_data,
            0,
            self.header.e_phnum as usize,
            self.context,
        )?;
        Ok(program_headers)
    }

    fn read_section_headers(&self) -> Result<elf::SectionHeaders, Error> {
        if self.header.e_shoff == 0 {
            return Err(Error::NoSections);
        }

        let section_headers_data = self.module_memory.read(
            self.header.e_shoff,
            self.header.e_shentsize as u64 * self.header.e_shnum as u64,
        )?;
        // Use `parse_from` rather than `parse`, which allows a 0 offset.
        let section_headers = elf::SectionHeader::parse_from(
            &section_headers_data,
            0,
            self.header.e_shnum as usize,
            self.context,
        )?;
        Ok(section_headers)
    }

    fn find_build_id_note(
        &self,
        offset: u64,
        size: u64,
        alignment: u64,
    ) -> Result<Option<Vec<u8>>, Error> {
        self.find_note(
            offset,
            size,
            alignment,
            elf::note::NT_GNU_BUILD_ID,
            0,
            "GNU",
        )
    }

    fn find_note(
        &self,
        offset: u64,
        size: u64,
        alignment: u64,
        note_type: u32,
        note_min_size: usize,
        note_name: &str,
    ) -> Result<Option<Vec<u8>>, Error> {
        let notes = self.module_memory.read(offset, size)?;
        for note in (elf::note::NoteDataIterator {
            data: &notes,
            // Note that `NoteDataIterator::size` is poorly named, it is actually an end offset. In
            // this case since our start offset is 0 we still set it to the size.
            size: size as usize,
            offset: 0,
            ctx: (alignment as usize, self.context),
        }) {
            let Ok(note) = note else { break };
            if note.name == note_name
                && note.n_type == note_type
                && note.desc.len() >= note_min_size
            {
                return Ok(Some(note.desc.to_owned()));
            }
        }
        Ok(None)
    }
}

pub trait ReadModuleMemory {
    fn read<'a>(&'a self, offset: u64, length: u64)
    -> Result<Cow<'a, [u8]>, ModuleMemoryReadError>;
    fn absolute_to_relative(&self, addr: u64) -> Option<u64>;
    /// Calculates the absolute address of the specified relative address
    fn relative_to_absolute(&self, addr: u64) -> Option<u64>;
    fn is_process_memory(&self) -> bool;
}

impl<'a> ReadModuleMemory for ProcessModuleMemoryReader<'a> {
    fn read(&self, offset: u64, length: u64) -> Result<Cow<'a, [u8]>, ModuleMemoryReadError> {
        self.read(offset, length)
    }
    fn absolute_to_relative(&self, addr: u64) -> Option<u64> {
        addr.checked_sub(self.start_address)
    }
    /// Calculates the absolute address of the specified relative address
    fn relative_to_absolute(&self, addr: u64) -> Option<u64> {
        self.start_address.checked_add(addr)
    }
    fn is_process_memory(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod test {
    use super::*;

    /// This is a small (but valid) 64-bit little-endian elf executable with the following layout:
    /// * ELF header
    /// * program header: text segment
    /// * program header: note
    /// * program header: dynamic
    /// * section header: null
    /// * section header: .text
    /// * section header: .note.gnu.build-id
    /// * section header: .shstrtab
    /// * section header: .dynamic
    /// * section header: .dynstr
    /// * note header (build id note)
    /// * shstrtab
    /// * dynamic (SONAME/STRTAB/STRSZ)
    /// * dynstr (SONAME string = libfoo.so.1)
    /// * program (calls exit(0))
    const TINY_ELF: &[u8] = &[
        0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x02, 0x00, 0x3e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0x03, 0x40, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe8, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x38, 0x00, 0x03, 0x00, 0x40, 0x00,
        0x06, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x0a, 0x03, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x03, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x68, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x68, 0x02, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0xbd, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xbd, 0x02, 0x40,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x03, 0x40,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x07, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x68, 0x02, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x68, 0x02, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x02, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x02,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x35, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x24, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00,
        0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xbd, 0x02, 0x40, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xbd, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2d, 0x00, 0x00,
        0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfd, 0x02,
        0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0xfd, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0d,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x04, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x47, 0x4e,
        0x55, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
        0x0e, 0x0f, 0x10, 0x00, 0x2e, 0x74, 0x65, 0x78, 0x74, 0x00, 0x2e, 0x6e, 0x6f, 0x74, 0x65,
        0x2e, 0x67, 0x6e, 0x75, 0x2e, 0x62, 0x75, 0x69, 0x6c, 0x64, 0x2d, 0x69, 0x64, 0x00, 0x2e,
        0x73, 0x68, 0x73, 0x74, 0x72, 0x74, 0x61, 0x62, 0x00, 0x2e, 0x64, 0x79, 0x6e, 0x61, 0x6d,
        0x69, 0x63, 0x00, 0x2e, 0x64, 0x79, 0x6e, 0x73, 0x74, 0x72, 0x00, 0x0e, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0xfd, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x6c, 0x69, 0x62, 0x66, 0x6f, 0x6f, 0x2e, 0x73, 0x6f, 0x2e, 0x31, 0x00, 0x6a, 0x3c,
        0x58, 0x31, 0xff, 0x0f, 0x05,
    ];

    #[test]
    fn build_id_program_headers() {
        let reader = ModuleReader::new(SliceModuleMemoryReader(TINY_ELF)).unwrap();
        let id = reader.build_id_from_program_headers().unwrap();
        assert_eq!(
            id,
            vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
        );
    }

    #[test]
    fn build_id_section() {
        let reader = ModuleReader::new(SliceModuleMemoryReader(TINY_ELF)).unwrap();
        let id = reader.build_id_from_section().unwrap();
        assert_eq!(
            id,
            vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
        );
    }

    #[test]
    fn build_id_text_hash() {
        let reader = ModuleReader::new(SliceModuleMemoryReader(TINY_ELF)).unwrap();
        let id = reader.build_id_generate_from_text().unwrap();
        assert_eq!(
            id,
            vec![
                0x6a, 0x3c, 0x58, 0x31, 0xff, 0x0f, 0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0
            ]
        );
    }

    #[test]
    fn soname_program_headers() {
        let reader = ModuleReader::new(SliceModuleMemoryReader(TINY_ELF)).unwrap();
        let soname = reader.soname_from_program_headers().unwrap();
        assert_eq!(soname, "libfoo.so.1");
    }

    #[test]
    fn soname_section() {
        let reader = ModuleReader::new(SliceModuleMemoryReader(TINY_ELF)).unwrap();
        let soname = reader.soname_from_sections().unwrap();
        assert_eq!(soname, "libfoo.so.1");
    }

    pub struct SliceModuleMemoryReader<'a>(pub &'a [u8]);

    impl<'a> ReadModuleMemory for SliceModuleMemoryReader<'a> {
        fn read<'b>(
            &'b self,
            offset: u64,
            length: u64,
        ) -> Result<Cow<'b, [u8]>, ModuleMemoryReadError> {
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
}

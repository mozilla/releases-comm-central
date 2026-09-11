//! The dynamic linker's debugger rendez-vous.
//!
//! This holds the `<link.h>` structures the linker publishes for debuggers, and
//! the `MD_LINUX_DSO_DEBUG` stream that is written straight from them.

use {
    super::{
        auxv::AuxvDumpInfo, minidump_writer::MinidumpWriter, process_inspection::ProcessInspector,
        process_reader::CopyFromProcessError, serializers::*,
    },
    crate::{
        mem_writer::{
            Buffer, MemoryArrayWriter, MemoryWriter, MemoryWriterError, write_string_to_location,
        },
        minidump_format::*,
    },
    plain::Plain,
};

type Result<T> = std::result::Result<T, SectionDsoDebugError>;

#[cfg(not(target_pointer_width = "64"))]
use goblin::elf32 as elf;
#[cfg(target_pointer_width = "64")]
use goblin::elf64 as elf;

cfg_if::cfg_if! {
    if #[cfg(target_pointer_width = "32")] {
        use goblin::elf::program_header::program_header32::SIZEOF_PHDR;
    } else if #[cfg(target_pointer_width = "64")] {
        use goblin::elf::program_header::program_header64::SIZEOF_PHDR;
    }
}

cfg_if::cfg_if! {
    if #[cfg(all(target_pointer_width = "64", target_arch = "arm"))] {
        type ElfAddr = u64;
    } else if #[cfg(all(target_pointer_width = "64", not(target_arch = "arm")))] {
        type ElfAddr = libc::Elf64_Addr;
    } else if #[cfg(all(target_pointer_width = "32", target_arch = "arm"))] {
        type ElfAddr = u32;
    } else if #[cfg(all(target_pointer_width = "32", not(target_arch = "arm")))] {
        type ElfAddr = libc::Elf32_Addr;
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum SectionDsoDebugError {
    #[error("Failed to write to memory")]
    MemoryWriterError(#[from] MemoryWriterError),
    #[error("Could not find: {0}")]
    CouldNotFind(&'static str),
    #[error("Failed to copy memory from process")]
    CopyFromProcessError(#[from] CopyFromProcessError),
    #[error("Failed to copy memory from process")]
    FromUTF8Error(
        #[from]
        #[serde(serialize_with = "serialize_from_utf8_error")]
        std::string::FromUtf8Error,
    ),
}

/// Information for a single dynamically loaded module.
///
/// This structure contains important information about a dynamically-loaded
/// module, like its name and virtual address. It is also a node in a
/// doubly-linked list of such modules.
///
/// Only the leading members below are part of the protocol with the debugger —
/// the same format used in SVR4. The linker's own fields follow them, and we
/// never read those.
///
/// <https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/link.h;h=b645760402514c4839686aaeade20dd5bb7725dd;hb=HEAD#l101>
#[derive(Debug, Clone, Default)]
#[repr(C)]
pub struct LinkMap {
    /// Difference between the addresses in the ELF file and the addresses in
    /// memory.
    pub(crate) l_addr: ElfAddr,
    /// Address of the absolute file name the object was found in.
    /// WAS: `char *`
    pub(crate) l_name: usize,
    /// Address of the dynamic section of the shared object.
    /// WAS: `ElfW(Dyn) *`
    pub(crate) l_ld: usize,
    /// Address of the next node in the chain of loaded objects.
    /// WAS: `struct link_map *`
    pub(crate) l_next: usize,
    /// Address of the previous node in the chain of loaded objects.
    /// WAS: `struct link_map *`
    pub(crate) l_prev: usize,
}

/// Shared object loading information for the debugger.
///
/// The Linux dynamic linker fills this in and points the main program's
/// `DT_DEBUG` dynamic entry at it. It is known as the "debugger rendez-vous"
/// point and is a legacy structure to assist debuggers in locating loaded
/// shared modules.
///
/// (But we're going to use it for minidump generation purposes.)
///
/// <https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/link.h;h=b645760402514c4839686aaeade20dd5bb7725dd;hb=HEAD#l40>
#[derive(Debug, Clone, Default)]
#[repr(C)]
pub struct RDebug {
    /// Version number for this protocol.
    pub(crate) r_version: libc::c_int,
    /// Address of the head of the chain of loaded objects.
    /// WAS: `struct link_map *`
    pub(crate) r_map: usize,
    /// Address of a function internal to the run-time linker, that will always
    /// be called when the linker begins to map in a library or unmap it, and
    /// again when the mapping change is complete. The debugger can set a
    /// breakpoint at this address if it wants to notice shared object mapping
    /// changes.
    pub(crate) r_brk: ElfAddr,
    /// Which mapping change is taking place when `r_brk` is called: 0
    /// (`RT_CONSISTENT`, the change is complete), 1 (`RT_ADD`, beginning to add
    /// a new object) or 2 (`RT_DELETE`, beginning to remove an object mapping).
    pub(crate) r_state: libc::c_int,
    /// Base address the linker is loaded at.
    pub(crate) r_ldbase: ElfAddr,
}

// Safety: both are `repr(C)` aggregates of plain integers, so every bit pattern
// we could read out of the target process is a valid value.
unsafe impl Plain for LinkMap {}
unsafe impl Plain for RDebug {}

pub fn write_dso_debug_stream(
    process_inspector: &dyn ProcessInspector,
    buffer: &mut Buffer,
    auxv: &AuxvDumpInfo,
) -> Result<MDRawDirectory> {
    let phnum_max =
        auxv.get_program_header_count()
            .ok_or(SectionDsoDebugError::CouldNotFind("AT_PHNUM in auxv"))? as usize;
    let phdr = auxv
        .get_program_header_address()
        .ok_or(SectionDsoDebugError::CouldNotFind("AT_PHDR in auxv"))? as usize;

    let ph = MinidumpWriter::copy_from_process(process_inspector, phdr, SIZEOF_PHDR * phnum_max)?;
    let program_headers;
    #[cfg(target_pointer_width = "64")]
    {
        program_headers = goblin::elf::program_header::program_header64::ProgramHeader::from_bytes(
            &ph, phnum_max,
        );
    }
    #[cfg(target_pointer_width = "32")]
    {
        program_headers = goblin::elf::program_header::program_header32::ProgramHeader::from_bytes(
            &ph, phnum_max,
        );
    };

    // Assume the program base is at the beginning of the same page as the PHDR
    let mut base = phdr & !0xfff;
    let mut dyn_addr = 0;
    // Search for the program PT_DYNAMIC segment
    for ph in program_headers {
        // Adjust base address with the virtual address of the PT_LOAD segment
        // corresponding to offset 0
        if ph.p_type == goblin::elf::program_header::PT_LOAD && ph.p_offset == 0 {
            base -= ph.p_vaddr as usize;
        }
        if ph.p_type == goblin::elf::program_header::PT_DYNAMIC {
            dyn_addr = ph.p_vaddr;
        }
    }

    if dyn_addr == 0 {
        return Err(SectionDsoDebugError::CouldNotFind(
            "dyn_addr in program headers",
        ));
    }

    dyn_addr += base as ElfAddr;

    let dyn_size = std::mem::size_of::<elf::dynamic::Dyn>();
    let mut r_debug = 0usize;
    let mut dynamic_length = 0usize;
    let memory_reader = process_inspector.process_reader();

    // The dynamic linker makes information available that helps gdb find all
    // DSOs loaded into the program. If this information is indeed available,
    // dump it to a MD_LINUX_DSO_DEBUG stream.
    loop {
        let dyn_struct: elf::dynamic::Dyn =
            memory_reader.read_pod(dyn_addr as usize + dynamic_length)?;
        dynamic_length += dyn_size;

        #[allow(clippy::useless_conversion)]
        let d_tag = u64::from(dyn_struct.d_tag);
        if d_tag == goblin::elf::dynamic::DT_DEBUG {
            r_debug = dyn_struct.d_val as usize;
        } else if d_tag == goblin::elf::dynamic::DT_NULL {
            break;
        }
    }

    // The "r_map" field of that r_debug struct contains a linked list of all
    // loaded DSOs.
    // Our list of DSOs potentially is different from the ones in the crashing
    // process. So, we have to be careful to never dereference pointers
    // directly. Instead, we copy every node out of the process.
    // See <link.h> for a more detailed discussion of the how the dynamic
    // loader communicates with debuggers.
    let debug_entry: RDebug = memory_reader.read_pod(r_debug)?;

    // Count the number of loaded DSOs
    let mut dso_vec = Vec::new();
    let mut curr_map = debug_entry.r_map;
    while curr_map != 0 {
        let map: LinkMap = memory_reader.read_pod(curr_map)?;
        curr_map = map.l_next;
        dso_vec.push(map);
    }

    let mut linkmap_rva = u32::MAX;
    if !dso_vec.is_empty() {
        // If we have at least one DSO, create an array of MDRawLinkMap
        // entries in the minidump file.
        let mut linkmap = MemoryArrayWriter::<MDRawLinkMap>::alloc_array(buffer, dso_vec.len())?;
        linkmap_rva = linkmap.location().rva;

        // Iterate over DSOs and write their information to mini dump
        for (idx, map) in dso_vec.iter().enumerate() {
            let mut filename = String::new();
            if map.l_name > 0 {
                let filename_data =
                    MinidumpWriter::copy_from_process(process_inspector, map.l_name, 256)?;

                // C - string is NULL-terminated
                if let Some(name) = filename_data.splitn(2, |x| *x == b'\0').next() {
                    filename = String::from_utf8(name.to_vec())?;
                }
            }
            let location = write_string_to_location(buffer, &filename)?;
            let entry = MDRawLinkMap {
                addr: map.l_addr,
                name: location.rva,
                ld: map.l_ld as ElfAddr,
            };

            linkmap.set_value_at(buffer, entry, idx)?;
        }
    }

    // Write MD_LINUX_DSO_DEBUG record
    let debug = MDRawDebug {
        version: debug_entry.r_version as u32,
        map: linkmap_rva,
        dso_count: dso_vec.len() as u32,
        brk: debug_entry.r_brk,
        ldbase: debug_entry.r_ldbase,
        dynamic: dyn_addr,
    };
    let debug_loc = MemoryWriter::<MDRawDebug>::alloc_with_val(buffer, debug)?;

    let mut dirent = MDRawDirectory {
        stream_type: MDStreamType::LinuxDsoDebug as u32,
        location: debug_loc.location(),
    };

    dirent.location.data_size += dynamic_length as u32;
    let dso_debug_data =
        MinidumpWriter::copy_from_process(process_inspector, dyn_addr as usize, dynamic_length)?;
    MemoryArrayWriter::write_bytes(buffer, &dso_debug_data);

    Ok(dirent)
}

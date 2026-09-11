use {
    super::{
        minidump_writer::MinidumpWriter, process_inspection::ProcessInspector,
        process_reader::CopyFromProcessError,
    },
    goblin::elf,
};

cfg_if::cfg_if! {
    if #[cfg(target_pointer_width = "32")] {
        use elf::dynamic::dyn32::{Dyn, SIZEOF_DYN};
        use elf::header::header32 as elf_header;
        use elf::program_header::program_header32::ProgramHeader;

        const DT_ANDROID_REL: u32 = (elf::dynamic::DT_LOOS + 2) as u32;
        const DT_ANDROID_RELA: u32 = (elf::dynamic::DT_LOOS + 4) as u32;
    } else if #[cfg(target_pointer_width = "64")] {
        use elf::dynamic::dyn64::{Dyn, SIZEOF_DYN};
        use elf::header::header64 as elf_header;
        use elf::program_header::program_header64::ProgramHeader;

        const DT_ANDROID_REL: u64 = elf::dynamic::DT_LOOS + 2;
        const DT_ANDROID_RELA: u64 = elf::dynamic::DT_LOOS + 4;
    } else {
        compile_error!("invalid pointer width");
    }
}

type Result<T> = std::result::Result<T, AndroidError>;

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum AndroidError {
    #[error("Failed to copy memory from process")]
    CopyFromProcessError(#[from] CopyFromProcessError),
    #[error("Failed slice conversion")]
    TryFromSliceError(
        #[from]
        #[serde(skip)]
        std::array::TryFromSliceError,
    ),
    #[error("No Android rel found")]
    NoRelFound,
}

struct DynVaddresses {
    min_vaddr: usize,
    dyn_vaddr: usize,
    dyn_count: usize,
}

fn has_android_packed_relocations(
    process_inspector: &dyn ProcessInspector,
    load_bias: usize,
    vaddrs: DynVaddresses,
) -> Result<()> {
    let dyn_addr = load_bias + vaddrs.dyn_vaddr;
    for idx in 0..vaddrs.dyn_count {
        let addr = dyn_addr + SIZEOF_DYN * idx;
        let dyn_data = MinidumpWriter::copy_from_process(process_inspector, addr, SIZEOF_DYN)?;
        // TODO: Couldn't find a nice way to use goblin for that, to avoid the unsafe-block
        let dyn_obj: Dyn;
        unsafe {
            dyn_obj = std::mem::transmute::<[u8; SIZEOF_DYN], Dyn>(dyn_data.as_slice().try_into()?);
        }

        if dyn_obj.d_tag == DT_ANDROID_REL || dyn_obj.d_tag == DT_ANDROID_RELA {
            return Ok(());
        }
    }
    Err(AndroidError::NoRelFound)
}

fn get_effective_load_bias(
    process_inspector: &dyn ProcessInspector,
    ehdr: &elf_header::Header,
    address: usize,
) -> usize {
    let ph = parse_loaded_elf_program_headers(process_inspector, ehdr, address);
    // If |min_vaddr| is non-zero and we find Android packed relocation tags,
    // return the effective load bias.

    if ph.min_vaddr != 0 {
        let load_bias = address - ph.min_vaddr;
        if has_android_packed_relocations(process_inspector, load_bias, ph).is_ok() {
            return load_bias;
        }
    }
    // Either |min_vaddr| is zero, or it is non-zero but we did not find the
    // expected Android packed relocations tags.
    address
}

fn parse_loaded_elf_program_headers(
    process_inspector: &dyn ProcessInspector,
    ehdr: &elf_header::Header,
    address: usize,
) -> DynVaddresses {
    let phdr_addr = address + ehdr.e_phoff as usize;
    let mut min_vaddr = usize::MAX;
    let mut dyn_vaddr = 0;
    let mut dyn_count = 0;

    let phdr_opt = MinidumpWriter::copy_from_process(
        process_inspector,
        phdr_addr,
        elf_header::SIZEOF_EHDR * ehdr.e_phnum as usize,
    );
    if let Ok(ph_data) = phdr_opt {
        // TODO: The original C code doesn't have error-handling here at all.
        //       We silently ignore "not parsable" for now, but might bubble it up.
        // TODO2: `from_bytes` might panic, `parse()` would return a Result<>, so maybe better
        //        to switch to that at some point.
        for phdr in ProgramHeader::from_bytes(&ph_data, ehdr.e_phnum as usize) {
            let p_vaddr = phdr.p_vaddr as usize;
            if phdr.p_type == elf::program_header::PT_LOAD && p_vaddr < min_vaddr {
                min_vaddr = p_vaddr;
            }

            if phdr.p_type == elf::program_header::PT_DYNAMIC {
                dyn_vaddr = p_vaddr;
                dyn_count = phdr.p_memsz as usize / SIZEOF_DYN;
            }
        }
    }

    DynVaddresses {
        min_vaddr,
        dyn_vaddr,
        dyn_count,
    }
}

/// Compute the effective load base of the ELF library pointed at by `elf_header_addr`.
/// In most cases it would be the same as that address, but libraries that use
/// Android packed relocations might need some tweaking.
pub fn effective_load_base(
    process_inspector: &dyn ProcessInspector,
    elf_header_addr: usize,
) -> usize {
    let ehdr = MinidumpWriter::copy_from_process(
        process_inspector,
        elf_header_addr,
        elf_header::SIZEOF_EHDR,
    )
    .ok()
    .and_then(|v| elf_header::Header::parse(&v).ok());

    match ehdr {
        // Only a relocatable object can have been packed.
        Some(ehdr) if ehdr.e_type == elf_header::ET_DYN => {
            get_effective_load_bias(process_inspector, &ehdr, elf_header_addr)
        }
        _ => elf_header_addr,
    }
}

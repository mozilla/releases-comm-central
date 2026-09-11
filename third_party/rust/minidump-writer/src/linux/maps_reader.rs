use {
    super::{
        auxv::AuxvType,
        module_reader::ModuleReaderError,
        process_inspection::{self, ProcessInspector},
        serializers::*,
    },
    crate::serializers::*,
    byteorder::{NativeEndian, ReadBytesExt},
    procfs_core::{
        FromRead,
        process::{MMPermissions, MMapPath, MemoryMaps},
    },
    std::{
        ffi::{OsStr, OsString},
        mem::size_of,
        os::unix::ffi::{OsStrExt, OsStringExt},
    },
};

pub const LINUX_GATE_LIBRARY_NAME: &str = "linux-gate.so";
pub const DELETED_SUFFIX: &[u8] = b" (deleted)";

type Result<T> = std::result::Result<T, MapsReaderError>;

// One of these is produced for each mapping in the process (i.e. line in
// /proc/$x/maps).
#[derive(Debug, PartialEq, Eq, Clone, serde::Serialize)]
pub struct MappingInfo {
    pub start_address: usize,
    pub size: usize,
    pub offset: usize,              // offset into the backed file.
    pub permissions: MMPermissions, // read, write and execute permissions.
    pub name: Option<OsString>,
    // pub elf_obj: Option<elf::Elf>,
}

#[derive(Debug)]
pub struct MappingEntry {
    pub mapping: MappingInfo,
    pub identifier: Vec<u8>,
}

// A list of <MappingInfo, GUID>
pub type MappingList = Vec<MappingEntry>;

#[derive(thiserror::Error, Debug, serde::Serialize)]
pub enum MapsReaderError {
    #[error("failed to read /proc/<pid>/maps")]
    ReadFileFailed(#[source] process_inspection::Error),
    #[error("Couldn't parse as ELF file")]
    ELFParsingFailed(
        #[from]
        #[serde(serialize_with = "serialize_goblin_error")]
        goblin::error::Error,
    ),
    #[error("failed to memory map file")]
    MemoryMapFileFailed(#[source] ModuleReaderError),
    #[error("No soname found (filename: {})", .0.to_string_lossy())]
    NoSoName(OsString, #[source] ModuleReaderError),

    // parse_from_line()
    #[error("Map entry malformed: No {0} found")]
    MapEntryMalformed(&'static str),
    #[error("Couldn't parse address")]
    UnparsableInteger(
        #[from]
        #[serde(skip)]
        std::num::ParseIntError,
    ),
    #[error("Linux gate location doesn't fit in the required integer type")]
    LinuxGateNotConvertable(
        #[from]
        #[serde(skip)]
        std::num::TryFromIntError,
    ),

    // get_mmap()
    #[error("Not safe to open mapping {}", .0.to_string_lossy())]
    NotSafeToOpenMapping(OsString),
    #[error("IO Error")]
    FileError(
        #[from]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
    #[error("Mmapped file empty or not an ELF file")]
    MmapSanityCheckFailed,
    #[error("Symlink does not match ({0} vs. {1})")]
    SymlinkError(std::path::PathBuf, std::path::PathBuf),
    #[error("Failed to parse memory maps file")]
    ParsingError(
        #[from]
        #[serde(serialize_with = "serialize_proc_error")]
        procfs_core::ProcError,
    ),
}

/// Return whether a `/proc/<pid>/maps` pathname is a path (contains a `/`).
pub(crate) fn name_is_path(pathname: Option<&OsStr>) -> bool {
    match pathname {
        Some(x) => x.as_bytes().contains(&b'/'),
        None => false,
    }
}

/// Quick helper to convert a `/proc/<pid>/maps` excerpt into mapping data.
#[cfg(test)]
#[cfg(target_pointer_width = "64")] // All tests are 64-bit
pub(crate) fn get_mappings_for(map: &str, linux_gate_loc: u64) -> Vec<MappingInfo> {
    MappingInfo::aggregate(
        MemoryMaps::from_read(map.as_bytes()).expect("failed to read mapping info"),
        Some(linux_gate_loc),
    )
    .unwrap_or_default()
}

/// Sanitize mapped paths.
///
/// This removes a ` (deleted)` suffix, if present.
fn sanitize_path(pathname: OsString) -> OsString {
    if let Some(bytes) = pathname.as_bytes().strip_suffix(DELETED_SUFFIX) {
        OsString::from_vec(bytes.to_owned())
    } else {
        pathname
    }
}

impl MappingInfo {
    /// Get the mappings for the given process.
    pub fn for_pid(
        process_inspector: &dyn ProcessInspector,
        pid: i32,
        linux_gate_loc: Option<AuxvType>,
    ) -> Result<Vec<Self>> {
        let maps_path = format!("/proc/{}/maps", pid);
        let maps_file = process_inspector
            .read_file(maps_path.into())
            .map_err(MapsReaderError::ReadFileFailed)?;
        let maps = MemoryMaps::from_read(maps_file)?;
        Self::aggregate(maps, linux_gate_loc)
    }

    /// Return whether the `name` field is a path (contains a `/`).
    pub fn name_is_path(&self) -> bool {
        name_is_path(self.name.as_deref())
    }

    pub fn is_empty_page(&self) -> bool {
        (self.offset == 0) && (self.permissions == MMPermissions::PRIVATE) && self.name.is_none()
    }

    pub fn end_address(&self) -> usize {
        self.start_address + self.size
    }

    pub fn aggregate(
        memory_maps: MemoryMaps,
        linux_gate_loc: Option<AuxvType>,
    ) -> Result<Vec<Self>> {
        let mut infos = Vec::<Self>::new();

        for mm in memory_maps {
            let start_address: usize = mm.address.0.try_into()?;
            let end_address: usize = mm.address.1.try_into()?;
            let mut offset: usize = mm.offset.try_into()?;

            let mut pathname: Option<OsString> = match mm.pathname {
                MMapPath::Path(p) => Some(sanitize_path(p.into())),
                MMapPath::Heap => Some("[heap]".into()),
                MMapPath::Stack => Some("[stack]".into()),
                MMapPath::TStack(i) => Some(format!("[stack:{i}]").into()),
                MMapPath::Vdso => Some("[vdso]".into()),
                MMapPath::Vvar => Some("[vvar]".into()),
                MMapPath::Vsyscall => Some("[vsyscall]".into()),
                MMapPath::Rollup => Some("[rollup]".into()),
                MMapPath::Vsys(i) => Some(format!("/SYSV{i:x}").into()),
                MMapPath::Other(n) => Some(format!("[{n}]").into()),
                MMapPath::Anonymous => None,
            };

            let is_path = name_is_path(pathname.as_deref());

            if let Some(linux_gate_loc) = linux_gate_loc.map(|u| usize::try_from(u).unwrap())
                && (!is_path && (start_address == linux_gate_loc))
            {
                pathname = Some(LINUX_GATE_LIBRARY_NAME.into());
                offset = 0;
            }

            if let Some(prev_module) = infos.last_mut() {
                if (start_address == prev_module.end_address())
                    && pathname.is_some()
                    && (pathname == prev_module.name)
                {
                    // Merge adjacent mappings into one module, assuming they're a single
                    // library mapped by the dynamic linker.
                    prev_module.size = end_address - prev_module.start_address;
                    prev_module.permissions |= mm.perms;
                    continue;
                } else if (start_address == prev_module.end_address())
                    && prev_module.is_executable()
                    && prev_module.name_is_path()
                    && ((offset == 0) || (offset == prev_module.end_address()))
                    && (mm.perms == MMPermissions::PRIVATE)
                {
                    // Also merge mappings that result from address ranges that the
                    // linker reserved but which a loaded library did not use. These
                    // appear as an anonymous private mapping with no access flags set
                    // and which directly follow an executable mapping.
                    prev_module.size = end_address - prev_module.start_address;
                    continue;
                }
            }

            // Sometimes the unused ranges reserved but the linker appear within the library.
            // If we detect an empty page that is adjacent to two mappings of the same library
            // we fold the three mappings together.
            if let Some(previous_modules) = infos.rchunks_exact_mut(2).next() {
                let empty_page = if let Some(prev_module) = previous_modules.last() {
                    let prev_prev_module = previous_modules.first().unwrap();
                    prev_prev_module.name_is_path()
                        && (prev_prev_module.end_address() == prev_module.start_address)
                        && prev_module.is_empty_page()
                        && (prev_module.end_address() == start_address)
                } else {
                    false
                };

                if empty_page {
                    let prev_prev_module = previous_modules.first_mut().unwrap();

                    if pathname == prev_prev_module.name {
                        prev_prev_module.size = end_address - prev_prev_module.start_address;
                        prev_prev_module.permissions |= mm.perms;
                        infos.pop();
                        continue;
                    }
                }
            }

            infos.push(MappingInfo {
                start_address,
                size: end_address - start_address,
                offset,
                permissions: mm.perms,
                name: pathname,
            });
        }
        Ok(infos)
    }

    pub fn stack_has_pointer_to_mapping(&self, stack_copy: &[u8], sp_offset: usize) -> bool {
        // Loop over all stack words that would have been on the stack in
        // the target process (i.e. are word aligned, and at addresses >=
        // the stack pointer).  Regardless of the alignment of |stack_copy|,
        // the memory starting at |stack_copy| + |offset| represents an
        // aligned word in the target process.
        let low_addr = self.start_address;
        let high_addr = self.start_address + self.size;
        let mut offset = (sp_offset + size_of::<usize>() - 1) & !(size_of::<usize>() - 1);
        while offset <= stack_copy.len() - size_of::<usize>() {
            let addr = match std::mem::size_of::<usize>() {
                4 => stack_copy[offset..]
                    .as_ref()
                    .read_u32::<NativeEndian>()
                    .map(|u| u as usize),
                8 => stack_copy[offset..]
                    .as_ref()
                    .read_u64::<NativeEndian>()
                    .map(|u| u as usize),
                x => panic!("Unexpected type width: {x}"),
            };
            if let Ok(addr) = addr {
                if low_addr <= addr && addr <= high_addr {
                    return true;
                }
                offset += size_of::<usize>();
            } else {
                break;
            }
        }
        false
    }

    pub fn is_interesting(&self) -> bool {
        // only want modules with filenames.
        self.name.is_some() &&
        // Only want to include one mapping per shared lib.
        // Avoid filtering executable mappings.
        (self.offset == 0 || self.is_executable()) &&
        // big enough to get a signature for.
        self.size >= 4096
    }

    pub fn contains_address(&self, address: usize) -> bool {
        self.start_address <= address && address < self.start_address + self.size
    }

    pub fn is_executable(&self) -> bool {
        self.permissions.contains(MMPermissions::EXECUTE)
    }

    pub fn is_readable(&self) -> bool {
        self.permissions.contains(MMPermissions::READ)
    }

    pub fn is_writable(&self) -> bool {
        self.permissions.contains(MMPermissions::WRITE)
    }
}

#[cfg(test)]
#[cfg(target_pointer_width = "64")] // All addresses are 64 bit and I'm currently too lazy to adjust it to work for both
mod tests {
    use super::*;

    const LINES: &str = "\
5597483fc000-5597483fe000 r--p 00000000 00:31 4750073                    /usr/bin/cat
5597483fe000-559748402000 r-xp 00002000 00:31 4750073                    /usr/bin/cat
559748402000-559748404000 r--p 00006000 00:31 4750073                    /usr/bin/cat
559748404000-559748405000 r--p 00007000 00:31 4750073                    /usr/bin/cat
559748405000-559748406000 rw-p 00008000 00:31 4750073                    /usr/bin/cat
559749b0e000-559749b2f000 rw-p 00000000 00:00 0                          [heap]
7efd968d3000-7efd968f5000 rw-p 00000000 00:00 0 
7efd968f5000-7efd9694a000 r--p 00000000 00:31 5004638                    /usr/lib/locale/en_US.utf8/LC_CTYPE
7efd9694a000-7efd96bc2000 r--p 00000000 00:31 5004373                    /usr/lib/locale/en_US.utf8/LC_COLLATE
7efd96bc2000-7efd96bc4000 rw-p 00000000 00:00 0 
7efd96bc4000-7efd96bea000 r--p 00000000 00:31 4996104                    /lib64/libc-2.32.so
7efd96bea000-7efd96d39000 r-xp 00026000 00:31 4996104                    /lib64/libc-2.32.so
7efd96d39000-7efd96d85000 r--p 00175000 00:31 4996104                    /lib64/libc-2.32.so
7efd96d85000-7efd96d86000 ---p 001c1000 00:31 4996104                    /lib64/libc-2.32.so
7efd96d86000-7efd96d89000 r--p 001c1000 00:31 4996104                    /lib64/libc-2.32.so
7efd96d89000-7efd96d8c000 rw-p 001c4000 00:31 4996104                    /lib64/libc-2.32.so
7efd96d8c000-7efd96d92000 ---p 00000000 00:00 0 
7efd96da0000-7efd96da1000 r--p 00000000 00:31 5004379                    /usr/lib/locale/en_US.utf8/LC_NUMERIC
7efd96da1000-7efd96da2000 r--p 00000000 00:31 5004382                    /usr/lib/locale/en_US.utf8/LC_TIME
7efd96da2000-7efd96da3000 r--p 00000000 00:31 5004377                    /usr/lib/locale/en_US.utf8/LC_MONETARY
7efd96da3000-7efd96da4000 r--p 00000000 00:31 5004376                    /usr/lib/locale/en_US.utf8/LC_MESSAGES/SYS_LC_MESSAGES
7efd96da4000-7efd96da5000 r--p 00000000 00:31 5004380                    /usr/lib/locale/en_US.utf8/LC_PAPER
7efd96da5000-7efd96da6000 r--p 00000000 00:31 5004378                    /usr/lib/locale/en_US.utf8/LC_NAME
7efd96da6000-7efd96da7000 r--p 00000000 00:31 5004372                    /usr/lib/locale/en_US.utf8/LC_ADDRESS
7efd96da7000-7efd96da8000 r--p 00000000 00:31 5004381                    /usr/lib/locale/en_US.utf8/LC_TELEPHONE
7efd96da8000-7efd96da9000 r--p 00000000 00:31 5004375                    /usr/lib/locale/en_US.utf8/LC_MEASUREMENT
7efd96da9000-7efd96db0000 r--s 00000000 00:31 5004639                    /usr/lib64/gconv/gconv-modules.cache
7efd96db0000-7efd96db1000 r--p 00000000 00:31 5004374                    /usr/lib/locale/en_US.utf8/LC_IDENTIFICATION
7efd96db1000-7efd96db2000 r--p 00000000 00:31 4996100                    /lib64/ld-2.32.so
7efd96db2000-7efd96dd3000 r-xp 00001000 00:31 4996100                    /lib64/ld-2.32.so
7efd96dd3000-7efd96ddc000 r--p 00022000 00:31 4996100                    /lib64/ld-2.32.so
7efd96ddc000-7efd96ddd000 r--p 0002a000 00:31 4996100                    /lib64/ld-2.32.so
7efd96ddd000-7efd96ddf000 rw-p 0002b000 00:31 4996100                    /lib64/ld-2.32.so
7ffc6dfda000-7ffc6dffb000 rw-p 00000000 00:00 0                          [stack]
7ffc6e0f3000-7ffc6e0f7000 r--p 00000000 00:00 0                          [vvar]
7ffc6e0f7000-7ffc6e0f9000 r-xp 00000000 00:00 0                          [vdso]
ffffffffff600000-ffffffffff601000 --xp 00000000 00:00 0                  [vsyscall]";
    const LINUX_GATE_LOC: u64 = 0x7ffc6e0f7000;

    fn get_all_mappings() -> Vec<MappingInfo> {
        get_mappings_for(LINES, LINUX_GATE_LOC)
    }

    #[test]
    fn test_merged() {
        // Only /usr/bin/cat and [heap]
        let mappings = get_mappings_for(
            "\
5597483fc000-5597483fe000 r--p 00000000 00:31 4750073                    /usr/bin/cat
5597483fe000-559748402000 r-xp 00002000 00:31 4750073                    /usr/bin/cat
559748402000-559748404000 r--p 00006000 00:31 4750073                    /usr/bin/cat
559748404000-559748405000 r--p 00007000 00:31 4750073                    /usr/bin/cat
559748405000-559748406000 rw-p 00008000 00:31 4750073                    /usr/bin/cat
559749b0e000-559749b2f000 rw-p 00000000 00:00 0                          [heap]
7efd968d3000-7efd968f5000 rw-p 00000000 00:00 0 ",
            0x7ffc6e0f7000,
        );

        assert_eq!(mappings.len(), 3);
        let cat_map = MappingInfo {
            start_address: 0x5597483fc000,
            size: 40960,
            offset: 0,
            permissions: MMPermissions::READ
                | MMPermissions::WRITE
                | MMPermissions::EXECUTE
                | MMPermissions::PRIVATE,
            name: Some("/usr/bin/cat".into()),
        };

        assert_eq!(mappings[0], cat_map);

        let heap_map = MappingInfo {
            start_address: 0x559749b0e000,
            size: 135168,
            offset: 0,
            permissions: MMPermissions::READ | MMPermissions::WRITE | MMPermissions::PRIVATE,
            name: Some("[heap]".into()),
        };

        assert_eq!(mappings[1], heap_map);

        let empty_map = MappingInfo {
            start_address: 0x7efd968d3000,
            size: 139264,
            offset: 0,
            permissions: MMPermissions::READ | MMPermissions::WRITE | MMPermissions::PRIVATE,
            name: None,
        };

        assert_eq!(mappings[2], empty_map);
    }

    #[test]
    fn test_linux_gate_parsing() {
        let mappings = get_all_mappings();

        let gate_map = MappingInfo {
            start_address: 0x7ffc6e0f7000,
            size: 8192,
            offset: 0,
            permissions: MMPermissions::READ | MMPermissions::EXECUTE | MMPermissions::PRIVATE,
            name: Some("linux-gate.so".into()),
        };

        assert_eq!(mappings[21], gate_map);
    }

    #[test]
    fn test_reading_all() {
        let mappings = get_all_mappings();

        let found_items: Vec<Option<OsString>> = vec![
            Some("/usr/bin/cat".into()),
            Some("[heap]".into()),
            None,
            Some("/usr/lib/locale/en_US.utf8/LC_CTYPE".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_COLLATE".into()),
            None,
            Some("/lib64/libc-2.32.so".into()),
            // The original shows a None here, but this is an address ranges that the
            // linker reserved but which a loaded library did not use. These
            // appear as an anonymous private mapping with no access flags set
            // and which directly follow an executable mapping.
            Some("/usr/lib/locale/en_US.utf8/LC_NUMERIC".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_TIME".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_MONETARY".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_MESSAGES/SYS_LC_MESSAGES".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_PAPER".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_NAME".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_ADDRESS".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_TELEPHONE".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_MEASUREMENT".into()),
            Some("/usr/lib64/gconv/gconv-modules.cache".into()),
            Some("/usr/lib/locale/en_US.utf8/LC_IDENTIFICATION".into()),
            Some("/lib64/ld-2.32.so".into()),
            Some("[stack]".into()),
            Some("[vvar]".into()),
            // This is rewritten from [vdso] to linux-gate.so
            Some("linux-gate.so".into()),
            Some("[vsyscall]".into()),
        ];

        assert_eq!(
            mappings.iter().map(|x| x.name.clone()).collect::<Vec<_>>(),
            found_items
        );
    }

    #[test]
    fn test_merged_reserved_mappings() {
        let mappings = get_all_mappings();

        let gate_map = MappingInfo {
            start_address: 0x7efd96bc4000,
            size: 1892352, // Merged the anonymous area after in this mapping, so its bigger..
            offset: 0,
            permissions: MMPermissions::READ
                | MMPermissions::WRITE
                | MMPermissions::EXECUTE
                | MMPermissions::PRIVATE,
            name: Some("/lib64/libc-2.32.so".into()),
        };

        assert_eq!(mappings[6], gate_map);
    }

    #[test]
    fn test_merged_reserved_mappings_within_module() {
        let mappings = get_mappings_for(
            "\
9b4a0000-9b931000 r--p 00000000 08:12 393449     /data/app/org.mozilla.firefox-1/lib/x86/libxul.so
9b931000-9bcae000 ---p 00000000 00:00 0 
9bcae000-a116b000 r-xp 00490000 08:12 393449     /data/app/org.mozilla.firefox-1/lib/x86/libxul.so
a116b000-a4562000 r--p 0594d000 08:12 393449     /data/app/org.mozilla.firefox-1/lib/x86/libxul.so
a4562000-a4563000 ---p 00000000 00:00 0 
a4563000-a4840000 r--p 08d44000 08:12 393449     /data/app/org.mozilla.firefox-1/lib/x86/libxul.so
a4840000-a4873000 rw-p 09021000 08:12 393449     /data/app/org.mozilla.firefox-1/lib/x86/libxul.so",
            0xa4876000,
        );

        let gate_map = MappingInfo {
            start_address: 0x9b4a0000,
            size: 155004928, // Merged the anonymous area after in this mapping, so its bigger..
            offset: 0,
            permissions: MMPermissions::READ
                | MMPermissions::WRITE
                | MMPermissions::EXECUTE
                | MMPermissions::PRIVATE,
            name: Some("/data/app/org.mozilla.firefox-1/lib/x86/libxul.so".into()),
        };

        assert_eq!(mappings[0], gate_map);
    }

    #[test]
    fn test_whitespaces_in_name() {
        let mappings = get_mappings_for(
            "\
10000000-20000000 r--p 00000000 00:3e 27136458                   libmoz    gtk.so
30000000-40000000 r--p 00000000 00:3e 27136458                   \"libmoz     gtk.so (deleted)\"
30000000-40000000 r--p 00000000 00:3e 27136458                   ",
            0x7ffe091bf000,
        );

        assert_eq!(mappings.len(), 3);
        assert_eq!(mappings[0].name, Some("libmoz    gtk.so".into()));
        assert_eq!(
            mappings[1].name,
            Some("\"libmoz     gtk.so (deleted)\"".into())
        );
        assert_eq!(mappings[2].name, None);
    }
}

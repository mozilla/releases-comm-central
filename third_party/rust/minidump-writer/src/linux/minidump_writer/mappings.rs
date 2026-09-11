use {
    super::*,
    crate::module_list::{ModuleListError, ModuleSource},
    std::ffi::OsString,
};

#[derive(Debug, Error, serde::Serialize)]
pub enum SectionMappingsError {
    #[error("Failed to write to memory")]
    MemoryWriterError(#[from] MemoryWriterError),
    #[error("Errors occurred while inspecting module {}", .name.to_string_lossy())]
    ModuleErrors {
        name: OsString,
        #[source]
        errors: ErrorList<ModuleListError>,
    },
}

impl MinidumpWriter {
    /// Write information about the modules loaded into the process. Because we
    /// are using the minidump format, the information about the modules is
    /// pretty limited. Because of this, we also include the full, unparsed,
    /// /proc/$x/maps file in another stream in the file.
    pub fn write_mappings(
        &self,
        buffer: &mut DumpBuf,
        mut soft_errors: impl WriteErrorList<SectionMappingsError>,
    ) -> Result<MDRawDirectory, SectionMappingsError> {
        let mut raw_modules = Vec::new();

        for module in &self.modules {
            let module_name = module.name.clone().unwrap_or_default();

            let Some((identifier, soname)) = self.get_mod_id_and_soname(module) else {
                continue;
            };

            let module = fill_raw_module(
                self.process_inspector.as_ref(),
                buffer,
                module,
                &identifier,
                soname,
                soft_errors.subwriter(|errors| SectionMappingsError::ModuleErrors {
                    name: module_name,
                    errors,
                }),
            )?;
            raw_modules.push(module);
        }

        let list_header = MemoryWriter::<u32>::alloc_with_val(buffer, raw_modules.len() as u32)?;

        let mut dirent = MDRawDirectory {
            stream_type: MDStreamType::ModuleListStream as u32,
            location: list_header.location(),
        };

        if !raw_modules.is_empty() {
            let module_list =
                MemoryArrayWriter::<MDRawModule>::alloc_from_iter(buffer, raw_modules)?;
            dirent.location.data_size += module_list.location().data_size;
        }

        Ok(dirent)
    }

    /// What it says on the tin. Returns None if the module doesn't have identifying data.
    fn get_mod_id_and_soname(&self, module: &ModuleInfo) -> Option<(Vec<u8>, Option<String>)> {
        // User-provided data is presumed to be correct.
        if let ModuleSource::User { identifier } = &module.source {
            return Some((identifier.clone(), None));
        }

        log::debug!("retrieving build id for {module:?}");
        let identifier = self
            .build_id_from_process_memory(module.base_address)
            .or_else(|e| {
                // If the module has an associated name that is a file, try to read the build id
                // from the file. If there is no note segment with the build id in
                // the program headers, we can't get to the note section if the section header
                // table isn't loaded.
                let Some(path) = &module.name else {
                    return Err(e);
                };

                log::debug!(
                    "failed to get build id from process memory ({e}), attempting to retrieve from {}",
                    path.display()
                );

                module_reader::read_build_id_from_file(self.process_inspector.as_ref(), path.as_ref())
                    .map_err(errors::WriterError::ModuleReaderError)
            })
            .unwrap_or_else(|e| {
                log::warn!("failed to get build id for module: {e}");
                Vec::new()
            });

        // If the identifier is all 0, its an uninteresting module (bmc#1676109)
        if identifier.is_empty() || identifier.iter().all(|&x| x == 0) {
            return None;
        }

        // SONAME should always be accessible through program headers alone, so we don't really
        // need to fall back to trying to read from the module file.
        let soname = self.soname_from_process_memory(module.base_address).ok();

        Some((identifier, soname))
    }
}
fn fill_raw_module(
    process_inspector: &dyn ProcessInspector,
    buffer: &mut DumpBuf,
    module: &ModuleInfo,
    identifier: &[u8],
    soname: Option<String>,
    soft_errors: impl WriteErrorList<ModuleListError>,
) -> Result<MDRawModule, SectionMappingsError> {
    let cv_record = if identifier.is_empty() {
        // Just zeroes
        Default::default()
    } else {
        let cv_signature = crate::minidump_format::format::CvSignature::Elf as u32;
        let array_size = std::mem::size_of_val(&cv_signature) + identifier.len();

        let mut sig_section = MemoryArrayWriter::<u8>::alloc_array(buffer, array_size)?;
        for (index, val) in cv_signature
            .to_ne_bytes()
            .iter()
            .chain(identifier.iter())
            .enumerate()
        {
            sig_section.set_value_at(buffer, *val, index)?;
        }
        sig_section.location()
    };

    let (file_path, _, so_version) =
        module.effective_path_name_and_version(process_inspector, soname, soft_errors);
    let name_header = write_string_to_location(buffer, file_path.to_string_lossy().as_ref())?;

    let version_info = so_version.map_or(Default::default(), |sov| format::VS_FIXEDFILEINFO {
        signature: format::VS_FFI_SIGNATURE,
        struct_version: format::VS_FFI_STRUCVERSION,
        file_version_hi: sov.major,
        file_version_lo: sov.minor,
        product_version_hi: sov.patch,
        product_version_lo: sov.prerelease,
        ..Default::default()
    });

    let raw_module = MDRawModule {
        base_of_image: module.base_address as u64,
        size_of_image: module.size as u32,
        cv_record,
        module_name_rva: name_header.rva,
        version_info,
        ..Default::default()
    };

    Ok(raw_module)
}

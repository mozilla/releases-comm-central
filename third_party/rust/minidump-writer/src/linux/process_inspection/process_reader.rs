use super::{
    Backend, Error, ProcessInspector,
    maps_reader::{MappingInfo, MapsReaderError},
};
use crate::module_reader::ProcessModuleMemoryReader;

use process_backend::local;

pub type ProcessHandle = libc::pid_t;

#[derive(Debug)]
pub struct ProcessReader<'a> {
    process_inspector: &'a ProcessInspector,
    forced_backend: Option<ForcedBackend>,
}

#[derive(Debug)]
enum ForcedBackend {
    Local(local::ProcessReader),
}

impl<'a> ProcessReader<'a> {
    pub fn new(process_inspector: &'a ProcessInspector) -> Self {
        Self {
            process_inspector,
            forced_backend: None,
        }
    }
    pub fn for_virtual_mem(process_inspector: &'a ProcessInspector) -> Self {
        let forced_backend = match &process_inspector.backend {
            Backend::Local { backend, .. } => {
                ForcedBackend::Local(backend.process_reader_for_virtual_mem())
            }
        };
        Self {
            process_inspector,
            forced_backend: Some(forced_backend),
        }
    }
    pub fn for_file(process_inspector: &'a ProcessInspector) -> Result<Self, Error> {
        let forced_backend = match &process_inspector.backend {
            Backend::Local { backend, .. } => {
                ForcedBackend::Local(backend.process_reader_for_file().map_err(Error::Local)?)
            }
        };
        Ok(Self {
            process_inspector,
            forced_backend: Some(forced_backend),
        })
    }
    pub fn for_ptrace(process_inspector: &'a ProcessInspector) -> Self {
        let forced_backend = match &process_inspector.backend {
            Backend::Local { backend, .. } => {
                ForcedBackend::Local(backend.process_reader_for_ptrace())
            }
        };
        Self {
            process_inspector,
            forced_backend: Some(forced_backend),
        }
    }

    /// Read memory from the process into the given buffer.
    ///
    /// Returns the number of bytes read.
    pub fn read(&self, src: usize, dst: &mut [u8]) -> Result<usize, CopyFromProcessError> {
        if let Some(forced_backend) = &self.forced_backend {
            match forced_backend {
                ForcedBackend::Local(process_reader_backend) => process_reader_backend
                    .read_at(src, dst)
                    .map_err(Error::Local),
            }
        } else {
            match &self.process_inspector.backend {
                Backend::Local {
                    process_reader_backend,
                    ..
                } => process_reader_backend
                    .read_at(src, dst)
                    .map_err(Error::Local),
            }
        }
        .map_err(CopyFromProcessError::Backend)
    }
    /// Find the address at which a module with the given name is loaded in the process.
    pub fn find_module(
        &self,
        module_name: &str,
    ) -> Result<ProcessModuleMemoryReader<'_>, FindModuleError> {
        MappingInfo::for_pid(self.process_inspector, self.process_inspector.pid, None)?
            .into_iter()
            .find_map(|m| {
                let mmem = ProcessModuleMemoryReader::new(self, m.start_address);
                let name = m.name.as_ref().and_then(|s| s.to_str())?;
                if name == module_name {
                    return Some(mmem);
                }
                // Check whether the SO_NAME matches the module name.
                //
                // For now, only check the SO_NAME of Android APKS, because libraries may be mapped
                // directly from within an APK. See bug 1982902.
                #[cfg(target_os = "android")]
                if name.ends_with(".apk") {
                    if let Ok(so_name) = crate::module_reader::read_soname_from_module(&mmem) {
                        if so_name == name {
                            return Some(mmem);
                        }
                    }
                }

                None
            })
            .ok_or(FindModuleError::ModuleNotFound)
    }
}

#[derive(Debug, thiserror::Error, serde::Serialize, serde::Deserialize)]
pub enum CopyFromProcessError {
    #[error("an error occurred calling ProcessReader")]
    Backend(Error),
    #[error("an invalid argument was passed")]
    InvalidArgument,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FindModuleError {
    #[error("Module not found")]
    ModuleNotFound,
    #[error("Failed to read process module mappings")]
    MappingError(#[from] MapsReaderError),
}

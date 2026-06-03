use {
    super::ffi::{self, HMODULE},
    crate::{module_reader::ProcessModuleMemoryReader, serializers::serialize_io_error},
    std::{
        convert::TryInto,
        ffi::OsString,
        mem::{MaybeUninit, size_of},
        os::windows::ffi::OsStringExt,
    },
};

pub type ProcessHandle = ffi::HANDLE;

pub struct ProcessReader {
    process: ProcessHandle,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
#[error("Copy from process {child} failed (source {src}, length: {length})")]
pub struct CopyFromProcessError {
    pub child: ProcessHandle,
    pub src: usize,
    pub length: usize,
    #[serde(serialize_with = "serialize_io_error")]
    pub error: std::io::Error,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum FindModuleError {
    #[error("Module not found")]
    ModuleNotFound,
    #[error("Failed to enumerator process modules")]
    EnumProcessModulesError,
    #[error("Module list exceeds 32-bit size constraint")]
    ModuleListTooLarge,
}

impl ProcessReader {
    pub fn new(process: ProcessHandle) -> ProcessReader {
        ProcessReader { process }
    }

    pub fn read(&self, src: usize, dst: &mut [u8]) -> Result<usize, CopyFromProcessError> {
        let mut size: usize = 0;
        let res = unsafe {
            ffi::ReadProcessMemory(
                self.process,
                src as _,
                dst.as_mut_ptr() as _,
                dst.len(),
                &mut size,
            )
        };

        if res != ffi::FALSE {
            Ok(size)
        } else {
            Err(CopyFromProcessError {
                child: self.process,
                src,
                length: dst.len(),
                error: std::io::Error::last_os_error(),
            })
        }
    }

    pub fn find_module(
        &self,
        module_name: &str,
    ) -> Result<ProcessModuleMemoryReader<'_>, FindModuleError> {
        let modules = self.get_module_list()?;

        let module = modules.iter().find_map(|&module| {
            let name = self.get_module_name(module);
            // Crude way of mimicking Windows lower-case comparisons but
            // sufficient for our use-cases.
            if name.is_some_and(|name| name.eq_ignore_ascii_case(module_name)) {
                self.get_module_info(module)
                    .map(|module| module.base_of_dll as usize)
            } else {
                None
            }
        });

        module
            .map(|m| ProcessModuleMemoryReader::new(self, m))
            .ok_or(FindModuleError::ModuleNotFound)
    }

    fn get_module_list(&self) -> Result<Vec<HMODULE>, FindModuleError> {
        let mut module_num: usize = 100;
        let mut required_buffer_size: u32 = 0;
        let mut module_array = Vec::<HMODULE>::with_capacity(module_num);

        loop {
            let buffer_size: u32 = (module_num * size_of::<HMODULE>())
                .try_into()
                .map_err(|_| FindModuleError::ModuleListTooLarge)?;
            let res = unsafe {
                ffi::K32EnumProcessModules(
                    self.process,
                    module_array.as_mut_ptr() as *mut _,
                    buffer_size,
                    &mut required_buffer_size as *mut _,
                )
            };

            module_num = required_buffer_size as usize / size_of::<HMODULE>();

            if required_buffer_size > buffer_size {
                module_array = Vec::<HMODULE>::with_capacity(module_num);
            } else if res == 0 {
                return Err(FindModuleError::EnumProcessModulesError);
            } else {
                break;
            }
        }

        // SAFETY: module_array has been filled by K32EnumProcessModules()
        unsafe {
            module_array.set_len(module_num);
        };

        Ok(module_array)
    }

    fn get_module_name(&self, module: HMODULE) -> Option<String> {
        use ffi::MAX_PATH;

        let mut path: [u16; MAX_PATH as usize] = [0; MAX_PATH as usize];
        let res = unsafe {
            ffi::K32GetModuleBaseNameW(self.process, module, path.as_mut_ptr(), MAX_PATH)
        };

        if res == 0 {
            None
        } else {
            let name = OsString::from_wide(&path[0..res as usize]);
            let name = name.to_str()?;
            Some(name.to_string())
        }
    }

    fn get_module_info(&self, module: HMODULE) -> Option<ffi::MODULEINFO> {
        let mut info: MaybeUninit<ffi::MODULEINFO> = MaybeUninit::uninit();
        let res = unsafe {
            ffi::K32GetModuleInformation(
                self.process,
                module,
                info.as_mut_ptr(),
                size_of::<ffi::MODULEINFO>() as u32,
            )
        };

        if res == 0 {
            None
        } else {
            let info = unsafe { info.assume_init() };
            Some(info)
        }
    }
}

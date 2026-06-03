/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use {
    crate::module_reader::ProcessModuleMemoryReader,
    mach2::{
        kern_return::KERN_SUCCESS,
        task::task_info,
        task_info::{TASK_DYLD_ALL_IMAGE_INFO_64, TASK_DYLD_INFO, task_dyld_info},
        vm::mach_vm_read_overwrite,
    },
    std::mem::{MaybeUninit, size_of},
};

pub type ProcessHandle = mach2::mach_types::task_t;

pub struct ProcessReader {
    process: ProcessHandle,
}

#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct AllImagesInfo {
    // VERSION 1
    pub version: u32,
    /// The number of [`ImageInfo`] structs at that following address
    info_array_count: u32,
    /// The address in the process where the array of [`ImageInfo`] structs is
    info_array_addr: u64,
    /// A function pointer, unused
    _notification: u64,
    /// Unused
    _process_detached_from_shared_region: bool,
    // VERSION 2
    lib_system_initialized: bool,
    // Note that crashpad adds a 32-bit int here to get proper alignment when
    // building on 32-bit targets...but we explicitly don't care about 32-bit
    // targets since Apple doesn't
    pub dyld_image_load_address: u64,
}

/// `dyld_image_info` from <usr/include/mach-o/dyld_images.h>
#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct ImageInfo {
    /// The address in the process where the image is loaded
    pub load_address: u64,
    /// The address in the process where the image's file path can be read
    pub file_path: u64,
    /// Timestamp for when the image's file was last modified
    pub file_mod_date: u64,
}

#[derive(Debug, thiserror::Error, serde::Serialize)]
#[error("Copy from process {child} failed (source {src}, length: {length})")]
pub struct CopyFromProcessError {
    pub child: ProcessHandle,
    pub src: usize,
    pub length: usize,
    pub kern_return: mach2::kern_return::kern_return_t,
}

#[derive(Debug, thiserror::Error)]
pub enum FindModuleError {
    #[error("Failed to get task info")]
    TaskInfoError,
    #[error("The image is not a supported format")]
    ImageFormatInvalid,
    #[error("The module was not found")]
    ModuleNotFound,
    #[error("Failed to read data from the module")]
    FailedToReadModule(#[from] CopyFromProcessError),
}

impl ProcessReader {
    pub fn new(process: ProcessHandle) -> ProcessReader {
        ProcessReader { process }
    }

    pub fn read(&self, src: usize, dst: &mut [u8]) -> Result<usize, CopyFromProcessError> {
        let mut size: u64 = 0;
        let res = unsafe {
            mach_vm_read_overwrite(
                self.process,
                src as _,
                dst.len() as _,
                dst.as_mut_ptr() as _,
                &mut size as _,
            )
        };

        if res == KERN_SUCCESS {
            Ok(size as usize)
        } else {
            Err(CopyFromProcessError {
                child: self.process,
                src,
                length: dst.len(),
                kern_return: res,
            })
        }
    }

    pub fn find_module(
        &self,
        module_name: &str,
    ) -> Result<ProcessModuleMemoryReader<'_>, FindModuleError> {
        let dyld_info = self.task_info()?;
        if (dyld_info.all_image_info_format as u32) != TASK_DYLD_ALL_IMAGE_INFO_64 {
            return Err(FindModuleError::ImageFormatInvalid);
        }

        let all_image_info_size = dyld_info.all_image_info_size;
        let all_image_info_addr = dyld_info.all_image_info_addr;
        if (all_image_info_size as usize) < size_of::<AllImagesInfo>() {
            return Err(FindModuleError::ImageFormatInvalid);
        }

        // SAFETY: The values of AllImagesInfo can be arbitrary; if they are incorrect (e.g. bad
        // addresses), bounds checking will produce an appropriate error.
        let all_images_info =
            unsafe { self.copy_object::<AllImagesInfo>(all_image_info_addr as _) }?;

        // Load the images
        // SAFETY: ImageInfo is allowed to have arbitrary values: if they are not valid, it will be
        // caught later.
        let images = unsafe {
            self.copy_array::<ImageInfo>(
                all_images_info.info_array_addr as _,
                all_images_info.info_array_count as _,
            )
        }?;

        images
            .iter()
            .find(|&image| {
                let image_path = self.copy_nul_terminated_string(image.file_path as usize);

                if let Ok(image_path) = image_path {
                    if let Some(image_name) = image_path.into_bytes().rsplit(|&b| b == b'/').next()
                    {
                        image_name.eq(module_name.as_bytes())
                    } else {
                        false
                    }
                } else {
                    false
                }
            })
            .map(|image| ProcessModuleMemoryReader::new(self, image.load_address as usize))
            .ok_or(FindModuleError::ModuleNotFound)
    }

    fn task_info(&self) -> Result<task_dyld_info, FindModuleError> {
        let mut info = MaybeUninit::<task_dyld_info>::uninit();
        let mut count = (size_of::<task_dyld_info>() / size_of::<u32>()) as u32;

        let res = unsafe {
            task_info(
                self.process,
                TASK_DYLD_INFO,
                info.as_mut_ptr().cast(),
                &mut count,
            )
        };

        if res == KERN_SUCCESS {
            // SAFETY: this will be initialized if the call succeeded
            unsafe { Ok(info.assume_init()) }
        } else {
            Err(FindModuleError::TaskInfoError)
        }
    }
}

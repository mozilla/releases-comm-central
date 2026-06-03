pub use minidump_common::format::{
    self, ArmElfHwCaps as MDCPUInformationARMElfHwCaps, GUID, MINIDUMP_DIRECTORY as MDRawDirectory,
    MINIDUMP_EXCEPTION as MDException, MINIDUMP_EXCEPTION_STREAM as MDRawExceptionStream,
    MINIDUMP_HANDLE_DATA_STREAM as MDRawHandleDataStream,
    MINIDUMP_HANDLE_DESCRIPTOR as MDRawHandleDescriptor, MINIDUMP_HEADER as MDRawHeader,
    MINIDUMP_LOCATION_DESCRIPTOR as MDLocationDescriptor,
    MINIDUMP_MEMORY_DESCRIPTOR as MDMemoryDescriptor, MINIDUMP_MEMORY_INFO as MDMemoryInfo,
    MINIDUMP_MEMORY_INFO_LIST as MDMemoryInfoList, MINIDUMP_MODULE as MDRawModule,
    MINIDUMP_SIGNATURE as MD_HEADER_SIGNATURE, MINIDUMP_STREAM_TYPE as MDStreamType,
    MINIDUMP_SYSTEM_INFO as MDRawSystemInfo, MINIDUMP_THREAD as MDRawThread,
    MINIDUMP_THREAD_NAME as MDRawThreadName, MINIDUMP_VERSION as MD_HEADER_VERSION, PlatformId,
    ProcessorArchitecture as MDCPUArchitecture, VS_FIXEDFILEINFO as MDVSFixedFileInfo,
};

/* An MDRVA is an offset into the minidump file.  The beginning of the
 * MDRawHeader is at offset 0. */
pub type MDRVA = u32;

pub type MDRawThreadList = Vec<MDRawThread>;

cfg_if::cfg_if! {
    if #[cfg(any(target_arch = "x86", target_arch = "x86_64"))] {
        pub use format::X86CpuInfo as MDCPUInformation;
    } else if #[cfg(any(target_arch = "arm", target_arch = "aarch64"))] {
        pub use format::ARMCpuInfo as MDCPUInformation;
    }
}

cfg_if::cfg_if! {
    if #[cfg(target_pointer_width = "64")] {
        pub use format::LINK_MAP_64 as MDRawLinkMap;
        pub use format::DSO_DEBUG_64 as MDRawDebug;
    } else if #[cfg(target_pointer_width = "32")] {
        pub use format::LINK_MAP_32 as MDRawLinkMap;
        pub use format::DSO_DEBUG_32 as MDRawDebug;
    }
}

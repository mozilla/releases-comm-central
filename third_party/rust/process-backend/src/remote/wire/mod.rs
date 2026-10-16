use super::super::remote;
use crate::{ProcessReaderKind, regs::*, wrapper::Stat};
use remote::transport;
use serde::{Deserialize, Serialize};

pub(crate) use cstr_with_null::CStrWithNull;

mod cstr_with_null;

pub(crate) trait Operation {
    type Args<'args>: Deserialize<'args> + Serialize;
    type Output<'output>: Deserialize<'output> + Serialize;
    fn request<'output, T>(
        transport: &'output mut T,
        args: Self::Args<'_>,
    ) -> Result<Result<Self::Output<'output>, RemoteError>, transport::BackendError>
    where
        T: transport::Backend;
}

pub(crate) type RemoteError = remote::executor::Error;

macro_rules! operations({
    $(
        $(#[cfg($($cfg_tt: tt)*)])?
        $name: ident($arg: ty) -> $output: ty,
    )*
} => {
    pub(crate) mod ops {
        use super::*;

        $(

        $(#[cfg($($cfg_tt)*)])?
        pub(crate) enum $name {}

        $(#[cfg($($cfg_tt)*)])?
        impl Operation for $name {
            type Args<'args> = $arg;
            type Output<'output> = $output;
            fn request<'output, T>(
                transport: &'output mut T,
                args: Self::Args<'_>,
            ) -> Result<Result<Self::Output<'output>, RemoteError>, transport::BackendError>
            where
                T: transport::Backend,
            {
                transport.send_request::<'output, Request, Result<Self::Output<'output>, RemoteError>>(
                    Request::$name(args),
                )
            }
        }

        )*
    }

    pub(crate) trait HandlesRequests {
        $(
        $(#[cfg($($cfg_tt)*)])?
        #[allow(non_snake_case)]
        fn $name<'args, 'output>(self, args: $arg) -> Result<$output, RemoteError>
        where
            Self: 'output;
        )*
    }

    pub(crate) fn serve_request<T, H>(
        transport: &mut T,
        handler: H,
    ) -> Result<(), transport::ExecutorError>
    where
        T: transport::Executor,
        H: HandlesRequests,
    {
        let request = transport.read_request::<'_, Request<'_>>()?;
        match request {
            $(
            $(#[cfg($($cfg_tt)*)])?
            Request::$name(args) => {
                let response = HandlesRequests::$name(handler, args);
                transport.write_response::<Result<<ops::$name as Operation>::Output<'_>, RemoteError>>(
                    response,
                )
            }
            )*
        }
    }

    #[derive(Debug, Deserialize, Serialize)]
    enum Request<'args> {
        $(
        $(#[cfg($($cfg_tt)*)])?
        $name(#[serde(borrow)] <ops::$name as Operation>::Args<'args>),
        )*
    }
});

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct FileReaderArgs {
    pub(crate) handle: usize,
    pub(crate) requested_len: usize,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct ProcessReaderReadAtArgs {
    pub(crate) address: usize,
    pub(crate) requested_len: usize,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct MappedModuleMemoryReaderOpenArgs<'args> {
    #[serde(borrow)]
    pub(crate) path: CStrWithNull<'args>,
    pub(crate) offset: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct MappedModuleMemoryReaderReadAtArgs {
    pub(crate) handle: usize,
    pub(crate) offset: usize,
    pub(crate) requested_len: usize,
}

#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct ReadLinkArgs<'args> {
    #[serde(borrow)]
    pub(crate) path: CStrWithNull<'args>,
    pub(crate) requested_len: usize,
}

// Notes on buffer sizing:
//
// The size of buffer-based arguments in these operations are limited by the
// `executor::Transport` argument buffer, the `backend::Transport` output buffer, and
// the `Executor` scratch buffer.
//
// Currently:
//
// The length of the argument buffer limits the maximum path length for:
//   read_file(), read_dir(), map_module_into_memory(), stat_file(), read_link()
//
// Sizing the Executor scratch buffer larger than the Backend output buffer is a bad idea - it
// means the Executor could request more bytes than the Backend is capable of holding, causing a
// `BufferTooSmall` error. Sizing the scratch buffer smaller is fine, but then the output buffer
// would never be totally utilized.
//
// So, in practice, the scratch buffer and output buffer should be the same size.
//
// The length of both limits the maximum readable path length for:
//   DirReader::read(), read_link()
//
// TL;DR
//
// The argument buffer should be the maximum length of a path you'd ever request for any operation
// that takes a path.
//
// The output buffer should be the maximum length of any directory name you'd expect returned
// by read_dir() and any path you'd ever expect returned by read_link().

operations! {
    GetPid(()) -> libc::pid_t,
    ProcessReaderReadAt(ProcessReaderReadAtArgs) -> &'output [u8],
    StopProcess(()) -> (),
    ContinueProcess(()) -> (),
    SuspendThread(libc::pid_t) -> (),
    ResumeThread(libc::pid_t) -> (),
    MappedModuleMemoryReaderOpen(MappedModuleMemoryReaderOpenArgs<'args>) -> usize,
    MappedModuleMemoryReaderReadAt(MappedModuleMemoryReaderReadAtArgs) -> &'output [u8],
    MappedModuleMemoryReaderLen(usize) -> usize,
    MappedModuleMemoryReaderClose(usize) -> (),
    StatFile(CStrWithNull<'args>) -> Stat,
    FileReaderOpen(CStrWithNull<'args>) -> usize,
    FileReaderRead(FileReaderArgs) -> &'output [u8],
    FileReaderClose(usize) -> (),
    DirReaderOpen(CStrWithNull<'args>) -> usize,
    DirReaderRead(usize) -> Option<&'output [u8]>,
    DirReaderClose(usize) -> (),
    ReadLink(ReadLinkArgs<'args>) -> &'output [u8],
    GetGenRegs(libc::pid_t) -> GenRegs,
    GetFpRegs(libc::pid_t) -> FpRegs,
    #[cfg(target_arch = "x86")]
    GetFpxRegs(libc::pid_t) -> FpxRegs,
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    PtracePeekUser(usize) -> [u8; crate::PTRACE_DATA_LEN],
    ForceProcessReaderKind(ProcessReaderKind) -> (),
    #[cfg(feature = "testing")]
    FailOneSyscallWith(core::ffi::c_int) -> (),
    Quit(()) -> (),
}

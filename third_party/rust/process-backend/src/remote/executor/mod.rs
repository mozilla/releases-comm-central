use super::super::remote;
use crate::local;
use remote::{transport, wire};
use resources::Pool;

pub use resources::Resources;

pub mod resources;

mod handler;

pub type Result<T> = core::result::Result<T, Error>;

pub fn run<T: transport::Executor>(
    pid: libc::pid_t,
    mut transport: T,
    resources: Resources<'_>,
) -> core::result::Result<(), transport::ExecutorError> {
    let mut executor = Executor {
        local_backend: local::Backend::new(pid),
        quit: false,
        file_readers: Pool::new(resources.file_readers),
        dir_readers: Pool::new(resources.dir_readers),
        mapped_module_memory_readers: Pool::new(resources.mapped_module_memory_readers),
        scratch_buf: resources.scratch_buf,
    };

    while !executor.quit {
        wire::serve_request(&mut transport, &mut executor)?;
    }

    Ok(())
}

struct Executor<'a> {
    local_backend: local::Backend,
    quit: bool,
    file_readers: Pool<'a, resources::FileReader>,
    dir_readers: Pool<'a, resources::DirReader>,
    mapped_module_memory_readers: Pool<'a, resources::MappedModuleMemoryReader>,
    scratch_buf: &'a mut [u8],
}

#[derive(Debug, thiserror::Error, serde::Deserialize, serde::Serialize)]
pub enum Error {
    #[error("an error was returned by a local syscall")]
    Local(#[source] local::Error),
    #[error("ran out of slots for a new MappedModuleMemoryReader")]
    MappedModuleMemoryReaderSlotsExhausted,
    #[error("requested an empty MappedModuleMemoryReader slot")]
    EmptyMappedModuleMemoryReaderSlotRequested,
    #[error("ran out of slots for a new FileReader")]
    FileReaderSlotsExhausted,
    #[error("requested an empty file slot")]
    EmptyFileSlotRequested,
    #[error("ran out of slots for a new DirReader")]
    DirReaderSlotsExhausted,
    #[error("requested an empty directory slot")]
    EmptyDirSlotRequested,
}

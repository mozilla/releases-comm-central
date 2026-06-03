use {
    super::*,
    crate::mem_writer::MemoryWriter,
    std::{
        ffi::OsStr,
        mem,
        path::{Path, PathBuf},
    },
};

fn descriptor_from_path(
    process_inspector: &ProcessInspector,
    buffer: &mut DumpBuf,
    path: &Path,
) -> Option<MDRawHandleDescriptor> {
    let handle = filename_to_fd(path.file_name().unwrap())?;
    let realpath = process_inspector.read_link(path).ok()?;
    let path_rva = write_string_to_location(buffer, realpath.to_string_lossy().as_ref()).ok()?;
    let stat = process_inspector.stat_file(path).ok()?;

    // TODO: We store the contents of `st_mode` into the `attributes` field, but
    // we could also store a human-readable string of the file type inside
    // `type_name_rva`. We might move this missing information (and
    // more) inside a custom `MINIDUMP_HANDLE_OBJECT_INFORMATION_TYPE` blob.
    // That would make this conversion loss-less.
    Some(MDRawHandleDescriptor {
        handle,
        type_name_rva: 0,
        object_name_rva: path_rva.rva,
        attributes: stat.st_mode,
        granted_access: 0,
        handle_count: 0,
        pointer_count: 0,
    })
}

fn filename_to_fd(filename: &OsStr) -> Option<u64> {
    let filename = filename.to_string_lossy();
    filename.parse::<u64>().ok()
}

#[derive(Debug, Error, serde::Serialize)]
pub enum SectionHandleDataStreamError {
    #[error("Failed to access file")]
    IOError(
        #[from]
        #[serde(serialize_with = "serialize_io_error")]
        std::io::Error,
    ),
    #[error("Failed to write to memory")]
    MemoryWriterError(#[from] MemoryWriterError),
    #[error("Failed integer conversion")]
    TryFromIntError(
        #[from]
        #[serde(skip)]
        std::num::TryFromIntError,
    ),
}

impl MinidumpWriter {
    pub fn write_handle_data_stream(
        &mut self,
        buffer: &mut DumpBuf,
    ) -> Result<MDRawDirectory, SectionHandleDataStreamError> {
        let proc_fd_path = PathBuf::from(format!("/proc/{}/fd", self.process_id));
        let proc_fd_iter = self.process_inspector.read_dir(&proc_fd_path)?;
        let descriptors: Vec<_> = proc_fd_iter
            .filter_map(|filename| filename.ok())
            .filter_map(|filename| {
                let path = proc_fd_path.join(filename);
                descriptor_from_path(&self.process_inspector, buffer, &path)
            })
            .collect();
        let number_of_descriptors = descriptors.len() as u32;

        let stream_header = MemoryWriter::<MDRawHandleDataStream>::alloc_with_val(
            buffer,
            MDRawHandleDataStream {
                size_of_header: mem::size_of::<MDRawHandleDataStream>() as u32,
                size_of_descriptor: mem::size_of::<MDRawHandleDescriptor>() as u32,
                number_of_descriptors,
                reserved: 0,
            },
        )?;

        let mut dirent = MDRawDirectory {
            stream_type: MDStreamType::HandleDataStream as u32,
            location: stream_header.location(),
        };

        let descriptor_list =
            MemoryArrayWriter::<MDRawHandleDescriptor>::alloc_from_iter(buffer, descriptors)?;

        dirent.location.data_size += descriptor_list.location().data_size;
        Ok(dirent)
    }
}

use super::*;

impl MinidumpWriter {
    /// Write application-provided memory regions.
    pub fn write_app_memory(&mut self, buffer: &mut DumpBuf) -> Result<(), CopyFromProcessError> {
        for app_memory in &self.app_memory {
            let data_copy = Self::copy_from_process(
                &self.process_inspector,
                app_memory.ptr,
                app_memory.length,
            )?;

            let section = MemoryArrayWriter::write_bytes(buffer, &data_copy);
            let desc = MDMemoryDescriptor {
                start_of_memory_range: app_memory.ptr as u64,
                memory: section.location(),
            };
            self.memory_blocks.push(desc);
        }
        Ok(())
    }
}

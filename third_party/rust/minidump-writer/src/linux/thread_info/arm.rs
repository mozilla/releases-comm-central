use {
    super::{Pid, ProcessInspector, ThreadInfoError, regs::*},
    crate::minidump_cpu::RawContextCPU,
};

#[derive(Debug)]
pub struct ThreadInfoArm {
    pub stack_pointer: usize,
    pub tgid: Pid, // thread group id
    pub ppid: Pid, // parent process
    pub regs: user_regs_struct,
    pub fpregs: user_fpregs_struct,
}

impl ThreadInfoArm {
    pub fn get_instruction_pointer(&self) -> usize {
        self.regs.uregs[15] as usize
    }

    pub fn fill_cpu_context(&self, out: &mut RawContextCPU) {
        out.context_flags =
            crate::minidump_format::format::ContextFlagsArm::CONTEXT_ARM_FULL.bits();

        out.iregs.copy_from_slice(&self.regs.uregs[..16]);
        out.cpsr = self.regs.uregs[16];
        out.float_save.fpscr = self.fpregs.fpscr as u64;
        out.float_save.regs = self.fpregs.fpregs;
    }

    pub fn create(process_inspector: &ProcessInspector, tid: Pid) -> Result<Self, ThreadInfoError> {
        let (ppid, tgid) = super::get_ppid_and_tgid(process_inspector, tid)?;
        let regs = process_inspector
            .get_gen_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;
        let fpregs = process_inspector
            .get_fp_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;

        let stack_pointer = regs.uregs[13] as usize;

        Ok(ThreadInfoArm {
            stack_pointer,
            tgid,
            ppid,
            regs,
            fpregs,
        })
    }
}

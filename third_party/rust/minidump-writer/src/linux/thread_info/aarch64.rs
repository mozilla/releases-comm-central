use {
    super::{Pid, ProcessInspector, ThreadInfoError, regs::*},
    crate::minidump_cpu::{FP_REG_COUNT, GP_REG_COUNT, RawContextCPU},
};

#[derive(Debug)]
pub struct ThreadInfoAarch64 {
    pub stack_pointer: usize,
    pub tgid: Pid, // thread group id
    pub ppid: Pid, // parent process
    pub regs: libc::user_regs_struct,
    pub fpregs: user_fpsimd_struct,
}

impl ThreadInfoAarch64 {
    pub fn get_instruction_pointer(&self) -> usize {
        self.regs.pc as usize
    }

    pub fn fill_cpu_context(&self, out: &mut RawContextCPU) {
        out.context_flags =
            minidump_common::format::ContextFlagsArm64Old::CONTEXT_ARM64_OLD_FULL.bits() as u64;

        out.cpsr = self.regs.pstate as u32;
        out.iregs[..GP_REG_COUNT].copy_from_slice(&self.regs.regs[..GP_REG_COUNT]);
        out.sp = self.regs.sp;
        // Note that in breakpad this was the last member of the iregs field
        // which was 33 in length, but in rust-minidump it is its own separate
        // field instead
        out.pc = self.regs.pc;

        out.fpsr = self.fpregs.fpsr;
        out.fpcr = self.fpregs.fpcr;
        out.float_regs[..FP_REG_COUNT].copy_from_slice(&self.fpregs.vregs[..FP_REG_COUNT]);
    }

    pub fn create(process_inspector: &ProcessInspector, tid: Pid) -> Result<Self, ThreadInfoError> {
        let (ppid, tgid) = super::get_ppid_and_tgid(process_inspector, tid)?;
        let regs = process_inspector
            .get_gen_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;
        let fpregs = process_inspector
            .get_fp_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;

        let stack_pointer = regs.sp as usize;

        Ok(Self {
            stack_pointer,
            tgid,
            ppid,
            regs,
            fpregs,
        })
    }
}

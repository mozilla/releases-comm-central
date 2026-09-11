use {
    super::{Pid, ProcessInspector, ThreadInfoError, regs::*},
    crate::minidump_cpu::RawContextCPU,
    error_graph::WriteErrorList,
};

#[derive(Debug)]
pub struct ThreadInfoArm {
    pub stack_pointer: usize,
    pub tgid: Pid, // thread group id
    pub ppid: Pid, // parent process
    pub regs: GenRegs,
    pub fpregs: Option<FpRegs>,
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

        let fpregs = self.fpregs.unwrap_or_default();

        out.float_save.fpscr = fpregs.fpscr as u64;
        out.float_save.regs = fpregs.fpregs;
    }

    pub fn create(
        process_inspector: &dyn ProcessInspector,
        tid: Pid,
        mut soft_errors: impl WriteErrorList<ThreadInfoError>,
    ) -> Result<Self, ThreadInfoError> {
        let (ppid, tgid) = super::get_ppid_and_tgid(process_inspector, tid)?;

        let regs = process_inspector
            .get_gen_regs(tid)
            .map_err(ThreadInfoError::GetGenRegsFailed)?;

        let fpregs = match process_inspector
            .get_fp_regs(tid)
            .map_err(ThreadInfoError::GetFpRegsFailed)
        {
            Ok(regs) => Some(regs),
            Err(e) => {
                soft_errors.push(e);
                None
            }
        };

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

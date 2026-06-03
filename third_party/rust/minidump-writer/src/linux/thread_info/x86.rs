use {
    super::{Pid, ProcessInspector, ThreadInfoError, regs::*},
    crate::{minidump_cpu::RawContextCPU, minidump_format::format},
    core::mem,
    scroll::Pwrite,
};

pub struct ThreadInfoX86 {
    pub stack_pointer: usize,
    pub tgid: Pid, // thread group id
    pub ppid: Pid, // parent process
    pub regs: user_regs_struct,
    pub fpregs: user_fpregs_struct,
    pub dregs: [RegType; NUM_DEBUG_REGISTERS],
    #[cfg(target_arch = "x86")]
    pub fpxregs: user_fpxregs_struct,
}

impl ThreadInfoX86 {
    pub fn create(process_inspector: &ProcessInspector, tid: Pid) -> Result<Self, ThreadInfoError> {
        let (ppid, tgid) = super::get_ppid_and_tgid(process_inspector, tid)?;
        let regs = process_inspector
            .get_gen_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;
        let fpregs = process_inspector
            .get_fp_regs(tid)
            .map_err(ThreadInfoError::PtraceError)?;

        #[cfg(target_arch = "x86")]
        let fpxregs = {
            if cfg!(target_feature = "fxsr") {
                process_inspector
                    .get_fpx_regs(tid)
                    .map_err(ThreadInfoError::PtraceError)?
            } else {
                unsafe { mem::zeroed() }
            }
        };

        let mut dregs: [RegType; NUM_DEBUG_REGISTERS] = [0; NUM_DEBUG_REGISTERS];

        let debug_offset = mem::offset_of!(user, u_debugreg);
        for (idx, dreg) in dregs.iter_mut().enumerate() {
            let chunk = process_inspector
                .ptrace_peekuser(tid, debug_offset + idx * mem::size_of::<RegType>())
                .map_err(ThreadInfoError::PtraceError)?;

            *dreg = RegType::from_ne_bytes(chunk[0..mem::size_of::<RegType>()].try_into().unwrap());
        }

        #[cfg(target_arch = "x86_64")]
        let stack_pointer = regs.rsp as usize;
        #[cfg(target_arch = "x86")]
        let stack_pointer = regs.esp as usize;

        Ok(Self {
            stack_pointer,
            tgid,
            ppid,
            regs,
            fpregs,
            dregs,
            #[cfg(target_arch = "x86")]
            fpxregs,
        })
    }

    #[cfg(target_arch = "x86_64")]
    pub fn get_instruction_pointer(&self) -> usize {
        self.regs.rip as usize
    }

    #[cfg(target_arch = "x86")]
    pub fn get_instruction_pointer(&self) -> usize {
        self.regs.eip as usize
    }

    #[cfg(target_arch = "x86_64")]
    pub fn fill_cpu_context(&self, out: &mut RawContextCPU) {
        use format::ContextFlagsAmd64;

        out.context_flags = ContextFlagsAmd64::CONTEXT_AMD64_FULL.bits()
            | ContextFlagsAmd64::CONTEXT_AMD64_SEGMENTS.bits();

        out.cs = self.regs.cs as u16; // TODO: This is u64, do we loose information by doing this?

        out.ds = self.regs.ds as u16; // TODO: This is u64, do we loose information by doing this?
        out.es = self.regs.es as u16; // TODO: This is u64, do we loose information by doing this?
        out.fs = self.regs.fs as u16; // TODO: This is u64, do we loose information by doing this?
        out.gs = self.regs.gs as u16; // TODO: This is u64, do we loose information by doing this?

        out.ss = self.regs.ss as u16; // TODO: This is u64, do we loose information by doing this?
        out.eflags = self.regs.eflags as u32; // TODO: This is u64, do we loose information by doing this?

        out.dr0 = self.dregs[0];
        out.dr1 = self.dregs[1];
        out.dr2 = self.dregs[2];
        out.dr3 = self.dregs[3];
        // 4 and 5 deliberatly omitted because they aren't included in the minidump
        // format.
        out.dr6 = self.dregs[6];
        out.dr7 = self.dregs[7];

        out.rax = self.regs.rax;
        out.rcx = self.regs.rcx;
        out.rdx = self.regs.rdx;
        out.rbx = self.regs.rbx;

        out.rsp = self.regs.rsp;

        out.rbp = self.regs.rbp;
        out.rsi = self.regs.rsi;
        out.rdi = self.regs.rdi;
        out.r8 = self.regs.r8;
        out.r9 = self.regs.r9;
        out.r10 = self.regs.r10;
        out.r11 = self.regs.r11;
        out.r12 = self.regs.r12;
        out.r13 = self.regs.r13;
        out.r14 = self.regs.r14;
        out.r15 = self.regs.r15;

        out.rip = self.regs.rip;

        {
            let fs = &self.fpregs;
            let mut float_save = crate::minidump_cpu::FloatStateCPU {
                control_word: fs.cwd,
                status_word: fs.swd,
                tag_word: fs.ftw as u8,
                error_opcode: fs.fop,
                error_offset: fs.rip as u32,
                data_offset: fs.rdp as u32,
                error_selector: 0, // We don't have this.
                data_selector: 0,  // We don't have this.
                mx_csr: fs.mxcsr,
                mx_csr_mask: fs.mxcr_mask,
                ..Default::default()
            };

            copy_u32_registers(&mut float_save.float_registers, &fs.st_space);
            copy_u32_registers(&mut float_save.xmm_registers, &fs.xmm_space);

            out.float_save
                .pwrite_with(float_save, 0, scroll::Endian::Little)
                .expect("this is impossible");
        }
    }

    #[cfg(target_arch = "x86")]
    pub fn fill_cpu_context(&self, out: &mut RawContextCPU) {
        out.context_flags = format::ContextFlagsX86::CONTEXT_X86_ALL.bits();

        out.dr0 = self.dregs[0] as u32;
        out.dr3 = self.dregs[3] as u32;
        out.dr1 = self.dregs[1] as u32;
        out.dr2 = self.dregs[2] as u32;
        // 4 and 5 deliberatly omitted because they aren't included in the minidump
        // format.
        out.dr6 = self.dregs[6] as u32;
        out.dr7 = self.dregs[7] as u32;

        out.gs = self.regs.xgs as u32;
        out.fs = self.regs.xfs as u32;
        out.es = self.regs.xes as u32;
        out.ds = self.regs.xds as u32;

        out.edi = self.regs.edi as u32;
        out.esi = self.regs.esi as u32;
        out.ebx = self.regs.ebx as u32;
        out.edx = self.regs.edx as u32;
        out.ecx = self.regs.ecx as u32;
        out.eax = self.regs.eax as u32;

        out.ebp = self.regs.ebp as u32;
        out.eip = self.regs.eip as u32;
        out.cs = self.regs.xcs as u32;
        out.eflags = self.regs.eflags as u32;
        out.esp = self.regs.esp as u32;
        out.ss = self.regs.xss as u32;

        out.float_save.control_word = self.fpregs.cwd as u32;
        out.float_save.status_word = self.fpregs.swd as u32;
        out.float_save.tag_word = self.fpregs.twd as u32;
        out.float_save.error_offset = self.fpregs.fip as u32;
        out.float_save.error_selector = self.fpregs.fcs as u32;
        out.float_save.data_offset = self.fpregs.foo as u32;
        out.float_save.data_selector = self.fpregs.fos as u32;

        {
            let ra = &mut out.float_save.register_area;
            // 8 registers * 10 bytes per register.
            for (idx, block) in self.fpregs.st_space.iter().enumerate() {
                let offset = idx * std::mem::size_of::<u32>();
                if offset >= ra.len() {
                    break;
                }

                ra.pwrite_with(block, offset, scroll::Endian::Little)
                    .expect("this is impossible");
            }
        }

        #[allow(unused_assignments)]
        {
            let mut offset = 0;
            macro_rules! write_er {
                ($reg:expr) => {
                    offset += out
                        .extended_registers
                        .pwrite_with($reg, offset, scroll::Endian::Little)
                        .unwrap()
                };
            }

            // This matches the Intel fpsave format.
            write_er!(self.fpregs.cwd as u16);
            write_er!(self.fpregs.swd as u16);
            write_er!(self.fpregs.twd as u16);
            write_er!(self.fpxregs.fop);
            write_er!(self.fpxregs.fip);
            write_er!(self.fpxregs.fcs);
            write_er!(self.fpregs.foo);
            write_er!(self.fpregs.fos);
            write_er!(self.fpxregs.mxcsr);

            offset = 32;

            for val in &self.fpxregs.st_space {
                write_er!(val);
            }

            debug_assert_eq!(offset, 160);

            for val in &self.fpxregs.xmm_space {
                write_er!(val);
            }
        }
    }
}

#[cfg(target_arch = "x86_64")]
pub fn copy_u32_registers(dst: &mut [u128], src: &[u32]) {
    assert_eq!(mem::size_of_val(src), mem::size_of_val(dst));
    // SAFETY: All bit patterns are valid for both types
    unsafe {
        std::ptr::copy_nonoverlapping(
            src.as_ptr().cast::<u8>(),
            dst.as_mut_ptr().cast::<u8>(),
            mem::size_of_val(src),
        );
    }
}

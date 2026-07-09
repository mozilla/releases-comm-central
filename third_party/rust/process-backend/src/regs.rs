pub use imp::*;

#[cfg(target_arch = "aarch64")]
mod imp {
    pub type GenRegs = libc::user_regs_struct;
    pub type FpRegs = user_fpsimd_struct;

    /// https://github.com/rust-lang/libc/pull/2719
    #[repr(C)]
    #[derive(Debug)]
    pub struct user_fpsimd_struct {
        pub vregs: [u128; 32],
        pub fpsr: u32,
        pub fpcr: u32,
    }
}

#[cfg(target_arch = "arm")]
mod imp {
    pub type GenRegs = user_regs_struct;
    pub type FpRegs = user_fpregs_struct;

    // Not defined by libc because this works only for cores support VFP
    #[repr(C)]
    #[derive(Debug, Eq, Hash, PartialEq, Copy, Clone, Default)]
    pub struct user_fpregs_struct {
        pub fpregs: [u64; 32],
        pub fpscr: u32,
    }

    #[repr(C)]
    #[derive(Debug, Eq, Hash, PartialEq, Copy, Clone, Default)]
    pub struct user_regs_struct {
        pub uregs: [u32; 18],
    }
}

#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
mod imp {
    pub type GenRegs = user_regs_struct;
    pub type FpRegs = user_fpregs_struct;

    #[cfg(target_arch = "x86")]
    pub type FpxRegs = user_fpxregs_struct;

    pub const NUM_DEBUG_REGISTERS: usize = 8;

    #[cfg(target_arch = "x86")]
    pub type RegType = u32;

    #[cfg(target_arch = "x86_64")]
    pub type RegType = u64;

    #[cfg(all(not(target_os = "android"), target_arch = "x86"))]
    pub use libc::user_fpxregs_struct;
    #[cfg(not(all(target_os = "android", target_arch = "x86")))]
    pub use libc::{user, user_fpregs_struct, user_regs_struct};

    // Not defined by libc on Android
    #[cfg(all(target_os = "android", target_arch = "x86"))]
    #[allow(non_camel_case_types)]
    #[repr(C)]
    pub struct user_regs_struct {
        pub ebx: libc::c_long,
        pub ecx: libc::c_long,
        pub edx: libc::c_long,
        pub esi: libc::c_long,
        pub edi: libc::c_long,
        pub ebp: libc::c_long,
        pub eax: libc::c_long,
        pub xds: libc::c_long,
        pub xes: libc::c_long,
        pub xfs: libc::c_long,
        pub xgs: libc::c_long,
        pub orig_eax: libc::c_long,
        pub eip: libc::c_long,
        pub xcs: libc::c_long,
        pub eflags: libc::c_long,
        pub esp: libc::c_long,
        pub xss: libc::c_long,
    }

    // Not defined by libc on Android
    #[cfg(all(target_os = "android", target_arch = "x86"))]
    #[allow(non_camel_case_types)]
    #[repr(C)]
    pub struct user_fpxregs_struct {
        pub cwd: libc::c_ushort,
        pub swd: libc::c_ushort,
        pub twd: libc::c_ushort,
        pub fop: libc::c_ushort,
        pub fip: libc::c_long,
        pub fcs: libc::c_long,
        pub foo: libc::c_long,
        pub fos: libc::c_long,
        pub mxcsr: libc::c_long,
        __reserved: libc::c_long,
        pub st_space: [libc::c_long; 32],
        pub xmm_space: [libc::c_long; 32],
        padding: [libc::c_long; 56],
    }

    // Not defined by libc on Android
    #[cfg(all(target_os = "android", target_arch = "x86"))]
    #[allow(non_camel_case_types)]
    #[repr(C)]
    pub struct user_fpregs_struct {
        pub cwd: libc::c_long,
        pub swd: libc::c_long,
        pub twd: libc::c_long,
        pub fip: libc::c_long,
        pub fcs: libc::c_long,
        pub foo: libc::c_long,
        pub fos: libc::c_long,
        pub st_space: [libc::c_long; 20],
    }

    #[cfg(all(target_os = "android", target_arch = "x86"))]
    #[allow(non_camel_case_types)]
    #[repr(C)]
    pub struct user {
        pub regs: user_regs_struct,
        pub u_fpvalid: libc::c_long,
        pub i387: user_fpregs_struct,
        pub u_tsize: libc::c_ulong,
        pub u_dsize: libc::c_ulong,
        pub u_ssize: libc::c_ulong,
        pub start_code: libc::c_ulong,
        pub start_stack: libc::c_ulong,
        pub signal: libc::c_long,
        __reserved: libc::c_int,
        pub u_ar0: *mut user_regs_struct,
        pub u_fpstate: *mut user_fpregs_struct,
        pub magic: libc::c_ulong,
        pub u_comm: [libc::c_char; 32],
        pub u_debugreg: [libc::c_int; 8],
    }
}

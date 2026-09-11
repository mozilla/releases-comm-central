// We define our own versions of the various constants/register-holding structures from the ptrace
// API of Linux for a few reasons:
//
// 1. The versions of them defined in the `libc` crate don't provide `Deserialize` or `Serialize`
//    implementations, and we need that - So we'd have to maintain parallel versions of these
//    structs anyway.
//
// 2. A lot of these structures/constants vary slightly by name and availability between glibc,
//    bionic and musl, even though the kernel itself supports them. Doing it ourselves helps us
//    maintain more consistency.
//
// 3. All of these structures are basically plain-old-data types under the hood, so we can avoid
//    using MaybeUninit by deriving a `Default` implementation for them - something the `libc`
//    crate doesn't do because it doesn't generalize to all types in libc.
//
// All information was obtained directly from the Linux Kernel source code, with a few
// modifications like explicitly-declared padding, and consistent use of fixed-width unsigned
// integer types.
//
// Kernel names will be used for these structs, and links to the relevant code in the kernel are
// included.
#![allow(unused)]

#[cfg(target_env = "gnu")]
pub(crate) type PtraceRequestType = core::ffi::c_uint;

#[cfg(not(target_env = "gnu"))]
pub(crate) type PtraceRequestType = core::ffi::c_int;

/// A kernel-defined constant that names a register set as part of a call to
/// ptrace(PTRACE_GETREGSET)
pub(crate) struct RegSetNote(pub(crate) usize);

/// Describes a register-set buffer that may be populated by `ptrace`.
///
/// # Safety
///
/// Implementors must guarantee all of the following:
///
/// 1. `NOTE` identifies a `PTRACE_GETREGSET` register set whose first
///    `KERNEL_SIZE` bytes have the layout of the corresponding prefix
///    of `Output`.
///
/// 2. If `LEGACY_REQUEST` is `Some`, that request writes the same register
///    representation, writes no more than `KERNEL_SIZE` bytes, and uses the
///    fourth `ptrace` argument as the output buffer.
///
/// 3. `KERNEL_SIZE <= size_of::<Output>()`.
///
/// 4. Every byte pattern the kernel may leave in the first `KERNEL_SIZE`
///    bytes, combined with the untouched bytes of `Output::default()`,
///    must constitute a valid `Output`, including when the syscall fails
///    after a partial write.
///
/// 5. `Output` must not require drop glue.
pub(crate) unsafe trait PtraceRegisterSet {
    const NOTE: RegSetNote;
    /// Legacy ptrace request to fall back on if PTRACE_GETREGSET fails
    const LEGACY_REQUEST: Option<PtraceRequestType>;
    const KERNEL_SIZE: usize;
    type Output: Copy + Default;
}

pub(crate) enum GenRegsTag {}
pub(crate) enum FpRegsTag {}

// https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/include/uapi/linux/elf.h?h=v7.1.8
const NT_PRSTATUS: RegSetNote = RegSetNote(1);
const NT_PRFPREG: RegSetNote = RegSetNote(2);
const NT_ARM_VFP: RegSetNote = RegSetNote(0x400);
const NT_PRXFPREG: RegSetNote = RegSetNote(0x46e62b7f);

pub use imp::*;

// https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm64/kernel/ptrace.c?h=v7.1.8#n1614
#[cfg(target_arch = "aarch64")]
mod imp {
    use super::*;

    pub type GenRegs = user_pt_regs;
    pub type FpRegs = user_fpsimd_state;

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm64/include/uapi/asm/ptrace.h?h=v7.1.8#n88
    #[repr(C)]
    #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
    pub struct user_pt_regs {
        pub regs: [u64; 31],
        pub sp: u64,
        pub pc: u64,
        pub pstate: u64,
    }

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm64/include/uapi/asm/ptrace.h?h=v7.1.8#n95
    #[repr(C)]
    #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
    pub struct user_fpsimd_state {
        pub vregs: [u128; 32],
        pub fpsr: u32,
        pub fpcr: u32,
        #[serde(skip)]
        pub __reserved: [u32; 2],
    }

    unsafe impl PtraceRegisterSet for GenRegsTag {
        const NOTE: RegSetNote = NT_PRSTATUS;
        const LEGACY_REQUEST: Option<PtraceRequestType> = None;
        const KERNEL_SIZE: usize = size_of::<user_pt_regs>();
        type Output = user_pt_regs;
    }

    unsafe impl PtraceRegisterSet for FpRegsTag {
        const NOTE: RegSetNote = NT_PRFPREG;
        const LEGACY_REQUEST: Option<PtraceRequestType> = None;
        const KERNEL_SIZE: usize = size_of::<user_fpsimd_state>();
        type Output = user_fpsimd_state;
    }

    const _: () = {
        assert!(size_of::<user_pt_regs>() == 272);
        assert!(align_of::<user_pt_regs>() == 8);
        assert!(size_of::<user_fpsimd_state>() == 528);
        assert!(align_of::<user_fpsimd_state>() == 16);
    };
}

// https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm/kernel/ptrace.c?h=v7.1.8#n678
#[cfg(target_arch = "arm")]
mod imp {
    use super::*;

    pub type GenRegs = pt_regs;
    pub type FpRegs = user_vfp;

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm/include/uapi/asm/ptrace.h?h=v7.1.8
    const PTRACE_GETREGS: PtraceRequestType = 12;
    const PTRACE_GETVFPREGS: PtraceRequestType = 27;

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm/include/uapi/asm/ptrace.h?h=v7.1.8#n149
    const ARM_VFPREGS_SIZE: usize = 32 * 8 /*fpregs*/ + 4 /*fpscr*/;

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm/include/asm/user.h?h=v7.1.8#n85
    //
    // Note: This struct has 4 bytes of padding at the end due to its alignment requirements, but
    // the kernel does not write those 4 bytes as part of a ptrace call - it will only write 260
    // bytes and not 264 (the size of this struct with trailing padding).
    //
    // We capture that by setting the `KERNEL_SIZE` to `ARM_VFPREGS_SIZE` instead of
    // `size_of::<user_vfp>()`.
    #[repr(C)]
    #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
    pub struct user_vfp {
        pub fpregs: [u64; 32],
        pub fpscr: u32,
    }

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/arm/include/asm/ptrace.h?h=v7.1.8#n16
    #[repr(C)]
    #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
    pub struct pt_regs {
        pub uregs: [u32; 18],
    }

    unsafe impl PtraceRegisterSet for GenRegsTag {
        const NOTE: RegSetNote = NT_PRSTATUS;
        const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETREGS);
        const KERNEL_SIZE: usize = size_of::<pt_regs>();
        type Output = pt_regs;
    }

    unsafe impl PtraceRegisterSet for FpRegsTag {
        const NOTE: RegSetNote = NT_ARM_VFP;
        const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETVFPREGS);
        const KERNEL_SIZE: usize = ARM_VFPREGS_SIZE;
        type Output = user_vfp;
    }

    const _: () = {
        assert!(size_of::<pt_regs>() == 72);
        assert!(align_of::<pt_regs>() == 4);
        assert!(size_of::<user_vfp>() == 264);
        assert!(align_of::<user_vfp>() == 8);
    };
}

// https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/kernel/ptrace.c?h=v7.1.8#n1298
#[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
mod imp {
    use super::*;

    // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/uapi/asm/ptrace-abi.h?h=v7.1.8
    const PTRACE_GETREGS: PtraceRequestType = 12;
    const PTRACE_GETFPREGS: PtraceRequestType = 14;

    pub const NUM_DEBUG_REGISTERS: usize = 8;

    pub use subarch::*;

    #[cfg(target_arch = "x86")]
    mod subarch {
        use super::*;

        pub type GenRegs = user_regs_struct;
        pub type FpRegs = user_i387_ia32_struct;
        pub type FpxRegs = fxregs_state;
        pub type RegType = u32;

        pub(crate) enum FpxRegsTag {}

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/uapi/asm/ptrace-abi.h?h=v7.1.8
        const PTRACE_GETFPXREGS: PtraceRequestType = 18;

        // Obtained by running:
        //     println!("{}", std::mem::offset_of!(libc::user, u_debugreg));
        pub const USER_STRUCT_DEBUGREG_OFFSET: usize = 252;

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/asm/user_32.h?h=v7.1.8#n78
        #[repr(C)]
        #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
        pub struct user_regs_struct {
            pub ebx: u32,
            pub ecx: u32,
            pub edx: u32,
            pub esi: u32,
            pub edi: u32,
            pub ebp: u32,
            pub eax: u32,
            pub ds: u32,
            pub es: u32,
            pub fs: u32,
            pub gs: u32,
            pub orig_eax: u32,
            pub eip: u32,
            pub cs: u32,
            pub eflags: u32,
            pub esp: u32,
            pub ss: u32,
        }

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/asm/user32.h?h=v7.1.8#n8
        #[repr(C)]
        #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
        pub struct user_i387_ia32_struct {
            pub cwd: u32,
            pub swd: u32,
            pub twd: u32,
            pub fip: u32,
            pub fcs: u32,
            pub foo: u32,
            pub fos: u32,
            pub st_space: [u32; 20],
        }

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/asm/fpu/types.h?h=v7.1.8#n36
        #[repr(C, align(16))]
        #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
        pub struct fxregs_state {
            pub cwd: u16,
            pub swd: u16,
            pub twd: u16,
            pub fop: u16,
            pub fip: u32,
            pub fcs: u32,
            pub foo: u32,
            pub fos: u32,
            pub mxcsr: u32,
            pub mxcsr_mask: u32,
            pub st_space: [u32; 32],
            pub xmm_space: super::XmmSpace,
            #[serde(skip)]
            pub __padding: [u32; 12],
            #[serde(skip)]
            pub __padding1: [u32; 12],
        }

        unsafe impl PtraceRegisterSet for GenRegsTag {
            const NOTE: RegSetNote = NT_PRSTATUS;
            const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETREGS);
            const KERNEL_SIZE: usize = size_of::<user_regs_struct>();
            type Output = user_regs_struct;
        }

        unsafe impl PtraceRegisterSet for FpRegsTag {
            const NOTE: RegSetNote = NT_PRFPREG;
            const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETFPREGS);
            const KERNEL_SIZE: usize = size_of::<user_i387_ia32_struct>();
            type Output = user_i387_ia32_struct;
        }

        unsafe impl PtraceRegisterSet for FpxRegsTag {
            const NOTE: RegSetNote = NT_PRXFPREG;
            const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETFPXREGS);
            const KERNEL_SIZE: usize = size_of::<fxregs_state>();
            type Output = fxregs_state;
        }

        const _: () = {
            assert!(size_of::<user_regs_struct>() == 68);
            assert!(align_of::<user_regs_struct>() == 4);
            assert!(size_of::<user_i387_ia32_struct>() == 108);
            assert!(align_of::<user_i387_ia32_struct>() == 4);
            assert!(size_of::<fxregs_state>() == 512);
            assert!(align_of::<fxregs_state>() == 16);
        };
    }

    #[cfg(target_arch = "x86_64")]
    mod subarch {
        use super::*;

        pub type GenRegs = user_regs_struct;
        pub type FpRegs = fxregs_state;
        pub type RegType = u64;

        // Obtained by running:
        //     println!("{}", std::mem::offset_of!(libc::user, u_debugreg));
        pub const USER_STRUCT_DEBUGREG_OFFSET: usize = 848;

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/asm/user_64.h?h=v7.1.8#n69
        #[repr(C)]
        #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
        pub struct user_regs_struct {
            pub r15: u64,
            pub r14: u64,
            pub r13: u64,
            pub r12: u64,
            pub rbp: u64,
            pub rbx: u64,
            pub r11: u64,
            pub r10: u64,
            pub r9: u64,
            pub r8: u64,
            pub rax: u64,
            pub rcx: u64,
            pub rdx: u64,
            pub rsi: u64,
            pub rdi: u64,
            pub orig_rax: u64,
            pub rip: u64,
            pub cs: u64,
            pub eflags: u64,
            pub rsp: u64,
            pub ss: u64,
            pub fs_base: u64,
            pub gs_base: u64,
            pub ds: u64,
            pub es: u64,
            pub fs: u64,
            pub gs: u64,
        }

        // https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/arch/x86/include/asm/fpu/types.h?h=v7.1.8#n36
        #[repr(C, align(16))]
        #[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
        pub struct fxregs_state {
            pub cwd: u16,
            pub swd: u16,
            pub twd: u16,
            pub fop: u16,
            pub rip: u64,
            pub rdp: u64,
            pub mxcsr: u32,
            pub mxcsr_mask: u32,
            pub st_space: [u32; 32],
            pub xmm_space: super::XmmSpace,
            #[serde(skip)]
            pub __padding: [u32; 12],
            #[serde(skip)]
            pub __padding1: [u32; 12],
        }

        unsafe impl PtraceRegisterSet for GenRegsTag {
            const NOTE: RegSetNote = NT_PRSTATUS;
            const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETREGS);
            const KERNEL_SIZE: usize = size_of::<user_regs_struct>();
            type Output = user_regs_struct;
        }

        unsafe impl PtraceRegisterSet for FpRegsTag {
            const NOTE: RegSetNote = NT_PRFPREG;
            const LEGACY_REQUEST: Option<PtraceRequestType> = Some(PTRACE_GETFPREGS);
            const KERNEL_SIZE: usize = size_of::<fxregs_state>();
            type Output = fxregs_state;
        }

        const _: () = {
            assert!(size_of::<user_regs_struct>() == 216);
            assert!(align_of::<user_regs_struct>() == 8);
            assert!(size_of::<fxregs_state>() == 512);
            assert!(align_of::<fxregs_state>() == 16);
        };
    }

    // std and serde don't implement Default, Deserialize, and Serialize traits for arrays longer
    // than 32 elements, so we have to hand-code them for the XMM array

    #[derive(Clone, Copy, Debug)]
    #[repr(transparent)]
    pub struct XmmSpace(pub [u32; 64]);

    impl Default for XmmSpace {
        fn default() -> XmmSpace {
            XmmSpace([0; 64])
        }
    }

    impl serde::Serialize for XmmSpace {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            use serde::ser::SerializeTuple;
            let mut tup = serializer.serialize_tuple(64)?;
            for element in self.0.iter() {
                tup.serialize_element::<u32>(element)?;
            }
            tup.end()
        }
    }

    impl<'de> serde::Deserialize<'de> for XmmSpace {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            struct Visitor;

            impl<'de> serde::de::Visitor<'de> for Visitor {
                type Value = XmmSpace;

                fn expecting(&self, formatter: &mut core::fmt::Formatter) -> core::fmt::Result {
                    write!(formatter, "a u32 array of length 64")
                }

                fn visit_seq<A: serde::de::SeqAccess<'de>>(
                    self,
                    mut seq: A,
                ) -> Result<Self::Value, A::Error> {
                    let mut arr = [0u32; 64];
                    for (idx, element) in arr.iter_mut().enumerate() {
                        *element = seq
                            .next_element::<u32>()?
                            .ok_or(<A::Error as serde::de::Error>::invalid_length(idx, &self))?;
                    }
                    Ok(XmmSpace(arr))
                }
            }

            deserializer.deserialize_tuple(64, Visitor)
        }
    }
}

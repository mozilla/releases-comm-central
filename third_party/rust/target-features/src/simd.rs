use crate::Architecture;

#[doc(hidden)]
pub enum SimdTypeImpl {
    Float32,
    Float64,
    Other,
}

/// Types which can be SIMD vector elements.
pub trait SimdType {
    #[doc(hidden)]
    const IMPL: SimdTypeImpl;
}

impl SimdType for u8 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for u16 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for u32 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for u64 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for usize {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for i8 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for i16 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for i32 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for i64 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for isize {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl SimdType for f32 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Float32;
}

impl SimdType for f64 {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Float64;
}

impl<T> SimdType for *const T {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl<T> SimdType for *mut T {
    const IMPL: SimdTypeImpl = SimdTypeImpl::Other;
}

impl crate::Target {
    /// Returns a suggested number of elements for a SIMD vector of the provided type.
    ///
    /// The returned value is an approximation and not necessarily indicative of the
    /// optimal vector width.  A few caveats:
    /// * Every instruction set is different, and this function doesn't take into account any
    /// particular operations--it's just a guess, and should be accurate at least for basic arithmetic.
    /// * Variable length vector instruction sets (ARM SVE and RISC-V V) only return the minimum
    /// vector length.
    pub const fn suggested_simd_width<T: SimdType>(&self) -> Option<usize> {
        let is_f32 = T::IMPL as u8 == SimdTypeImpl::Float32 as u8;
        let is_f64 = T::IMPL as u8 == SimdTypeImpl::Float64 as u8;

        let v128 = 16 / core::mem::size_of::<T>();
        let v256 = 32 / core::mem::size_of::<T>();
        let v512 = 64 / core::mem::size_of::<T>();
        let v1024 = 128 / core::mem::size_of::<T>();

        if let Architecture::Arm = self.architecture() {
            // Neon on arm doesn't support f64
            if self.supports_feature_str("neon") && !is_f64 {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::AArch64 = self.architecture() {
            if self.supports_feature_str("neon") {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::Hexagon = self.architecture() {
            // HVX doesn't support floats
            if is_f32 || is_f64 {
                None
            } else if self.supports_feature_str("hvx-length128b") {
                Some(v1024)
            } else if self.supports_feature_str("hvx") {
                Some(v512)
            } else {
                None
            }
        } else if let Architecture::Mips = self.architecture() {
            if self.supports_feature_str("msa") {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::PowerPC = self.architecture() {
            // Altivec without VSX doesn't support f64
            if self.supports_feature_str("vsx") || (self.supports_feature_str("altivec") && !is_f64)
            {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::RiscV = self.architecture() {
            // V provides at least 128-bit vectors
            if self.supports_feature_str("v") {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::Wasm = self.architecture() {
            if self.supports_feature_str("simd128") {
                Some(v128)
            } else {
                None
            }
        } else if let Architecture::X86 = self.architecture() {
            if self.supports_feature_str("avx512f") {
                Some(v512)
            } else if self.supports_feature_str("avx2")
                || (is_f32 || is_f64) && self.supports_feature_str("avx")
            {
                // AVX supports f32 and f64
                Some(v256)
            } else if self.supports_feature_str("sse2")
                || is_f32 && self.supports_feature_str("sse")
            {
                // SSE supports f32
                Some(v128)
            } else {
                None
            }
        } else {
            None
        }
    }
}

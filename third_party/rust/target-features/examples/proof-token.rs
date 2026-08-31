// This example demonstrates using `Target` to create a "proof token type", a token that
// demonstrates that particular target features have already been detected, and that those features
// can be used safely.

#![allow(unused, unused_macros, unused_imports)]

use target_features::Target;

/// Make sure proof tokens can't be improperly constructed
mod unconstructible {
    pub struct Unconstructible(());
    impl Unconstructible {
        pub unsafe fn new() -> Self {
            Self(())
        }
    }
}
use unconstructible::Unconstructible;

/// Proof of target feature support.
///
/// # Safety
/// The type must be implemented such that it's impossible to safely construct without ensuring the
/// specified target features are supported.
unsafe trait Proof: Sized {
    /// The proven target
    const TARGET: Target;

    /// Detect the support for the target features
    fn detect() -> Option<Self>;

    /// Assume the target features are supported
    ///
    /// # Safety
    /// Calling this is undefined if the target features are not supported
    unsafe fn assume() -> Self;
}

/// Make a proof token type for a particular set of features
macro_rules! make_target_proof {
    { $vis:vis struct $proof:ident($($feature:tt),*); } => {
        $vis struct $proof(Unconstructible);

        unsafe impl Proof for $proof {
            // Build on the already-known target features
            const TARGET: Target = target_features::CURRENT_TARGET$(.with_feature_str($feature))*;

            fn detect() -> Option<Self> {
                if true $(&& is_x86_feature_detected!($feature))* {
                    unsafe { Some(Self::assume()) }
                } else {
                    None
                }
            }

            unsafe fn assume() -> Self {
                Self(Unconstructible::new())
            }
        }
    }
}

/// A function that can only be called with the "avx" feature, or panics otherwise.
#[cfg(target_arch = "x86_64")]
fn safe_avx_fn<P: Proof>(_: P) {
    #[target_feature(enable = "avx")]
    unsafe fn unsafe_avx_fn() {
        println!("called an avx function")
    }

    // Future improvements to const generics might make it possible to assert this at compile time.
    // Since P::TARGET is const, this assert disappears if the required features are present.
    assert!(
        P::TARGET.supports_feature_str("avx"),
        "avx feature not supported"
    );
    unsafe { unsafe_avx_fn() }
}

#[cfg(target_arch = "x86_64")]
fn main() {
    // The function can be called with the exact features
    make_target_proof! {
        struct Avx("avx");
    }
    if let Some(proof) = Avx::detect() {
        safe_avx_fn(proof);
    }

    // The function can also be called with a target that implies the required features
    make_target_proof! {
        struct Avx2("avx2");
    }
    if let Some(proof) = Avx2::detect() {
        safe_avx_fn(proof);
    }

    // This panics, unless compiled with something like `-Ctarget-feature=+avx`
    make_target_proof! {
        struct Aes("aes");
    }
    if let Some(proof) = Aes::detect() {
        safe_avx_fn(proof);
    }
}

#[cfg(not(target_arch = "x86_64"))]
fn main() {}

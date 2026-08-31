use target_features::{Architecture, Feature, Target};

#[test]
fn cpu() {
    let mut features = Target::from_cpu(Architecture::X86, "x86-64-v2")
        .unwrap()
        .features()
        .map(|f| f.name())
        .collect::<Vec<_>>();
    features.sort();
    assert_eq!(
        &features,
        &[
            "cmpxchg16b",
            "fxsr",
            "lahfsahf",
            "popcnt",
            "sse",
            "sse2",
            "sse3",
            "sse4.1",
            "sse4.2",
            "ssse3",
        ]
    );
}

#[test]
fn unknown_cpu() {
    let _ = Target::from_cpu(Architecture::X86, "this-doesn't-exist").unwrap_err();
}

#[test]
fn unknown_feature() {
    let _ = Feature::new(Architecture::X86, "this-doesn't-exist").unwrap_err();
}

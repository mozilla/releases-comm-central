use std::{collections::HashMap, error::Error, fs::File, io::Write, path::Path};

fn main() -> Result<(), Box<dyn Error>> {
    let rustc_version = include_str!("rustc-version.txt").trim();
    let target_features = include_str!("target-features.txt");
    let target_cpus = include_str!("target-cpus.txt");
    let out_dir = std::env::var_os("OUT_DIR").unwrap();

    // Parse the generated features file
    let mut lines = target_features.lines().peekable();
    let mut features = Vec::new();
    while lines.peek().is_some() {
        let feature = lines
            .next()
            .unwrap()
            .strip_prefix("feature =")
            .unwrap()
            .trim();
        let arch = lines.next().unwrap().strip_prefix("arch =").unwrap().trim();
        let implies = lines
            .next()
            .unwrap()
            .strip_prefix("implies =")
            .unwrap()
            .trim()
            .split(' ')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        let description = lines
            .next()
            .unwrap()
            .strip_prefix("description =")
            .unwrap()
            .trim();
        let _ = lines.next();
        features.push((feature, arch, description, implies));
    }

    // Parse the generated CPUs file
    let mut lines = target_cpus.lines().peekable();
    let mut cpus = Vec::new();
    while lines.peek().is_some() {
        let cpu = lines.next().unwrap().strip_prefix("cpu =").unwrap().trim();
        let arch = lines.next().unwrap().strip_prefix("arch =").unwrap().trim();
        let features = lines
            .next()
            .unwrap()
            .strip_prefix("features =")
            .unwrap()
            .trim()
            .split(' ')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        let _ = lines.next();
        cpus.push((cpu, arch, features));
    }

    // Write the generated docs
    let mut rustc_docs = File::create(Path::new(&out_dir).join("generated.md"))?;
    writeln!(rustc_docs, "Generated with {rustc_version}.")?;

    // Write a module
    let mut module = File::create(Path::new(&out_dir).join("generated.rs"))?;

    // Generate the features array
    writeln!(
        module,
        "const FEATURES: &[(crate::Architecture, &str, &str, &[Feature])] = &["
    )?;
    for (feature, arch, description, implies) in &features {
        let implies = implies
            .iter()
            .map(|implied_feature| {
                format!(
                    "Feature({})",
                    features
                        .iter()
                        .position(|(f, a, _, _)| implied_feature == f && arch == a)
                        .unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        writeln!(
            module,
            "    (crate::Architecture::{arch}, \"{feature}\", \"{description}\", &[{implies}]),"
        )?;
    }
    writeln!(module, "];")?;

    // Generate the CPUs array
    writeln!(
        module,
        "const CPUS: &[(crate::Architecture, &str, &[Feature])] = &["
    )?;
    for (cpu, arch, cpu_features) in &cpus {
        let cpu_features = cpu_features
            .iter()
            .map(|feature| {
                format!(
                    "Feature({})",
                    features
                        .iter()
                        .position(|(f, a, _, _)| feature == f && arch == a)
                        .unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        writeln!(
            module,
            "    (crate::Architecture::{arch}, \"{cpu}\", &[{cpu_features}]),"
        )?;
    }
    writeln!(module, "];")?;

    let build_features = std::env::var("CARGO_CFG_TARGET_FEATURE")
        .map(|x| x.split(',').map(ToString::to_string).collect())
        .unwrap_or_else(|_| Vec::new());
    let build_arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
        "arm" => "Arm",
        "aarch64" => "AArch64",
        "bpf" => "Bpf",
        "hexagon" => "Hexagon",
        "mips" | "mips64" => "Mips",
        "powerpc" | "powerpc64" => "PowerPC",
        "riscv32" | "riscv64" => "RiscV",
        "wasm32" | "wasm64" => "Wasm",
        "x86" | "x86_64" => "X86",
        _ => "Unsupported",
    };
    writeln!(module, "/// The target of the current build.")?;
    writeln!(module, "#[allow(clippy::let_and_return)]")?;
    writeln!(module, "pub const CURRENT_TARGET: Target = {{")?;
    writeln!(module, "    let arch = Architecture::{build_arch};")?;
    writeln!(module, "    let target = Target::new(arch);")?;
    for feature in build_features {
        writeln!(module, "    let target = if let Ok(feature) = Feature::new(arch, \"{feature}\") {{ target.with_feature(feature) }} else {{ target }};")?;
    }
    writeln!(module, "    target")?;
    writeln!(module, "}};")?;

    // Generate the features docs
    let mut docs = File::create(Path::new(&out_dir).join("docs.rs"))?;
    let mut by_arch = HashMap::<_, (Vec<_>, Vec<_>)>::new();
    for (feature, arch, description, implies) in features {
        by_arch
            .entry(arch)
            .or_default()
            .0
            .push((feature, description, implies));
    }
    for (cpu, arch, features) in cpus {
        by_arch.entry(arch).or_default().1.push((cpu, features));
    }
    let mut by_arch = by_arch.drain().collect::<Vec<_>>();
    by_arch.sort();
    for (arch, (features, cpus)) in by_arch.drain(..) {
        writeln!(docs, "/// {} documentation", arch.to_lowercase())?;
        writeln!(docs, "///")?;
        writeln!(docs, "/// ## Features")?;
        writeln!(
            docs,
            "/// | Feature | Description | Also Enables<sup>†</sup> |"
        )?;
        writeln!(
            docs,
            "/// | ------- | ----------- | ------------------------ |"
        )?;
        for (feature, description, implies) in features {
            write!(docs, "/// | `{feature}` | {description} | ")?;
            for (i, feature) in implies.into_iter().enumerate() {
                if i != 0 {
                    write!(docs, ", ")?;
                }
                write!(docs, "`{feature}`")?;
            }
            writeln!(docs, " |")?;
        }
        writeln!(docs, "///")?;
        writeln!(docs, "/// <sup>†</sup> This is often empirical, rather than specified in any standard, i.e. all available CPUs with a particular feature also have another feature.")?;
        writeln!(docs, "///")?;
        writeln!(docs, "/// ## CPUs")?;
        writeln!(docs, "/// | CPU | Enabled Features |")?;
        writeln!(docs, "/// | --- | -------- |")?;
        for (cpu, features) in cpus {
            writeln!(
                docs,
                "/// | `{cpu}` | {} |",
                features
                    .iter()
                    .map(|f| format!("`{f}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            )?;
        }
        writeln!(docs, "pub mod {} {{}}", arch.to_lowercase())?;
    }

    // Rerun build if the source features changed
    println!("cargo:rerun-if-changed=rustc-version.txt");
    println!("cargo:rerun-if-changed=target-features.txt");
    println!("cargo:rerun-if-changed=target-cpus.txt");
    println!("cargo:rerun-if-changed=build.rs");
    Ok(())
}

// Copyright © 2018 Mozilla Foundation
//
// This program is made available under an ISC-style license.  See the
// accompanying file LICENSE for details.

#[cfg(not(feature = "gecko-in-tree"))]
extern crate cmake;
#[cfg(not(feature = "gecko-in-tree"))]
extern crate pkg_config;

use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

macro_rules! t {
    ($e:expr) => {
        match $e {
            Ok(e) => e,
            Err(e) => panic!("{} failed with {}", stringify!($e), e),
        }
    };
}

#[cfg(feature = "gecko-in-tree")]
fn main() {}

#[cfg(not(feature = "gecko-in-tree"))]
fn main() {
    if env::var("LIBCUBEB_SYS_USE_PKG_CONFIG").is_ok()
        && pkg_config::find_library("libcubeb").is_ok()
    {
        return;
    }

    let _ = fs::remove_dir_all(env::var("OUT_DIR").unwrap());
    t!(fs::create_dir_all(env::var("OUT_DIR").unwrap()));

    env::remove_var("DESTDIR");

    // Copy libcubeb to the output directory.
    let libcubeb_path = format!("{}/libcubeb", env::var("OUT_DIR").unwrap());
    t!(Command::new("cp")
        .args(["-r", "libcubeb", &env::var("OUT_DIR").unwrap(),])
        .status());

    fn visit_dirs(dir: &Path, cb: &dyn Fn(&fs::DirEntry)) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, cb)?;
                } else {
                    cb(&entry);
                }
            }
        }
        Ok(())
    }
    // For packaged build: rename libcubeb Cargo.toml.in files to Cargo.toml.
    t!(visit_dirs(Path::new(&libcubeb_path), &|entry| {
        let path = entry.path();
        if path
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .ends_with("Cargo.toml.in")
        {
            let new_path = path.with_file_name("Cargo.toml");
            fs::rename(&path, &new_path).unwrap();
        }
    }));

    let target = env::var("TARGET").unwrap();
    let windows = target.contains("windows");
    let darwin = target.contains("darwin");
    let freebsd = target.contains("freebsd");
    let android = target.contains("android");
    let mut cfg = cmake::Config::new(&libcubeb_path);

    if darwin {
        let cmake_osx_arch = if target.contains("aarch64") {
            // Apple Silicon
            "arm64"
        } else {
            // Assuming Intel (x86_64)
            "x86_64"
        };
        cfg.define("CMAKE_OSX_ARCHITECTURES", cmake_osx_arch);
    }

    // Do not build the rust backends for tests: doing so causes duplicate
    // symbol definitions.
    let build_rust_libs = cfg!(not(feature = "unittest-build")) && env::var("DOCS_RS").is_err();
    let dst = cfg
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("BUILD_TESTS", "OFF")
        .define("BUILD_TOOLS", "OFF")
        .define(
            "BUILD_RUST_LIBS",
            if build_rust_libs { "ON" } else { "OFF" },
        )
        .define("USE_STATIC_MSVC_RUNTIME", "ON")
        // Force rust libs to include target triple when outputting,
        // for easier linking when cross-compiling.
        .env("CARGO_BUILD_TARGET", &target)
        .build();

    let debug = env::var("PROFILE").unwrap() == "debug";

    println!("cargo:rustc-link-lib=static=cubeb");
    if windows {
        println!("cargo:rustc-link-lib=dylib=avrt");
        println!("cargo:rustc-link-lib=dylib=ksuser");
        println!("cargo:rustc-link-lib=dylib=ole32");
        println!("cargo:rustc-link-lib=dylib=user32");
        println!("cargo:rustc-link-lib=dylib=winmm");
        println!("cargo:rustc-link-search=native={}/lib", dst.display());
        if debug {
            println!("cargo:rustc-link-lib=msvcrtd");
        }
    } else if darwin {
        println!("cargo:rustc-link-lib=framework=AudioUnit");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-lib=framework=CoreServices");
        println!("cargo:rustc-link-lib=dylib=c++");

        // Do not link the rust backends for tests: doing so causes duplicate
        // symbol definitions.
        if build_rust_libs {
            println!("cargo:rustc-link-lib=static=cubeb_coreaudio");
            let mut search_path = std::env::current_dir().unwrap();
            search_path.push(&(libcubeb_path + "/src/cubeb-coreaudio-rs/target"));
            search_path.push(&target);
            if debug {
                search_path.push("debug");
            } else {
                search_path.push("release");
            }
            println!("cargo:rustc-link-search=native={}", search_path.display());
        }

        println!("cargo:rustc-link-search=native={}/lib", dst.display());
    } else {
        if freebsd || android {
            println!("cargo:rustc-link-lib=dylib=c++");
        } else {
            println!("cargo:rustc-link-lib=dylib=stdc++");
        }
        println!("cargo:rustc-link-search=native={}/lib", dst.display());
        println!("cargo:rustc-link-search=native={}/lib64", dst.display());

        // Ignore the result of find_library. We don't care if the
        // libraries are missing.
        let _ = pkg_config::find_library("alsa");
        if pkg_config::find_library("libpulse").is_ok() {
            // Do not link the rust backends for tests: doing so causes duplicate
            // symbol definitions.
            if build_rust_libs {
                println!("cargo:rustc-link-lib=static=cubeb_pulse");
                let mut search_path = std::env::current_dir().unwrap();
                search_path.push(&(libcubeb_path + "/src/cubeb-pulse-rs/target"));
                search_path.push(&target);
                if debug {
                    search_path.push("debug");
                } else {
                    search_path.push("release");
                }
                println!("cargo:rustc-link-search=native={}", search_path.display());
            }
        }
        let _ = pkg_config::find_library("jack");
        let _ = pkg_config::find_library("speexdsp");
        if android {
            println!("cargo:rustc-link-lib=dylib=OpenSLES");
        }
    }
}

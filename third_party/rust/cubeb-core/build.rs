use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let versioned = format!(
        "rust_write_formatted_msg_{}_{}_{}",
        env!("CARGO_PKG_VERSION_MAJOR"),
        env!("CARGO_PKG_VERSION_MINOR"),
        env!("CARGO_PKG_VERSION_PATCH")
    );

    let mut cfg = cc::Build::new();
    cfg.file("src/log.c");
    cfg.define("RUST_WRITE_FORMATTED_MSG", Some(versioned.as_str()));
    cfg.compile("cubeb_log_wrap");

    let out_dir = env::var_os("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("log_wrap.rs");
    fs::write(
        &dest_path,
        format!(
            r#"
            #[allow(clippy::missing_safety_doc)]
            #[no_mangle]
            pub unsafe extern "C" fn {}(s: *const c_char) {{
                rust_write_formatted_msg(s);
            }}
        "#,
            versioned
        ),
    )
    .unwrap();

    println!("cargo::rerun-if-changed=src/log.c");
    println!("cargo::rerun-if-changed=build.rs");
}

use std::env;
use std::fs::File;
use std::io::prelude::*;
use std::path::Path;

use dbus_codegen::{generate, GenOpts, ServerAccess};

fn generate_code(interfaces: &[(&str, GenOpts)], outfile: &str) {
    let mut code = String::new();
    for (n, (file, opts)) in interfaces.iter().enumerate() {
        let mut f = File::open(file).unwrap();
        let mut xml = String::new();
        f.read_to_string(&mut xml).unwrap();
        code.push_str(&format!("mod n{} {{\n", n));
        code.push_str(&generate(&xml, &opts).unwrap());
        code.push_str(&format!("\n}}\npub use n{}::*;\n", n));
    }
    let out_dir = env::var("OUT_DIR").unwrap();
    let path = Path::new(&out_dir).join(outfile);
    let mut f = File::create(path).unwrap();
    (&mut f as &mut dyn Write)
        .write_all(code.as_bytes())
        .unwrap();
}

fn main() {
    generate_code(
        &[
            (
                "dbus_interfaces/StatusNotifierWatcher.xml",
                GenOpts {
                    methodtype: None,
                    skipprefix: Some("org.kde.".into()),
                    ..Default::default()
                },
            ),
            (
                "dbus_interfaces/StatusNotifierItem.xml",
                GenOpts {
                    serveraccess: ServerAccess::AsRefClosure,
                    skipprefix: Some("org.kde.".into()),
                    ..Default::default()
                },
            ),
            (
                "dbus_interfaces/DBusMenu.xml",
                GenOpts {
                    serveraccess: ServerAccess::AsRefClosure,
                    skipprefix: Some("com.canonical.".into()),
                    ..Default::default()
                },
            ),
        ],
        "dbus_interfaces.rs",
    );
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! A program for turning [Microsoft OpenAPI
//! metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml)
//! into Rust types.

use quote::quote;
use std::{env, fs, io::Write};

mod extract;
mod naming;
mod openapi;
mod oxidize;

use crate::extract::path::extract_from_oa_path;
use crate::extract::schema::{extract_from_schema, Property};
use crate::naming::{pascalize, simple_name, snakeify};
use crate::openapi::{load_yaml, path::OaPath, LoadedYaml};
use crate::oxidize::types;

const SUPPORTED_TYPES: [&str; 4] = ["user", "mailboxSettings", "directoryObject", "entity"];
const SUPPORTED_PATHS: [&str; 1] = ["/me"];

const FILE_LEDE: &str = r#"/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN
"#;

const GENERATION_DISCLOSURE: &str = "Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`.";

fn print_usage(this_program: &str) {
    println!("Usage: {this_program} <openapi.yaml> <graph_tb_path>");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        let this_program = args
            .first()
            .map(String::as_str)
            .unwrap_or("ms_graph_tb_extract");
        print_usage(this_program);
        std::process::exit(1);
    }

    let yaml_path = std::path::Path::new(&args[1]);
    let out_dir = std::path::Path::new(&args[2]);
    let paths_dir = out_dir.join("src/paths/");
    let types_dir = out_dir.join("src/types/");

    let yaml = fs::read_to_string(yaml_path)?;
    println!("file read");
    let LoadedYaml { paths, schemas } = load_yaml(&yaml)?;
    println!("loaded paths and schemas");

    let mut modules = vec![];
    for (name, path) in &paths {
        if SUPPORTED_PATHS.contains(&name.as_str()) {
            println!("generating Rust type for {name} request");
            process_path(out_dir, name, path)?;
            modules.push(snakeify(name));
        }
    }
    modules.sort();
    write_module_file(&paths_dir, &modules)?;

    let mut modules = vec![];
    for (full_name, schema) in &schemas {
        let simple = simple_name(full_name);
        if SUPPORTED_TYPES.contains(&simple) {
            println!("generating Rust type for {full_name}");
            let (description, props) = extract_from_schema(schema);
            process_schema(out_dir, simple, description, props)?;
            modules.push(snakeify(simple));
        }
    }
    modules.sort();
    write_module_file(&types_dir, &modules)?;

    Ok(())
}

fn process_path(
    out_dir: &std::path::Path,
    name: &str,
    path: &OaPath,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = extract_from_oa_path(name.to_string(), path);
    let generated = quote!(#path);

    let out_dir = out_dir.join("src/paths/");
    let filename = format!("{}.rs", snakeify(name));
    let destination = out_dir.join(filename);
    let mut file = fs::File::create(&destination)?;

    write!(file, "{FILE_LEDE}\n{generated}")?;
    println!(
        "Wrote generated path to {}\n",
        destination.to_string_lossy()
    );
    Ok(())
}

fn process_schema(
    out_dir: &std::path::Path,
    name: &str,
    description: Option<String>,
    properties: Vec<Property>,
) -> Result<(), Box<dyn std::error::Error>> {
    let graph_type = types::GraphType::new(name, description, properties);
    let generated = quote!(#graph_type);

    let out_dir = out_dir.join("src/types/");
    let filename = format!("{}.rs", snakeify(name));
    let destination = out_dir.join(filename);
    let mut file = fs::File::create(&destination)?;

    write!(file, "{FILE_LEDE}\n{generated}")?;
    println!(
        "Wrote generated Rust types to {}\n",
        destination.to_string_lossy()
    );
    Ok(())
}

fn write_module_file(
    out_dir: &std::path::Path,
    modules: &[impl AsRef<str>],
) -> Result<(), Box<dyn std::error::Error>> {
    let module_path = out_dir.join("mod.rs");
    let mut module_file = fs::File::create(&module_path)?;
    writeln!(module_file, "{FILE_LEDE}")?;
    for module in modules {
        writeln!(module_file, "pub mod {};", module.as_ref())?;
    }
    println!("Wrote module out to {}\n", module_path.to_string_lossy());
    Ok(())
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! A program for turning [Microsoft OpenAPI
//! metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml)
//! into Rust types.

use quote::quote;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::{env, fs, io::Write};

mod extract;
mod naming;
mod openapi;
mod oxidize;

use crate::extract::path::extract_from_oa_path;
use crate::extract::schema::{Property, extract_from_schema};
use crate::naming::{base_name, simple_name, snakeify};
use crate::openapi::{LoadedYaml, load_yaml, path::OaPath};
use crate::oxidize::types;

const SUPPORTED_TYPES: [&str; 6] = [
    "directoryObject",
    "entity",
    "mailboxSettings",
    "message",
    "sendMailRequestBody",
    "user",
];
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

    // Schemas come with a hierarchy, and different schemas at different levels
    // might have the same name (e.g. `microsoft.graph.user` vs
    // `microsoft.graph.security.user`), so we replicate this hierarchy with
    // modules in the final crate.
    let mut modules: BTreeMap<PathBuf, Vec<String>> = BTreeMap::new();

    for (full_name, schema) in &schemas {
        let simple_name = simple_name(full_name);
        let base_name = base_name(full_name);
        if SUPPORTED_TYPES.contains(&base_name.as_str()) {
            println!("generating Rust type for {full_name}");

            let (description, props) = extract_from_schema(schema);
            let schema_path = naming::path(full_name);

            process_schema(out_dir, &schema_path, simple_name, description, props)?;

            modules
                .entry(schema_path)
                .or_default()
                .push(snakeify(simple_name));
        }
    }

    // For each path in the map, create a new `mod.rs` that exports the
    // corresponding modules, and ensure it's correctly exported throughout the
    // hierarchy.
    modules
        .into_iter()
        .map(|(path, mut modules)| {
            modules.sort();
            let module_dir = types_dir.join(path);
            write_module_file(&module_dir, &modules)?;
            ensure_module_in_hierarchy(&types_dir, &module_dir)?;
            Ok(())
        })
        .collect::<Result<Vec<()>, Box<dyn std::error::Error>>>()?;

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
    schemas_dir: &std::path::Path,
    schema_path: &std::path::Path,
    simple_name: &str,
    description: Option<String>,
    properties: Vec<Property>,
) -> Result<(), Box<dyn std::error::Error>> {
    let graph_type = types::GraphType::new(simple_name, description, properties);
    let generated = quote!(#graph_type);

    let output_dir = schemas_dir
        .join("src/types/")
        // If the type is at the top-level, `schema_path` is empty, and joining
        // on it will essentially be a no-op.
        .join(schema_path);

    // Ensure the destination folder exists, even if the schema isn't at the top
    // level of the hierarchy.
    fs::create_dir_all(&output_dir)?;

    let filename = format!("{}.rs", snakeify(simple_name));
    let destination = output_dir.join(filename);
    let mut file = fs::File::create(&destination)?;

    write!(file, "{FILE_LEDE}\n{generated}")?;
    println!(
        "Wrote generated Rust types to {}\n",
        destination.to_string_lossy()
    );
    Ok(())
}

/// Write a `mod.rs` file at the given path and populate it with the given list
/// of modules (i.e. write the corresponding `pub mod` lines into the file).
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

/// Ensures that a module is correctly included throughout the crate's
/// hierarchy.
///
/// This is particularly helpful for schemas, which come with a non-flat
/// hierarchy; meaning the `types` module might end up with multiple
/// sub-modules, which need to be included in the relevant `mod.rs` files.
///
/// This function walks backwards (recursively) through the folder hierarchy to ensure each
/// step has a `mod.rs` file which includes the parent.
fn ensure_module_in_hierarchy(
    base_out_dir: &std::path::Path,
    module_path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    if base_out_dir == module_path {
        // We've reached the top level, meaning we should have finished our job
        // for this module.
        return Ok(());
    }

    let module_name = module_path
        .file_name()
        .expect("invalid module path: cannot get name")
        .to_str()
        .expect("the module name isn't valid unicode");

    let parent = module_path
        .parent()
        .expect("invalid module path: cannot get parent");

    // Check if the parent has a `mod.rs` file, so we can preserve its content
    // before rewriting it.
    let mod_file_path = parent.join("mod.rs");
    if mod_file_path.try_exists()? {
        let mod_file_content = fs::read_to_string(&mod_file_path)?;
        let mod_pub_line = format!("pub mod {module_name};");

        if !mod_file_content.contains(mod_pub_line.as_str()) {
            add_module_to_mod_file(&mod_file_path, &mod_file_content, module_name)?;
        }
    } else {
        add_module_to_mod_file(&mod_file_path, FILE_LEDE, module_name)?;
    };

    // We've ensured the module is included in the current level of the
    // hierarchy, now go one step higher and do this again.
    ensure_module_in_hierarchy(base_out_dir, parent)
}

/// Overwrites the `mod.rs` file referred to by `mod_file_path` (or creates it
/// if it didn't already exist). `prefix` is first written into the file,
/// followed by the `pub mod` line for the module.
fn add_module_to_mod_file(
    mod_file_path: &std::path::Path,
    prefix: &str,
    module_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut file = fs::File::create(mod_file_path)?;
    writeln!(file, "{prefix}")?;
    writeln!(file, "pub mod {module_name};")?;
    Ok(())
}

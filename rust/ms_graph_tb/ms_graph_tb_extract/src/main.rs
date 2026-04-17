/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! A program for turning [Microsoft OpenAPI
//! metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml)
//! into Rust types.

use env_logger::Env;
use log::info;
use quote::quote;
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::Path;
use std::sync::LazyLock;
use std::{env, error::Error, fs, io, io::Write};

mod extract;
mod module_hierarchy;
mod naming;
mod openapi;
mod oxidize;

use crate::extract::path::extract_from_oa_path;
use crate::extract::schema::{Property, SchemaContext, SchemaKind, extract_from_schema};
use crate::module_hierarchy::{ModuleHierarchy, ModuleHierarchyElement, ModuleName};
use crate::naming::{base_name, simple_name};
use crate::openapi::{LoadedYaml, load_yaml, path::OaPath};
use crate::oxidize::{ModuleFile, paths::PathModule, types};

const FILE_LEDE: &str = r#"/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN
"#;

const GENERATION_DISCLOSURE: &str = "Auto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`.";

const SUPPORTED_TYPES_FILE: &str = "supported_types.txt";
const SUPPORTED_PATHS_FILE: &str = "supported_paths.txt";
pub(crate) static SUPPORTED_TYPES: LazyLock<HashSet<String>> = LazyLock::new(|| {
    load_supported_values(SUPPORTED_TYPES_FILE).expect("supported_types.txt must load")
});
pub(crate) static SUPPORTED_PATHS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    load_supported_values(SUPPORTED_PATHS_FILE).expect("supported_paths.txt must load")
});

fn print_usage(this_program: &str) {
    println!("Usage: {this_program} <openapi.yaml> <graph_tb_path>");
}

fn main() -> Result<(), Box<dyn Error>> {
    env_logger::Builder::from_env(Env::default().default_filter_or("warn")).init();

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
    info!("read {}", yaml_path.display());
    let LoadedYaml { paths, schemas } = load_yaml(&yaml)?;
    info!("loaded paths and schemas");

    generate_paths(out_dir, &paths, &paths_dir)?;
    generate_types(out_dir, &schemas, &types_dir)?;

    Ok(())
}

/// Read the file at `filename` and parse it as a hash set of lines of supported
/// types/paths.
fn load_supported_values(filename: &str) -> Result<HashSet<String>, Box<dyn Error>> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(filename);
    let contents = fs::read_to_string(&path)?;
    let values = contents
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_owned)
        .collect::<HashSet<_>>();

    if values.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} did not contain any supported values", path.display()),
        )
        .into());
    }

    info!("loaded {} entries from {}", values.len(), path.display());
    Ok(values)
}

fn generate_paths(
    out_dir: &Path,
    paths: &BTreeMap<String, OaPath>,
    paths_dir: &Path,
) -> Result<(), Box<dyn Error>> {
    let supported_path_entries = paths
        .iter()
        .filter(|(name, _)| SUPPORTED_PATHS.contains(name.as_str()))
        .collect::<Vec<_>>();
    let module_names = supported_path_entries
        .iter()
        .map(|(name, _)| ModuleHierarchyElement::from_api_path(name))
        .collect::<BTreeSet<_>>();
    let module_hierarchy = ModuleHierarchy::new(module_names.iter().cloned());

    // Sometimes operations will have `new()` functions that take no arguments
    // (mainly GET requests with no template expressions), which clippy lints as
    // needing a `Default` implementation. Having some operations provide
    // `Default` and others not seems needlessly inconsistent, so just disable
    // that lint for path modules.
    let root_module =
        &ModuleFile::new(module_hierarchy.root_modules()).allow_lints(&["new_without_default"]);
    write_generated_file(&paths_dir.join("mod.rs"), &quote!(#root_module))?;

    for (name, path) in supported_path_entries {
        info!("generating Rust type for {name} request");
        let module_path = ModuleHierarchyElement::from_api_path(name);
        process_path(
            out_dir,
            name,
            path,
            module_hierarchy.child_modules(&module_path),
        )?;
    }

    // create (mostly empty) modules for ancestors we don't support
    for (module_path, child_modules) in module_hierarchy.intermediate_modules() {
        let modules = &ModuleFile::new(child_modules);
        let destination = paths_dir.join(module_path.file_path());
        write_generated_file(&destination, &quote!(#modules))?;
        info!(
            "wrote intermediate path module to {}",
            destination.display()
        );
    }

    Ok(())
}

fn generate_types(
    out_dir: &Path,
    schemas: &BTreeMap<String, openapi::schema::OaSchema>,
    types_dir: &Path,
) -> Result<(), Box<dyn Error>> {
    let mut type_namespaces = BTreeSet::new();
    let mut direct_type_modules = Vec::new();

    for (full_name, schema) in schemas {
        let simple_name = simple_name(full_name);
        let base_name = base_name(full_name);
        if SUPPORTED_TYPES.contains(base_name) {
            info!("generating Rust type for {full_name}");

            let (description, props) = extract_from_schema(
                schema,
                SchemaContext {
                    kind: SchemaKind::Other,
                    is_delta: false,
                },
            );
            let schema_path = ModuleHierarchyElement::from_schema(full_name);
            let schema_namespace = schema_path.namespace();
            let module_name = schema_path
                .leaf()
                .expect("schema paths should have a leaf")
                .clone();

            process_schema(out_dir, &schema_path, simple_name, description, props)?;

            direct_type_modules.push((schema_namespace.clone(), module_name));
            if !schema_namespace.is_root() {
                type_namespaces.insert(schema_namespace);
            }
        }
    }

    let mut type_module_hierarchy = ModuleHierarchy::new(type_namespaces);

    for (schema_namespace, module_name) in direct_type_modules {
        type_module_hierarchy.add_direct_module(schema_namespace, module_name);
    }

    let type_module_paths = type_module_hierarchy.module_paths();

    for module_path in type_module_paths {
        let exported_modules = type_module_hierarchy.exported_modules_for(&module_path);
        if exported_modules.is_empty() {
            continue;
        }

        let modules = &ModuleFile::new(&exported_modules);
        let destination = if module_path.is_root() {
            types_dir.join("mod.rs")
        } else {
            types_dir.join(module_path.file_path())
        };
        write_generated_file(&destination, &quote!(#modules))?;
    }

    Ok(())
}

fn process_path(
    out_dir: &std::path::Path,
    name: &str,
    path: &OaPath,
    child_modules: &[ModuleName],
) -> Result<(), Box<dyn Error>> {
    let path = extract_from_oa_path(name.to_string(), path);
    let path_module = PathModule {
        path: &path,
        child_modules,
    };
    let generated = quote!(#path_module);

    let module_path = ModuleHierarchyElement::from_api_path(name);
    let mut destination = out_dir.join("src/paths/");
    destination.push(module_path.file_path());
    write_generated_file(&destination, &generated)?;
    info!("wrote generated path to {}", destination.display());
    Ok(())
}

fn process_schema(
    schemas_dir: &std::path::Path,
    schema_path: &ModuleHierarchyElement,
    simple_name: &str,
    description: Option<String>,
    properties: Vec<Property>,
) -> Result<(), Box<dyn Error>> {
    let graph_type =
        types::GraphType::new(simple_name, description, properties, types::TypeKind::Named);
    let generated = quote!(#graph_type);

    let destination = schemas_dir.join("src/types/").join(schema_path.file_path());

    write_generated_file(&destination, &generated)?;
    info!("wrote generated Rust types to {}", destination.display());
    Ok(())
}

/// Write the file lede then generated content to the file path in
/// `destination`, creating all necessary parent directories.
fn write_generated_file(
    destination: &std::path::Path,
    generated: &impl std::fmt::Display,
) -> Result<(), Box<dyn Error>> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(destination)?;
    write!(file, "{FILE_LEDE}\n{generated}")?;
    Ok(())
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;

use crate::naming::{base_name, raw_snakeify, snakeify};
use proc_macro2::{Ident, Span};

/// The name of a module, which can then be converted into a (filesystem) path
/// segment or rust identifier.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ModuleName(String);

impl ModuleName {
    pub fn from_raw_segment(s: &str) -> Self {
        Self(raw_snakeify(s))
    }

    /// Get the name as a valid name for a file path segment.
    pub fn as_path_segment(&self) -> &str {
        &self.0
    }

    /// Get the name as a valid Rust identifier, applying raw identifier syntax as needed.
    pub fn as_rust_ident(&self) -> Ident {
        let ident = snakeify(&self.0);
        if let Some(raw) = ident.strip_prefix("r#") {
            Ident::new_raw(raw, Span::call_site())
        } else {
            Ident::new(&ident, Span::call_site())
        }
    }
}

impl AsRef<str> for ModuleName {
    fn as_ref(&self) -> &str {
        self.as_path_segment()
    }
}

/// A representation of a module name and its parents.
///
/// A `ModuleHierarchyElement` may represent either an API path module or a
/// schema module, including the leaf type module.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct ModuleHierarchyElement {
    segments: Vec<ModuleName>,
}

impl ModuleHierarchyElement {
    /// Build a generated module path from an OpenAPI/Graph API path.
    pub fn from_api_path(path: &str) -> Self {
        let path = path.trim_matches('/');
        assert!(!path.is_empty(), "invalid api path: {path}");

        let segments = path.split('/').map(ModuleName::from_raw_segment).collect();
        Self { segments }
    }

    /// Constructor taking a schema name.
    ///
    /// For example, "microsoft.graph.security.user" will have ["security",
    /// "user"] as its path.
    pub fn from_schema(schema: &str) -> Self {
        // Strip out the type's prefix.
        let path = base_name(schema);
        assert!(!path.is_empty(), "invalid type name: {schema}");

        let parts = path.split('.').map(ModuleName::from_raw_segment).collect();
        Self { segments: parts }
    }

    /// Create a hierarchy node representing the root module (whether path or type).
    pub fn root() -> Self {
        Self { segments: vec![] }
    }

    /// Whether this module is the root module (i.e., has no name or parents).
    pub fn is_root(&self) -> bool {
        self.segments.is_empty()
    }

    fn from_slice(slice: &[ModuleName]) -> Self {
        Self {
            segments: slice.into(),
        }
    }

    /// The name of the module itself.
    ///
    /// Returns `None` if this is the root module.
    pub fn leaf(&self) -> Option<&ModuleName> {
        self.segments.last()
    }

    /// The parent of this module.
    pub fn namespace(&self) -> Self {
        self.segments
            .split_last()
            .map(|(_, parents)| Self::from_slice(parents))
            .unwrap_or_else(Self::root)
    }

    /// Get the relative file path where this module should be saved.
    pub fn file_path(&self) -> PathBuf {
        let (module_name, parents) = self
            .segments
            .split_last()
            .expect("called `file_path` on a root");
        let module_file = format!("{}.rs", module_name.as_path_segment());
        let mut path_buf: PathBuf = parents.iter().map(ModuleName::as_path_segment).collect();
        path_buf.push(module_file);
        path_buf
    }
}

pub struct ModuleHierarchy {
    concrete_modules: BTreeSet<ModuleHierarchyElement>,
    child_modules: BTreeMap<ModuleHierarchyElement, Vec<ModuleName>>,
    direct_modules: BTreeMap<ModuleHierarchyElement, BTreeSet<ModuleName>>,
}

impl ModuleHierarchy {
    pub fn new(modules: impl IntoIterator<Item = ModuleHierarchyElement>) -> Self {
        let concrete_modules = modules.into_iter().collect::<BTreeSet<_>>();
        let child_modules = Self::build_child_modules(&concrete_modules);

        Self {
            concrete_modules,
            child_modules,
            direct_modules: BTreeMap::new(),
        }
    }

    fn build_child_modules(
        concrete_modules: &BTreeSet<ModuleHierarchyElement>,
    ) -> BTreeMap<ModuleHierarchyElement, Vec<ModuleName>> {
        concrete_modules
            .iter()
            .cloned()
            .fold(
                BTreeMap::<ModuleHierarchyElement, BTreeSet<ModuleName>>::new(),
                |mut hierarchy, mut module_path| {
                    while let Some((module_name, parents)) = module_path.segments.split_last() {
                        let parent_path = ModuleHierarchyElement::from_slice(parents);
                        hierarchy
                            .entry(parent_path.clone())
                            .or_default()
                            .insert(module_name.clone());
                        module_path = parent_path;
                    }
                    hierarchy
                },
            )
            .into_iter()
            .map(|(path, modules)| (path, modules.into_iter().collect()))
            .collect()
    }

    pub fn add_direct_module(
        &mut self,
        module_path: ModuleHierarchyElement,
        module_name: ModuleName,
    ) {
        self.direct_modules
            .entry(module_path)
            .or_default()
            .insert(module_name);
    }

    pub fn root_modules(&self) -> &[ModuleName] {
        self.child_modules
            .get(&ModuleHierarchyElement::root())
            .expect("At least one root module should be present")
    }

    pub fn child_modules(&self, module_path: &ModuleHierarchyElement) -> &[ModuleName] {
        self.child_modules
            .get(module_path)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn is_concrete_module(&self, module_path: &ModuleHierarchyElement) -> bool {
        self.concrete_modules.contains(module_path)
    }

    pub fn intermediate_modules(
        &self,
    ) -> impl Iterator<Item = (&ModuleHierarchyElement, &[ModuleName])> {
        self.child_modules.iter().filter_map(|(path, modules)| {
            (!path.is_root() && !self.is_concrete_module(path))
                .then_some((path, modules.as_slice()))
        })
    }

    pub fn exported_modules_for(&self, module_path: &ModuleHierarchyElement) -> Vec<ModuleName> {
        let mut exported_modules = BTreeSet::new();
        if let Some(modules) = self.direct_modules.get(module_path) {
            exported_modules.extend(modules.iter().cloned());
        }
        if let Some(modules) = self.child_modules.get(module_path) {
            exported_modules.extend(modules.iter().cloned());
        }
        exported_modules.into_iter().collect()
    }

    pub fn module_paths(&self) -> BTreeSet<ModuleHierarchyElement> {
        self.direct_modules
            .keys()
            .cloned()
            .chain(self.child_modules.keys().cloned())
            .chain(std::iter::once(ModuleHierarchyElement::root()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::{ModuleHierarchy, ModuleHierarchyElement, ModuleName};

    use std::path::PathBuf;

    #[test]
    fn path_segments_are_sanitized_for_modules_and_files() {
        let path = ModuleHierarchyElement::from_api_path("/me/mailFolders/delta()");

        assert_eq!(
            path.segments,
            vec![
                ModuleName::from_raw_segment("me"),
                ModuleName::from_raw_segment("mailFolders"),
                ModuleName::from_raw_segment("delta()"),
            ]
        );
        let expected_path: PathBuf = "me/mail_folders/delta.rs".into();
        assert_eq!(path.file_path(), expected_path);
    }

    #[test]
    fn rust_keywords_use_plain_file_names_but_raw_idents() {
        let path = ModuleHierarchyElement::from_api_path("/move");
        let module_name = path.leaf().expect("path should have a leaf");

        let expected_path: PathBuf = "move.rs".into();
        assert_eq!(module_name.as_path_segment(), "move");
        assert_eq!(module_name.as_rust_ident().to_string(), "r#move");
        assert_eq!(path.file_path(), expected_path);
    }

    #[test]
    fn schema_paths_only_include_sanitized_namespaces() {
        let top_level = ModuleHierarchyElement::from_schema("microsoft.graph.directoryObject");
        let nested = ModuleHierarchyElement::from_schema("microsoft.graph.security.alert");

        assert_eq!(
            top_level.segments,
            vec![ModuleName::from_raw_segment("directoryObject")]
        );
        assert_eq!(
            top_level.leaf().map(ModuleName::as_path_segment),
            Some("directory_object")
        );
        assert!(top_level.namespace().is_root());

        assert_eq!(
            nested.segments,
            vec![
                ModuleName::from_raw_segment("security"),
                ModuleName::from_raw_segment("alert"),
            ]
        );
        assert_eq!(
            nested
                .namespace()
                .segments
                .iter()
                .map(ModuleName::as_path_segment)
                .collect::<Vec<_>>(),
            vec!["security"]
        );
        let expected_file_path: PathBuf = "security/alert.rs".into();
        assert_eq!(nested.file_path(), expected_file_path);
    }

    #[test]
    fn hierarchy_combines_direct_and_child_modules() {
        let mut hierarchy = ModuleHierarchy::new([ModuleHierarchyElement::from_schema(
            "microsoft.graph.security.alert",
        )]);
        hierarchy.add_direct_module(
            ModuleHierarchyElement::root(),
            ModuleName::from_raw_segment("directoryObject"),
        );

        assert_eq!(
            hierarchy
                .exported_modules_for(&ModuleHierarchyElement::root())
                .iter()
                .map(ModuleName::as_path_segment)
                .collect::<Vec<_>>(),
            vec!["directory_object", "security"]
        );
    }
}

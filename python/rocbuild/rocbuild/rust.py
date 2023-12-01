# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os.path
import subprocess

import tomlkit
from tomlkit.toml_file import TOMLFile

config_footer = """
# Take advantage of the fact that cargo will treat lines starting with #
# as comments to add preprocessing directives. This file can thus by copied
# as-is to $topsrcdir/.cargo/config with no preprocessing to be used there
# (for e.g. independent tasks building rust code), or be preprocessed by
# the build system to produce a .cargo/config with the right content.
#define REPLACE_NAME vendored-sources
#define VENDORED_DIRECTORY comm/third_party/rust
# We explicitly exclude the following section when preprocessing because
# it would overlap with the preprocessed [source."@REPLACE_NAME@"], and
# cargo would fail.
#ifndef REPLACE_NAME
[source.vendored-sources]
directory = "../third_party/rust"
#endif

# Thankfully, @REPLACE_NAME@ is unlikely to be a legitimate source, so
# cargo will ignore it when it's here verbatim.
#filter substitution
[source."@REPLACE_NAME@"]
directory = "@top_srcdir@/@VENDORED_DIRECTORY@"
"""

gkrust_template = """
[package]
name = "gkrust"
version = "0.1.0"

[lib]
path = "src/lib.rs"
crate-type = ["staticlib"]
test = false
doctest = false
bench = false
doc = false
plugin = false
harness = false

{dependencies}

[package.metadata.cargo-udeps.ignore]
normal = ["mozilla-central-workspace-hack"]
"""

workspace_template = """
[package]
name = "mozilla-central-workspace-hack"
version = "0.1.0"
license = "MPL-2.0"
description = "Thunderbird extensions to mozilla-central-workspace-hack"

[features]
{features}

[workspace]
members = {members}

[workspace.dependencies]
{dependencies}

{patches}
"""


class CargoFile:
    """
    Simple abstraction of a Cargo.toml file
    """

    # Direct dependencies
    dependencies = None

    name = None

    # Identity -> Patch
    patches = None

    # Full filename of this cargo file
    filename = None
    features = None

    workspace_members = None
    workspace_deps = None
    our_directory = None

    def __init__(self, filename):
        self.our_directory = os.path.dirname(filename)
        self.dependencies = dict()
        self.patches = dict()
        self.filename = filename
        self.workspace_members = list()
        self.workspace_deps = dict()
        self.features = dict()

        data = TOMLFile(filename).read()

        for section in data:
            if section == "package":
                if "name" in data[section]:
                    self.name = data[section]["name"]
            if section == "patch":
                for block in data[section]:
                    self._handle_patches(block, data[section][block])
            elif section == "dependencies":
                self.dependencies.update(self._handle_dependencies(data[section]))
                pass
            elif section == "workspace":
                self._handle_workspace(data[section])
            elif section == "features":
                self.features = data["features"]

    def _handle_dependencies(self, data):
        """Store each dependnency"""
        deps = dict()

        for id in data:
            dep = data[id]
            # Direct version field
            if isinstance(dep, str):
                dep = {"version": dep}
            if "path" in dep:
                path = os.path.abspath(os.path.join(self.our_directory, dep["path"]))
                dep["path"] = path
            deps[id] = dep

        return deps

    def _handle_patches(self, identity, data):
        """identity = crates-io, etc."""
        patches = dict()

        for id in data:
            patch = data[id]
            if "path" in patch:
                path = os.path.abspath(os.path.join(self.our_directory, patch["path"]))
                patch["path"] = path
            patches[id] = patch

        if identity in self.patches:
            self.patches[identity].update(patches)
        else:
            self.patches[identity] = patches

    def _handle_workspace(self, data):
        if "dependencies" in data:
            self.workspace_deps.update(self._handle_dependencies(data["dependencies"]))

        if "members" in data:
            self.workspace_members = data["members"]


def regen_toml_files(command_context, workspace):
    """
    Regenerate the TOML files within the gkrust workspace
    """
    mc_workspace_toml = os.path.join(command_context.topsrcdir, "Cargo.toml")
    mc_gkrust_toml = os.path.join(
        command_context.topsrcdir, "toolkit", "library", "rust", "shared", "Cargo.toml"
    )

    mc_workspace = CargoFile(mc_workspace_toml)
    mc_gkrust = CargoFile(mc_gkrust_toml)

    comm_gkrust_toml = os.path.join(workspace, "gkrust", "Cargo.toml")
    comm_gkrust_dir = os.path.dirname(comm_gkrust_toml)
    comm_workspace_toml = os.path.join(workspace, "Cargo.toml")

    # Grab existing features/members
    comm_workspace = CargoFile(comm_workspace_toml)
    features = comm_workspace.features
    members = comm_workspace.workspace_members

    # Preserve original deps to gkrust (path = relative)
    comm_gkrust = CargoFile(comm_gkrust_toml)
    local_deps = dict()
    for dep_id in comm_gkrust.dependencies:
        dep = comm_gkrust.dependencies[dep_id]
        if "path" not in dep:
            continue
        path = os.path.abspath(os.path.join(workspace, dep["path"]))
        if os.path.dirname(path) == workspace:
            local_deps[dep_id] = dep

    # Deps copied from gkrust-shared
    global_deps = mc_gkrust.dependencies
    keys = [
        x
        for x in global_deps.keys()
        if x != "mozilla-central-workspace-hack" and x != "gkrust-shared"
    ]
    keys.sort()
    global_deps.update(local_deps)

    patches = mc_workspace.patches
    del patches["crates-io"]["mozilla-central-workspace-hack"]

    global_deps["mozilla-central-workspace-hack"] = {
        "version": "0.1",
        "features": ["gkrust"],
        "optional": True,
    }
    global_deps["gkrust-shared"] = {
        "version": "0.1.0",
        "path": os.path.join(command_context.topsrcdir, "toolkit", "library", "rust", "shared"),
    }
    for i in local_deps.keys():
        keys.insert(0, i)

    keys.insert(0, "gkrust-shared")
    keys.insert(0, "mozilla-central-workspace-hack")

    dependencies = "[dependencies]\n"
    for key in keys:
        data = global_deps[key]
        # Rewrite paths relative to us.
        if "path" in data:
            data["path"] = os.path.relpath(data["path"], comm_gkrust_dir)
        if "default_features" in data:
            del data["default_features"]
        elif "default-features" in data:
            del data["default-features"]
        dependencies += inline_encoded_toml(key, data) + "\n"

    with open(comm_gkrust_toml, "w") as cargo:
        cargo.write(gkrust_template.format(dependencies=dependencies.strip()))

    workspace_members = members
    workspace_patches = ""
    workspace_dependencies = ""

    for dep in mc_workspace.workspace_deps:
        workspace_dependencies += inline_encoded_toml(dep, mc_workspace.workspace_deps[dep])

    # Patch emission
    for section in patches:
        data = patches[section]
        if ":/" in section:
            section = f'"{section}"'
        workspace_patches += f"[patch.{section}]\n"
        if section == "crates-io":
            workspace_patches += (
                inline_encoded_toml("mozilla-central-workspace-hack", {"path": "."}) + "\n"
            )
        for id in data:
            patch = data[id]
            if "path" in patch:
                patch["path"] = os.path.relpath(patch["path"], workspace)
            workspace_patches += inline_encoded_toml(id, patch) + "\n"
        workspace_patches += "\n"

    with open(comm_workspace_toml, "w") as cargo:
        cargo_toml = (
            workspace_template.format(
                dependencies=workspace_dependencies,
                members=workspace_members,
                features=tomlkit.dumps(features),
                patches=workspace_patches,
            ).strip()
            + "\n"
        )
        cargo.write(cargo_toml)


def run_cargo_update(workspace):
    """
    Run cargo to regenerate the lockfile
    """
    subprocess.run(
        [
            "cargo",
            "update",
            "-p",
            "gkrust",
        ],
        cwd=workspace,
        check=True,
    )


def inline_encoded_toml(id, data):
    """
    Write nice looking TOML keys automatically for easier to review changes
    """
    if isinstance(data, str):
        return f'{id} = "{data}"'
    ret = f"{id} = {{"
    for idx, key in enumerate(data):
        if isinstance(data[key], bool):
            value = (str(data[key])).lower()
        elif isinstance(data[key], list):
            value = str(data[key])
        else:
            value = '"' + data[key] + '"'
        if idx > 0:
            ret += ", "
        else:
            ret += " "
        ret += f"{key} = {value}"
    return ret + " }"

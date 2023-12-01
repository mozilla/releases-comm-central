#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os.path
import shutil
import subprocess

from mach.decorators import Command, SubCommand


@Command(
    "tb-rust",
    category="thunderbird",
    description="Manage Thunderbird Rust components",
    virtualenv_name="tb_common",
)
def tb_rust(command_context):
    """
    Commands for keeping the Thunderbird Rust workspace in sync with
    the mozilla-central Rust workspace.

    Do not rely on `cargo update` as it will bust builds.
    """


@SubCommand("tb-rust", "sync", description="Sync gkrust with mozilla-central gkrust")
def tb_cargo_sync(command_context):
    """
    Sync the comm/rust workspace with mozilla-central
    """
    from rocbuild.rust import regen_toml_files, run_cargo_update

    mc_lock = os.path.join(command_context.topsrcdir, "Cargo.lock")
    workspace = os.path.join(command_context.topsrcdir, "comm", "rust")
    our_lock = os.path.join(workspace, "Cargo.lock")

    regen_toml_files(command_context, workspace)
    command_context.log(logging.INFO, "tb-rust", {}, f"[INFO] Syncing {mc_lock} with {our_lock}")
    shutil.copyfile(mc_lock, our_lock)
    command_context.log(logging.INFO, "tb-rust", {}, "[INFO] Updating gkrust in our workspace")
    run_cargo_update(workspace)


@SubCommand("tb-rust", "vendor", description="Refresh comm/third_party/rust")
def tb_cargo_vendor(command_context):
    """
    Remove and refresh the vendored rust dependencies within the
    comm/third_party/rust directory.

    Existing directories will be removed and the vendor process will
    be performed according to the lockfile.

    Do note that the lockfile and Cargo.toml files will be synced as
    part of the process.
    """
    from rocbuild.rust import config_footer

    tb_cargo_sync(command_context)
    workspace = os.path.join(command_context.topsrcdir, "comm", "rust")
    config = os.path.join(workspace, ".cargo", "config.in")
    third_party = os.path.join(command_context.topsrcdir, "comm", "third_party", "rust")

    if os.path.exists(third_party):
        command_context.log(logging.INFO, "tb-rust", {}, "[INFO] Removing comm/third_party/rust")
        shutil.rmtree(third_party)
    else:
        command_context.log(
            logging.WARNING,
            "tb-rust",
            {},
            "[WARNING] Cannot find comm/third_party/rust",
        )

    cmd = [
        "cargo",
        "vendor",
        "-s",
        "comm/rust/Cargo.toml",
        "comm/third_party/rust",
    ]

    command_context.log(logging.INFO, "tb-rust", {}, "[INFO] Running cargo vendor")
    proc = subprocess.run(
        cmd, cwd=command_context.topsrcdir, check=True, stdout=subprocess.PIPE, encoding="utf-8"
    )
    with open(config, "w") as config_file:
        config_file.writelines([f"{x}\n" for x in proc.stdout.splitlines()[0:-2]])
        config_file.write(config_footer)

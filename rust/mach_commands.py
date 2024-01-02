#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

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
    from rocbuild.rust import run_tb_cargo_sync

    return run_tb_cargo_sync(command_context)


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
    from rocbuild.rust import run_tb_rust_vendor

    return run_tb_rust_vendor(command_context)

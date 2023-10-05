# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import mozpack.path as mozpath
from mach.decorators import Command, SubCommand


@Command(
    "tb-storybook",
    category="misc",
    description="Start the Storybook server",
)
def storybook_run(command_context):
    ensure_env(command_context)
    return run_npm(command_context, args=["run", "storybook"])


@SubCommand(
    "tb-storybook",
    "build",
    description="Build the Storybook for export.",
)
def storybook_build(command_context):
    ensure_env(command_context)
    return run_npm(command_context, args=["run", "build-storybook"])


def build_storybook_manifest(command_context):
    print("Build ChromeMap backend")
    run_mach(command_context, "build-backend", backend=["ChromeMap"])
    config_environment = command_context.config_environment
    storybook_chrome_map_path = "mail/components/storybook/.storybook/chrome-map.js"
    chrome_map_path = mozpath.join(config_environment.topobjdir, "chrome-map.json")
    with open(chrome_map_path, "r") as chrome_map_f:
        with open(storybook_chrome_map_path, "w") as storybook_chrome_map_f:
            storybook_chrome_map_f.write("module.exports = ")
            storybook_chrome_map_f.write(chrome_map_f.read())
            storybook_chrome_map_f.write(";")


def run_mach(command_context, cmd, **kwargs):
    return command_context._mach_context.commands.dispatch(
        cmd, command_context._mach_context, **kwargs
    )


def run_npm(command_context, args):
    return run_mach(command_context, "npm", args=[*args, "--prefix=mail/components/storybook"])


def ensure_env(command_context):
    ensure_npm_deps(command_context)
    build_storybook_manifest(command_context)


def ensure_npm_deps(command_context):
    if not check_npm_deps(command_context):
        install_npm_deps(command_context)
    else:
        print("Dependencies up to date\n")


def check_npm_deps(command_context):
    print("Checking installed npm dependencies")
    return not run_npm(command_context, args=["ls"])


def install_npm_deps(command_context):
    print("Installing missing npm dependencies")
    run_npm(command_context, args=["ci"])

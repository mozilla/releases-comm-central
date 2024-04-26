# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import subprocess
import threading
import time

import mozpack.path as mozpath
from mach.decorators import Command, CommandArgument, SubCommand


@Command(
    "tb-storybook",
    category="thunderbird",
    description="Start the Storybook server and launch te site in a local build of Thunderbird. This will install npm dependencies, if necessary.",
)
@CommandArgument(
    "--no-open",
    action="store_true",
    help="Start the Storybook server without opening a local Thunderbird build.",
)
def storybook_run(command_context, no_open=False):
    ensure_env(command_context)
    if not no_open:
        start_application_thread = threading.Thread(
            target=start_application, args=(command_context,)
        )
        start_application_thread.start()
    return run_npm(command_context, args=["run", "storybook"])


@SubCommand(
    "tb-storybook",
    "build",
    description="Build the Storybook for export.",
)
def storybook_build(command_context):
    ensure_env(command_context)
    return run_npm(command_context, args=["run", "build-storybook"])


@SubCommand("tb-storybook", "launch", description="Launch the Storybook site in your local build.")
@CommandArgument(
    "--no-temp-profile",
    action="store_true",
    help="Start Thunderbird with the normal run profile and not a temporary profile. Disables automatic setting of prefs.",
)
def storybook_launch(command_context, no_temp_profile=False):
    set_prefs = [
        "mail.storybook.openTab=true",
    ]
    temp_profile = not no_temp_profile
    if temp_profile:
        set_prefs = set_prefs + [
            "svg.context-properties.content.enabled=true",
            "layout.css.light-dark.enabled=true",
        ]

    # Work around the runprefs SettingsProvider not getting registered.
    if "runprefs" not in command_context._mach_context.settings:
        command_context._mach_context.settings.runprefs = ""

    return run_mach(
        command_context,
        "run",
        setpref=set_prefs,
        temp_profile=temp_profile,
    )


def start_application(command_context):
    # This delay is used to avoid launching the application before the Storybook server has started.
    time.sleep(5)
    subprocess.run(run_mach(command_context, "tb-storybook", subcommand="launch"))


def build_storybook_manifest(command_context):
    print("Build ChromeMap backend")
    run_mach(command_context, "build-backend", backend=["ChromeMap"])
    config_environment = command_context.config_environment
    storybook_chrome_map_path = "mail/components/storybook/.storybook/chrome-map.mjs"
    chrome_map_path = mozpath.join(config_environment.topobjdir, "chrome-map.json")
    with open(chrome_map_path, "r") as chrome_map_f:
        with open(storybook_chrome_map_path, "w") as storybook_chrome_map_f:
            storybook_chrome_map_f.write("export default ")
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

#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# This script provides one-line bootstrap support to configure systems to build
# the tree. It does so by cloning the repo before calling directly into `mach
# bootstrap`.

# mozboot bootstrap.py was mangled and maimed in the creation of this script.

# Note that this script can't assume anything in particular about the host
# Python environment (except that it's run with a sufficiently recent version of
# Python 3), so we are restricted to stdlib modules.

import sys

major, minor = sys.version_info[:2]
if (major < 3) or (major == 3 and minor < 8):
    print("Bootstrap currently only runs on Python 3.8+." "Please try re-running with python3.8+.")
    sys.exit(1)

import ctypes
import os
import subprocess
from optparse import OptionParser
from pathlib import Path
from typing import Optional

WINDOWS = sys.platform.startswith("win32") or sys.platform.startswith("msys")


def which(name):
    """Python implementation of which.

    It returns the path of an executable or None if it couldn't be found.
    """
    search_dirs = os.environ["PATH"].split(os.pathsep)
    potential_names = [name]
    if WINDOWS:
        potential_names.insert(0, name + ".exe")

    for path in search_dirs:
        for executable_name in potential_names:
            test = Path(path) / executable_name
            if test.is_file() and os.access(test, os.X_OK):
                return test

    return None


def validate_clone_dest(dest: Path):
    dest = dest.resolve()

    if not dest.exists():
        return dest

    if not dest.is_dir():
        print(f"ERROR! Destination '{dest}' exists but is not a directory.")
        return None

    if not any(dest.iterdir()):
        return dest
    else:
        print(f"ERROR! Destination directory '{dest}' exists but is nonempty.")
        print(
            f"To re-bootstrap the existing checkout, go into '{dest}' and run './mach bootstrap'."
        )
        return None


def input_clone_dest(no_interactive):
    dest_name = "source"
    print(f"Cloning Firefox into '{dest_name}' using Git...")
    while True:
        dest = None
        if not no_interactive:
            dest = input(
                f"Destination directory for clone (leave empty to use "
                f"default destination of '{dest_name}'): "
            ).strip()
        if not dest:
            dest = dest_name
        dest = validate_clone_dest(Path(dest).expanduser())
        if dest:
            return dest
        if no_interactive:
            return None


def git_clone(
    git: Path,
    repo_url: str,
    dest: Path,
    watchman: Optional[Path],
    head_repo: Optional[str],
    head_rev: Optional[str],
):
    print(f"Cloning from '{repo_url}'...")
    env = dict(os.environ)

    clone_args = [str(git), "clone", repo_url, str(dest)]
    subprocess.check_call(clone_args, env=env)
    subprocess.check_call([str(git), "config", "fetch.prune", "true"], cwd=str(dest), env=env)
    subprocess.check_call([str(git), "config", "pull.ff", "only"], cwd=str(dest), env=env)

    # Optional override for automation / advanced usage.
    # If the user provides an alternate remote, we add it as "head" and
    # optionally checkout a revision from it.
    if head_repo:
        subprocess.check_call([str(git), "remote", "add", "head", head_repo], cwd=str(dest), env=env)
        if head_rev:
            subprocess.check_call([str(git), "fetch", "head", head_rev], cwd=str(dest), env=env)
            subprocess.check_call([str(git), "checkout", "FETCH_HEAD"], cwd=str(dest), env=env)
        else:
            subprocess.check_call([str(git), "fetch", "head"], cwd=str(dest), env=env)

    if head_rev and not head_repo:
        # If the revision is a branch / tag / SHA that exists in origin.
        subprocess.check_call([str(git), "checkout", head_rev], cwd=str(dest), env=env)

    watchman_sample = dest / ".git/hooks/fsmonitor-watchman.sample"
    # Older versions of git didn't include fsmonitor-watchman.sample.
    if watchman and watchman_sample.exists():
        print("Configuring watchman")
        watchman_config = dest / ".git/hooks/query-watchman"
        if not watchman_config.exists():
            print(f"Copying {watchman_sample} to {watchman_config}")
            copy_args = [
                "cp",
                ".git/hooks/fsmonitor-watchman.sample",
                ".git/hooks/query-watchman",
            ]
            subprocess.check_call(copy_args, cwd=str(dest))

        config_args = [
            str(git),
            "config",
            "core.fsmonitor",
            ".git/hooks/query-watchman",
        ]
        subprocess.check_call(config_args, cwd=str(dest), env=env)
    return dest


def add_microsoft_defender_antivirus_exclusions(dest, no_system_changes):
    if no_system_changes:
        return

    if not WINDOWS:
        return

    powershell_exe = which("powershell")

    if not powershell_exe:
        return

    def print_attempt_exclusion(path):
        print(f"Attempting to add exclusion path to Microsoft Defender Antivirus for: {path}")

    powershell_exe = str(powershell_exe)
    paths = []

    # firefox / clone dest
    repo_dir = Path.cwd() / dest
    paths.append(repo_dir)
    print_attempt_exclusion(repo_dir)

    # MOZILLABUILD
    mozillabuild_dir = os.getenv("MOZILLABUILD")
    if mozillabuild_dir:
        paths.append(mozillabuild_dir)
        print_attempt_exclusion(mozillabuild_dir)

    # .mozbuild
    mozbuild_dir = Path.home() / ".mozbuild"
    paths.append(mozbuild_dir)
    print_attempt_exclusion(mozbuild_dir)

    args = ";".join(f"Add-MpPreference -ExclusionPath '{path}'" for path in paths)
    command = f'-Command "{args}"'

    # This will attempt to run as administrator by triggering a UAC prompt
    # for admin credentials. If "No" is selected, no exclusions are added.
    ctypes.windll.shell32.ShellExecuteW(None, "runas", powershell_exe, command, None, 0)


def clone(options):
    no_interactive = options.no_interactive
    no_system_changes = options.no_system_changes

    binary = which("git")
    if not binary:
        print("Git is not installed.")
        print("Try installing git using your system package manager.")
        return None

    dest = input_clone_dest(no_interactive)
    if not dest:
        return None

    add_microsoft_defender_antivirus_exclusions(dest, no_system_changes)

    watchman = which("watchman")

    firefox_head_repo = os.environ.get("FIREFOX_HEAD_REPOSITORY")
    firefox_head_rev = os.environ.get("FIREFOX_HEAD_REV")

    thunderbird_head_repo = os.environ.get("THUNDERBIRD_HEAD_REPOSITORY")
    thunderbird_head_rev = os.environ.get("THUNDERBIRD_HEAD_REV")

    firefox_dest = git_clone(
        binary,
        "https://github.com/mozilla-firefox/firefox",
        dest,
        watchman,
        firefox_head_repo,
        firefox_head_rev,
    )
    if firefox_dest == dest:
        dest = Path(dest) / "comm"
        thunderbird_dest = git_clone(
            binary,
            "https://github.com/thunderbird/thunderbird-desktop",
            dest,
            watchman,
            thunderbird_head_repo,
            thunderbird_head_rev,
        )
        if thunderbird_dest:
            return firefox_dest
        else:
            return thunderbird_dest
    return firefox_dest

def bootstrap(srcdir: Path, artifact_mode, no_interactive, no_system_changes):
    args = [sys.executable, "mach"]

    if no_interactive:
        # --no-interactive is a global argument, not a command argument,
        # so it needs to be specified before "bootstrap" is appended.
        args += ["--no-interactive"]

    args += ["bootstrap"]

    if artifact_mode:
        args += ["--application-choice", "Firefox for Desktop Artifact Mode"]
    else:
        args += ["--application-choice", "Firefox for Desktop"]
    if no_system_changes:
        args += ["--no-system-changes"]

    print("Running `%s`" % " ".join(args))
    return subprocess.call(args, cwd=str(srcdir))


def mozconfig(srcdir):
    """Build Thunderbird, not Firefox!"""
    mozconfig = os.path.join(srcdir, "mozconfig")
    with open(mozconfig, "a") as mfp:
        mfp.write("ac_add_options --enable-project=comm/mail")
    return True


def main(args):
    parser = OptionParser()
    parser.add_option(
        "--artifact-mode",
        dest="artifact_mode",
        help="Build Thunderbird in Artifact mode. "
        "See https://firefox-source-docs.mozilla.org/contributing/build"
        "/artifact_builds.html for details.",
    )
    parser.add_option(
        "--no-interactive",
        dest="no_interactive",
        action="store_true",
        help="Answer yes to any (Y/n) interactive prompts.",
    )
    parser.add_option(
        "--no-system-changes",
        dest="no_system_changes",
        action="store_true",
        help="Only executes actions that leave the system " "configuration alone.",
    )

    options, leftover = parser.parse_args(args)
    try:
        srcdir = clone(options)
        if not srcdir:
            return 1
        print("Clone complete.")
        print(
            "If you need to run the tooling bootstrapping again, "
            "then consider running './mach bootstrap' instead."
        )
        if not options.no_interactive:
            remove_bootstrap_file = input(
                "Unless you are going to have more local copies of Firefox source code, "
                "this 'bootstrap.py' file is no longer needed and can be deleted. "
                "Clean up the bootstrap.py file? (Y/n)"
            )
            if not remove_bootstrap_file:
                remove_bootstrap_file = "y"
        if options.no_interactive or remove_bootstrap_file == "y":
            try:
                Path(sys.argv[0]).unlink()
            except FileNotFoundError:
                print("File could not be found !")
        bootstrap(
            srcdir,
            options.artifact_mode,
            options.no_interactive,
            options.no_system_changes,
        )
        return mozconfig(srcdir)
    except Exception:
        print("Could not bootstrap Thunderbird! Consider filing a bug.")
        raise


if __name__ == "__main__":
    sys.exit(main(sys.argv))

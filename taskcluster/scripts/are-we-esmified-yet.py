#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os
import pathlib
import subprocess
import sys

TBPL_FAILURE = 2

excluded_prefix = [
    "suite/",
]
EXCLUSION_FILES = [
    os.path.join("tools", "lint", "ThirdPartyPaths.txt"),
]


if not (pathlib.Path(".hg").exists() and pathlib.Path("mail/moz.configure").exists()):
    print(
        "This script needs to be run inside mozilla-central + comm-central "
        "checkout of mercurial. "
    )
    sys.exit(TBPL_FAILURE)


def load_exclusion_files():
    for path in EXCLUSION_FILES:
        with open(path, "r") as f:
            for line in f:
                excluded_prefix.append(line.strip())


def is_excluded(path):
    """Returns true if the JSM file shouldn't be converted to ESM."""
    path_str = str(path)
    for prefix in excluded_prefix:
        if path_str.startswith(prefix):
            return True

    return False


def new_files_struct():
    return {
        "jsm": [],
        "esm": [],
        "subdir": {},
    }


def put_file(files, kind, path):
    """Put a path into files tree structure."""

    if is_excluded(path):
        return

    name = path.name

    current_files = files
    for part in path.parent.parts:
        if part not in current_files["subdir"]:
            current_files["subdir"][part] = new_files_struct()
        current_files = current_files["subdir"][part]

    current_files[kind].append(name)


def run(cmd):
    """Run command and return output as lines, excluding empty line."""
    lines = subprocess.run(cmd, stdout=subprocess.PIPE).stdout.decode()
    return filter(lambda x: x != "", lines.split("\n"))


def collect_jsm(files):
    """Collect JSM files."""
    kind = "jsm"

    # jsm files
    cmd = ["hg", "files", "set:glob:**/*.jsm"]
    for line in run(cmd):
        put_file(files, kind, pathlib.Path(line))

    # js files with EXPORTED_SYMBOLS
    cmd = ["hg", "files", "set:grep('EXPORTED_SYMBOLS = \[') and glob:**/*.js"]
    for line in run(cmd):
        put_file(files, kind, pathlib.Path(line))


def collect_esm(files):
    """Collect system ESM files."""
    kind = "esm"

    # sys.mjs files
    cmd = ["hg", "files", "set:glob:**/*.sys.mjs"]

    for line in run(cmd):
        put_file(files, kind, pathlib.Path(line))


def to_stat(files):
    """Convert files tree into status tree."""
    jsm = len(files["jsm"])
    esm = len(files["esm"])
    subdir = {}

    for key, sub_files in files["subdir"].items():
        sub_stat = to_stat(sub_files)

        subdir[key] = sub_stat
        jsm += sub_stat["jsm"]
        esm += sub_stat["esm"]

    stat = {
        "jsm": jsm,
        "esm": esm,
    }
    if len(subdir):
        stat["subdir"] = subdir

    return stat


def main():
    cmd = ["hg", "parent", "--template", "{node}"]
    commit_hash = list(run(cmd))[0]

    cmd = ["hg", "parent", "--template", "{date|shortdate}"]
    date = list(run(cmd))[0]

    files = new_files_struct()
    collect_jsm(files)
    collect_esm(files)

    stat = to_stat(files)
    stat["hash"] = commit_hash
    stat["date"] = date

    print(json.dumps(stat, indent=2))


if __name__ == "__main__":
    main()

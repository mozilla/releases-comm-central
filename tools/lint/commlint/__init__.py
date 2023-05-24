# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
from contextlib import contextmanager
from pathlib import Path

from mozlint.pathutils import expand_exclusions
from mozlint.types import supported_types
from mozpack import path as mozpath

COMM_EXCLUSION_FILES = [
    os.path.join("comm", "tools", "lint", "ThirdPartyPaths.txt"),
    os.path.join("comm", "tools", "lint", "Generated.txt"),
]

TASKCLUSTER_EXCLUDE_PATHS = (os.path.join("comm", "suite"),)


@contextmanager
def pushd(dest_path: Path):
    """
    Sets the cwd within the context
    :param Path dest_path: The path to the cwd
    """
    origin = Path().absolute()
    try:
        os.chdir(dest_path)
        yield
    finally:
        os.chdir(origin)


def _apply_global_excludes(root, config):
    exclude = config.get("exclude", [])

    for path in COMM_EXCLUSION_FILES:
        with open(os.path.join(root, path), "r") as fh:
            exclude.extend([mozpath.join(root, f.strip()) for f in fh.readlines()])

    if os.environ.get("MOZLINT_NO_SUITE", None):
        # Ignore Seamonkey-only paths when run from Taskcluster
        suite_excludes = [mozpath.join(root, path) for path in TASKCLUSTER_EXCLUDE_PATHS]
        exclude.extend(suite_excludes)

    config["exclude"] = exclude


# This makes support file paths absolute, allowing lintpref to find StaticPrefList.yaml
def _expand_support_files(root, config):
    support_files = config.get("support-files", [])
    absolute_support_files = [mozpath.join(root, f) for f in support_files]
    config["support-files"] = absolute_support_files


def eslint_wrapper(paths, config, **lintargs):
    comm_root = Path(lintargs["root"]) / "comm"
    with pushd(comm_root):
        rv = lint_wrapper(paths, config, **lintargs)

    return rv


def stylelint_wrapper(paths, config, **lintargs):
    comm_root = Path(lintargs["root"]) / "comm"

    ignore_file = str(comm_root / ".stylelintignore")
    lintargs.setdefault("extra_args", [])
    lintargs["extra_args"].extend(["--ignore-path", ignore_file])

    with pushd(comm_root):
        rv = lint_wrapper(paths, config, **lintargs)

    return rv


def black_lint(paths, config, fix=None, **lintargs):
    from python.black import run_black

    files = list(expand_exclusions(paths, config, lintargs["root"]))

    # prepend "--line-length 99" to files, it will be processed as an argument
    black_args = ["-l", "99"] + files

    return run_black(
        config,
        black_args,
        fix=fix,
        log=lintargs["log"],
        virtualenv_bin_path=lintargs.get("virtualenv_bin_path"),
    )


def lint_wrapper(paths, config, **lintargs):
    _apply_global_excludes(lintargs["root"], config)
    _expand_support_files(lintargs["root"], config)

    payload = supported_types[config.get("wrappedType", config["type"])]
    config["payload"] = config["wraps"]
    del config["wraps"]

    if config.get("wrappedType", ""):
        config["type"] = config["wrappedType"]
        del config["wrappedType"]

    if config.get("commroot", False):
        lintargs["root"] = os.path.join(lintargs["root"], "comm")
        del config["commroot"]

    return payload(paths, config, **lintargs)

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Test comm-l10n Fluent migrations
"""

import logging
import os
import re
import shutil
from datetime import datetime, timedelta
from subprocess import check_call
from typing import Iterable

from compare_locales.merge import merge_channels
from compare_locales.paths.configparser import TOMLParser
from compare_locales.paths.files import ProjectFiles
from fluent.migrate.repo_client import RepoClient, git
from test_fluent_migrations.fmt import diff_resources
from test_fluent_migrations.fmt import inspect_migration as _inspect_migration

import mozpack.path as mozpath
from mach.util import get_state_dir

L10N_SOURCE_NAME = "tb-l10n-source"
L10N_SOURCE_REPO = "https://github.com/thunderbird-l10n/thunderbird-l10n-source.git"

PULL_AFTER = timedelta(days=2)

BUILD_APP = "comm/mail"


def inspect_migration(arg):
    return _inspect_migration(arg)


def prepare_directories(cmd):
    """
    Ensure object dir exists,
    and that repo dir has a relatively up-to-date clone of tb-l10n-source or
    thunderbird-l10n-source.

    We run this once per mach invocation, for all tested migrations.
    """

    obj_dir = mozpath.join(cmd.topobjdir, "comm", "python", "l10n")
    if not os.path.exists(obj_dir):
        os.makedirs(obj_dir)

    repo_dir = mozpath.join(get_state_dir(), L10N_SOURCE_NAME)
    marker = mozpath.join(repo_dir, ".git", "l10n_pull_marker")

    try:
        last_pull = datetime.fromtimestamp(os.stat(marker).st_mtime)
        skip_clone = datetime.now() < last_pull + PULL_AFTER
    except OSError:
        skip_clone = False
    if not skip_clone:
        if os.path.exists(repo_dir):
            check_call(["git", "pull", L10N_SOURCE_REPO], cwd=repo_dir)
        else:
            check_call(["git", "clone", L10N_SOURCE_REPO, repo_dir])
        with open(marker, "w") as fh:
            fh.flush()

    return obj_dir, repo_dir


def test_migration(
    cmd,
    obj_dir: str,
    repo_dir: str,
    to_test: list[str],
    references: Iterable[str],
):
    """Test the given recipe.

    This creates a workdir by l10n-merging thunderbird-l10n-source and the c-c
    source, to mimic thunderbird-l10n-source after the patch to test landed.
    It then runs the recipe with a thunderbird-l10n-source clone as localization,
    both dry and wet.
    It inspects the generated commits, and shows a diff between the merged
    reference and the generated content.
    The diff is intended to be visually inspected. Some changes might be
    expected, in particular when formatting of the en-US strings is different.
    """
    rv = 0
    paths = mozpath.split(to_test)
    migration_name = os.path.splitext(paths[-1])[0]
    work_dir = mozpath.join(obj_dir, migration_name)

    # Migration modules should be in a sub-folder of l10n.
    migration_module = ".".join(paths[paths.index("l10n") + 1 : -1]) + "." + migration_name

    if os.path.exists(work_dir):
        shutil.rmtree(work_dir)
    os.makedirs(mozpath.join(work_dir, "reference"))
    l10n_toml = mozpath.join(cmd.topsrcdir, BUILD_APP, "locales", "l10n.toml")
    pc = TOMLParser().parse(l10n_toml, env={"l10n_base": work_dir})
    pc.set_locales(["reference"])
    files = ProjectFiles("reference", [pc])
    ref_root = mozpath.join(work_dir, "reference")
    for ref in references:
        if ref != mozpath.normpath(ref):
            cmd.log(
                logging.ERROR,
                "tb-fluent-migration-test",
                {"file": to_test, "ref": ref},
                'Reference path "{ref}" needs to be normalized for {file}',
            )
            rv = 1
            continue
        full_ref = mozpath.join(ref_root, ref)
        m = files.match(full_ref)
        if m is None:
            raise ValueError("Bad reference path: " + ref)
        m_c_path = m[1]
        g_s_path = mozpath.join(work_dir, L10N_SOURCE_NAME, ref)
        resources = [
            b"" if not os.path.exists(f) else open(f, "rb").read() for f in (g_s_path, m_c_path)
        ]
        ref_dir = mozpath.dirname(full_ref)
        if not os.path.exists(ref_dir):
            os.makedirs(ref_dir)
        open(full_ref, "wb").write(merge_channels(ref, resources))
    l10n_root = mozpath.join(work_dir, "en-US")
    git(work_dir, "clone", repo_dir, l10n_root)
    client = RepoClient(l10n_root)
    old_tip = client.head()
    run_migration = [
        cmd._virtualenv_manager.python_path,
        "-m",
        "fluent.migratetb.tool",
        "--lang",
        "en-US",
        "--reference-dir",
        ref_root,
        "--localization-dir",
        l10n_root,
        "--dry-run",
        migration_module,
    ]
    cmd.run_process(run_migration, cwd=work_dir, line_handler=print)
    # drop --dry-run
    run_migration.pop(-2)
    cmd.run_process(run_migration, cwd=work_dir, line_handler=print)
    tip = client.head()
    if old_tip == tip:
        cmd.log(
            logging.WARN,
            "tb-fluent-migration-test",
            {"file": to_test},
            "No migration applied for {file}",
        )
        return rv
    for ref in references:
        diff_resources(mozpath.join(ref_root, ref), mozpath.join(l10n_root, ref))
    messages = client.log(old_tip, tip)
    bug = re.search("[0-9]{5,}", migration_name)
    # Just check first message for bug number, they're all following the same pattern
    if bug is None or bug.group() not in messages[0]:
        rv = 1
        cmd.log(
            logging.ERROR,
            "tb-fluent-migration-test",
            {"file": to_test},
            "Missing or wrong bug number for {file}",
        )
    if any("part {}".format(n + 1) not in msg for n, msg in enumerate(reversed(messages))):
        rv = 1
        cmd.log(
            logging.ERROR,
            "tb-fluent-migration-test",
            {"file": to_test},
            'Commit messages should have "part {{index}}" for {file}',
        )
    return rv

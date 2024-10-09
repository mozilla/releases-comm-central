# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os.path
from pathlib import Path

from mach.decorators import Command, CommandArgument


@Command(
    "tb-add-missing-ftls",
    category="thunderbird",
    description="Add missing FTL files after l10n merge.",
    virtualenv_name="tb_common",
)
@CommandArgument(
    "--merge",
    type=Path,
    help="Merge path base",
)
@CommandArgument(
    "locale",
    type=str,
    help="Locale code",
)
def tb_add_missing_ftls(command_context, merge, locale):
    """
    Command to create empty FTL files for incomplete localizations to
    avoid over-zealous en-US fallback as described in bug 1586984. This
    mach command is based on the script used to update the l10n-central
    repositories. It gets around the need to have write access to those
    repositories in favor of creating the files during l10m-repackaging.
    This code assumes that mach compare-locales --merge has already run.
    """
    from tb_l10n.missing_ftl import add_missing_ftls, get_lang_ftls, get_source_ftls

    print("Checking for missing .ftl files in locale {}".format(locale))
    comm_src_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    source_files = get_source_ftls(comm_src_dir)

    l10n_path = os.path.join(merge, locale)
    locale_files = get_lang_ftls(l10n_path)

    add_missing_ftls(l10n_path, source_files, locale_files)


@Command(
    "tb-fluent-migration-test",
    category="thunderbird",
    description="Test Fluent migration recipes.",
    virtualenv_name="tb_common",
)
@CommandArgument("test_paths", nargs="*", metavar="N", help="Recipe paths to test.")
def run_migration_tests(command_context, test_paths=None, **kwargs):
    if not test_paths:
        test_paths = []
    command_context.activate_virtualenv()

    from tb_l10n.tb_migration_test import (
        inspect_migration,
        prepare_object_dir,
        test_migration,
    )

    rv = 0
    with_context = []
    for to_test in test_paths:
        try:
            context = fmt.inspect_migration(to_test)
            for issue in context["issues"]:
                command_context.log(
                    logging.ERROR,
                    "tb-fluent-migration-test",
                    {
                        "error": issue["msg"],
                        "file": to_test,
                    },
                    "ERROR in {file}: {error}",
                )
            if context["issues"]:
                continue
            with_context.append(
                {
                    "to_test": to_test,
                    "references": context["references"],
                }
            )
        except Exception as e:
            command_context.log(
                logging.ERROR,
                "tb-fluent-migration-test",
                {"error": str(e), "file": to_test},
                "ERROR in {file}: {error}",
            )
            rv |= 1
    obj_dir, repo_dir = fmt.prepare_directories(command_context)
    for context in with_context:
        rv |= fmt.test_migration(command_context, obj_dir, repo_dir, **context)
    return rv

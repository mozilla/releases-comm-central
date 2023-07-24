# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse
import logging
import os.path
from pathlib import Path

from mutlh.decorators import Command, CommandArgument


# https://stackoverflow.com/a/14117511
def _positive_int(value):
    value = int(value)
    if value <= 0:
        raise argparse.ArgumentTypeError(f"{value} must be a positive integer.")
    return value


def _retry_run_process(command_context, *args, error_msg=None, **kwargs):
    try:
        return command_context.run_process(*args, **kwargs)
    except Exception as exc:
        raise Exception(error_msg or str(exc)) from exc


def _get_rev(command_context, strings_path):
    result = []

    def save_output(line):
        result.append(line)

    status = _retry_run_process(
        command_context,
        [
            "hg",
            "--cwd",
            str(strings_path),
            "log",
            "-r",
            ".",
            "--template",
            "{node}\n",
        ],
        line_handler=save_output,
    )
    if status == 0:
        return "\n".join(result)
    raise Exception(f"Failed to get head revision: {status}")


@Command(
    "tb-l10n-x-channel",
    category="thunderbird",
    description="Create cross-channel content for Thunderbird (comm-strings).",
)
@CommandArgument(
    "--strings-path",
    "-s",
    metavar="en-US",
    type=Path,
    default=Path("en-US"),
    help="Path to mercurial repository for comm-strings-quarantine",
)
@CommandArgument(
    "--outgoing-path",
    "-o",
    type=Path,
    help="create an outgoing() patch if there are changes",
)
@CommandArgument(
    "--attempts",
    type=_positive_int,
    default=1,
    help="Number of times to try (for automation)",
)
@CommandArgument(
    "--ssh-secret",
    action="store",
    help="Taskcluster secret to use to push (for automation)",
)
@CommandArgument(
    "actions",
    choices=("prep", "create", "push", "clean"),
    nargs="+",
    # This help block will be poorly formatted until we fix bug 1714239
    help="""
    "prep": clone repos and pull heads.
    "create": create the en-US strings commit an optionally create an
              outgoing() patch.
    "push": push the en-US strings to the quarantine repo.
    "clean": clean up any sub-repos.
    """,
)
def tb_cross_channel(
    command_context,
    strings_path,
    outgoing_path,
    actions,
    attempts,
    ssh_secret,
    **kwargs,
):
    """Run Thunderbird's l10n cross-channel content generation."""
    from tbxchannel import TB_XC_NOTIFICATION_TMPL, get_thunderbird_xc_config
    from tbxchannel.l10n_merge import COMM_STRINGS_QUARANTINE

    from rocbuild.notify import email_notification

    kwargs.update(
        {
            "strings_path": strings_path,
            "outgoing_path": outgoing_path,
            "actions": actions,
            "attempts": attempts,
            "ssh_secret": ssh_secret,
            "get_config": get_thunderbird_xc_config,
        }
    )
    command_context._mach_context.commands.dispatch(
        "l10n-cross-channel", command_context._mach_context, **kwargs
    )
    if os.path.exists(outgoing_path):
        head_rev = _get_rev(command_context, strings_path)
        rev_url = f"{COMM_STRINGS_QUARANTINE}/rev/{head_rev}"

        notification_body = TB_XC_NOTIFICATION_TMPL.format(rev_url=rev_url)
        email_notification("X-channel comm-strings-quarantine updated", notification_body)


@Command(
    "tb-add-missing-ftls",
    category="thunderbird",
    description="Add missing FTL files after l10n merge.",
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
    from missing_ftl import add_missing_ftls, get_lang_ftls, get_source_ftls

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
)
@CommandArgument("test_paths", nargs="*", metavar="N", help="Recipe paths to test.")
def run_migration_tests(command_context, test_paths=None, **kwargs):
    if not test_paths:
        test_paths = []
    command_context.activate_virtualenv()

    from tbxchannel.tb_migration_test import inspect_migration, prepare_object_dir, test_migration

    rv = 0
    with_context = []
    for to_test in test_paths:
        try:
            context = inspect_migration(to_test)
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
    obj_dir = prepare_object_dir(command_context)
    for context in with_context:
        rv |= test_migration(command_context, obj_dir, **context)
    return rv


from mutlh.decorators import Command, CommandArgument


@Command(
    "tb-l10n-quarantine-to-strings",
    category="thunderbird",
    description="Publish quarantines strings to comm-l10n.",
)
@CommandArgument(
    "--quarantine-path",
    "-q",
    type=Path,
    help="Path to comm-strings-quarantine repo",
)
@CommandArgument(
    "--comm-l10n-path",
    "-l",
    type=Path,
    help="Path to comm-l10n repo",
)
@CommandArgument(
    "actions",
    choices=("clean", "prep", "migrate", "push"),
    nargs="+",
    # This help block will be poorly formatted until we fix bug 1714239
    help="""
    "clean": remove existing clones of quarantine and comm-l10n repos
    "prep": clone a new repository or update an existing one to latest rev
    "migrate": update comm-l10n en_US from quarantine
    "push": push comm-l10n
    """,
)
def quarantine_to_strings(
    command_context,
    quarantine_path,
    comm_l10n_path,
    actions,
    **kwargs,
):
    """Publish strings in Thunderbird's comm-l10n cross-channel repository from
    comm-strings-quarantine."""
    from tbxchannel.quarantine_to_strings import publish_strings

    command_context._set_log_level(True)
    command_context.activate_virtualenv()
    command_context.log_manager.enable_unstructured()
    publish_strings(command_context, quarantine_path, comm_l10n_path, actions, **kwargs)

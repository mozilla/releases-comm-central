# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this,
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from __future__ import absolute_import, print_function, unicode_literals

import argparse
from pathlib import Path

from mach.decorators import (
    CommandArgument,
    Command,
)


# https://stackoverflow.com/a/14117511
def _positive_int(value):
    value = int(value)
    if value <= 0:
        raise argparse.ArgumentTypeError(f"{value} must be a positive integer.")
    return value


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
    from tbxchannel import get_thunderbird_xc_config

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

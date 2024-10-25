# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import sys


def setup_logging(command_context, quiet=False, verbose=True):
    """
    Set up Python logging for all loggers, sending results to stderr (so
    that command output can be redirected easily) and adding the typical
    mach timestamp.
    """
    # remove the old terminal handler
    old = command_context.log_manager.replace_terminal_handler(None)

    # re-add it, with level and fh set appropriately
    if not quiet:
        level = logging.DEBUG if verbose else logging.INFO
        command_context.log_manager.add_terminal_logging(
            fh=sys.stderr,
            level=level,
            write_interval=old.formatter.write_interval,
            write_times=old.formatter.write_times,
        )

    # all of the taskgraph logging is unstructured logging
    command_context.log_manager.enable_unstructured()

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import copy
import os
import sys

from mozfile import load_source

from mach.decorators import Command
from mozbuild.base import BuildEnvironmentNotFoundException

HERE = os.path.abspath(os.path.dirname(__file__))


def setup_argument_parser():
    from mozlint import cli

    return cli.MozlintParser()


@Command(
    "commlint",
    category="thunderbird",
    description="Run linters with Thunderbird configurations.",
    parser=setup_argument_parser,
    virtualenv_name="lint",
)
def lint(command_context, *runargs, **lintargs):
    """Run linters."""
    command_context.activate_virtualenv()

    mach_lint = load_source(
        "mach_lint", os.path.join(command_context.topsrcdir, "tools/lint/mach_commands.py")
    )

    from mozlint import cli, parser

    try:
        buildargs = {}
        buildargs["substs"] = copy.deepcopy(dict(command_context.substs))
        buildargs["defines"] = copy.deepcopy(dict(command_context.defines))
        buildargs["topobjdir"] = command_context.topobjdir
        lintargs.update(buildargs)
    except BuildEnvironmentNotFoundException:
        pass

    lintargs.setdefault("root", command_context.topsrcdir)
    if lintargs["extra_args"] is None:
        lintargs["extra_args"] = []

    lintargs["exclude"] = mach_lint.get_global_excludes(**lintargs)

    # Add the linter code from gecko to sys.path. Normally handled by "config_paths"
    sys.path.insert(0, mach_lint.here)
    lintargs["config_paths"].insert(0, HERE)

    lintargs["virtualenv_bin_path"] = command_context.virtualenv_manager.bin_path
    lintargs["virtualenv_manager"] = command_context.virtualenv_manager
    if mach_lint.REPORT_WARNINGS and lintargs.get("show_warnings") is None:
        lintargs["show_warnings"] = "soft"
    for path in mach_lint.EXCLUSION_FILES:
        parser.GLOBAL_SUPPORT_FILES.append(os.path.join(command_context.topsrcdir, path))
    setupargs = {
        "mach_command_context": command_context,
    }
    return cli.run(*runargs, setupargs=setupargs, **lintargs)

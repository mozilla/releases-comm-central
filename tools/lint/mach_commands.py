# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from mach.decorators import Command


def setup_argument_parser():
    from mozlint import cli

    return cli.MozlintParser()


@Command(
    "commlint",
    category="thunderbird",
    description="Run linters with Thunderbird configurations.",
    parser=setup_argument_parser,
)
def commlint(command_context, paths, extra_args=[], **kwargs):
    kwargs["config_paths"].insert(0, "comm/tools/lint")
    return command_context._mach_context.commands.dispatch(
        "lint", command_context._mach_context, paths=paths, argv=extra_args, **kwargs
    )

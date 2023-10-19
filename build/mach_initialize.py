# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
mach_initialize.py

This file contains initialization code for mach commands that are outside of
the Firefox source repository.
"""

import os
import sys

from build import mach_initialize as mach_init


def mach_sys_path(mozilla_dir):
    # We need the "mach" module to access the logic to parse virtualenv
    # requirements. Since that depends on "packaging" (and, transitively,
    # "pyparsing"), we add those to the path too.
    sys.path[0:0] = [
        os.path.join(mozilla_dir, module)
        for module in (
            os.path.join("python", "mach"),
            os.path.join("testing", "mozbase", "mozfile"),
            os.path.join("third_party", "python", "packaging"),
            os.path.join("third_party", "python", "pyparsing"),
            os.path.join("third_party", "python", "six"),
        )
    ]
    from mach.requirements import MachEnvRequirements

    requirements = MachEnvRequirements.from_requirements_definition(
        mozilla_dir,
        True,  # is_thunderbird
        False,
        os.path.join(mozilla_dir, "comm/python/sites/tb_common.txt"),
    )
    return sorted(
        [
            os.path.normcase(os.path.join(mozilla_dir, pth.path))
            for pth in requirements.pth_requirements
        ]
    )


def initialize(topsrcdir, args=()):
    # Add comm Python module paths
    sys.path.extend(mach_sys_path(topsrcdir))

    CATEGORIES = {
        "thunderbird": {
            "short": "Thunderbird Development",
            "long": "Mach commands that aid Thunderbird Development",
            "priority": 65,
        },
    }
    mach_init.CATEGORIES.update(CATEGORIES)

    from mach.command_util import MACH_COMMANDS, MachCommandReference

    # Additional Thunderbird mach commands
    COMM_MACH_COMMANDS = {
        "commlint": MachCommandReference("comm/tools/lint/mach_commands.py"),
        "tb-add-missing-ftls": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-fluent-migration-test": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-l10n-quarantine-to-strings": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-l10n-x-channel": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-esmify": MachCommandReference("comm/tools/esmify/mach_commands.py"),
        "tb-storybook": MachCommandReference("comm/mail/components/storybook/mach_commands.py"),
    }
    MACH_COMMANDS.update(COMM_MACH_COMMANDS)

    driver = mach_init.initialize(topsrcdir, args)

    return driver

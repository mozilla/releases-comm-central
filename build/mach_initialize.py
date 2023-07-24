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

CATEGORIES = {
    "thunderbird": {
        "short": "Thunderbird Development",
        "long": "Mach commands that aid Thunderbird Development",
        "priority": 65,
    },
}


def mach_sys_path(mozilla_dir):
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


def initialize(topsrcdir):
    driver = mach_init.initialize(topsrcdir)

    # Add comm Python module paths
    sys.path.extend(mach_sys_path(topsrcdir))

    # Define Thunderbird mach command categories
    for category, meta in CATEGORIES.items():
        driver.define_category(category, meta["short"], meta["long"], meta["priority"])

    from mach.util import MachCommandReference

    # Additional Thunderbird mach commands
    MACH_COMMANDS = {
        "commlint": MachCommandReference("comm/tools/lint/mach_commands.py"),
        "tb-add-missing-ftls": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-fluent-migration-test": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-l10n-quarantine-to-strings": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-l10n-x-channel": MachCommandReference("comm/python/l10n/mach_commands.py"),
        "tb-esmify": MachCommandReference("comm/tools/esmify/mach_commands.py"),
        "tb-storybook": MachCommandReference("comm/mail/components/storybook/mach_commands.py"),
    }

    # missing_ok should only be set when a sparse checkout is present, comm repos
    # do not make use of sparse profiles (though they do exist)
    driver.load_commands_from_spec(MACH_COMMANDS, topsrcdir, missing_ok=False)

    return driver

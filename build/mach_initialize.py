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

# Individual files that provide mach commands
MACH_MODULES = [
    "comm/python/l10n/mach_commands.py",
    "comm/tools/lint/mach_commands.py",
    "comm/tools/esmify/mach_commands.py",
    "comm/mail/components/storybook/mach_commands.py",
]

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

    for path in MACH_MODULES:
        driver.load_commands_from_file(os.path.join(topsrcdir, path))

    return driver

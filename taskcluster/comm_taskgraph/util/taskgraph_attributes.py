#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""
This file contains the constants from gecko_taskgraph.util.attributes, but
only the Thunderbird repositories are included.

"""

from importlib import import_module

# gecko_taskgraph.util.attributes
INTEGRATION_PROJECTS = set({})

TRUNK_PROJECTS = INTEGRATION_PROJECTS | {"comm-central"}

RELEASE_PROJECTS = {
    "comm-central",
    "comm-beta",
    "comm-release",
    "comm-esr115",
}

RELEASE_PROMOTION_PROJECTS = {
    "jamun",
    "try-comm-central",
} | RELEASE_PROJECTS

TEMPORARY_PROJECTS = set({})

TRY_PROJECTS = {
    "try-comm-central",
}

ALL_PROJECTS = RELEASE_PROMOTION_PROJECTS | TRUNK_PROJECTS | TEMPORARY_PROJECTS

RUN_ON_PROJECT_ALIASES = {
    # key is alias, value is lambda to test it against
    "all": lambda project: True,
    "integration": lambda project: (project in INTEGRATION_PROJECTS or project == "toolchains"),
    "release": lambda project: (project in RELEASE_PROJECTS or project == "toolchains"),
    "trunk": lambda project: (project in TRUNK_PROJECTS or project == "toolchains"),
    "trunk-only": lambda project: project in TRUNK_PROJECTS,
}

# gecko_taskgraph.util.scriptworker
SIGNING_SCOPE_ALIAS_TO_PROJECT = [
    [
        "all-nightly-branches",
        {
            "comm-central",
        },
    ],
    [
        "all-release-branches",
        {
            "comm-beta",
            "comm-release",
            "comm-esr115",
        },
    ],
]

"""Map beetmover scope aliases to sets of projects.
"""
BEETMOVER_SCOPE_ALIAS_TO_PROJECT = [
    [
        "all-nightly-branches",
        {
            "comm-central",
        },
    ],
    [
        "all-release-branches",
        {
            "comm-beta",
            "comm-release",
            "comm-esr115",
        },
    ],
]

"""Map balrog scope aliases to sets of projects.

This is a list of list-pairs, for ordering.
"""
BALROG_SCOPE_ALIAS_TO_PROJECT = [
    [
        "nightly",
        {
            "comm-central",
        },
    ],
    [
        "beta",
        {
            "comm-beta",
        },
    ],
    [
        "release",
        {
            "comm-release",
        },
    ],
    [
        "esr115",
        {
            "comm-esr115",
        },
    ],
]


def patch_attributes():
    """These constants are used throughout gecko_taskgraph. They are patched
    with the Thunderbird repository values in order to keep Thunderbird specific
    code out of gecko_taskgraph."""
    constants = {
        "INTEGRATION_PROJECTS": INTEGRATION_PROJECTS,
        "TRUNK_PROJECTS": TRUNK_PROJECTS,
        "RELEASE_PROJECTS": RELEASE_PROJECTS,
        "RELEASE_PROMOTION_PROJECTS": RELEASE_PROMOTION_PROJECTS,
        "TEMPORARY_PROJECTS": TEMPORARY_PROJECTS,
        "TRY_PROJECTS": TRY_PROJECTS,
        "ALL_PROJECTS": ALL_PROJECTS,
        "RUN_ON_PROJECT_ALIASES": RUN_ON_PROJECT_ALIASES,
    }
    attributes = import_module("gecko_taskgraph.util.attributes")
    for key, value in constants.items():
        setattr(attributes, key, value)


def patch_scriptworker():
    """Similar to the above attributes, these constants are then used to set
    up scopes appropriately for various scriptworker jobs."""
    constants = {
        "SIGNING_SCOPE_ALIAS_TO_PROJECT": SIGNING_SCOPE_ALIAS_TO_PROJECT,
        "BEETMOVER_SCOPE_ALIAS_TO_PROJECT": BEETMOVER_SCOPE_ALIAS_TO_PROJECT,
        "BALROG_SCOPE_ALIAS_TO_PROJECT": BALROG_SCOPE_ALIAS_TO_PROJECT,
    }
    scriptworker = import_module("gecko_taskgraph.util.scriptworker")
    for key, value in constants.items():
        setattr(scriptworker, key, value)


patch_attributes()
patch_scriptworker()

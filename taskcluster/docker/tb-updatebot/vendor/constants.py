#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import shutil
from enum import Enum
from pathlib import Path


class OperatingMode(Enum):
    PROD = "prod"
    DEV = "dev"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def get(cls):
        repo = os.environ.get("COMM_HEAD_REPOSITORY", "") == "https://hg.mozilla.org/comm-central"
        if repo:
            return OperatingMode.PROD
        return OperatingMode.DEV


class Level(Enum):
    ONE = 1
    THREE = 3

    def __str__(self) -> str:
        return str(self.value)

    @classmethod
    def get(cls, mode: OperatingMode):
        if mode is OperatingMode.PROD:
            return cls.THREE
        return cls.ONE


HOME_PATH = Path.home()
GECKO_PATH = Path(os.environ.get("GECKO_PATH", ""))
COMM_PATH = GECKO_PATH / "comm"

PROJECT = os.environ.get("COMM_HEAD_REPOSITORY", "/comm-central").split("/")[-1]
STABLE_BRANCH = PROJECT not in ("comm-central", "try-comm-central")

DEV_PHAB_URL = "https://bogus.example.com/"
PROD_PHAB_URL = "https://phabricator.services.mozilla.com/api/"

RESOLVED_OPERATING_MODE = OperatingMode.get()
RESOLVED_LEVEL = Level.get(RESOLVED_OPERATING_MODE)

PHABRICATOR_URL = DEV_PHAB_URL if RESOLVED_OPERATING_MODE is OperatingMode.DEV else PROD_PHAB_URL

SECRET_PATH = f"project/comm/thunderbird/releng/build/level-{RESOLVED_LEVEL.value}"

GECKO_HEAD_REV = os.environ.get("GECKO_HEAD_REV")
COMM_HEAD_REV = os.environ.get("COMM_HEAD_REV")

HG = shutil.which("hg")
MOZ_PHAB = shutil.which("moz-phab")

REVIEWERS = os.environ.get("REVIEWERS")

# Opt builds on the three desktop platforms, and nothing else.
BUILDS_ONLY_TRY_CONFIG = {
    "tasks": [
        "build-linux64/opt",
        "build-macosx64/opt",
        "build-win64/opt",
    ]
}

# Everything the ash project runs: builds plus tests on the three desktop
# platforms. A third party library update can build fine and still break at
# runtime, so builds alone are not enough of a check.
BUILDS_AND_TESTS_TRY_CONFIG = {
    "version": 2,
    "parameters": {
        "optimize_target_tasks": False,
        "target_tasks_method": "ash_tasks",
    },
}


def validate():
    """
    Validate required environment variables and the tools the jobs shell out to.
    """
    if not os.environ.get("GECKO_PATH"):
        raise Exception("Missing GECKO_PATH environment variable.")
    if REVIEWERS is None:
        raise Exception("Missing REVIEWERS environment variable.")
    if HG is None:
        raise Exception("Mercurial (hg) is not on PATH.")
    if MOZ_PHAB is None:
        raise Exception("moz-phab is not on PATH.")

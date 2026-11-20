#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""
Steps shared by the updatebot jobs.
"""

import os
import re
from typing import Optional

from .constants import (
    COMM_PATH,
    HG,
    PHABRICATOR_URL,
    RESOLVED_OPERATING_MODE,
    SECRET_PATH,
    OperatingMode,
)
from .support import (
    DevConduit,
    ExtendedConduit,
    TaskClusterSecrets,
    log,
    notify_sheriffs,
    notify_user,
    run_cmd,
    write_arcrc,
    write_hgrc_userinfo,
    write_ssh_key,
    write_try_task_config,
)

# The hg push hook prints "Follow the progress of your build on Treeherder:"
# followed by this URL on stdout.
TREEHERDER_URL_RE = re.compile(r"https://treeherder\.mozilla\.org/\S+")


def prepare_environment():
    """Retrieve secrets and write out config files."""
    log(f"Operating mode is {RESOLVED_OPERATING_MODE}")

    if RESOLVED_OPERATING_MODE is OperatingMode.PROD:
        log("Getting secrets from Taskcluster...")
        secret_mgr = TaskClusterSecrets(SECRET_PATH)
        phabricator_token = secret_mgr.get_secret("arc-phabricator-token")
        try_ssh = secret_mgr.get_secret("tbirdtry")
        try_ssh_user = try_ssh["user"]
        try_ssh_key = try_ssh["ssh_privkey"]
    else:
        log("Using fake secrets...")
        phabricator_token = "null"
        try_ssh_user = "nobody"
        try_ssh_key = "nokey"

    log("Setting up Mercurial user, ssh key, and Phabricator token...")
    ssh_key_file = write_ssh_key("ssh_id", try_ssh_key)
    write_hgrc_userinfo(try_ssh_user, ssh_key_file)
    write_arcrc(PHABRICATOR_URL, phabricator_token)


def get_conduit():
    if RESOLVED_OPERATING_MODE is OperatingMode.PROD:
        return ExtendedConduit(COMM_PATH)
    return DevConduit(COMM_PATH)


def notify(body: str):
    log(f"Notification: {body}")
    if RESOLVED_OPERATING_MODE is not OperatingMode.PROD:
        log("Skipping Sheriff notification.")
        notify_user(body)
        return
    notify_sheriffs(body)


def push_to_try(message: str, try_config: dict) -> Optional[str]:
    """Push to try-comm-central, returning the Treeherder URL the push hook prints."""
    os.chdir(COMM_PATH)
    log("Submitting try-comm-central build.")
    try_task_config = write_try_task_config(COMM_PATH, try_config)
    run_cmd([HG, "add", try_task_config.name])
    if RESOLVED_OPERATING_MODE is not OperatingMode.PROD:
        log("Skipping submit to try-comm-central in dev mode...")
        return None

    result = run_cmd([HG, "push-to-try", "-s", "try-cc", "-m", message])
    match = TREEHERDER_URL_RE.search(result.stdout)
    if match is None:
        log("No Treeherder URL found in the push output.")
        return None
    return match.group(0)

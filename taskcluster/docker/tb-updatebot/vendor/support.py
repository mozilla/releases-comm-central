#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""
Support functions for comm-central third party code management
"""

import json
import os
import stat
from pathlib import Path

import requests

import taskcluster

SECRET_URL_BASE = "http://taskcluster/secrets/v1/secret/"


def log(*args):
    print(*args)


class TaskClusterSecrets:
    def __init__(self, base_path: str):
        self.base_path = base_path

    def get_secret(self, name: str) -> dict | str:
        secret = None
        e_name = name.replace("-", "")
        if f"TASKCLUSTER_SECRET_{e_name}" in os.environ:
            secret = json.loads(os.environ[f"TASKCLUSTER_SECRET_{e_name}"])
        elif "TASK_ID" in os.environ:
            secrets_url = f"{SECRET_URL_BASE}/{self.base_path}/{name}"
            res = requests.get(secrets_url)
            res.raise_for_status()
            secret = res.json()
        else:
            secrets = taskcluster.Secrets(taskcluster.optionsFromEnvironment())
            secret = secrets.get(f"{self.base_path}/{name}")
        secret = secret["secret"] if "secret" in secret else None
        return secret


def write_ssh_key(filename: str, key: str) -> Path:
    ssh_key_path = Path.home() / filename
    if key is not None:
        with open(ssh_key_path, "w") as sshkey:
            sshkey.write(key)
        os.chmod(ssh_key_path, stat.S_IRUSR | stat.S_IWUSR)
    return ssh_key_path


def write_hgrc_userinfo(username: str, ssh_key_path: Path):
    hgrc_path = Path.home() / ".hgrc"
    with open(hgrc_path, "w") as hgrcfile:
        hgrcfile.write(
            f"""[ui]
ssh = ssh -i {str(ssh_key_path)} -l {username}
username = Thunderbird Updatebot <{username}@mozilla.com>
"""
        )


def write_arcrc(phabricator_url: str, phabricator_token: str):
    arc_filename = Path.home() / ".arcrc"
    arc_json = {"hosts": {phabricator_url: phabricator_token}}
    with open(arc_filename, "w") as arcrc:
        json.dump(arc_json, arcrc)
    os.chmod(arc_filename, stat.S_IRUSR | stat.S_IWUSR)

#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""
Support functions for comm-central third party code management
"""

import argparse
import json
import os
import shutil
import stat
import subprocess
from pathlib import Path
from typing import Union

import requests
from mozphab.conduit import ConduitAPI
from mozphab.detect_repository import repo_from_args

import taskcluster

SECRET_URL_BASE = "http://taskcluster/secrets/v1/secret/"
NOTIFY_URL_BASE = "http://taskcluster/api/notify/v1/matrix"
ARTIFACT_URL_BASE = "http://taskcluster/api/queue/v1/task/"

TB_SHERIFF_MATRIX_ID = "!TWztIhgqLawNpRBZTC:mozilla.org"

MOZ_PHAB = shutil.which("moz-phab")
assert MOZ_PHAB is not None


def log(*args):
    print(*args)


def run_cmd(*args, **kwargs):
    """Wrapper around subprocess.run that logs the command to run."""
    log(f"Running command: {' '.join(args[0])}")
    kwargs.update({"capture_output": True, "text": True, "check": True})
    try:
        rv = subprocess.run(*args, **kwargs)
    except subprocess.CalledProcessError as e:
        rv = e
    finally:
        log(f"Return code: {rv.returncode}")
        log(rv.stdout)
        log(rv.stderr)
        if type(rv) is subprocess.CalledProcessError:
            raise rv

    return rv


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


def write_try_task_config(comm_src_dir: Path) -> Path:
    try_task_config_file = comm_src_dir / "try_task_config.json"
    try_task_config = {
        "tasks": [
            "build-linux64-rust/opt",
            "build-macosx64-rust/opt",
            "build-win64-rust/opt",
        ]
    }
    with open(try_task_config_file, "w") as try_fp:
        json.dump(try_task_config, try_fp, indent=2)
    return try_task_config_file


def notify_sheriffs(body: str):
    data = {
        "roomId": TB_SHERIFF_MATRIX_ID,
        "body": body,
    }
    requests.post(NOTIFY_URL_BASE, data=data)


def artifact_url(task_id: str, artifact_path: str) -> str:
    return f"{ARTIFACT_URL_BASE}/{task_id}/artifacts/{artifact_path}"


def fetch_indexed_artifact(previous_task_id: str, artifact_path: str) -> str or None:
    url = artifact_url(previous_task_id, artifact_path)
    log(f"Fetching artifact {url}")
    response = requests.get(url)
    try:
        response.raise_for_status()
    except requests.exceptions.HTTPError:
        log(f"Status code {response.status_code}.")
        if response.status_code == 404:
            return None
        raise
    return response.text


class ExtendedConduit(ConduitAPI):
    def __init__(self, repo_root: Union[Path, None] = None) -> None:
        super().__init__()
        if repo_root is None:
            return
        repo = repo_from_args(argparse.Namespace(path=str(repo_root), safe_mode=False))
        self.set_repo(repo)

    def is_revision_open(self, phab_rev_id: str) -> bool:
        rev_id = int(phab_rev_id[1:])
        revisions = self.get_revisions([rev_id])
        if revisions:
            return not revisions[0]["fields"]["status"]["closed"]

    def abandon_revision(self, phab_rev_id: str):
        transactions = [
            {"type": "abandon", "value": True},
        ]
        self.apply_transactions_to_revision(phab_rev_id, transactions)

    def submit(self):
        return run_cmd([MOZ_PHAB, "submit", "-s", "--no-lint"])


class DevConduit:
    def __init__(self, repo_root: Path) -> None:
        self.repo = str(repo_root)

    def is_revision_open(self, phab_rev_id: str) -> bool:
        return False

    def abandon_revision(self, phab_rev_id: str):
        return

    def submit(self):
        return subprocess.CompletedProcess([], 0, stdout="output /D12345")

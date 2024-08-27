#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.append(".")

from .support import (  # noqa: I001
    DevConduit,
    ExtendedConduit,
    TaskClusterSecrets,
    fetch_indexed_artifact,
    log,
    notify_sheriffs,
    notify_user,
    run_cmd,
    write_ssh_key,
    write_arcrc,
    write_hgrc_userinfo,
    write_try_task_config,
)

# Bump this number when you need to cause a commit for the job to re-run: 0

HOME_PATH = Path.home()
GECKO_PATH = Path(os.environ.get("GECKO_PATH"))
COMM_PATH = GECKO_PATH / "comm"

OPERATING_MODE = (
    "prod"
    if os.environ.get("COMM_HEAD_REPOSITORY", "") == "https://hg.mozilla.org/comm-central"
    else "dev"
)
PROJECT = os.environ.get("COMM_HEAD_REPOSITORY", "/comm-central").split("/")[-1]

PROD_PHAB_URL = "https://phabricator.services.mozilla.com/api/"

phabricator_url = "https://bogus.example.com/" if OPERATING_MODE == "dev" else PROD_PHAB_URL

LEVEL = 1
if OPERATING_MODE == "prod":
    LEVEL = 3

SECRET_PATH = f"project/comm/thunderbird/releng/build/level-{LEVEL}"

HG = shutil.which("hg")
assert HG is not None

REVIEWERS = os.environ.get("REVIEWERS")
if REVIEWERS is None:
    raise Exception("Missing REVIEWERS environment variable.")

os.environ["MOZ_FETCHES_DIR"] = os.path.abspath(os.environ["MOZ_FETCHES_DIR"])

GECKO_HEAD_REV = os.environ.get("GECKO_HEAD_REV")
COMM_HEAD_REV = os.environ.get("COMM_HEAD_REV")


def prepare():
    """Retrieve secrets and write out config files."""
    # Get TC Secrets =======================================
    log("Operating mode is ", OPERATING_MODE)
    if OPERATING_MODE == "prod":
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

    # Set Up Mercurial, SSH & Phabricator ==============================
    log("Setting up Mercurial user, ssh key, and Phabricator token...")
    ssh_key_file = write_ssh_key("ssh_id", try_ssh_key)
    write_hgrc_userinfo(try_ssh_user, ssh_key_file)
    write_arcrc(phabricator_url, phabricator_token)


def run_check_upstream() -> bool:
    """Runs mach tb-rust check-upstream.
    :rtype: bool: True if check-upstream reports no problems, False if need to rerun vendoring.
    """
    log("Running updatebot")
    os.chdir(GECKO_PATH)
    try:
        run_cmd(["./mach", "tb-rust", "check-upstream"])
        log("Rust code is in sync with upstream.")
        notify(f"Sheriffs: No rust changes for Gecko head rev {GECKO_HEAD_REV[:12]}.")
        if OPERATING_MODE == "dev":
            notify("Forcing complete run in dev mode.")
            return False
        return True
    except subprocess.CalledProcessError as e:
        if e.returncode == 88:
            notify(
                f"Sheriffs: Rust changes incoming for Gecko head rev {GECKO_HEAD_REV[:12]}. Stay tuned!"
            )
            return False
        else:
            raise


def run_vendor():
    os.chdir(GECKO_PATH)
    log("Running tb-rust vendor")
    run_cmd(["./mach", "tb-rust", "vendor"])

    os.chdir(COMM_PATH)
    result = run_cmd([HG, "id", "-T", "{dirty}\n"])
    if result.stdout[0] != "+":
        notify(f"Failed to complete Rust vendor automation for {GECKO_HEAD_REV[:12]}.")
        raise Exception("Whoa there! No changes were found. ABORT ABORT ABORT ABORT ABORT!")


def compare_checksums(old_checksums):
    if old_checksums is None:
        log("Old checksums invalid.")
        return False
    log("Comparing checksums with previously submitted review request")
    new_checksums = open(COMM_PATH / "rust/checksums.json").read()
    return old_checksums == new_checksums


def commit_changes():
    os.chdir(COMM_PATH)
    run_cmd([HG, "addremove", "third_party/rust/", "rust/"])
    logmsg = f"""Bug 1878375 - Synchronize vendored Rust libraries with mozilla-central. r={REVIEWERS}

mozilla-central: {GECKO_HEAD_REV}
comm-central: {COMM_HEAD_REV}
"""
    with tempfile.NamedTemporaryFile() as fp:
        fp.write(logmsg.encode("utf-8"))
        fp.flush()

        run_cmd([HG, "commit", "-l", fp.name])

    run_cmd([HG, "export", "-r", "tip", "-o", str(HOME_PATH / "hg_diff.patch")])


def submit_phabricator(previous_data: dict) -> bool:
    previous_phabrev = previous_data.get("phab_rev_id.txt")
    conduit = get_conduit()

    if previous_phabrev is None:
        log("No previous Phabricator revision found.")
    else:
        if conduit.is_revision_open(previous_phabrev):
            if compare_checksums(previous_data.get("checksums.json")):
                # checksums.json from earlier submitted rev is the same as
                # after running tb-rust vendor again. Do not submit a new
                # revision, exit cleanly.
                log(f"checksums.json from {previous_phabrev} is the same.")
                log("Exiting without submitting a new revision.")
                notify(f"Sheriffs: Please land {previous_phabrev} to fix Rust builds.")
                return False
            else:
                log(
                    f"Previous revision {previous_phabrev} is stale. Abandoning it and re-submitting."
                )
                conduit.abandon_revision(previous_phabrev)

    os.chdir(COMM_PATH)
    result = conduit.submit()

    # Look for the Phabricator revision URL on the last line of stdout
    if result.returncode == 0:
        line = result.stdout.rstrip().split("\n")[-1]
        match = re.search(r"/(D\d+)$", line)
        if match:
            phab_rev = match.group(1)
            notify(
                f"Sheriffs: Rust vendored libraries update for {GECKO_HEAD_REV[:12]} in {phab_rev}!"
            )
            shutil.copy2(COMM_PATH / "rust/checksums.json", HOME_PATH / "checksums.json")
            with open(HOME_PATH / "phab_rev_id.txt", "w") as fp:
                fp.write(phab_rev)
            return True
        raise Exception("Failed to match a Phabricator review ID.")


def run_try_cc():
    os.chdir(COMM_PATH)
    log("Submitting try-comm-central build.")
    try_task_config = write_try_task_config(COMM_PATH)
    run_cmd([HG, "add", try_task_config.name])
    if OPERATING_MODE == "prod":
        run_cmd([HG, "push-to-try", "-s", "try-cc", "-m", "Automation: Rust build check"])
    else:
        log("Skipping submit to try-comm-central in dev mode...")


def get_old_artifacts() -> dict:
    rv = {}
    if previous_task_id := os.environ.get("PREVIOUS_TASK_ID"):
        for filename in ("phab_rev_id.txt", "checksums.json"):
            previous_data = fetch_indexed_artifact(previous_task_id, f"public/{filename}")
            if previous_data is not None:
                rv[filename] = previous_data
                with open(HOME_PATH / filename, "w") as fp:
                    fp.write(previous_data)
    return rv


def get_conduit():
    if OPERATING_MODE == "prod":
        return ExtendedConduit(COMM_PATH)
    return DevConduit(COMM_PATH)


def notify(body: str):
    log(f"Notification: {body}")
    if OPERATING_MODE != "prod":
        log("Skipping Sheriff notification.")
        notify_user(body)
        return
    notify_sheriffs(body)


def main():
    prepare()
    previous_data = get_old_artifacts()
    result = run_check_upstream()
    if result:
        sys.exit(0)
    run_vendor()
    commit_changes()
    do_run_try_cc = submit_phabricator(previous_data)
    if not do_run_try_cc:
        sys.exit(0)
    run_try_cc()


if __name__ == "__main__":
    main()

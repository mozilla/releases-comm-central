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

GECKO_PATH = os.environ.get("GECKO_PATH")
sys.path.append(os.path.join(GECKO_PATH, "third_party/python/taskcluster"))
sys.path.append(os.path.join(GECKO_PATH, "third_party/python/taskcluster_urls"))
sys.path.append(os.path.join(GECKO_PATH, "third_party/python/slugid"))
sys.path.append(os.path.join(GECKO_PATH, "third_party/python/mohawk"))

sys.path.append(".")

from .support import (  # noqa: I001
    TaskClusterSecrets,
    log,
    notify_sheriffs,
    run_cmd,
    write_ssh_key,
    write_arcrc,
    write_hgrc_userinfo,
    write_try_task_config,
)

# Bump this number when you need to cause a commit for the job to re-run: 0

HOME_PATH = Path.home()
COMM_PATH = os.path.join(GECKO_PATH, "comm")

OPERATING_MODE = (
    "prod"
    if os.environ.get("COMM_HEAD_REPOSITORY", "") == "https://hg.mozilla.org/comm-central"
    else "dev"
)

PROD_PHAB_URL = "https://phabricator.services.mozilla.com/api/"

phabricator_url = "https://bogus.example.com/" if OPERATING_MODE == "dev" else PROD_PHAB_URL

LEVEL = 1
if OPERATING_MODE == "prod":
    LEVEL = 3

SECRET_PATH = f"project/comm/thunderbird/releng/build/level-{LEVEL}"

HG = shutil.which("hg")
assert HG is not None
MOZ_PHAB = shutil.which("moz-phab")
assert MOZ_PHAB is not None

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
    log("Getting secrets...")
    if OPERATING_MODE == "prod":
        secret_mgr = TaskClusterSecrets(SECRET_PATH)
        phabricator_token = secret_mgr.get_secret("arc-phabricator-token")
        try_ssh = secret_mgr.get_secret("tbirdtry")
        try_ssh_user = try_ssh["user"]
        try_ssh_key = try_ssh["ssh_privkey"]

        # Set Up Mercurial, SSH & Phabricator ==============================
        log("Setting up Mercurial user, ssh key, and Phabricator token...")
        ssh_key_file = write_ssh_key("ssh_id", try_ssh_key)
        write_hgrc_userinfo(try_ssh_user, ssh_key_file)
        write_arcrc(phabricator_url, phabricator_token)
    else:
        write_hgrc_userinfo("no hg user config", Path("/dev/null"))
        log(f"Skipping retrieving secrets in {OPERATING_MODE} mode.")


def run_check_upstream() -> bool:
    """Runs mach tb-rust check-upstream.
    :rtype: bool: True if check-upstream reports no problems, False if need to rerun vendoring.
    """
    log("Running updatebot")
    os.chdir(GECKO_PATH)
    try:
        run_cmd(["./mach", "tb-rust", "check-upstream"])
        log("Rust code is in sync with upstream.")
        notify_sheriffs(f"Sheriffs: No rust changes for Gecko head rev {GECKO_HEAD_REV[:12]}.")
        return True
    except subprocess.CalledProcessError as e:
        if e.returncode == 88:
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
        notify_sheriffs(f"Failed to complete Rust vendor automation for {GECKO_HEAD_REV[:12]}.")
        raise Exception("Whoa there! No changes were found. ABORT ABORT ABORT ABORT ABORT!")


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


def submit_phabricator():
    if OPERATING_MODE != "prod":
        log(f"Skipping moz-phab submission in {OPERATING_MODE} mode.")
        return

    os.chdir(COMM_PATH)
    result = run_cmd([MOZ_PHAB, "submit", "-s", "--no-lint"])

    # Look for the Phabricator revision URL on the last line of stdout
    if result.returncode == 0:
        line = result.stdout.rstrip().split("\n")[-1]
        match = re.search(r"/(D\d+)$", line)
        if match:
            phab_rev = match.group(1)
            notify_sheriffs(
                f"Sheriffs: Rust vendored libraries update for {GECKO_HEAD_REV[:12]} in {phab_rev}!"
            )


def run_try_cc():
    os.chdir(COMM_PATH)
    log("Submitting try-comm-central build.")
    try_task_config = write_try_task_config(Path(COMM_PATH))
    run_cmd([HG, "add", try_task_config.name])
    run_cmd([HG, "push-to-try", "-s", "try-cc", "-m", "Automation: Rust build check"])


def main():
    prepare()
    result = run_check_upstream()
    if result:
        sys.exit(0)
    run_vendor()
    commit_changes()
    submit_phabricator()
    run_try_cc()


if __name__ == "__main__":
    main()

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
    fetch_indexed_artifact,
    log,
    run_cmd,
)

from .constants import (
    BUILDS_ONLY_TRY_CONFIG,
    COMM_HEAD_REV,
    COMM_PATH,
    GECKO_HEAD_REV,
    GECKO_PATH,
    HG,
    HOME_PATH,
    REVIEWERS,
    RESOLVED_OPERATING_MODE,
    OperatingMode,
    validate,
)
from .error import SubmitException, UpdatebotException, VendorException
from .job import get_conduit, notify, prepare_environment, push_to_try

os.environ["MOZ_FETCHES_DIR"] = os.path.abspath(os.environ["MOZ_FETCHES_DIR"])


def check_gecko_checkout():
    """Ensure the Gecko checkout is usable before running any mach command."""
    if (GECKO_PATH / "mach").exists():
        return

    raise Exception(
        f"No mach in the Gecko checkout at {GECKO_PATH} (GECKO_HEAD_REV={GECKO_HEAD_REV}). "
        "That revision is probably a tag-only commit on the tags-unified branch "
        "instead of a head of mozilla-central's default branch."
    )


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
        if RESOLVED_OPERATING_MODE is OperatingMode.DEV:
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
    result = run_cmd([HG, "status", "third_party/rust/", "rust/"])
    if not result.stdout.strip():
        raise VendorException(f"tb-rust vendor produced no changes for {GECKO_HEAD_REV[:12]}.")


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

    # Explicitly add the content of the Cargo.toml.orig files as they are
    # covered by the hgignore pattern "*.orig".
    extra_files = [str(p) for p in Path("third_party/rust").glob("**/Cargo.toml.orig")]
    if extra_files:
        run_cmd([HG, "addremove"] + extra_files)

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
    line = result.stdout.rstrip().split("\n")[-1]
    match = re.search(r"/(D\d+)$", line)
    if not match:
        raise SubmitException("No Phabricator revision id in the moz-phab output.")

    phab_rev = match.group(1)
    notify(f"Sheriffs: Rust vendored libraries update for {GECKO_HEAD_REV[:12]} in {phab_rev}!")
    shutil.copy2(COMM_PATH / "rust/checksums.json", HOME_PATH / "checksums.json")
    with open(HOME_PATH / "phab_rev_id.txt", "w") as fp:
        fp.write(phab_rev)
    return True


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


def main():
    validate()
    prepare_environment()
    check_gecko_checkout()
    previous_data = get_old_artifacts()
    try:
        result = run_check_upstream()
        if result:
            sys.exit(0)
        run_vendor()
        commit_changes()
        do_run_try_cc = submit_phabricator(previous_data)
        if not do_run_try_cc:
            sys.exit(0)
        push_to_try("Automation: Rust build check", BUILDS_ONLY_TRY_CONFIG)
    except UpdatebotException as e:
        notify(f"Rust vendor automation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

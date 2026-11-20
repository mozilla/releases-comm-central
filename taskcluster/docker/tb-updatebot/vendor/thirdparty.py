#!/usr/bin/env python3
#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Update out of date third party libraries in comm/third_party.

Everything specific to a library lives in its moz.yaml manifest, so this is a
generic loop: ask ./mach vendor whether upstream has moved, re-vendor, and put
the result up for review. Only one library is handled per run, to keep the
Phabricator revisions from stacking on each other.

Libraries opt-in for automatic vendoring in their respective moz.yml manifests.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterator, List, NamedTuple, Optional, Tuple

import yaml

from .constants import (
    BUILDS_AND_TESTS_TRY_CONFIG,
    COMM_PATH,
    GECKO_PATH,
    HG,
    HOME_PATH,
    PROJECT,
    REVIEWERS,
    STABLE_BRANCH,
    validate,
)
from .error import (
    SubmitException,
    UpdatebotException,
    UpdateCheckException,
    VendorException,
)
from .job import get_conduit, notify, prepare_environment, push_to_try
from .support import fetch_indexed_artifact, log, run_cmd
from .versions import CUSTOM_TAG_PATTERNS, DEFAULT_TAG_PATTERN, parse_ls_remote, select_update

STATE_ARTIFACT = "third_party_state.json"

# Standing bug that every automated third party library update is filed under.
BUG_ID = "2063073"


# built from the libraries' moz.yaml
class Library(NamedTuple):
    name: str
    # origin.revision
    revision: str
    # vendoring.url
    url: str
    # vendoring.tracking, "tag" or "commit"
    tracking: str
    # CUSTOM_TAG_PATTERNS entry, or DEFAULT_TAG_PATTERN
    tag_pattern: str


def last_line(output: Optional[str]) -> str:
    """The last non-blank line of command output, to keep notifications to one line."""
    lines = [line for line in (output or "").splitlines() if line.strip()]
    return lines[-1] if lines else ""


def moz_yaml_path(library: str) -> Path:
    return COMM_PATH / "third_party" / library / "moz.yaml"


def enabled_libraries() -> List[Library]:
    """Libraries with an enabled vendoring task in their moz.yaml."""
    libraries = []
    for manifest in sorted((COMM_PATH / "third_party").glob("*/moz.yaml")):
        with open(manifest) as fp:
            data = yaml.safe_load(fp)

        tasks = (data.get("updatebot") or {}).get("tasks") or []

        if any(task.get("type") == "vendoring" and task.get("enabled") for task in tasks):
            lib = Library(
                name=manifest.parent.name,
                revision=data["origin"]["revision"],
                url=data["vendoring"]["url"],
                # mach vendor defaults to commit when tracking is unset
                tracking=data["vendoring"].get("tracking", "commit"),
                tag_pattern=CUSTOM_TAG_PATTERNS.get(manifest.parent.name, DEFAULT_TAG_PATTERN),
            )
            # Stable branches only take patch releases, so skip tip commits.
            if lib.tracking != "tag" and STABLE_BRANCH:
                log(f"Skipping commit-tracked {lib.name} on {PROJECT}.")
                continue

            libraries.append(lib)

    return libraries


def check_for_update(library: Library) -> Optional[str]:
    """Return the upstream revision to update to, or None when up to date."""
    log(f"Checking for update for {library.name}")

    try:
        if library.tracking == "tag":
            tags = run_cmd(
                ["git", "ls-remote", "--tags", "--refs", library.url],
            )

            parsed_tags = parse_ls_remote(tags.stdout)

            return select_update(
                library.revision,
                parsed_tags,
                STABLE_BRANCH,
                library.tag_pattern,
            )

        mach = run_cmd(
            [
                "./mach",
                "vendor",
                "--check-for-update",
                str(moz_yaml_path(library.name)),
            ],
            cwd=GECKO_PATH,
        )
    except subprocess.CalledProcessError as e:
        raise UpdateCheckException(
            f"Update check failed for {library.name}: {last_line(e.stderr) or last_line(e.stdout)}"
        ) from e
    except ValueError as e:
        raise UpdateCheckException(f"Update check failed for {library.name}: {e}") from e

    lines = [line for line in mach.stdout.splitlines() if line.strip()]
    if not lines:
        return None

    fields = lines[-1].split()
    if len(fields) != 2:
        raise UpdateCheckException(
            f"Unexpected mach vendor output for {library.name}:\n{mach.stdout}"
        )

    return fields[0]


def get_previous_state() -> dict:
    """The {library: {revision, phab_rev}} map left behind by the previous run."""
    if previous_task_id := os.environ.get("PREVIOUS_TASK_ID"):
        if data := fetch_indexed_artifact(previous_task_id, f"public/{STATE_ARTIFACT}"):
            return json.loads(data)
    return {}


def save_state(state: dict):
    """Written on every run, including no-op runs, so state is not lost."""
    with open(HOME_PATH / STATE_ARTIFACT, "w") as fp:
        json.dump(state, fp, indent=2, sort_keys=True)


def select_libraries(
    libraries: List[Library], state: dict, conduit, failed: List[str]
) -> Iterator[Tuple[Library, str]]:
    """Yield each library needing work with its target revision, skipping any already
    up for review. Libraries whose update check fails are appended to failed."""
    for library in libraries:
        try:
            revision = check_for_update(library)
        except UpdateCheckException as e:
            log(f"{e} - trying the next library")
            failed.append(library.name)
            continue

        if revision is None:
            log(f"{library.name} is up to date.")
            continue

        previous = state.get(library.name, {})
        phab_rev = previous.get("phab_rev")
        if phab_rev:
            if conduit.is_revision_open(phab_rev):
                if previous.get("revision") == revision:
                    log(f"{library.name} {revision} is already up for review in {phab_rev}.")
                    continue
                log(f"{phab_rev} for {library.name} is stale. Abandoning it and re-submitting.")
                conduit.abandon_revision(phab_rev)
            elif previous.get("revision") == revision:
                log(
                    f"{phab_rev} for {library.name} {revision} is closed. Either deliberately "
                    f"closed or already landed. Skipping."
                )
                continue

        yield library, revision


def run_vendor(library: Library, revision: str):
    log(f"Vendoring {library.name} {revision}")
    run_cmd(
        ["./mach", "vendor", "--revision", revision, str(moz_yaml_path(library.name))],
        cwd=GECKO_PATH,
    )

    os.chdir(COMM_PATH)
    result = run_cmd([HG, "id", "-T", "{dirty}\n"])
    if not result.stdout.startswith("+"):
        raise VendorException(f"./mach vendor produced no changes for {library.name} {revision}.")


def commit_changes(library: Library, revision: str):
    os.chdir(COMM_PATH)
    run_cmd([HG, "addremove", "third_party/"])

    logmsg = (
        f"Bug {BUG_ID} - Update {library.name} to {revision}. r={REVIEWERS}\n"
        f"\n"
        f"Vendored with: ./mach vendor -r {revision} comm/third_party/{library.name}/moz.yaml\n"
        f"\n"
        f"./mach vendor does not update moz.build for this library, so the source\n"
        f"file lists need checking if upstream added or removed files.\n"
    )
    with tempfile.NamedTemporaryFile() as fp:
        fp.write(logmsg.encode("utf-8"))
        fp.flush()

        run_cmd([HG, "commit", "-l", fp.name])

    run_cmd([HG, "export", "-r", "tip", "-o", str(HOME_PATH / "hg_diff.patch")])


def submit_phabricator(conduit, library: Library, revision: str) -> str:
    os.chdir(COMM_PATH)
    try:
        result = conduit.submit()
    except subprocess.CalledProcessError as e:
        raise SubmitException(
            f"moz-phab failed to submit the {library.name} {revision} update, exited "
            f"{e.returncode}: {last_line(e.stderr) or last_line(e.stdout)}"
        ) from e

    # Look for the Phabricator revision URL on the last line of stdout
    line = result.stdout.rstrip().split("\n")[-1]
    match = re.search(r"/(D\d+)$", line)
    if not match:
        raise SubmitException(
            f"No Phabricator revision id in the moz-phab output for {library.name} {revision}."
        )
    return match.group(1)


def update_library(libraries: List[Library], state: dict):
    """Vendor the first library needing an update, if any. Only one per run, so the
    Phabricator revisions do not stack."""
    conduit = get_conduit()
    failed = []

    for library, revision in select_libraries(libraries, state, conduit, failed):
        try:
            run_vendor(library, revision)
        except VendorException as e:
            log(f"{e} Trying the next library.")
            continue

        commit_changes(library, revision)

        phab_rev = submit_phabricator(conduit, library, revision)
        state[library.name] = {"revision": revision, "phab_rev": phab_rev}

        try_url = push_to_try(
            f"Automation: {library.name} {revision} build and test check",
            BUILDS_AND_TESTS_TRY_CONFIG,
        )
        body = (
            f"Sheriffs: {library.name} update to {revision} is in {phab_rev}. "
            f"It needs review, and moz.build may need updating."
        )
        if try_url:
            body += f" Try: {try_url}"
        if failed:
            body += f" Update check failed for: {', '.join(failed)}."

        notify(body)
        return

    if failed:
        raise UpdateCheckException(f"Update check failed for: {', '.join(failed)}")

    log("No third party library updates available.")


def main():
    validate()

    libraries = enabled_libraries()
    if not libraries:
        log("No libraries have vendoring enabled in their moz.yaml, nothing to do.")
        sys.exit(0)

    log("Vendoring enabled for:")
    for lib in libraries:
        log(lib.name)

    prepare_environment()

    state = get_previous_state()
    try:
        update_library(libraries, state)
    except UpdatebotException as e:
        notify(f"Third party updatebot failed: {e}")
        sys.exit(1)
    finally:
        save_state(state)


if __name__ == "__main__":
    main()

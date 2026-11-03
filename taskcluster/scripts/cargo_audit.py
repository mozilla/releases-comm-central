#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# Run cargo audit against a Cargo.lock, skipping the advisories listed in an
# ignore file. When vulnerabilities are found, the configured email addresses
# and Matrix rooms are notified and the script exits 1, failing the task.
# Entries under "warnings" in the cargo audit output (unmaintained, unsound,
# yanked, ...) are treated as warnings and cargo audit failures are likely
# transient, so both are logged but exit 0.

import json
import logging
import os
import re
import subprocess
import sys
import urllib.request
from argparse import ArgumentParser
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import tomllib

logger = logging.getLogger(__name__)

RUSTSEC_ID = re.compile(r"RUSTSEC-\d{4}-\d{4}")


@dataclass
class IgnoredAdvisory:
    id: str
    bug: int
    reason: str

    def __post_init__(self):
        if not isinstance(self.id, str):
            raise ValueError(f"advisory id must be a string: {self.id!r}")
        self.id = self.id.strip()
        if not RUSTSEC_ID.fullmatch(self.id):
            raise ValueError(f"invalid advisory id: {self.id!r}")
        if not isinstance(self.bug, int) or self.bug <= 0:
            raise ValueError(f"{self.id}: bug must be a positive bug number")
        if not isinstance(self.reason, str) or not self.reason.strip():
            raise ValueError(f"{self.id}: reason must not be empty")


@dataclass(frozen=True)
class Advisory:
    # yanked entries have no advisory
    id: Optional[str]
    kind: str
    package: str
    version: str
    title: Optional[str]
    url: Optional[str]

    @classmethod
    def from_json(cls, entry: dict) -> "Advisory":
        advisory = entry.get("advisory") or {}
        package = entry["package"]

        return cls(
            id=advisory.get("id"),
            kind=entry.get("kind", "vulnerability"),
            package=package["name"],
            version=package["version"],
            title=advisory.get("title"),
            url=advisory.get("url"),
        )

    def summary(self) -> str:
        if not self.id:
            return f"{self.package} {self.version} ({self.kind})"
        return f"{self.id}: {self.title} {self.url}"


def load_ignored(ignore_file: Path) -> List[IgnoredAdvisory]:
    """
    Load the .toml file containing the list of RUSTSECs to ignore.
    Returns list of IgnoredAdvisory.
    """
    with open(ignore_file, "rb") as f:
        advisories = [IgnoredAdvisory(**a) for a in tomllib.load(f).get("ignore", [])]

    return advisories


def send_notification(service: str, payload: dict):
    """
    Send a notification through the Taskcluster notify service.
    `service` is the notify endpoint, "email" or "matrix".
    """
    request = urllib.request.Request(
        f"{os.environ['TASKCLUSTER_PROXY_URL']}/api/notify/v1/{service}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )

    try:
        urllib.request.urlopen(request).close()
    except OSError as e:
        logger.error(f"Failed to send {service} notification: {e}")


def notify(vulns: List[Advisory], warnings: List[Advisory]):
    project = os.environ["CARGO_AUDIT_PROJECT"]
    task_url = f"{os.environ['TASKCLUSTER_ROOT_URL']}/tasks/{os.environ['TASK_ID']}"

    subject = f"Thunderbird RUSTSEC advisories found in {project}"
    body = "\n".join(
        [
            f"cargo audit of comm/rust/Cargo.lock on {project} found vulnerabilities:",
            *(f"- {vuln.summary()}" for vuln in vulns),
            "",
            "Warnings:",
            *([f"- {warning.summary()}" for warning in warnings] or ["- none"]),
            "",
            f"Task: {task_url}",
        ]
    )

    for address in os.environ["CARGO_AUDIT_EMAILS"].split():
        send_notification("email", {"address": address, "subject": subject, "content": body})

    for room in os.environ["CARGO_AUDIT_MATRIX_ROOMS"].split():
        send_notification("matrix", {"roomId": room, "body": body, "msgtype": "m.text"})


def audit(lockfile: Path, ignore_file: Optional[Path]) -> int:
    """
    Run cargo audit --json -f <lockfile> --ignore <advisory id>
    Returns 1 when a vulnerability is found or 0 otherwise.
    Any cargo audit failure is considered a 0 as it's likely transient.
    """
    fetches = os.environ.get("MOZ_FETCHES_DIR")
    cargo_audit = str(Path(fetches, "cargo-audit", "cargo-audit")) if fetches else "cargo-audit"

    ignore_args = []
    if ignore_file:
        advisories = load_ignored(ignore_file)

        for advisory in advisories:
            ignore_args += ["--ignore", advisory.id]

    args = [cargo_audit, "audit", "--json", "-f", str(lockfile), *ignore_args]
    result = subprocess.run(args, capture_output=True, text=True)

    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        logger.warning(result.stderr)
        logger.warning("cargo audit could not run, retrying on the next scheduled run")
        return 0

    vulns = [Advisory.from_json(v) for v in report["vulnerabilities"]["list"]]
    warnings = [Advisory.from_json(w) for entries in report["warnings"].values() for w in entries]

    if vulns:
        logger.error(f"{len(vulns)} vulnerabilities found!")

        for vuln in vulns:
            logger.error(vuln.summary())

    if warnings:
        logger.warning(f"{len(warnings)} warnings found!")

    if vulns or warnings:
        # Run cargo audit a second time to get full text output
        # which includes the dependency tree.
        # Run with --no-fetch to re-use the advisory db already fetched.
        text = subprocess.run(
            [
                cargo_audit,
                "audit",
                "--no-fetch",
                "--color",
                "never",
                "-f",
                str(lockfile),
                *ignore_args,
            ],
            capture_output=True,
            text=True,
        )
        logger.info(text.stdout)

    if not vulns:
        return 0

    notify(vulns, warnings)
    return 1


def main(args):
    logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = ArgumentParser()
    parser.add_argument(
        "--lockfile", type=Path, help="Path to the lockfile to be audited.", required=True
    )
    parser.add_argument(
        "--ignore-file",
        type=Path,
        help="Path to the file containing a list of RUSTSEC advisories to ignore.",
    )

    opts = parser.parse_args(args)

    if not opts.lockfile.is_file():
        parser.error("Lockfile not found")

    if opts.ignore_file and not opts.ignore_file.is_file():
        parser.error("Ignore file not found")

    return audit(opts.lockfile, opts.ignore_file)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

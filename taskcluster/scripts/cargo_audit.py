#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

# Run cargo audit against a Cargo.lock. Ignored advisories come from the
# .cargo/audit.toml in the working directory, which cargo audit reads itself.
# When vulnerabilities are found, the configured email addresses
# and Matrix rooms are notified and the script exits 1, failing the task.
# Entries under "warnings" in the cargo audit output (unmaintained, unsound,
# yanked, ...) are treated as warnings and cargo audit failures are likely
# transient, so both are logged but exit 0.

import json
import logging
import os
import subprocess
import sys
import urllib.request
from argparse import ArgumentParser
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


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


def audit(lockfile: Path) -> int:
    """
    Run cargo audit --json -f <lockfile>
    Returns 1 when a vulnerability is found or 0 otherwise.
    Any cargo audit failure is considered a 0 as it's likely transient.
    """
    fetches = os.environ.get("MOZ_FETCHES_DIR")
    cargo_audit = str(Path(fetches, "cargo-audit", "cargo-audit")) if fetches else "cargo-audit"

    args = [cargo_audit, "audit", "--json", "-f", str(lockfile)]
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

    parser = ArgumentParser(
        description="Run cargo audit, ignoring the advisories listed in comm/rust/.cargo/audit.toml. "
        "Must be run from comm/rust."
    )

    parser.add_argument(
        "--lockfile", type=Path, help="Path to the lockfile to be audited.", required=True
    )

    opts = parser.parse_args(args)

    if not opts.lockfile.is_file():
        parser.error("Lockfile not found")

    return audit(opts.lockfile)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

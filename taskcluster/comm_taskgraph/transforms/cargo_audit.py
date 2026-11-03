#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.
"""
Pass the cargo-audit kind's notification targets to the audit script as
environment variables, and add the notify scopes needed to reach them.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

transforms = TransformSequence()


@transforms.add
def resolve_notify_targets(config, jobs):
    for job in jobs:
        for key in ("emails", "matrix-rooms"):
            resolve_keyed_by(
                job["audit-notify"], key, job["name"], level=str(config.params["level"])
            )
        yield job


@transforms.add
def add_notify_env_and_scopes(config, jobs):
    for job in jobs:
        notify = job.pop("audit-notify")
        emails = [email.format(owner=config.params["owner"]) for email in notify["emails"]]
        rooms = notify["matrix-rooms"]

        job["worker"].setdefault("env", {}).update(
            {
                "CARGO_AUDIT_PROJECT": config.params["project"],
                "CARGO_AUDIT_EMAILS": " ".join(emails),
                "CARGO_AUDIT_MATRIX_ROOMS": " ".join(rooms),
            }
        )
        job.setdefault("scopes", []).extend(
            [f"notify:email:{email}" for email in emails]
            + [f"notify:matrix-room:{room}" for room in rooms]
        )
        yield job

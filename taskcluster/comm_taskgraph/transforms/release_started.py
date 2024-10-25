# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Add notifications via taskcluster-notify for release tasks
"""

import base64
from pipes import quote as shell_quote

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.schema import resolve_keyed_by

transforms = TransformSequence()


@transforms.add
def add_notifications(config, jobs):
    for job in jobs:
        label = "{}-{}".format(config.kind, job["name"])

        resolve_keyed_by(job, "emails", label, project=config.params["project"])
        emails = [email.format(config=config.__dict__) for email in job.pop("emails")]

        resolve_keyed_by(job, "prefix-message", label, project=config.params["project"])
        prefix_message = ""
        if msg := job.pop("prefix-message"):
            prefix_message = base64.b64encode(bytes(msg.encode("utf-8"))).decode()

        command = [
            "tb-release",
            "send-buglist-email-thunderbird",
            "--version",
            config.params["version"],
            "--product",
            job["shipping-product"],
            "--revision",
            config.params["comm_head_rev"],
            "--build-number",
            str(config.params["build_number"]),
            "--repo",
            config.params["comm_head_repository"],
            "--prefix-message",
            prefix_message,
        ]
        for address in emails:
            command += ["--address", address]
        command += [
            # We wrap this in `{'task-reference': ...}` below
            "--task-group-id",
            "<decision>",
        ]

        job["scopes"] = ["notify:email:{}".format(address) for address in emails]
        job["run"] = {
            "using": "mach",
            "comm-checkout": True,
            "sparse-profile": "mach",
            "mach": {"task-reference": " ".join(map(shell_quote, command))},
        }

        yield job

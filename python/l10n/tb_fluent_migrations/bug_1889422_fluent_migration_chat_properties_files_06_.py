# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 6. part {index}"""
    target = reference = "chat/imtooltip.ftl"
    source = "chat/imtooltip.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

buddy-username = {COPY(from_path, "buddy.username")}
buddy-account = {COPY(from_path, "buddy.account")}
contact-tags = {COPY(from_path, "contact.tags")}
encryption-tag = {COPY(from_path, "encryption.tag")}
message-status = {COPY(from_path, "message.status")}

""",
            from_path=source,
        ),
    )

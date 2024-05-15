# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 11. part {index}"""
    target = reference = "chat/twitter.ftl"
    source = "chat/twitter.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

twitter-protocol-name = {COPY(from_path, "twitter.protocolName")}
twitter-disabled = {COPY(from_path, "twitter.disabled")}

""",
            from_path=source,
        ),
    )

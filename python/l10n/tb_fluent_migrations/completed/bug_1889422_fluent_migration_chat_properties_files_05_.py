# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 5. part {index}"""
    target = reference = "chat/facebook.ftl"
    source = "chat/facebook.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

facebook-chat-name = {COPY(from_path, "facebook.chat.name")}
facebook-disabled = {COPY(from_path, "facebook.disabled")}

""",
            from_path=source,
        ),
    )

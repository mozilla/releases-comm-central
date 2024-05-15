# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 13. part {index}"""
    target = reference = "chat/yahoo.ftl"
    source = "chat/yahoo.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

yahoo-disabled = {COPY(from_path, "yahoo.disabled")}

""",
            from_path=source,
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 3. part {index}"""
    target = reference = "chat/contacts.ftl"
    source = "chat/contacts.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

default-group = {COPY(from_path, "defaultGroup")}

""",
            from_path=source,
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

about_replacements = dict(
    {
        "%1$S": VARIABLE_REFERENCE("filename"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 8. part {index}"""
    target = reference = "chat/logger.ftl"
    source = "chat/logger.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

bad-logfile = {REPLACE(from_path, "badLogfile", about_replacements)}

""",
            from_path=source,
            about_replacements=about_replacements,
        ),
    )

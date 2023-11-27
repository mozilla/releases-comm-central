# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1703164 - mail/components/preferences/colors.xhtml to top level html part {index}"""

    target = reference = "mail/messenger/preferences/colors.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
colors-dialog-title = {{COPY_PATTERN(from_path, "colors-dialog-window2.title")}}
            """,
            from_path="mail/messenger/preferences/colors.ftl",
        ),
    )

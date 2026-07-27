# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2050953 - Fix calendar dialog window titles, part {index}"""

    source = "calendar/calendar/calendar.ftl"

    ctx.add_transforms(
        source,
        source,
        transforms_from(
            """
calendar-properties-dialog-title = { COPY_PATTERN(from_path, "calendar-server-dialog-title-edit.title") }

calendar-publish-dialog-window-title = { COPY_PATTERN(from_path, "calendar-publish-dialog-title.title") }

calendar-error-prompt-title = { COPY_PATTERN(from_path, "calendar-error-title.title") }
            """,
            from_path=source,
        ),
    )

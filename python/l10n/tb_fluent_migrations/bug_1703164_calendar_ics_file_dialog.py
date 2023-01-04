# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1703164 - convert calendar/base/content/dialogs/calendar-ics-file-dialog.xhtml to html"""

    ctx.add_transforms(
        "calendar/calendar/calendar-ics-file-dialog.ftl",
        "calendar/calendar/calendar-ics-file-dialog.ftl",
        transforms_from(
            """
calendar-ics-file-window-title = {{COPY_PATTERN(from_path, "calendar-ics-file-window-2.title")}}
            """,
            from_path="calendar/calendar/calendar-ics-file-dialog.ftl",
        ),
    )

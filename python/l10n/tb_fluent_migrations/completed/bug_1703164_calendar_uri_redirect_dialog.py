# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1703164 - convert calendar/base/content/dialogs/calendar-uri-redirect-dialog.xhtml to top level html"""

    ctx.add_transforms(
        "calendar/calendar/calendar-uri-redirect-dialog.ftl",
        "calendar/calendar/calendar-uri-redirect-dialog.ftl",
        transforms_from(
            """
calendar-uri-redirect-window-title = {{COPY_PATTERN(from_path, "calendar-uri-redirect-window.title")}}
            """,
            from_path="calendar/calendar/calendar-uri-redirect-dialog.ftl",
        ),
    )

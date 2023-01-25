# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1805938 - Refactor recurrence calendar UX part {index}."""

    source = "calendar/chrome/calendar/calendar-event-dialog.dtd"
    reference = target = "calendar/calendar/calendar-recurrence-dialog.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
calendar-recurrence-preview-label = { COPY(from_path, "event.recurrence.preview.label") }
""",
            from_path=source,
        ),
    )

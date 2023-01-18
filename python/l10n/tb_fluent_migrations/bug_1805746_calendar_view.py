# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1805746 - Update Calendar View selection part {index}."""

    ctx.add_transforms(
        "calendar/calendar/calendar-widgets.ftl",
        "calendar/calendar/calendar-widgets.ftl",
        transforms_from(
            """
calendar-view-toggle-day = { COPY(from_path, "calendar.day.button.label") }
    .title = { COPY(from_path, "calendar.day.button.tooltip") }
calendar-view-toggle-week = { COPY(from_path, "calendar.week.button.label") }
    .title = { COPY(from_path, "calendar.week.button.tooltip") }
calendar-view-toggle-multiweek = { COPY(from_path, "calendar.multiweek.button.label") }
    .title = { COPY(from_path, "calendar.multiweek.button.tooltip") }
calendar-view-toggle-month = { COPY(from_path, "calendar.month.button.label") }
    .title = { COPY(from_path, "calendar.month.button.tooltip") }
""",
            from_path="calendar/chrome/calendar/calendar.dtd",
        ),
    )

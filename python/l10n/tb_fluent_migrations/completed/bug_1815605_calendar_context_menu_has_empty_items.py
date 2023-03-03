# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1815605 - calendar context menu has empty items, part {index}."""

    ctx.add_transforms(
        "calendar/calendar/calendar-widgets.ftl",
        "calendar/calendar/calendar-widgets.ftl",
        transforms_from(
            """
calendar-context-menu-previous-day =
  .label = { COPY(from_path, "calendar.prevday.label") }
  .accesskey = { COPY(from_path, "calendar.prevday.accesskey") }

calendar-context-menu-previous-week =
  .label = { COPY(from_path, "calendar.prevweek.label") }
  .accesskey =  { COPY(from_path, "calendar.prevweek.accesskey") }

calendar-context-menu-previous-multiweek =
  .label = { COPY(from_path, "calendar.prevweek.label") }
  .accesskey =  { COPY(from_path, "calendar.prevweek.accesskey") }

calendar-context-menu-previous-month =
  .label = { COPY(from_path, "calendar.prevmonth.label") }
  .accesskey = { COPY(from_path, "calendar.prevmonth.accesskey") }

calendar-context-menu-next-day =
  .label = { COPY(from_path, "calendar.nextday.label") }
  .accesskey = { COPY(from_path, "calendar.nextday.accesskey") }

calendar-context-menu-next-week =
  .label = { COPY(from_path, "calendar.nextweek.label") }
  .accesskey = { COPY(from_path, "calendar.nextweek.accesskey") }

calendar-context-menu-next-multiweek =
  .label = { COPY(from_path, "calendar.nextweek.label") }
  .accesskey = { COPY(from_path, "calendar.nextweek.accesskey") }

calendar-context-menu-next-month =
  .label = { COPY(from_path, "calendar.nextmonth.label") }
  .accesskey = { COPY(from_path, "calendar.nextmonth.accesskey") }
""",
            from_path="calendar/chrome/calendar/calendar.dtd",
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982635 - Migrate calendar alarm strings from DTD to Fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-alarm-dialog-title = {COPY(from_path, "calendar.alarm.title.label")}
calendar-alarm-details =
    .value = {COPY(from_path, "calendar.alarm.details.label")}

calendar-alarm-dismiss =
    .label = {COPY(from_path, "calendar.alarm.dismiss.label")}
calendar-alarm-dismiss-all =
    .label = {COPY(from_path, "calendar.alarm.dismissall.label")}

calendar-alarm-snooze-for =
    .label = {COPY(from_path, "calendar.alarm.snoozefor.label")}
calendar-alarm-snooze-all-for =
    .label = {COPY(from_path, "calendar.alarm.snoozeallfor.label")}

calendar-alarm-snooze-cancel =
    .aria-label = {COPY(from_path, "calendar.alarm.snooze.cancel")}
            """,
            from_path=source,
        ),
    )

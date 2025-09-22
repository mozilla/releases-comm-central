# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982636 - Migrate calendar properties strings from DTD to Fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-properties-color = {COPY(from_path, "calendarproperties.color.label")}
calendar-properties-location = {COPY(from_path, "calendarproperties.location.label")}
calendar-properties-refresh = {COPY(from_path, "calendarproperties.refreshInterval.label")}
calendar-properties-refresh-manual = {COPY(from_path, "calendarproperties.refreshInterval.manual.label")}
calendar-properties-read-only = {COPY(from_path, "calendarproperties.readonly.label")}
calendar-properties-show-reminders = {COPY(from_path, "calendarproperties.firealarms.label")}
calendar-properties-offline-support = {COPY(from_path, "calendarproperties.cache3.label")}
calendar-properties-enable-calendar = {COPY(from_path, "calendarproperties.enabled2.label")}
calendar-properties-provider-missing = {COPY(from_path, "calendarproperties.forceDisabled.label")}
calendar-properties-unsubscribe =
    .label = {COPY(from_path, "calendarproperties.unsubscribe.label")}
    .accesskey = {COPY(from_path, "calendarproperties.unsubscribe.accesskey")}
    .buttonlabelextra1 = {COPY(from_path, "calendarproperties.unsubscribe.label")}
    .buttonaccesskeyextra1 = {COPY(from_path, "calendarproperties.unsubscribe.accesskey")}
            """,
            from_path=source,
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982629 - Migrate calendar.context.attendance.* to fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-context-attendance-menu =
    .label = {COPY(from_path, "calendar.context.attendance.menu.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.menu.accesskey")}

calendar-context-attendance-occurrence =
    .label = {COPY(from_path, "calendar.context.attendance.occurrence.label")}

calendar-context-attendance-all-series =
    .label = {COPY(from_path, "calendar.context.attendance.all2.label")}

calendar-context-attendance-send =
    .label = {COPY(from_path, "calendar.context.attendance.send.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.send.accesskey")}

calendar-context-attendance-dontsend =
    .label = {COPY(from_path, "calendar.context.attendance.dontsend.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.dontsend.accesskey")}

calendar-context-attendance-occ-accepted =
    .label = {COPY(from_path, "calendar.context.attendance.occ.accepted.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.accepted.accesskey")}

calendar-context-attendance-occ-tentative =
    .label = {COPY(from_path, "calendar.context.attendance.occ.tentative.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.tentative.accesskey")}

calendar-context-attendance-occ-declined =
    .label = {COPY(from_path, "calendar.context.attendance.occ.declined.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.declined.accesskey")}

calendar-context-attendance-occ-delegated =
    .label = {COPY(from_path, "calendar.context.attendance.occ.delegated.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.delegated.accesskey")}

calendar-context-attendance-occ-needs-action =
    .label = {COPY(from_path, "calendar.context.attendance.occ.needsaction.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.needsaction.accesskey")}

calendar-context-attendance-occ-in-progress =
    .label = {COPY(from_path, "calendar.context.attendance.occ.inprogress.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.inprogress.accesskey")}

calendar-context-attendance-occ-completed =
    .label = {COPY(from_path, "calendar.context.attendance.occ.completed.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.occ.completed.accesskey")}

calendar-context-attendance-all-accepted =
    .label = {COPY(from_path, "calendar.context.attendance.all.accepted.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.accepted.accesskey")}

calendar-context-attendance-all-tentative =
    .label = {COPY(from_path, "calendar.context.attendance.all.tentative.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.tentative.accesskey")}

calendar-context-attendance-all-declined =
    .label = {COPY(from_path, "calendar.context.attendance.all.declined.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.declined.accesskey")}

calendar-context-attendance-all-delegated =
    .label = {COPY(from_path, "calendar.context.attendance.all.delegated.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.delegated.accesskey")}

calendar-context-attendance-all-needs-action =
    .label = {COPY(from_path, "calendar.context.attendance.all.needsaction.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.needsaction.accesskey")}

calendar-context-attendance-all-in-progress =
    .label = {COPY(from_path, "calendar.context.attendance.all.inprogress.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.inprogress.accesskey")}

calendar-context-attendance-all-completed =
    .label = {COPY(from_path, "calendar.context.attendance.all.completed.label")}
    .accesskey = {COPY(from_path, "calendar.context.attendance.all.completed.accesskey")}
            """,
            from_path=source,
        ),
    )

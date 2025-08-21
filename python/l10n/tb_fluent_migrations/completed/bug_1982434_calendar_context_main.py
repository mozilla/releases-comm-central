# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982434 - Migrate the calendar context menu(s) to fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-context-open-event =
    .label = {COPY(from_path, "calendar.context.modifyorviewitem.label")}
    .accesskey = {COPY(from_path, "calendar.context.modifyorviewitem.accesskey")}

calendar-context-open-task =
    .label = {COPY(from_path, "calendar.context.modifyorviewtask.label")}
    .accesskey = {COPY(from_path, "calendar.context.modifyorviewtask.accesskey")}

calendar-context-new-event =
    .label = {COPY(from_path, "calendar.context.newevent.label")}
    .accesskey = {COPY(from_path, "calendar.context.newevent.accesskey")}

calendar-context-new-task =
    .label = {COPY(from_path, "calendar.context.newtodo.label")}
    .accesskey = {COPY(from_path, "calendar.context.newtodo.accesskey")}

calendar-context-delete-task =
    .label = {COPY(from_path, "calendar.context.deletetask.label")}
    .accesskey = {COPY(from_path, "calendar.context.deletetask.accesskey")}

calendar-context-delete-event =
    .label = {COPY(from_path, "calendar.context.deleteevent.label")}
    .accesskey = {COPY(from_path, "calendar.context.deleteevent.accesskey")}

calendar-context-cut =
    .label = {COPY(from_path, "calendar.context.cutevent.label")}
    .accesskey = {COPY(from_path, "calendar.context.cutevent.accesskey")}

calendar-context-copy =
    .label = {COPY(from_path, "calendar.context.copyevent.label")}
    .accesskey = {COPY(from_path, "calendar.context.copyevent.accesskey")}

calendar-context-paste =
    .label = {COPY(from_path, "calendar.context.pasteevent.label")}
    .accesskey = {COPY(from_path, "calendar.context.pasteevent.accesskey")}

calendar-context-today-pane =
    .label = {COPY(from_path, "calendar.context.button.label")}
    .accesskey = {COPY(from_path, "calendar.context.button.accesskey")}

calendar-taskview-delete =
    .label = {COPY(from_path, "calendar.taskview.delete.label")}
    .tooltiptext = {COPY(from_path, "calendar.context.deletetask.label")}
            """,
            from_path=source,
        ),
    )

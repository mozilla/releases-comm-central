# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982630 - Migrate remaining calendar context strings to fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"
    source_ftl = "calendar/calendar/calendar.ftl"

    # Migrate from DTD to Fluent and Fluent to Fluent (using dot notation for .label)
    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-context-progress =
    .label = {COPY(from_path, "calendar.context.progress.label")}
    .accesskey = {COPY(from_path, "calendar.context.progress.accesskey")}

calendar-context-priority =
    .label = {COPY(from_path, "calendar.context.priority.label")}
    .accesskey = {COPY(from_path, "calendar.context.priority.accesskey")}

calendar-context-postpone =
    .label = {COPY(from_path, "calendar.context.postpone.label")}
    .accesskey = {COPY(from_path, "calendar.context.postpone.accesskey")}

calendar-context-mark-completed =
    .label = {COPY(from_path, "calendar.context.markcompleted.label")}
    .accesskey = {COPY(from_path, "calendar.context.markcompleted.accesskey")}

calendar-context-postpone-1hour =
    .label = {COPY(from_path, "calendar.context.postpone.1hour.label")}
    .accesskey = {COPY(from_path, "calendar.context.postpone.1hour.accesskey")}

calendar-context-postpone-1day =
    .label = {COPY(from_path, "calendar.context.postpone.1day.label")}
    .accesskey = {COPY(from_path, "calendar.context.postpone.1day.accesskey")}

calendar-context-postpone-1week =
    .label = {COPY(from_path, "calendar.context.postpone.1week.label")}
    .accesskey = {COPY(from_path, "calendar.context.postpone.1week.accesskey")}

calendar-context-new-server =
    .label = {COPY(from_path, "calendar.context.newserver.label")}
    .accesskey = {COPY(from_path, "calendar.context.newserver.accesskey")}

calendar-context-delete-server =
    .label = {COPY(from_path, "calendar.context.deleteserver2.label")}
    .accesskey = {COPY(from_path, "calendar.context.deleteserver2.accesskey")}

calendar-context-remove-server =
    .label = {COPY(from_path, "calendar.context.removeserver.label")}
    .accesskey = {COPY(from_path, "calendar.context.removeserver.accesskey")}

calendar-context-unsubscribe-server =
    .label = {COPY(from_path, "calendar.context.unsubscribeserver.label")}
    .accesskey = {COPY(from_path, "calendar.context.unsubscribeserver.accesskey")}

calendar-context-publish =
    .label = {COPY(from_path, "calendar.context.publish.label")}
    .accesskey = {COPY(from_path, "calendar.context.publish.accesskey")}

calendar-context-export =
    .label = {COPY(from_path, "calendar.context.export.label")}
    .accesskey = {COPY(from_path, "calendar.context.export.accesskey")}

calendar-context-properties =
    .label = {COPY(from_path, "calendar.context.properties.label")}
    .accesskey = {COPY(from_path, "calendar.context.properties.accesskey")}

calendar-context-showall =
    .label = {COPY(from_path, "calendar.context.showall.label")}
    .accesskey = {COPY(from_path, "calendar.context.showall.accesskey")}

calendar-context-convert-menu =
    .label = {COPY(from_path, "calendar.context.convertmenu.label")}
    .accesskey = {COPY(from_path, "calendar.context.convertmenu.accesskey.calendar")}

calendar-context-convert-to-event =
    .label = {COPY(from_path, "calendar.context.convertmenu.event.label")}
    .accesskey = {COPY(from_path, "calendar.context.convertmenu.event.accesskey")}

calendar-context-convert-to-message =
    .label = {COPY(from_path, "calendar.context.convertmenu.message.label")}
    .accesskey = {COPY(from_path, "calendar.context.convertmenu.message.accesskey")}

calendar-context-convert-to-task =
    .label = {COPY(from_path, "calendar.context.convertmenu.task.label")}
    .accesskey = {COPY(from_path, "calendar.context.convertmenu.task.accesskey")}

show-calendar-name =
    .label = {COPY_PATTERN(from_path_ftl, "show-calendar-label.label")}
    .accesskey = {COPY(from_path, "calendar.context.showcalendar.accesskey")}

hide-calendar-name =
    .label = {COPY_PATTERN(from_path_ftl, "hide-calendar-label.label")}
    .accesskey = {COPY(from_path, "calendar.context.hidecalendar.accesskey")}

show-only-calendar-name =
    .label = {COPY_PATTERN(from_path_ftl, "show-only-calendar.label")}
    .accesskey = {COPY(from_path, "calendar.context.showonly.accesskey")}
            """,
            from_path=source,
            from_path_ftl=source_ftl,
        ),
    )

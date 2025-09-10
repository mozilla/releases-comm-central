# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982633 - Migrate calendar task strings from DTD to Fluent. part {index}"""
    source = "calendar/chrome/calendar/calendar.dtd"
    source_ftl = "calendar/calendar/calendar.ftl"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-task-filter-title = {COPY(from_path, "calendar.task.filter.title.label")}

calendar-task-filter-all =
    .label = {COPY(from_path, "calendar.task.filter.all.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.all.accesskey")}

calendar-task-filter-today =
    .label = {COPY(from_path, "calendar.task.filter.today.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.today.accesskey")}

calendar-task-filter-next7days =
    .label = {COPY(from_path, "calendar.task.filter.next7days.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.next7days.accesskey")}

calendar-task-filter-notstarted =
    .label = {COPY(from_path, "calendar.task.filter.notstarted.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.notstarted.accesskey")}

calendar-task-filter-overdue =
    .label = {COPY(from_path, "calendar.task.filter.overdue.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.overdue.accesskey")}

calendar-task-filter-completed =
    .label = {COPY(from_path, "calendar.task.filter.completed.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.completed.accesskey")}

calendar-task-filter-open =
    .label = {COPY(from_path, "calendar.task.filter.open.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.open.accesskey")}

calendar-task-filter-current =
    .label = {COPY(from_path, "calendar.task.filter.current.label")}
    .accesskey = {COPY(from_path, "calendar.task.filter.current.accesskey")}

calendar-task-details-title = {COPY(from_path, "calendar.task-details.title.label")}
calendar-task-details-organizer = {COPY(from_path, "calendar.task-details.organizer.label")}
calendar-task-details-priority = {COPY(from_path, "calendar.task-details.priority.label")}
calendar-task-details-priority-low = {COPY(from_path, "calendar.task-details.priority.low.label")}
calendar-task-details-priority-normal = {COPY(from_path, "calendar.task-details.priority.normal.label")}
calendar-task-details-priority-high = {COPY(from_path, "calendar.task-details.priority.high.label")}
calendar-task-details-status = {COPY(from_path, "calendar.task-details.status.label")}
calendar-task-details-category = {COPY(from_path, "calendar.task-details.category.label")}
calendar-task-details-repeat = {COPY(from_path, "calendar.task-details.repeat.label")}
calendar-task-details-attachments = {COPY(from_path, "calendar.task-details.attachments.label")}
calendar-task-details-start = {COPY(from_path, "calendar.task-details.start.label")}
calendar-task-details-due = {COPY(from_path, "calendar.task-details.due.label")}

calendar-task-mark-completed =
    .label = {COPY_PATTERN(from_path_ftl, "calendar-context-mark-completed.label")}
    .accesskey = {COPY_PATTERN(from_path_ftl, "calendar-context-mark-completed.accesskey")}
    .tooltiptext = {COPY(from_path, "calendar.task.complete.button.tooltip")}

calendar-task-change-priority =
    .label = {COPY_PATTERN(from_path_ftl, "calendar-context-priority.label")}
    .accesskey = {COPY_PATTERN(from_path_ftl, "calendar-context-priority.accesskey")}
    .tooltiptext = {COPY(from_path, "calendar.task.priority.button.tooltip")}

calendar-task-text-filter-field =
    .emptytextbase = {COPY(from_path, "calendar.task.text-filter.textbox.emptytext.base1")}
    .keylabelnonmac = {COPY(from_path, "calendar.task.text-filter.textbox.emptytext.keylabel.nonmac")}
    .keylabelmac = {COPY(from_path, "calendar.task.text-filter.textbox.emptytext.keylabel.mac")}

calendar-copylink =
    .label = {COPY(from_path, "calendar.copylink.label")}
    .accesskey = {COPY(from_path, "calendar.copylink.accesskey")}

calendar-progress-level-0 =
    .label = {COPY(from_path, "progress.level.0")}
    .accesskey = {COPY(from_path, "progress.level.0.accesskey")}

calendar-progress-level-25 =
    .label = {COPY(from_path, "progress.level.25")}
    .accesskey = {COPY(from_path, "progress.level.25.accesskey")}

calendar-progress-level-50 =
    .label = {COPY(from_path, "progress.level.50")}
    .accesskey = {COPY(from_path, "progress.level.50.accesskey")}

calendar-progress-level-75 =
    .label = {COPY(from_path, "progress.level.75")}
    .accesskey = {COPY(from_path, "progress.level.75.accesskey")}

calendar-progress-level-100 =
    .label = {COPY(from_path, "progress.level.100")}
    .accesskey = {COPY(from_path, "progress.level.100.accesskey")}

calendar-priority-none =
    .label = {COPY(from_path, "priority.level.none")}
    .accesskey = {COPY(from_path, "priority.level.none.accesskey")}

calendar-priority-low =
    .label = {COPY(from_path, "priority.level.low")}
    .accesskey = {COPY(from_path, "priority.level.low.accesskey")}

calendar-priority-normal =
    .label = {COPY(from_path, "priority.level.normal")}
    .accesskey = {COPY(from_path, "priority.level.normal.accesskey")}

calendar-priority-high =
    .label = {COPY(from_path, "priority.level.high")}
    .accesskey = {COPY(from_path, "priority.level.high.accesskey")}

calendar-tasks-view-minimonth =
    .label = {COPY(from_path, "calendar.tasks.view.minimonth.label")}
    .accesskey = {COPY(from_path, "calendar.tasks.view.minimonth.accesskey")}

calendar-tasks-view-calendarlist =
    .label = {COPY(from_path, "calendar.tasks.view.calendarlist.label")}
    .accesskey = {COPY(from_path, "calendar.tasks.view.calendarlist.accesskey")}

calendar-tasks-view-filtertasks =
    .label = {COPY(from_path, "calendar.tasks.view.filtertasks.label")}
    .accesskey = {COPY(from_path, "calendar.tasks.view.filtertasks.accesskey")}
            """,
            from_path=source,
            from_path_ftl=source_ftl,
        ),
    )

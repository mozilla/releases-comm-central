# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2047917 - Migrate calendar-item-summary widget to Fluent. part {index}"""
    from_dtd = "calendar/chrome/calendar/calendar-event-dialog.dtd"
    target = reference = "calendar/calendar/calendar-item-summary.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
calendar-item-summary-general =
    .value = { COPY(from_dtd, "read.only.general.label") }

calendar-item-summary-attendees =
    .value = { COPY(from_dtd, "read.only.attendees.label") }

calendar-item-summary-description =
    .value = { COPY(from_dtd, "read.only.description.label") }

calendar-item-summary-link =
    .value = { COPY(from_dtd, "read.only.link.label") }

calendar-item-summary-title = { COPY(from_dtd, "read.only.title.label") }

calendar-item-summary-calendar = { COPY(from_dtd, "read.only.calendar.label") }

calendar-item-summary-task-start = { COPY(from_dtd, "read.only.task.start.label") }

calendar-item-summary-event-start = { COPY(from_dtd, "read.only.event.start.label") }

calendar-item-summary-task-due = { COPY(from_dtd, "read.only.task.due.label") }

calendar-item-summary-event-end = { COPY(from_dtd, "read.only.event.end.label") }

calendar-item-summary-repeat = { COPY(from_dtd, "read.only.repeat.label") }

calendar-item-summary-location = { COPY(from_dtd, "read.only.location.label") }

calendar-item-summary-category = { COPY(from_dtd, "read.only.category.label") }

calendar-item-summary-organizer = { COPY(from_dtd, "read.only.organizer.label") }

calendar-item-summary-status = { COPY(from_dtd, "task.status.label") }

calendar-item-summary-reminder = { COPY(from_dtd, "read.only.reminder.label") }

calendar-item-summary-attachments = { COPY(from_dtd, "read.only.attachments.label") }

calendar-item-summary-status-tentative = { COPY(from_dtd, "newevent.status.tentative.label") }

calendar-item-summary-status-confirmed = { COPY(from_dtd, "newevent.status.confirmed.label") }

calendar-item-summary-event-status-cancelled = { COPY(from_dtd, "newevent.eventStatus.cancelled.label") }

calendar-item-summary-todo-status-cancelled = { COPY(from_dtd, "newevent.todoStatus.cancelled.label") }

calendar-item-summary-status-needs-action = { COPY(from_dtd, "newevent.status.needsaction.label") }

calendar-item-summary-status-in-process = { COPY(from_dtd, "newevent.status.inprogress.label") }

calendar-item-summary-status-completed = { COPY(from_dtd, "newevent.status.completed.label") }

calendar-item-summary-reminder-none =
    .label = { COPY(from_dtd, "event.reminder.none.label") }

calendar-item-summary-reminder-0-minutes-before =
    .label = { COPY(from_dtd, "event.reminder.0minutes.before.label") }

calendar-item-summary-reminder-5-minutes-before =
    .label = { COPY(from_dtd, "event.reminder.5minutes.before.label") }

calendar-item-summary-reminder-15-minutes-before =
    .label = { COPY(from_dtd, "event.reminder.15minutes.before.label") }

calendar-item-summary-reminder-30-minutes-before =
    .label = { COPY(from_dtd, "event.reminder.30minutes.before.label") }

calendar-item-summary-reminder-1-hour-before =
    .label = { COPY(from_dtd, "event.reminder.1hour.before.label") }

calendar-item-summary-reminder-2-hours-before =
    .label = { COPY(from_dtd, "event.reminder.2hours.before.label") }

calendar-item-summary-reminder-12-hours-before =
    .label = { COPY(from_dtd, "event.reminder.12hours.before.label") }

calendar-item-summary-reminder-1-day-before =
    .label = { COPY(from_dtd, "event.reminder.1day.before.label") }

calendar-item-summary-reminder-2-days-before =
    .label = { COPY(from_dtd, "event.reminder.2days.before.label") }

calendar-item-summary-reminder-1-week-before =
    .label = { COPY(from_dtd, "event.reminder.1week.before.label") }

calendar-item-summary-reminder-custom =
    .label = { COPY(from_dtd, "event.reminder.custom.label") }

calendar-item-summary-reminder-multiple =
    .value = { COPY(from_dtd, "event.reminder.multiple.label") }
            """,
            from_dtd=from_dtd,
        ),
    )

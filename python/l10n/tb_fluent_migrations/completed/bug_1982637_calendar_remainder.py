# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1982637 - Migrate remaining items from calendar.dtd to fluent. part {index}"""
    from_calendar = "calendar/chrome/calendar/calendar.dtd"
    from_lightning = "calendar/chrome/lightning/lightning.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar.ftl",
        "calendar/calendar/calendar.ftl",
        transforms_from(
            """
calendar-calendar =
    .label = { COPY(from_path, "calendar.calendar.label") }
    .accesskey = { COPY(from_path, "calendar.calendar.accesskey") }

calendar-newevent-button =
    .label = { COPY(from_path, "calendar.newevent.button.label") }
    .tooltiptext = { COPY(from_path, "calendar.newevent.button.tooltip") }

calendar-newtask-button =
    .label = { COPY(from_path, "calendar.newtask.button.label") }
    .tooltiptext = { COPY(from_path, "calendar.newtask.button.tooltip") }

calendar-unifinder-show-completed-todos =
    .label = { COPY(from_path, "calendar.unifinder.showcompletedtodos.label") }

calendar-display-todos-checkbox =
    .label = { COPY(from_path, "calendar.displaytodos.checkbox.label") }
    .accesskey = { COPY(from_path, "calendar.displaytodos.checkbox.accesskey") }

calendar-completed-tasks-checkbox =
    .label = { COPY(from_path, "calendar.completedtasks.checkbox.label") }
    .accesskey = { COPY(from_path, "calendar.completedtasks.checkbox.accesskey") }

calendar-only-workday-checkbox =
    .label = { COPY(from_path, "calendar.onlyworkday.checkbox.label") }
    .accesskey = { COPY(from_path, "calendar.onlyworkday.checkbox.accesskey") }

calendar-orientation =
    .label = { COPY(from_path, "calendar.orientation.label") }
    .accesskey = { COPY(from_path, "calendar.orientation.accesskey") }

calendar-todaypane-button =
    .label = { COPY(from_path_lightning, "todaypane.statusButton.label") }
    .tooltiptext = { COPY(from_path, "calendar.todaypane.button.tooltip") }

calendar-search-options-searchfor =
    .value = { COPY(from_path, "calendar.search.options.searchfor") }

calendar-server-dialog-title-edit =
    .title = { COPY(from_path, "calendar.server.dialog.title.edit") }
calendar-server-dialog-name-label =
    .value = { COPY(from_path, "calendar.server.dialog.name.label") }

calendar-publish-dialog-title =
    .title = { COPY(from_path, "calendar.publish.dialog.title") }
calendar-publish-url-label = { COPY(from_path, "calendar.publish.url.label") }
calendar-publish-publish-button = { COPY(from_path, "calendar.publish.publish.button") }
calendar-publish-close-button = { COPY(from_path, "calendar.publish.close.button") }

calendar-select-dialog-title = { COPY(from_path, "calendar.select.dialog.title") }

calendar-error-detail =
    .label = { COPY(from_path, "calendar.error.detail") }
calendar-error-code =
    .value = { COPY(from_path, "calendar.error.code") }
calendar-error-description =
    .value = { COPY(from_path, "calendar.error.description") }
calendar-error-title =
    .title = { COPY(from_path, "calendar.error.title") }

calendar-extract-event-button =
    .label = { COPY(from_path, "calendar.extract.event.button") }
    .tooltiptext = { COPY(from_path, "calendar.extract.event.button.tooltip") }

calendar-extract-task-button =
    .label = { COPY(from_path, "calendar.extract.task.button") }
    .tooltiptext = { COPY(from_path, "calendar.extract.task.button.tooltip") }
            """,
            from_path=from_calendar,
            from_path_lightning=from_lightning,
        ),
    )

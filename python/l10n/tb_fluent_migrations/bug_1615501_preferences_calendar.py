# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import
import fluent.syntax.ast as FTL
from fluent.migrate.helpers import transforms_from
from fluent.migrate import CONCAT, REPLACE
from fluent.migrate.helpers import COPY, TERM_REFERENCE


def migrate(ctx):
    """Bug 1615501 - Fluent migration recipe for Preferences Calendar Tab, part {index}."""

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
calendar-title = { COPY(from_path, "panelHeader.title") }
calendar-title-reminder = { COPY(from_path, "panelReminder.title") }
calendar-title-category = { COPY(from_path, "panelCategory.title") }
""",
            from_path="calendar/chrome/calendar/preferences/preferences.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
dateformat-label =
    .value = { COPY(from_path, "pref.dateformat.label") }
    .accesskey = { COPY(from_path, "pref.dateformat.accesskey") }

#   $date (String) - the formatted example date
dateformat-long =
    .label = { COPY(from_path, "pref.dateformat.long") }: { $date }

#   $date (String) - the formatted example date
dateformat-short =
    .label = { COPY(from_path, "pref.dateformat.short") }: { $date }

timezone-label =
    .value = { COPY(from_path, "pref.timezones.caption") }:

todaypane-legend = { COPY(from_path, "pref.calendar.todaypane.agenda.caption") }

soon-label =
    .value = { COPY(from_path, "pref.soondays2.label") }
    .accesskey = { COPY(from_path, "pref.soondays2.accesskey") }

event-task-legend = { COPY(from_path, "pref.eventsandtasks.label") }

default-length-label =
    .value = { COPY(from_path, "pref.default_event_task_length.label") }:
    .accesskey = { COPY(from_path, "pref.default_event_task_length.accesskey") }

task-start-1-label =
    .label = { COPY(from_path, "pref.default_task_none.label") }
task-start-2-label =
    .label = { COPY(from_path, "pref.default_task_start_of_day.label") }
task-start-3-label =
    .label = { COPY(from_path, "pref.default_task_end_of_day.label") }
task-start-4-label =
    .label = { COPY(from_path, "pref.default_task_tomorrow.label") }
task-start-5-label =
    .label = { COPY(from_path, "pref.default_task_next_week.label") }
task-start-6-label =
    .label = { COPY(from_path, "pref.default_task_offset_current.label") }
task-start-7-label =
    .label = { COPY(from_path, "pref.default_task_offset_start.label") }
task-start-8-label =
    .label = { COPY(from_path, "pref.default_task_offset_next_hour.label") }

edit-intab-label =
    .label = { COPY(from_path, "pref.editInTab.label") }
    .accesskey = { COPY(from_path, "pref.editInTab.accesskey") }

accessibility-legend = { COPY(from_path, "pref.accessibility.label") }

accessibility-colors-label =
    .label = { COPY(from_path, "pref.systemcolors.label") }
    .accesskey = { COPY(from_path, "pref.systemcolors.accesskey") }
""",
            from_path="calendar/chrome/calendar/preferences/general.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
weekstart-label =
    .value = { COPY(from_path, "pref.weekstarts.label") }
    .accesskey = { COPY(from_path, "pref.weekstarts.accesskey") }

show-weeknumber-label =
    .label = { COPY(from_path, "pref.calendar.view-minimonth.showweeknumber.label") }
    .accesskey = { COPY(from_path, "pref.calendar.view-minimonth.showweeknumber.accesskey") }

workdays-label =
    .value = { COPY(from_path, "pref.workweekDays.label") }

dayweek-legend = { COPY(from_path, "pref.calendar.view.dayandweekviews.caption") }

visible-hours-label =
    .value = { COPY(from_path, "pref.calendar.view.visiblehours.label") }
    .accesskey = { COPY(from_path, "pref.calendar.view.visiblehours.accesskey") }

visible-hours-end-label =
    .value = { COPY(from_path, "pref.calendar.view.visiblehoursend.label") }

day-start-label =
    .value = { COPY(from_path, "pref.calendar.view.daystart.label") }
    .accesskey = { COPY(from_path, "pref.calendar.view.daystart.accesskey") }

day-end-label =
    .value = { COPY(from_path, "pref.calendar.view.dayend.label") }
    .accesskey = { COPY(from_path, "pref.calendar.view.dayend.accesskey") }

location-checkbox =
    .label = { COPY(from_path, "pref.showlocation.label") }
    .accesskey = { COPY(from_path, "pref.showlocation.accesskey") }

multiweek-legend = { COPY(from_path, "pref.calendar.view.multiweekview.caption") }

number-of-weeks-label =
    .value = { COPY(from_path, "pref.numberofweeks.label") }
    .accesskey = { COPY(from_path, "pref.numberofweeks.accesskey") }

week-0-label =
    .label = { COPY(from_path, "pref.numberofweeks.0") }
week-1-label =
    .label = { COPY(from_path, "pref.numberofweeks.1") }
week-2-label =
    .label = { COPY(from_path, "pref.numberofweeks.2") }
week-3-label =
    .label = { COPY(from_path, "pref.numberofweeks.3") }
week-4-label =
    .label = { COPY(from_path, "pref.numberofweeks.4") }
week-5-label =
    .label = { COPY(from_path, "pref.numberofweeks.5") }
week-6-label =
    .label = { COPY(from_path, "pref.numberofweeks.6") }

previous-weeks-label =
    .value = { COPY(from_path, "pref.numberofpreviousweeks.label") }
    .accesskey = { COPY(from_path, "pref.numberofpreviousweeks.accesskey") }
""",
            from_path="calendar/chrome/calendar/preferences/views.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
day-1-name =
    .label = { COPY(from_path, "day.1.name") }
day-2-name =
    .label = { COPY(from_path, "day.2.name") }
day-3-name =
    .label = { COPY(from_path, "day.3.name") }
day-4-name =
    .label = { COPY(from_path, "day.4.name") }
day-5-name =
    .label = { COPY(from_path, "day.5.name") }
day-6-name =
    .label = { COPY(from_path, "day.6.name") }
day-7-name =
    .label = { COPY(from_path, "day.7.name") }

day-1-checkbox =
    .label = { COPY(from_path, "day.1.Ddd") }
    .accesskey = { COPY(from_path, "day.1.Ddd.accesskey") }
day-2-checkbox =
    .label = { COPY(from_path, "day.2.Ddd") }
    .accesskey = { COPY(from_path, "day.2.Ddd.accesskey") }
day-3-checkbox =
    .label = { COPY(from_path, "day.3.Ddd") }
    .accesskey = { COPY(from_path, "day.3.Ddd.accesskey") }
day-4-checkbox =
    .label = { COPY(from_path, "day.4.Ddd") }
    .accesskey = { COPY(from_path, "day.4.Ddd.accesskey") }
day-5-checkbox =
    .label = { COPY(from_path, "day.5.Ddd") }
    .accesskey = { COPY(from_path, "day.5.Ddd.accesskey") }
day-6-checkbox =
    .label = { COPY(from_path, "day.6.Ddd") }
    .accesskey = { COPY(from_path, "day.6.Ddd.accesskey") }
day-7-checkbox =
    .label = { COPY(from_path, "day.7.Ddd") }
    .accesskey = { COPY(from_path, "day.7.Ddd.accesskey") }

midnight-label =
    .label = { COPY(from_path, "time.midnight") }
noon-label =
    .label = { COPY(from_path, "time.noon") }
""",
            from_path="calendar/chrome/calendar/global.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
task-start-label =
    .value = { COPY(from_path, "read.only.task.start.label") }

task-due-label =
    .value = { COPY(from_path, "read.only.task.due.label") }
""",
            from_path="calendar/chrome/calendar/calendar-event-dialog.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
reminder-legend = { COPY(from_path, "pref.alarmgoesoff.label") }

reminder-play-checkbox =
    .label = { COPY(from_path, "pref.playasound") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.playsound.accessKey") }

reminder-play-alarm-button =
    .label = { COPY(from_path, "pref.calendar.alarms.sound.play.label") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.sound.play.accessKey") }

reminder-default-sound-label =
    .label = { COPY(from_path, "pref.calendar.alarms.sound.useDefault.label") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.sound.useDefault.accessKey") }

reminder-custom-sound-label =
    .label = { COPY(from_path, "pref.calendar.alarms.sound.useCustom.label") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.sound.useCustom.accessKey") }

reminder-browse-sound-label =
    .label = { COPY(from_path, "pref.calendar.alarms.sound.browse.label") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.sound.browse.accessKey") }

reminder-dialog-label =
    .label = { COPY(from_path, "pref.showalarmbox") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.showAlarmBox.accessKey") }

missed-reminder-label =
    .label = { COPY(from_path, "pref.missedalarms2") }
    .accesskey = { COPY(from_path, "pref.calendar.alarms.missedAlarms.accessKey") }

reminder-default-legend = { COPY(from_path, "pref.calendar.alarms.defaults.label") }

default-snooze-label =
    .value = { COPY(from_path, "pref.defaultsnoozelength.label") }
    .accesskey = { COPY(from_path, "pref.defaultsnoozelength.accesskey") }

event-alarm-label =
    .value = { COPY(from_path, "pref.defalarm4events.label") }
    .accesskey = { COPY(from_path, "pref.defalarm4events.accesskey") }

alarm-on-label =
    .label = { COPY(from_path, "pref.alarm.on") }
alarm-off-label =
    .label = { COPY(from_path, "pref.alarm.off") }

task-alarm-label =
    .value = { COPY(from_path, "pref.defalarm4todos.label") }
    .accesskey = { COPY(from_path, "pref.defalarm4todos.accesskey") }

event-alarm-time-label =
    .value = { COPY(from_path, "pref.defalarmlen4events.label") }
    .accesskey = { COPY(from_path, "pref.defalarmlen4events.accesskey") }

task-alarm-time-label =
    .value = { COPY(from_path, "pref.defalarmlen4todos.label") }
    .accesskey = { COPY(from_path, "pref.defalarmlen4todos.accesskey") }
""",
            from_path="calendar/chrome/calendar/preferences/alarms.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        transforms_from(
            """
category-new-label = { COPY(from_path, "pref.categories.new.title") }

category-edit-label = { COPY(from_path, "pref.categories.edit.title") }

category-overwrite-title = { COPY(from_path, "pref.categories.overwrite.title") }
category-blank-warning = { COPY(from_path, "pref.categories.noBlankCategories") }
""",
            from_path="calendar/chrome/calendar/preferences/categories.dtd",
        ),
    )

    ctx.add_transforms(
        "calendar/calendar/preferences.ftl",
        "calendar/calendar/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("category-overwrite"),
                value=REPLACE(
                    "calendar/chrome/calendar/preferences/categories.dtd",
                    "pref.categories.overwrite",
                    {" \\n": FTL.TextElement("")},
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "calendar/calendar/category-dialog.ftl",
        "calendar/calendar/category-dialog.ftl",
        transforms_from(
            """
category-name-label = { COPY(from_path, "pref.categories.name.label") }

category-color-label =
    .label = { COPY(from_path, "pref.categories.usecolor.label") }
""",
            from_path="calendar/chrome/calendar/preferences/categories.dtd",
        ),
    )

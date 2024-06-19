# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.transforms import Transform, TransformPattern, PLURALS, REPLACE_IN_TEXT

replacements_count_error = dict(
    {"%1$S": VARIABLE_REFERENCE("count"), "%2$S": VARIABLE_REFERENCE("error")}
)
replacements_date_time = dict(
    {"%1$S": VARIABLE_REFERENCE("date"), "%2$S": VARIABLE_REFERENCE("time")}
)
replacements_datetime = dict({"%1$S": VARIABLE_REFERENCE("datetime")})
replacements_datetime_timezone = dict(
    {"%1$S": VARIABLE_REFERENCE("datetime"), "%2$S": VARIABLE_REFERENCE("timezone")}
)
replacements_dayName_dayIndex = dict(
    {"%1$S": VARIABLE_REFERENCE("dayName"), "%2$S": VARIABLE_REFERENCE("dayIndex")}
)
replacements_dayName_dayIndex_monthName_year = dict(
    {
        "%1$S": VARIABLE_REFERENCE("dayName"),
        "%2$S": VARIABLE_REFERENCE("dayIndex"),
        "%3$S": VARIABLE_REFERENCE("monthName"),
        "%4$S": VARIABLE_REFERENCE("year"),
    }
)
replacements_errorCode = dict({"%1$S": VARIABLE_REFERENCE("errorCode")})
replacements_errorDescription = dict({"%1$S": VARIABLE_REFERENCE("errorDescription")})
replacements_filePath = dict({"%1$S": VARIABLE_REFERENCE("filePath")})
replacements_hostApplication_fileName = dict(
    {
        "%1$S": VARIABLE_REFERENCE("hostApplication"),
        "%2$S": VARIABLE_REFERENCE("fileName"),
    }
)
replacements_index = dict({"%1$S": VARIABLE_REFERENCE("index")})
replacements_index_total = dict(
    {"%1$S": VARIABLE_REFERENCE("index"), "%2$S": VARIABLE_REFERENCE("total")}
)
replacements_languageName = dict({"%1$S": VARIABLE_REFERENCE("languageName")})
replacements_languageName_region = dict(
    {"%1$S": VARIABLE_REFERENCE("languageName"), "%2$S": VARIABLE_REFERENCE("region")}
)
replacements_location = dict({"%1$S": VARIABLE_REFERENCE("location")})
replacements_month_year = dict(
    {"%1$S": VARIABLE_REFERENCE("month"), "%2$S": VARIABLE_REFERENCE("year")}
)
replacements_name = dict({"%1$S": VARIABLE_REFERENCE("name")})
replacements_number = dict({"%1$S": VARIABLE_REFERENCE("number")})
replacements_pasteItem = dict({"%1$S": VARIABLE_REFERENCE("pasteItem")})
replacements_percent = dict({"%1$S": VARIABLE_REFERENCE("percent")})
replacements_startDate_startTime = dict(
    {"%1$S": VARIABLE_REFERENCE("startDate"), "%2$S": VARIABLE_REFERENCE("startTime")}
)
replacements_startDate_startTime_endDate_endTime = dict(
    {
        "%1$S": VARIABLE_REFERENCE("startDate"),
        "%2$S": VARIABLE_REFERENCE("startTime"),
        "%3$S": VARIABLE_REFERENCE("endDate"),
        "%4$S": VARIABLE_REFERENCE("endTime"),
    }
)
replacements_startDate_startTime_endTime = dict(
    {
        "%1$S": VARIABLE_REFERENCE("startDate"),
        "%2$S": VARIABLE_REFERENCE("startTime"),
        "%3$S": VARIABLE_REFERENCE("endTime"),
    }
)
replacements_startIndex_endIndex = dict(
    {"%1$S": VARIABLE_REFERENCE("startIndex"), "%2$S": VARIABLE_REFERENCE("endIndex")}
)
replacements_startMonth_startDayIndex_endDayIndex_year = dict(
    {
        "%1$S": VARIABLE_REFERENCE("startMonth"),
        "%2$S": VARIABLE_REFERENCE("startDayIndex"),
        "%3$S": VARIABLE_REFERENCE("endDayIndex"),
        "%4$S": VARIABLE_REFERENCE("year"),
    }
)
replacements_startMonth_startDayIndex_endMonth_endDayIndex_year = dict(
    {
        "%1$S": VARIABLE_REFERENCE("startMonth"),
        "%2$S": VARIABLE_REFERENCE("startDayIndex"),
        "%3$S": VARIABLE_REFERENCE("endMonth"),
        "%4$S": VARIABLE_REFERENCE("endDayIndex"),
        "%5$S": VARIABLE_REFERENCE("year"),
    }
)
replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear = dict(
    {
        "%1$S": VARIABLE_REFERENCE("startMonth"),
        "%2$S": VARIABLE_REFERENCE("startDayIndex"),
        "%3$S": VARIABLE_REFERENCE("startYear"),
        "%4$S": VARIABLE_REFERENCE("endMonth"),
        "%5$S": VARIABLE_REFERENCE("endDayIndex"),
        "%6$S": VARIABLE_REFERENCE("endYear"),
    }
)
replacements_statusCode = dict({"%1$S": VARIABLE_REFERENCE("statusCode")})
replacements_task = dict({"%1$S": VARIABLE_REFERENCE("task")})
replacements_timezone = dict({"%1$S": VARIABLE_REFERENCE("timezone")})
replacements_timezone_title_datetime = dict(
    {
        "%1$S": VARIABLE_REFERENCE("timezone"),
        "%2$S": VARIABLE_REFERENCE("title"),
        "%3$S": VARIABLE_REFERENCE("datetime"),
    }
)
replacements_title = dict({"%1$S": VARIABLE_REFERENCE("title")})
replacements_wildmat = dict({"%1$S": VARIABLE_REFERENCE("wildmat")})
replacements_timezone_offset_detail1_detail2 = dict(
    {
        "%1$S": VARIABLE_REFERENCE("timezone"),
        "%2$S": VARIABLE_REFERENCE("offset"),
        "%3$S": VARIABLE_REFERENCE("detail1"),
        "%4$S": VARIABLE_REFERENCE("detail2"),
    }
)
replacements_timezone_zoneInfoTimezoneId = dict(
    {
        "%1$S": VARIABLE_REFERENCE("timezone"),
        "%2$S": VARIABLE_REFERENCE("zoneInfoTimezoneId"),
    }
)
replacements_statusCode_statusCodeInfo = dict(
    {
        "%1$S": VARIABLE_REFERENCE("statusCode"),
        "%2$S": VARIABLE_REFERENCE("statusCodeInfo"),
    }
)
replacements_count_filePath = dict(
    {"%1$S": VARIABLE_REFERENCE("count"), "%2$S": VARIABLE_REFERENCE("filePath")}
)


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 2. part {index}"""
    target = reference = "calendar/calendar/calendar.ftl"
    source = "calendar/chrome/calendar/calendar.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

new-event =
    .placeholder = {COPY(from_path, "newEvent")}
new-event-dialog = {COPY(from_path, "newEventDialog")}
edit-event-dialog = {COPY(from_path, "editEventDialog")}
new-task-dialog = {COPY(from_path, "newTaskDialog")}
edit-task-dialog = {COPY(from_path, "editTaskDialog")}
ask-save-title-event = {COPY(from_path, "askSaveTitleEvent")}
ask-save-title-task = {COPY(from_path, "askSaveTitleTask")}
ask-save-message-event = {COPY(from_path, "askSaveMessageEvent")}
ask-save-message-task = {COPY(from_path, "askSaveMessageTask")}
warning-end-before-start = {COPY(from_path, "warningEndBeforeStart")}
warning-until-date-before-start = {COPY(from_path, "warningUntilDateBeforeStart")}
home-calendar-name = {COPY(from_path, "homeCalendarName")}
untitled-calendar-name = {COPY(from_path, "untitledCalendarName")}
status-tentative = {COPY(from_path, "statusTentative")}
status-confirmed = {COPY(from_path, "statusConfirmed")}
event-status-cancelled = {COPY(from_path, "eventStatusCancelled")}
todo-status-cancelled = {COPY(from_path, "todoStatusCancelled")}
status-needs-action = {COPY(from_path, "statusNeedsAction")}
status-in-process = {COPY(from_path, "statusInProcess")}
status-completed = {COPY(from_path, "statusCompleted")}
high-priority = {COPY(from_path, "highPriority")}
normal-priority = {COPY(from_path, "normalPriority")}
low-priority = {COPY(from_path, "lowPriority")}
import-prompt = {COPY(from_path, "importPrompt")}
export-prompt = {COPY(from_path, "exportPrompt")}
paste-prompt = {COPY(from_path, "pastePrompt")}
publish-prompt = {COPY(from_path, "publishPrompt")}
paste-event-also = {COPY(from_path, "pasteEventAlso")}
paste-events-also = {COPY(from_path, "pasteEventsAlso")}
paste-task-also = {COPY(from_path, "pasteTaskAlso")}
paste-tasks-also = {COPY(from_path, "pasteTasksAlso")}
paste-items-also = {COPY(from_path, "pasteItemsAlso")}
paste-event-only = {COPY(from_path, "pasteEventOnly")}
paste-events-only = {COPY(from_path, "pasteEventsOnly")}
paste-task-only = {COPY(from_path, "pasteTaskOnly")}
paste-tasks-only = {COPY(from_path, "pasteTasksOnly")}
paste-items-only = {COPY(from_path, "pasteItemsOnly")}
paste-notify-about = {REPLACE(from_path, "pasteNotifyAbout", replacements_pasteItem)}
paste-and-notify-label = {COPY(from_path, "pasteAndNotifyLabel")}
paste-dont-notify-label = {COPY(from_path, "pasteDontNotifyLabel")}
import-items-failed = {REPLACE(from_path, "importItemsFailed", replacements_count_error)}
no-items-in-calendar-file2 = {REPLACE(from_path, "noItemsInCalendarFile2", replacements_filePath)}
event-description = {COPY(from_path, "eventDescription")}
unable-to-read = {COPY(from_path, "unableToRead")}
unable-to-write = {COPY(from_path, "unableToWrite")} { $filePath }
default-file-name = {COPY(from_path, "defaultFileName")}
html-title = {COPY(from_path, "HTMLTitle")}
timezone-error = {REPLACE(from_path, "timezoneError", replacements_filePath)}
duplicate-error =
    { $count ->
        [one] {REPLACE(from_path, "duplicateError", replacements_count_filePath)}
        *[other] {REPLACE(from_path, "duplicateError", replacements_count_filePath)}
    }
unable-to-create-provider = {REPLACE(from_path, "unableToCreateProvider", replacements_location)}
unknown-timezone-in-item = {REPLACE(from_path, "unknownTimezoneInItem", replacements_timezone_title_datetime)}
timezone-errors-alert-title = {COPY(from_path, "TimezoneErrorsAlertTitle")}
timezone-errors-see-console = {COPY(from_path, "TimezoneErrorsSeeConsole")}
remove-calendar-title = {COPY(from_path, "removeCalendarTitle")}
remove-calendar-button-delete = {COPY(from_path, "removeCalendarButtonDelete")}
remove-calendar-button-unsubscribe = {COPY(from_path, "removeCalendarButtonUnsubscribe")}
remove-calendar-message-delete-or-unsubscribe = {REPLACE(from_path, "removeCalendarMessageDeleteOrUnsubscribe", replacements_name)}
remove-calendar-message-delete = {REPLACE(from_path, "removeCalendarMessageDelete", replacements_name)}
remove-calendar-message-unsubscribe = {REPLACE(from_path, "removeCalendarMessageUnsubscribe", replacements_name)}
week-title = {REPLACE(from_path, "WeekTitle", replacements_title)}
week-title-label =
    .aria-label = {REPLACE(from_path, "WeekTitle", replacements_title)}
calendar-none =
    .label = {COPY(from_path, "None")}
too-new-schema-error-text = {REPLACE(from_path, "tooNewSchemaErrorText", replacements_hostApplication_fileName)}
event-untitled = {COPY(from_path, "eventUntitled")}
tooltip-title = {COPY(from_path, "tooltipTitle")}
tooltip-location = {COPY(from_path, "tooltipLocation")}
tooltip-date = {COPY(from_path, "tooltipDate")}
tooltip-cal-name = {COPY(from_path, "tooltipCalName")}
tooltip-status = {COPY(from_path, "tooltipStatus")}
tooltip-organizer = {COPY(from_path, "tooltipOrganizer")}
tooltip-start = {COPY(from_path, "tooltipStart")}
tooltip-due = {COPY(from_path, "tooltipDue")}
tooltip-priority = {COPY(from_path, "tooltipPriority")}
tooltip-percent = {COPY(from_path, "tooltipPercent")}
tooltip-completed = {COPY(from_path, "tooltipCompleted")}
calendar-new = {COPY(from_path, "New")}
calendar-open = {COPY(from_path, "Open")}
filepicker-title-import = {COPY(from_path, "filepickerTitleImport")}
filepicker-title-export = {COPY(from_path, "filepickerTitleExport")}
filter-ics = {REPLACE(from_path, "filterIcs", replacements_wildmat)}
filter-html = {REPLACE(from_path, "filterHtml", replacements_wildmat)}
generic-error-title = {COPY(from_path, "genericErrorTitle")}
http-put-error = {REPLACE(from_path, "httpPutError", replacements_statusCode_statusCodeInfo)}
other-put-error = {REPLACE(from_path, "otherPutError", replacements_statusCode)}
read-only-mode = {REPLACE(from_path, "readOnlyMode", replacements_name)}
disabled-mode = {REPLACE(from_path, "disabledMode", replacements_name)}
minor-error = {REPLACE(from_path, "minorError", replacements_name)}
still-read-only-error = {REPLACE(from_path, "stillReadOnlyError", replacements_name)}
utf8-decode-error = {COPY(from_path, "utf8DecodeError")}
ics-malformed-error = {COPY(from_path, "icsMalformedError")}
item-modified-on-server-title = {COPY(from_path, "itemModifiedOnServerTitle")}
item-modified-on-server = {COPY(from_path, "itemModifiedOnServer")}
modify-will-lose-data = {COPY(from_path, "modifyWillLoseData")}
delete-will-lose-data = {COPY(from_path, "deleteWillLoseData")}
calendar-conflicts-dialog =
    .buttonlabelcancel = {COPY(from_path, "updateFromServer")}
proceed-modify =
    .label = {COPY(from_path, "proceedModify")}
proceed-delete =
    .label = {COPY(from_path, "proceedDelete")}
dav-not-dav = {REPLACE(from_path, "dav_notDav", replacements_name)}
dav-dav-not-cal-dav = {REPLACE(from_path, "dav_davNotCaldav", replacements_name)}
item-put-error = {COPY(from_path, "itemPutError")}
item-delete-error = {COPY(from_path, "itemDeleteError")}
cal-dav-request-error = {COPY(from_path, "caldavRequestError")}
cal-dav-response-error = {COPY(from_path, "caldavResponseError")}
cal-dav-request-status-code = {REPLACE(from_path, "caldavRequestStatusCode", replacements_statusCode)}
cal-dav-request-status-code-string-generic = {COPY(from_path, "caldavRequestStatusCodeStringGeneric")}
cal-dav-request-status-code-string-400 = {COPY(from_path, "caldavRequestStatusCodeString400")}
cal-dav-request-status-code-string-403 = {COPY(from_path, "caldavRequestStatusCodeString403")}
cal-dav-request-status-code-string-404 = {COPY(from_path, "caldavRequestStatusCodeString404")}
cal-dav-request-status-code-string-409 = {COPY(from_path, "caldavRequestStatusCodeString409")}
cal-dav-request-status-code-string-412 = {COPY(from_path, "caldavRequestStatusCodeString412")}
cal-dav-request-status-code-string-500  = {COPY(from_path, "caldavRequestStatusCodeString500")}
cal-dav-request-status-code-string-502  = {COPY(from_path, "caldavRequestStatusCodeString502")}
cal-dav-request-status-code-string-503 = {COPY(from_path, "caldavRequestStatusCodeString503")}
cal-dav-redirect-title = {REPLACE(from_path, "caldavRedirectTitle", replacements_name)}
cal-dav-redirect-text = {REPLACE(from_path, "caldavRedirectText", replacements_name)}
cal-dav-redirect-disable-calendar = {COPY(from_path, "caldavRedirectDisableCalendar")}
likely-timezone = {COPY(from_path, "likelyTimezone")}
warning-os-tz-no-match = {REPLACE(from_path, "WarningOSTZNoMatch", replacements_timezone_zoneInfoTimezoneId)}
skipping-os-timezone = {REPLACE(from_path, "SkippingOSTimezone", replacements_timezone)}
skipping-locale-timezone = {REPLACE(from_path, "SkippingLocaleTimezone", replacements_timezone)}
warning-using-floating-tz-no-match = {COPY(from_path, "warningUsingFloatingTZNoMatch")}
warning-using-guessedtz = {REPLACE(from_path, "WarningUsingGuessedTZ", replacements_timezone_offset_detail1_detail2)}
tz-almost-matches-os-differ-at-mostaweek = {COPY(from_path, "TZAlmostMatchesOSDifferAtMostAWeek")}
tz-seems-to-matchos = {COPY(from_path, "TZSeemsToMatchOS")}
tz-fromos = {REPLACE(from_path, "TZFromOS", replacements_timezone)}
tz-from-locale = {COPY(from_path, "TZFromLocale")}
tz-from-known-timezones = {COPY(from_path, "TZFromKnownTimezones")}
tasks-with-no-due-date = {COPY(from_path, "tasksWithNoDueDate")}
cal-dav-name = {COPY(from_path, "caldavName")}
composite-name = {COPY(from_path, "compositeName")}
ics-name-key = {COPY(from_path, "icsName")}
memory-name = {COPY(from_path, "memoryName")}
storage-name = {COPY(from_path, "storageName")}
html-prefix-title = {COPY(from_path, "htmlPrefixTitle")}
html-prefix-when = {COPY(from_path, "htmlPrefixWhen")}
html-prefix-location = {COPY(from_path, "htmlPrefixLocation")}
html-prefix-description = {COPY(from_path, "htmlPrefixDescription")}
html-task-completed = {REPLACE(from_path, "htmlTaskCompleted", replacements_task)}
add-category = {COPY(from_path, "addCategory")}
multiple-categories = {COPY(from_path, "multipleCategories")}
calendar-today = {COPY(from_path, "today")}
calendar-tomorrow = {COPY(from_path, "tomorrow")}
yesterday = {COPY(from_path, "yesterday")}
events-only = {COPY(from_path, "eventsonly")}
events-and-tasks = {COPY(from_path, "eventsandtasks")}
tasks-only = {COPY(from_path, "tasksonly")}
short-calendar-week = {COPY(from_path, "shortcalendarweek")}
calendar-go = {COPY(from_path, "go")}
calendar-next1 = {COPY(from_path, "next1")}
calendar-next2 = {COPY(from_path, "next2")}
calendar-last1 = {COPY(from_path, "last1")}
calendar-last2 = {COPY(from_path, "last2")}
""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
            replacements_timezone_offset_detail1_detail2=replacements_timezone_offset_detail1_detail2,
            replacements_timezone_zoneInfoTimezoneId=replacements_timezone_zoneInfoTimezoneId,
            replacements_statusCode_statusCodeInfo=replacements_statusCode_statusCodeInfo,
            replacements_count_filePath=replacements_count_filePath,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("alarm-window-title-label"),
                comment=FTL.Comment("Alarm Dialog\n$count reminder count"),
                value=PLURALS(
                    source,
                    "alarmWindowTitle.label",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
alarm-starts =
    .value = {REPLACE(from_path, "alarmStarts", replacements_datetime)}
alarm-today-at = {REPLACE(from_path, "alarmTodayAt", replacements_datetime)}
alarm-tomorrow-at = {REPLACE(from_path, "alarmTomorrowAt", replacements_datetime)}
alarm-yesterday-at = {REPLACE(from_path, "alarmYesterdayAt", replacements_datetime)}
alarm-default-description = {COPY(from_path, "alarmDefaultDescription")}
alarm-default-summary = {COPY(from_path, "alarmDefaultSummary")}
""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("alarm-snooze-limit-exceeded"),
                comment=FTL.Comment("$count number of months"),
                value=PLURALS(
                    source,
                    "alarmSnoozeLimitExceeded",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

task-details-status-needs-action = {COPY(from_path, "taskDetailsStatusNeedsAction")}
task-details-status-in-progress = {REPLACE(from_path, "taskDetailsStatusInProgress", replacements_percent)}
task-details-status-completed = {COPY(from_path, "taskDetailsStatusCompleted")}
task-details-status-completed-on = {REPLACE(from_path, "taskDetailsStatusCompletedOn", replacements_datetime)}
task-details-status-cancelled = {COPY(from_path, "taskDetailsStatusCancelled")}
getting-calendar-info-common =
    .label = {COPY(from_path, "gettingCalendarInfoCommon")}
getting-calendar-info-detail =
    .label = {REPLACE(from_path, "gettingCalendarInfoDetail", replacements_index_total)}
error-code = {REPLACE(from_path, "errorCode", replacements_errorCode)}
error-description = {REPLACE(from_path, "errorDescription", replacements_errorDescription)}
error-writing2 = {REPLACE(from_path, "errorWriting2", replacements_name)}
error-writing-details = {COPY(from_path, "errorWritingDetails")}
tooltip-calendar-disabled =
    .title = {REPLACE(from_path, "tooltipCalendarDisabled", replacements_name)}
tooltip-calendar-read-only =
    .title = {REPLACE(from_path, "tooltipCalendarReadOnly", replacements_name)}
task-edit-instructions = {COPY(from_path, "taskEditInstructions")}
task-edit-instructions-readonly = {COPY(from_path, "taskEditInstructionsReadonly")}
task-edit-instructions-capability = {COPY(from_path, "taskEditInstructionsCapability")}
event-details-start-date = {COPY(from_path, "eventDetailsStartDate")}
event-details-end-date = {COPY(from_path, "eventDetailsEndDate")}
datetime-with-timezone = {REPLACE(from_path, "datetimeWithTimezone", replacements_datetime_timezone)}
single-long-calendar-week = {REPLACE(from_path, "singleLongCalendarWeek", replacements_index)}
single-calendar-week = {REPLACE(from_path, "singleShortCalendarWeek", replacements_index)}
    .title = {REPLACE(from_path, "singleLongCalendarWeek", replacements_index)}
several-calendar-weeks = {REPLACE(from_path, "severalShortCalendarWeeks", replacements_startIndex_endIndex)}
    .title = {REPLACE(from_path, "severalLongCalendarWeeks", replacements_startIndex_endIndex)}

multiweek-view-week = {REPLACE(from_path, "multiweekViewWeek", replacements_number)}
""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("due-in-days"),
                comment=FTL.Comment(
                    'Task tree, "Due In" column.\nLOCALIZATION NOTE (due-in-days, due-in-hours): Semi-colon list of plural\nforms. See: http://developer.mozilla.org/en/Localization_and_Plurals\n$count count'
                ),
                value=PLURALS(
                    source,
                    "dueInDays",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("due-in-hours"),
                comment=FTL.Comment("$count count"),
                value=PLURALS(
                    source,
                    "dueInHours",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
due-in-less-than-one-hour = {COPY(from_path, "dueInLessThanOneHour")}
month-in-year = {REPLACE(from_path, "monthInYear", replacements_month_year)}
month-in-year-label =
    .aria-label = {REPLACE(from_path, "monthInYear", replacements_month_year)}
month-in-year-month-format = {COPY(from_path, "monthInYear.monthFormat")}
format-date-long = {REPLACE(from_path, "formatDateLong", replacements_dayName_dayIndex_monthName_year)}
day-header = {REPLACE(from_path, "dayHeaderLabel", replacements_dayName_dayIndex)}
day-header-elem =
    .label = { day-header }
days-interval-in-month = {REPLACE(from_path, "daysIntervalInMonth", replacements_startMonth_startDayIndex_endDayIndex_year)}
days-interval-in-month-month-format = {COPY(from_path, "daysIntervalInMonth.monthFormat")}
days-interval-between-months = {REPLACE(from_path, "daysIntervalBetweenMonths", replacements_startMonth_startDayIndex_endMonth_endDayIndex_year)}
days-interval-between-months-month-format = {COPY(from_path, "daysIntervalBetweenMonths.monthFormat")}
days-interval-between-years = {REPLACE(from_path, "daysIntervalBetweenYears", replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear)}
days-interval-between-years-month-format = {COPY(from_path, "daysIntervalBetweenYears.monthFormat")}
datetime-interval-on-same-date-time = {REPLACE(from_path, "datetimeIntervalOnSameDateTime", replacements_startDate_startTime)}
datetime-interval-on-same-day = {REPLACE(from_path, "datetimeIntervalOnSameDay", replacements_startDate_startTime_endTime)}
datetime-interval-on-several-days = {REPLACE(from_path, "datetimeIntervalOnSeveralDays", replacements_startDate_startTime_endDate_endTime)}
datetime-interval-task-without-date = {COPY(from_path, "datetimeIntervalTaskWithoutDate")}
datetime-interval-task-without-due-date = {REPLACE(from_path, "datetimeIntervalTaskWithoutDueDate", replacements_date_time)}
datetime-interval-task-without-start-date = {REPLACE(from_path, "datetimeIntervalTaskWithoutStartDate", replacements_date_time)}
drag-label-tasks-with-only-entry-date = {COPY(from_path, "dragLabelTasksWithOnlyEntryDate")}
drag-label-tasks-with-only-due-date = {COPY(from_path, "dragLabelTasksWithOnlyDueDate")}
delete-task =
    .label = {COPY(from_path, "deleteTaskLabel")}
    .accesskey = {COPY(from_path, "deleteTaskAccesskey")}
delete-item =
    .label = {COPY(from_path, "deleteItemLabel")}
    .accesskey = {COPY(from_path, "deleteItemAccesskey")}
delete-event =
    .label = {COPY(from_path, "deleteEventLabel")}
    .accesskey = {COPY(from_path, "deleteEventAccesskey")}
""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("calendar-properties-every-minute"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=PLURALS(
                            source,
                            "calendarPropertiesEveryMinute",
                            VARIABLE_REFERENCE("count"),
                            foreach=lambda n: REPLACE_IN_TEXT(
                                n,
                                dict(
                                    {
                                        "#1": VARIABLE_REFERENCE("count"),
                                    }
                                ),
                            ),
                        ),
                    )
                ],
            )
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

extract-using = {REPLACE(from_path, "extractUsing", replacements_languageName)}
extract-using-region = {REPLACE(from_path, "extractUsingRegion", replacements_languageName_region)}

""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("unit-minutes"),
                comment=FTL.Comment(
                    "LOCALIZATION NOTE (unit)\nUsed to determine the correct plural form of a unit\n$count count"
                ),
                value=PLURALS(
                    source,
                    "unitMinutes",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("unit-hours"),
                comment=FTL.Comment("$count count"),
                value=PLURALS(
                    source,
                    "unitHours",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("unit-days"),
                comment=FTL.Comment("$count count"),
                value=PLURALS(
                    source,
                    "unitDays",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("unit-weeks"),
                comment=FTL.Comment("$count count"),
                value=PLURALS(
                    source,
                    "unitWeeks",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            ),
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
show-calendar = {REPLACE(from_path, "showCalendar", replacements_name)}
hide-calendar = {REPLACE(from_path, "hideCalendar", replacements_name)}
hide-calendar-title =
    .title = {REPLACE(from_path, "showCalendar", replacements_name)}
show-calendar-title =
    .title = {REPLACE(from_path, "hideCalendar", replacements_name)}
show-calendar-label =
    .label = {REPLACE(from_path, "showCalendar", replacements_name)}
hide-calendar-label =
    .label = {REPLACE(from_path, "hideCalendar", replacements_name)}
show-only-calendar =
    .label = {REPLACE(from_path, "showOnlyCalendar", replacements_name)}
modify-conflict-prompt-title = {COPY(from_path, "modifyConflictPromptTitle")}
modify-conflict-prompt-message = {COPY(from_path, "modifyConflictPromptMessage")}
modify-conflict-prompt-button1 = {COPY(from_path, "modifyConflictPromptButton1")}
modify-conflict-prompt-button2 = {COPY(from_path, "modifyConflictPromptButton2")}
minimonth-no-selected-date =
    .aria-label = {COPY(from_path, "minimonthNoSelectedDate")}
""",
            from_path=source,
            replacements_count_error=replacements_count_error,
            replacements_date_time=replacements_date_time,
            replacements_datetime=replacements_datetime,
            replacements_datetime_timezone=replacements_datetime_timezone,
            replacements_dayName_dayIndex=replacements_dayName_dayIndex,
            replacements_dayName_dayIndex_monthName_year=replacements_dayName_dayIndex_monthName_year,
            replacements_errorCode=replacements_errorCode,
            replacements_errorDescription=replacements_errorDescription,
            replacements_filePath=replacements_filePath,
            replacements_hostApplication_fileName=replacements_hostApplication_fileName,
            replacements_index=replacements_index,
            replacements_index_total=replacements_index_total,
            replacements_languageName=replacements_languageName,
            replacements_languageName_region=replacements_languageName_region,
            replacements_location=replacements_location,
            replacements_month_year=replacements_month_year,
            replacements_name=replacements_name,
            replacements_number=replacements_number,
            replacements_pasteItem=replacements_pasteItem,
            replacements_percent=replacements_percent,
            replacements_startDate_startTime=replacements_startDate_startTime,
            replacements_startDate_startTime_endDate_endTime=replacements_startDate_startTime_endDate_endTime,
            replacements_startDate_startTime_endTime=replacements_startDate_startTime_endTime,
            replacements_startIndex_endIndex=replacements_startIndex_endIndex,
            replacements_startMonth_startDayIndex_endDayIndex_year=replacements_startMonth_startDayIndex_endDayIndex_year,
            replacements_startMonth_startDayIndex_endMonth_endDayIndex_year=replacements_startMonth_startDayIndex_endMonth_endDayIndex_year,
            replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear=replacements_startMonth_startDayIndex_startYear_endMonth_endDayIndex_endYear,
            replacements_statusCode=replacements_statusCode,
            replacements_task=replacements_task,
            replacements_timezone=replacements_timezone,
            replacements_timezone_title_datetime=replacements_timezone_title_datetime,
            replacements_title=replacements_title,
            replacements_wildmat=replacements_wildmat,
        ),
    )

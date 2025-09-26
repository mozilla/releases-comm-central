# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Default name for new events
new-event =
    .placeholder = New Event

# Titles for the event/task dialog
new-event-dialog = New Event
edit-event-dialog = Edit Event
new-task-dialog = New Task
edit-task-dialog = Edit Task

# Do you want to save changes?
ask-save-title-event = Save Event
ask-save-title-task = Save Task
ask-save-message-event = Event has not been saved. Do you want to save the event?
ask-save-message-task = Task has not been saved. Do you want to save the task?

# Event Dialog Warnings
warning-end-before-start = The end date you entered occurs before the start date
warning-until-date-before-start = The until date occurs before the start date

# The name of the calendar provided with the application by default
home-calendar-name = Home

# The name given to a calendar if an opened calendar has an empty filename
untitled-calendar-name = Untitled Calendar

# Event status: Tentative, Confirmed, Cancelled
# ToDo task status: NeedsAction, InProcess, Completed, Cancelled
status-tentative      = Tentative
status-confirmed      = Confirmed
event-status-cancelled = Canceled
todo-status-cancelled  = Canceled
status-needs-action    = Needs Action
status-in-process      = In Process
status-completed      = Completed

# Task priority, these should match the priority.level.* labels in calendar.dtd
high-priority = High
normal-priority = Normal
low-priority = Low

import-prompt = Which calendar do you want to import these items into?
export-prompt = Which calendar do you want to export from?
paste-prompt = Which of your currently writable calendars do you want to paste into?
publish-prompt = Which calendar do you want to publish?

# LOCALIZATION NOTE (paste-event-also): The users pasting operation includes among
# others also a meeting invitation - this is used as a affix in
# paste-notify-about
paste-event-also = Your pasting includes a meeting
# LOCALIZATION NOTE (paste-events-also): The users pasting operation includes among
# others also several meeting invitations  - this is used as a affix in
# paste-notify-about
paste-events-also = Your pasting includes meetings
# LOCALIZATION NOTE (paste-task-also): The users pasting operation includes among
# others also an assigned task - this is used as a affix in paste-notify-about
paste-task-also = Your pasting includes an assigned task
# LOCALIZATION NOTE (paste-tasks-also): The users pasting operation include among
# others also several assigned tasks - this is used as a affix in
# paste-notify-about
paste-tasks-also = Your pasting includes assigned tasks
# LOCALIZATION NOTE (paste-items-also): The users pasting operation includes among
# others also assigned task(s) and meeting invitation(s) - this is used as a affix
# in paste-notify-about
paste-items-also = Your pasting includes meetings and assigned tasks
# LOCALIZATION NOTE (paste-event-only): The users is pasting a meeting -
# this is used as a affix in paste-notify-about
paste-event-only = You are pasting a meeting
# LOCALIZATION NOTE (paste-events-only): The users is pasting several meetings -
# this is used as a affix in paste-notify-about
paste-events-only = You are pasting meetings
# LOCALIZATION NOTE (paste-event-only): The users is pasting an assigned task -
# this is used as a affix in paste-notify-about
paste-task-only = You are pasting an assigned task
# LOCALIZATION NOTE (paste-events-only): The users is pasting several assigned
# tasks - this is used as a affix in paste-notify-about
paste-tasks-only = You are pasting assigned tasks
# LOCALIZATION NOTE (paste-events-only): The users is pasting assigned task(s) and
# meeting(s) - this is used as a affix in paste-notify-about
paste-items-only = You are pasting meetings and assigned tasks

# LOCALIZATION NOTE (paste-notify-about): Text displayed if pasting an invitation
# or assigned task
# $pasteItem - pasteEvent* or pasteTask*
paste-notify-about = { $pasteItem } - do you want to send an update to everybody involved?

# LOCALIZATION NOTE (paste-and-notify-label): button label used in calendar prompt
# of the pasted item has attendees
paste-and-notify-label = Paste and send now
# LOCALIZATION NOTE (paste-dont-notify-label): button label used in calendar prompt
# of the pasted item has attendees
paste-dont-notify-label = Paste without sending

# LOCALIZATION NOTE (import-items-failed):
#    $count will be replaced with number of failed items
#    $error will be replaced with last error code / error string
import-items-failed = { $count } items failed to import. The last error was: { $error }
# LOCALIZATION NOTE (no-items-in-calendar-file2):
#    $filePath will be replaced with file path
no-items-in-calendar-file2 = Cannot import from { $filePath }. There are no importable items in this file.

# spaces needed at the end of the following lines
event-description = Description:

unable-to-read = Unable to read from file:
# $filePath
unable-to-write = Unable to write to file: { $filePath }
default-file-name = MozillaCalEvents
html-title = Mozilla Calendar

# LOCALIZATION NOTE (timezone-error):
# used for an error message like 'An unknown and undefined timezone was found while reading c:\Mycalendarfile.ics'
#    $filePath will be replaced with the path to a file
timezone-error = An unknown and undefined timezone was found while reading { $filePath }.

# LOCALIZATION NOTE (duplicate-error):
#    $count will be replaced with number of duplicate items
#    $filePath will be replaced with a file path pointing to a calendar
duplicate-error = {
    $count ->
        [one] { $count } item(s) were ignored since they exist in both the destination calendar and { $filePath }.
         *[other] { $count } item(s) were ignored since they exist in both the destination calendar and { $filePath }.
}

# $location unknown calendar location
unable-to-create-provider = An error was encountered preparing the calendar located at { $location } for use. It will not be available.

# Sample: Unknown timezone "USPacific" in "Dentist Appt".  Using the 'floating' local timezone instead: 2008/02/28 14:00:00
# $timezone timezone name, $title item title, $datetime date-time
unknown-timezone-in-item = Unknown timezone “{ $timezone }” in “{ $title }”. Treated as ‘floating’ local timezone instead: { $datetime }
timezone-errors-alert-title = Timezone Errors
timezone-errors-see-console = See Error Console: Unknown timezones are treated as the ‘floating’ local timezone.

# The following strings are for the prompt to delete/unsubscribe from the calendar
remove-calendar-title = Remove Calendar
remove-calendar-button-delete = Delete Calendar
remove-calendar-button-unsubscribe = Unsubscribe

# LOCALIZATION NOTE (remove-calendar-message-delete-or-unsubscribe): Shown for
# calendar where both deleting and unsubscribing is possible.
# $name:  The name of a calendar
remove-calendar-message-delete-or-unsubscribe = Do you want to remove the calendar “{ $name }”? Unsubscribing will remove the calendar from the list, deleting will also permanently purge its data.

# LOCALIZATION NOTE (remove-calendar-message-delete): Shown for calendar where
# deleting is the only option.
# $name:  The name of a calendar
remove-calendar-message-delete = Do you want to permanently delete the calendar “{ $name }”?

# LOCALIZATION NOTE (remove-calendar-message-unsubscribe): Shown for calendar
# where unsubscribing is the only option.
# $name:  The name of a calendar
remove-calendar-message-unsubscribe = Do you want to unsubscribe from the calendar “{ $name }”?

# $title title
week-title = Week { $title }
# $title title
week-title-label =
    .aria-label = Week { $title }
calendar-none =
    .label = None

# Error strings
# @name UID_NOT_FOUND
# @loc none
# LOCALIZATION NOTE (too-new-schema-error-text):
#    $hostApplication will be replaced with the name of the host application, e.g. 'Thunderbird'
#    $fileName will be replaced with the name of the new copy of the file, e.g. 'local-2020-05-11T21-30-17.sqlite'
too-new-schema-error-text = Your calendar data is not compatible with this version of { $hostApplication }. The calendar data in your profile was updated by a newer version of { $hostApplication }. A backup of the data file has been created, named “{ $fileName }”. Continuing with a newly created data file.

# List of events or todos (unifinder)
event-untitled = Untitled

# Tooltips of events or todos
tooltip-title = Title:
tooltip-location = Location:
# event date, usually an interval, such as
#  Date: 7:00--8:00 Thu 9 Oct 2011
#  Date: Thu 9 Oct 2000 -- Fri 10 Oct 2000
tooltip-date = Date:
# event calendar name
tooltip-cal-name = Calendar Name:
# event status: tentative, confirmed, cancelled
tooltip-status = Status:
# event organizer
tooltip-organizer = Organizer:
# task/todo fields
# start date time, due date time, task priority number, completed date time
tooltip-start = Start:
tooltip-due = Due:
tooltip-priority = Priority:
tooltip-percent = % Complete:
tooltip-completed = Completed:

# File commands and dialogs
calendar-new = New
calendar-open = Open
filepicker-title-import = Import
filepicker-title-export = Export

# Filters for export/import/open file picker.  $wildmat will be replaced with
# wildmat used to filter files by extension, such as (*.html; *.htm).
filter-ics = iCalendar ({ $wildmat })
# Filters for export/import/open file picker.  $wildmat will be replaced with
# wildmat used to filter files by extension, such as (*.html; *.htm).
filter-html = Web Page ({ $wildmat })

# Remote calendar errors
generic-error-title = An error has occurred
# $statusCode $statusCodeInfo status code info
http-put-error =
    Publishing the calendar file failed.
    Status code: { $statusCode }: { $statusCodeInfo }
# $statusCode status code
other-put-error =
    Publishing the calendar file failed.
    Status code: 0x{ $statusCode }

# LOCALIZATION NOTE (read-only-mode):
# used for an message like 'There has been an error reading data for calendar: Home. It has been...'
#    $name will be replaced with the name of a calendar
read-only-mode = There has been an error reading data for calendar: { $name }. It has been placed in read-only mode, since changes to this calendar will likely result in data-loss.  You may change this setting by choosing ‘Edit Calendar’.

# LOCALIZATION NOTE (disabled-mode):
# used for an message like 'There has been an error reading data for calendar: Home. It has been...'
#    $name will be replaced with the name of a calendar
disabled-mode = There has been an error reading data for calendar: { $name }. It has been disabled until it is safe to use it.

# LOCALIZATION NOTE (minor-error):
# used for an message like 'There has been an error reading data for calendar: Home. However this...'
#    $name will be replaced with the name of a calendar
minor-error = There has been an error reading data for calendar: { $name }.  However, this error is believed to be minor, so the program will attempt to continue.

# LOCALIZATION NOTE (still-read-only-error):
# used for an message like 'There has been an error reading data for calendar: Home.'
#    $name will be replaced with the name of a calendar
still-read-only-error = There has been an error reading data for calendar: { $name }.
utf8-decode-error = An error occurred while decoding an iCalendar (ics) file as UTF-8. Check that the file, including symbols and accented letters, is encoded using the UTF-8 character encoding.
ics-malformed-error = Parsing an iCalendar (ics) file failed. Check that the file conforms to iCalendar (ics) file syntax.
item-modified-on-server-title = Item changed on server
item-modified-on-server = This item has recently been changed on the server.
modify-will-lose-data = Submitting your changes will overwrite the changes made on the server.
delete-will-lose-data = Deleting this item will cause loss of the changes made on the server.
calendar-conflicts-dialog =
    .buttonlabelcancel = Discard my changes and reload
proceed-modify =
    .label = Submit my changes anyway
proceed-delete =
    .label = Delete anyway
# $name calendar name
dav-not-dav = The resource at { $name } is either not a DAV collection or not available
# $name calendar name
dav-dav-not-cal-dav = The resource at { $name } is a DAV collection but not a CalDAV calendar
item-put-error = There was an error storing the item on the server.
item-delete-error = There was an error deleting the item from the server.
cal-dav-request-error = An error occurred when sending the invitation.
cal-dav-response-error = An error occurred when sending the response.
# $statusCode status code
cal-dav-request-status-code = Status Code: { $statusCode }
cal-dav-request-status-code-string-generic = The request cannot be processed.
cal-dav-request-status-code-string-400 = The request contains bad syntax and cannot be processed.
cal-dav-request-status-code-string-403 = The user lacks the required permission to perform the request.
cal-dav-request-status-code-string-404 = Resource not found.
cal-dav-request-status-code-string-409 = Resource conflict.
cal-dav-request-status-code-string-412 = Precondition failed.
cal-dav-request-status-code-string-500 = Internal server error.
cal-dav-request-status-code-string-502 = Bad gateway (Proxy configuration?).
cal-dav-request-status-code-string-503 = Internal server error (Temporary server outage?).
# $name name of calendar
cal-dav-redirect-title = Update location for calendar { $name }?
# $name name of calendar
cal-dav-redirect-text = The requests for { $name } are being redirected to a new location. Would you like to change the location to the following value?
cal-dav-redirect-disable-calendar = Disable Calendar


# LOCALIZATION NOTE (likely-timezone):
#   Translators, please put the most likely timezone(s) where the people using
#   your locale will be.  Use the Olson ZoneInfo timezone name *in English*,
#   ie "Europe/Paris", (continent or ocean)/(largest city in timezone).
#   Order does not matter, except if two historically different zones now match,
#   such as America/New_York and America/Toronto, will only find first listed.
#   (Particularly needed to guess the most relevant timezones if there are
#    similar timezones at the same June/December GMT offsets with alphabetically
#    earlier ZoneInfo timezone names.  Sample explanations for English below.)
# for english-US:
#   America/Los_Angeles likelier than America/Dawson
#   America/New_York    likelier than America/Detroit (NY for US-EasternTime)
# for english:
#   Europe/London   likelier than Atlantic/Canary
#   Europe/Paris    likelier than Africa/Ceuta (for WestEuropeanTime)
#   America/Halifax likelier than America/Glace_Bay (Canada-AtlanticTime)
#   America/Mexico_City likelier than America/Cancun
#   America/Argentina/Buenos_Aires likelier than America/Araguaina
#   America/Sao_Paolo (may not recognize: summer-time dates change every year)
#   Asia/Singapore  likelier than Antarctica/Casey
#   Asia/Tokyo      likelier than Asia/Dili
#   Africa/Lagos likelier than Africa/Algiers (for WestAfricanTime)
#   Africa/Johannesburg likelier than Africa/Blantyre (for SouthAfricanStdTime)
#   Africa/Nairobi likelier than Africa/Addis_Ababa (for EastAfricanTime)
#   Australia/Brisbane likelier than Antarctica/DumontDUrville
#   Australia/Sydney likelier than Australia/Currie or Australia/Hobart
#   Pacific/Auckland likelier than Antarctica/McMurdo
likely-timezone = America/New_York, America/Chicago, America/Denver, America/Phoenix, America/Los_Angeles, America/Anchorage, America/Adak, Pacific/Honolulu, America/Puerto_Rico, America/Halifax, America/Mexico_City, America/Argentina/Buenos_Aires, America/Sao_Paulo, Europe/London, Europe/Paris, Asia/Singapore, Asia/Tokyo, Africa/Lagos, Africa/Johannesburg, Africa/Nairobi, Australia/Brisbane, Australia/Sydney, Pacific/Auckland

# Guessed Timezone errors and warnings.
# Testing note:
# * remove preference for calendar.timezone.default in userprofile/prefs.js
# * repeat
#   - set OS timezone to a city (windows: click right on clock in taskbar)
#   - restart
#   - observe guess in error console and verify whether guessed timezone city
#     makes sense for OS city.
# 'Warning: Operating system timezone "E. South America Standard Time"
#  no longer matches ZoneInfo timezone "America/Sao_Paulo".'
# Testing notes:
# - Brasil DST change dates are set every year by decree, so likely out of sync.
# - Only appears on OSes from which timezone can be obtained
#   (windows; or TZ env var, /etc/localtime target path, or line in
#    /etc/timezone or /etc/sysconfig/clock contains ZoneInfo timezone id).
# - Windows: turning off "Automatically adjust clock for daylight saving time"
#   can also trigger this warning.
# $timezone OS timezone id
# $zoneInfoTimezoneId ZoneInfo timezone id
warning-os-tz-no-match =
    Warning: Operating system timezone “{ $timezone }”
    no longer matches the internal ZoneInfo timezone “{ $zoneInfoTimezoneId }”.

# "Skipping Operating System timezone 'Pacific/New_Country'."
# Testing note: not easily testable.  May occur someday if (non-windows)
# OS uses different version of ZoneInfo database which has a timezone name
# that is not included in our current ZoneInfo database (or if the mapping
# mapping from windows to ZoneInfo timezone ids does).
# $timezone OS timezone id
skipping-os-timezone = Skipping Operating System timezone '{ $timezone }'.

# "Skipping locale timezone 'America/New_Yawk'."
# Testing note: Skipping occurs if a likely-timezone id is unknown or misspelled.
# $timezone likely timezone id
skipping-locale-timezone = Skipping locale timezone '{ $timezone }'.

# Testing note: "No match" timezones include Bucharest on W2k.
# Brazil timezones may be "No match" (change every year, so often out of date,
# and changes are often more than a week different).
warning-using-floating-tz-no-match =
    Warning: Using “floating” timezone.
    No ZoneInfo timezone data matched the operating system timezone data.

# "Warning:  Using guessed timezone
#    America/New York (UTC-0500/-0400).
#    [rfc2445 summer daylight saving shift rules for timezone]
#  This ZoneInfo timezone almost matches/seems to match..."
#  This ZoneInfo timezone was chosen based on ... "
# $timezone $offset $detail1 $detail2
warning-using-guessedtz =
    Warning:  Using guessed timezone
    { $timezone } (UTC{ $offset }).
    { $detail1 }
    { $detail2 }

# Testing note: "Almost match" timezones include Cairo on W2k.
tz-almost-matches-os-differ-at-mostaweek =
    This ZoneInfo timezone almost matches the operating system timezone.
    For this rule, the next transitions between daylight and standard time
    differ at most a week from the operating system timezone transitions.
    There may be discrepancies in the data, such as differing start date,
    or differing rule, or approximation for non-Gregorian-calendar rule.

tz-seems-to-matchos = This ZoneInfo timezone seems to match the operating system timezone this year.

# LOCALIZATION NOTE (tz-fromos):
# used for a display of a chosen timezone
#    $timezone will be replaced with the name of a timezone
tz-fromos =
    This ZoneInfo timezone was chosen based on the operating system timezone
    identifier “{ $timezone }”.

# Localization note (tz-from-locale): Substitute name of your locale language.
tz-from-locale =
    This ZoneInfo timezone was chosen based on matching the operating system
    timezone with likely timezones for internet users using US English.

tz-from-known-timezones =
    This ZoneInfo timezone was chosen based on matching the operating system
    timezone with known timezones in alphabetical order of timezone id.

# Print Layout
tasks-with-no-due-date  =  Tasks with no due date

# Providers
cal-dav-name = CalDAV
composite-name = Composite
ics-name-key = iCalendar (ICS)
memory-name = Temporary (memory)
storage-name = Local (SQLite)

# Used in created html code for export
html-prefix-title = Title
html-prefix-when = When
html-prefix-location = Location
html-prefix-description = Description
# $task task
html-task-completed = { $task } (completed)

# Categories
add-category = Add Category
multiple-categories = Multiple Categories
no-categories = None

calendar-today = Today
calendar-tomorrow = Tomorrow
yesterday = Yesterday

# Today pane
events-only = Events
events-and-tasks = Events and Tasks
tasks-only = Tasks
short-calendar-week = CW

calendar-go = Go

# Some languages have different conjugations of 'next' and 'last'.  If yours
# does not, simply repeat the value.  This will be used with day names, as in
# 'next Sunday'.
calendar-next1 = next
calendar-next2 = next
calendar-last1 = last
calendar-last2 = last

# Alarm Dialog
# $count reminder count
alarm-window-title-label =
    { $count ->
        [one] { $count } Reminder
        *[other] { $count } Reminders
    }

# LOCALIZATION NOTE (alarm-starts):
# used for a display the start of an alarm like 'Starts:  Thu 2 Oct 2008 13:21'
#    $datetime will be replaced with a date-time
alarm-starts =
    .value = Starts: { $datetime }

# LOCALIZATION NOTE (alarm-today-at):
# used for a display the date-time of an alarm like 'Today at Thu 2 Oct 2008 13:21'
#    $datetime will be replaced with a date-time
alarm-today-at = Today at { $datetime }

# LOCALIZATION NOTE (alarm-tomorrow-at):
# used for a display the date-time of an alarm like 'Tomorrow at Thu 2 Oct 2008 13:21'
#    $datetime will be replaced with a date-time
alarm-tomorrow-at = Tomorrow at { $datetime }

# LOCALIZATION NOTE (alarm-yesterday-at):
# used for a display the date-time of an alarm like 'Yesterday at Thu 2 Oct 2008 13:21'
#    $datetime will be replaced with a date-time
alarm-yesterday-at = Yesterday at { $datetime }

# Alarm interface strings
# LOCALIZATION NOTE: These strings do not get displayed. They are only visible
# when exporting an item with i.e a DISPLAY alarm, that doesn't have a
# description set, or an EMAIL alarm that doesn't have a summary set.
alarm-default-description = Default Mozilla Description
alarm-default-summary = Default Mozilla Summary

# $count number of months
alarm-snooze-limit-exceeded = {
    $count ->
        [one] You cannot snooze an alarm for more than { $count } month.
        *[other] You cannot snooze an alarm for more than { $count } months.
    }


task-details-status-needs-action = Needs Action

# LOCALIZATION NOTE (task-details-status-in-progress):
# used for a display of how much of a task is completed ' Complete'
#    $percent will be replaced with the number of percentage completed
task-details-status-in-progress = { $percent }% Complete
task-details-status-completed = Completed

# LOCALIZATION NOTE (task-details-status-completed-on):
# used for a display of completion date like 'Completed on Thu 2 Oct 2008 13:21'
#    $datetime will be replaced with the completion date-time of the task
task-details-status-completed-on = Completed on { $datetime }
task-details-status-cancelled = Canceled

getting-calendar-info-common =
    .label = Checking Calendars…

# LOCALIZATION NOTE (getting-calendar-info-detail):
# used for a progress-display of processed like 'Checking Calendar 5 of 10'
#    $index will be replaced with the index of the currently processed calendar
#    $total will be replaced with the total numbers of calendars
getting-calendar-info-detail =
    .label = Checking Calendar { $index } of { $total }

# LOCALIZATION NOTE (error-code):
#    $errorCode will be replaced with the number of an error code
error-code = Error code: { $errorCode }

# LOCALIZATION NOTE (error-description):
#    $errorDescription will be replaced with the description of an error
error-description = Description: { $errorDescription }

# LOCALIZATION NOTE (error-writing):
# used for an message like 'An error occurred when writing to the calendar Home!'
#    $name will be replaced with the name of a calendar
error-writing2 = An error occurred when writing to the calendar { $name }! Please see below for more information.

# LOCALIZATION NOTE (error-writing-details):
# This will be displayed in the detail section of the error dialog
error-writing-details = If you’re seeing this message after snoozing or dismissing a reminder and this is for a calendar you do not want to add or edit events for, you can mark this calendar as read-only to avoid such experience in future. To do so, get to the calendar properties by right-clicking on this calendar in the list in the calendar or task view.

# LOCALIZATION NOTE (tooltip-calendar-disabled):
# used for an alert-message like 'The calendar Home is momentarily not available'
#    $name will be replaced with the name of a calendar
tooltip-calendar-disabled =
    .title = The calendar { $name } is momentarily not available

# LOCALIZATION NOTE (tooltip-calendar-read-only):
# used for an message like 'The calendar Home is readonly'
#    $name will be replaced with the name of a calendar
tooltip-calendar-read-only =
    .title = The calendar { $name } is readonly

task-edit-instructions = Click here to add a new task
task-edit-instructions-readonly = Please select a writable calendar
task-edit-instructions-capability = Please select a calendar that supports tasks

event-details-start-date = Start:
event-details-end-date = End:

# LOCALIZATION NOTE (datetime-with-timezone):
# used for a display of a date-time with timezone 'Thu 2 Oct 2008 13:21', Europe/Paris
#    $datetime will be replaced with the completion date-time
#    $timezone will be replaced with the name of the timezone
datetime-with-timezone = { $datetime }, { $timezone }

# LOCALIZATION NOTE (single-long-calendar-week):
# used for display of calendar weeks in long form like 'Calendar Week 43'
#    $index will be replaced with the index of the week
single-long-calendar-week = Calendar Week: { $index }

# LOCALIZATION NOTE (single-calendar-week):
# used for display of calendar weeks in short form like 'CW 43'
#    $index will be replaced with the index of the week
single-calendar-week = CW: { $index }
    .title = Calendar Week: { $index }

# LOCALIZATION NOTE (several-long-calendar-weeks):
# used for display of calendar weeks in long form like 'Calendar Weeks 43 - 45'
#    $startIndex will be replaced with the index of the start-week
#    $endIndex will be replaced with the index of the end-week
several-long-calendar-weeks = Calendar Weeks { $startIndex }-{ $endIndex }

# LOCALIZATION NOTE (several-calendar-weeks):
# used for display of calendar weeks in short form like 'CWs 43 - 45'
#    $startIndex will be replaced with the index of the start-week
#    $endIndex will be replaced with the index of the end-week
several-calendar-weeks = CWs: { $startIndex }-{ $endIndex }
    .title = Calendar Weeks { $startIndex }-{ $endIndex }

# LOCALIZATION NOTE (multiweek-view-week):
# Used for displaying the week number in the first day box of every week
# in multiweek and month views.
# It allows to localize the label with the week number in case your locale
# requires it.
# Take into account that this label is placed in the same room of the day label
# inside the day boxes, exactly on left side, hence a possible string shouldn't
# be too long otherwise it will create confusion between the week number and
# the day number other than a possible crop when the window is resized.
#    $number is a number from 1 to 53 that represents the week number.
multiweek-view-week = W { $number }

# Task tree, "Due In" column.
# LOCALIZATION NOTE (due-in-days, due-in-hours): Semi-colon list of plural
# forms. See: http://developer.mozilla.org/en/Localization_and_Plurals
# $count count
due-in-days = {
    $count ->
        [one] { $count } day
        *[other] { $count } days
    }
# $count count
due-in-hours = {
    $count ->
        [one] { $count } hour
        *[other] { $count } hours
    }

due-in-less-than-one-hour = < 1 hour

# LOCALIZATION NOTE (format-date-long):
# used for display dates in long format like 'Mon 15 Oct 2008' when it's
# impossible to retrieve the formatatted date from the OS.
#    $dayName will be replaced with name of the day in short format;
#    $dayIndex will be replaced with the day-index of the month, possibly followed by an ordinal symbol
#         (depending on the string dayOrdinalSymbol in dateFormat.properties);
#    $monthName will be replaced with the name of the month in short format;
#    $year will be replaced with the year.
format-date-long = { $dayName } { $dayIndex } { $monthName } { $year }

# LOCALIZATION NOTE (day-header):
# used for display the labels in the header of the days in day/week views in short
# or long format. For example: 'Monday 6 Oct.' or 'Mon. 6 Oct.'
#    $dayName will be replaced with name of the day in short or long format
#    $dayIndex will be replaced with the day-index of the month, possibly followed by an ordinal symbol
#         (depending on the string dayOrdinalSymbol in dateFormat.properties), plus the name
#         of the month in short format (the day/month order depends on the OS settings).
day-header = { $dayName } { $dayIndex }
day-header-elem =
    .label = { day-header }

# LOCALIZATION NOTE (datetime-interval-task-without-date):
# used for task without start and due date
# (showed only in exported calendar in Html format)
datetime-interval-task-without-date =  no start or due date
# LOCALIZATION NOTE (datetime-interval-task-without-due-date):
# used for intervals in task with only start date
# displayed form is 'start date 5 Jan 2006 13:00'
# (showed only in exported calendar in Html format)
#    $date will be replaced with the date of the start date
#    $time will be replaced with the time of the start date
datetime-interval-task-without-due-date = start date { $date } { $time }
# LOCALIZATION NOTE (datetime-interval-task-without-start-date):
# used for intervals in task with only due date
# displayed form is 'due date 5 Jan 2006 13:00'
# (showed only in exported calendar in Html format)
#    $date will be replaced with the date of the due date
#    $time will be replaced with the time of the due date
datetime-interval-task-without-start-date = due date { $date } { $time }

# LOCALIZATION NOTE (drag-label-tasks-with-only-entry-date
#                    drag-label-tasks-with-only-due-date)
# Labels that appear while dragging a task with only
# entry date OR due date
drag-label-tasks-with-only-entry-date = Starting time
drag-label-tasks-with-only-due-date = Due at

delete-task =
    .label = Delete Task
    .accesskey = l
delete-item =
    .label = Delete
    .accesskey = l
delete-event =
    .label = Delete Event
    .accesskey = l

# $count count
calendar-properties-every-minute =
    .label = { $count ->
        [one] Every minute
        *[other] Every { $count } minutes
    }

# LOCALIZATION NOTE (extract-using)
# Used in message header
#    $languageName will be replaced with language name from languageNames.properties
extract-using = Using { $languageName }

# LOCALIZATION NOTE (extract-using-region)
# Used in message header
#    $languageName will be replaced with language name from languageNames.properties
#    $region will be replaced with region like US in en-US
extract-using-region = Using { $languageName } ({ $region })

# Variables:
# $count (Number) - Number of minutes, also used to determine the correct plural form.
unit-minutes =
    { $count ->
        [one] { $count } minute
        *[other] { $count } minutes
    }
event-duration-menuitem-count-minutes =
    .label = { unit-minutes }

# Variables:
# $count (Number) - Number of hours, also used to determine the correct plural form.
unit-hours =
    { $count ->
        [one] { $count } hour
        *[other] { $count } hours
    }
event-duration-menuitem-count-hours =
    .label = { unit-hours }

# Variables:
# $count (Number) - Number of days, also used to determine the correct plural form.
unit-days =
    { $count ->
        [one] { $count } day
        *[other] { $count } days
    }
event-duration-menuitem-count-days =
    .label = { unit-days }

# Variables:
# $count (Number) - Number of weeks, also used to determine the correct plural form.
unit-weeks =
    { $count ->
        [one] { $count } week
        *[other] { $count } weeks
    }
event-duration-menuitem-count-weeks =
    .label = { unit-weeks }

# Variables:
# $count (Number) - Number of minutes used to determine the correct plural form.
event-duration-menuitem-minutes =
    .label = { $count ->
        [one] minute
        *[other] minutes
    }
event-duration-label-minutes =
    .value = { event-duration-menuitem-minutes.label }

# Variables:
# $count (Number) - Number of hours used to determine the correct plural form.
event-duration-menuitem-hours =
    .label = { $count ->
        [one] hour
        *[other] hours
    }
event-duration-label-hours =
    .value = { event-duration-menuitem-hours.label }

# Variables:
# $count (Number) - Number of days used to determine the correct plural form.
event-duration-menuitem-days =
    .label = { $count ->
        [one] day
        *[other] days
    }
event-duration-label-days =
    .value = { event-duration-menuitem-days.label }

# Variables:
# $count (Number) - Number of weeks used to determine the correct plural form.
event-duration-menuitem-weeks =
    .label = { $count ->
        [one] week
        *[other] weeks
    }
event-duration-label-weeks =
    .value = { event-duration-menuitem-weeks.label }

# LOCALIZATION NOTE (show-calendar)
# Used in calendar list context menu
#    $name will be replaced with the calendar name
# uses the access key calendar.context.togglevisible.accesskey
# $name calendar name
show-calendar = Show { $name }
# $name calendar name
hide-calendar = Hide { $name }
# $name calendar name
hide-calendar-title =
    .title = Show { $name }
# $name calendar name
show-calendar-title =
    .title = Hide { $name }

# Variables:
# $name (String) - The calendar name
show-calendar-name =
    .label = Show { $name }
    .accesskey = h

# Variables:
# $name (String) - The calendar name
hide-calendar-name =
    .label = Hide { $name }
    .accesskey = H

# Variables:
# $name (String) - The calendar name
show-only-calendar-name =
    .label = Show Only { $name }
    .accesskey = O

# LOCALIZATION NOTE (modify-conflict-*)
# Used by the event dialog to resolve item modification conflicts.
modify-conflict-prompt-title = Item Modification Conflict
modify-conflict-prompt-message = The item being edited in the dialog has been modified since it was opened.
modify-conflict-prompt-button1 = Overwrite the other changes
modify-conflict-prompt-button2 = Discard these changes

# Accessible description of a grid calendar with no selected date
minimonth-no-selected-date =
    .aria-label = No date selected

# Used in the main menu and contextual menus.
calendar-context-today-pane =
    .label = Today Pane
    .accesskey = P

calendar-context-open-event =
    .label = Open
    .accesskey = O

calendar-context-open-task =
    .label = Open Task…
    .accesskey = O

calendar-context-new-event =
    .label = New Event…
    .accesskey = N

calendar-context-new-task =
    .label = New Task…
    .accesskey = k

calendar-context-delete-task =
    .label = Delete Task
    .accesskey = l

calendar-context-delete-event =
    .label = Delete Event
    .accesskey = l

calendar-context-cut =
    .label = Cut
    .accesskey = t

calendar-context-copy =
    .label = Copy
    .accesskey = C

calendar-context-paste =
    .label = Paste
    .accesskey = P

calendar-taskview-delete =
    .label = Delete
    .tooltiptext = Delete Task

calendar-context-attendance-menu =
    .label = Attendance
    .accesskey = d

calendar-context-attendance-occurrence =
    .label = This Occurrence

calendar-context-attendance-all-series =
    .label = Complete Series

calendar-context-attendance-send =
    .label = Send a notification now
    .accesskey = S

calendar-context-attendance-dontsend =
    .label = Do not send a notification
    .accesskey = D

calendar-context-attendance-occ-accepted =
    .label = Accepted
    .accesskey = A

calendar-context-attendance-occ-tentative =
    .label = Accepted tentatively
    .accesskey = y

calendar-context-attendance-occ-declined =
    .label = Declined
    .accesskey = c

calendar-context-attendance-occ-delegated =
    .label = Delegated
    .accesskey = g

calendar-context-attendance-occ-needs-action =
    .label = Still needs action
    .accesskey = S

calendar-context-attendance-occ-in-progress =
    .label = In progress
    .accesskey = I

calendar-context-attendance-occ-completed =
    .label = Completed
    .accesskey = C

calendar-context-attendance-all-accepted =
    .label = Accepted
    .accesskey = e

calendar-context-attendance-all-tentative =
    .label = Accepted tentatively
    .accesskey = v

calendar-context-attendance-all-declined =
    .label = Declined
    .accesskey = d

calendar-context-attendance-all-delegated =
    .label = Delegated
    .accesskey = l

calendar-context-attendance-all-needs-action =
    .label = Still needs action
    .accesskey = l

calendar-context-attendance-all-in-progress =
    .label = In progress
    .accesskey = p

calendar-context-attendance-all-completed =
    .label = Completed
    .accesskey = m

calendar-context-progress =
    .label = Progress
    .accesskey = P

calendar-context-postpone =
    .label = Postpone Task
    .accesskey = s

calendar-context-postpone-1hour =
    .label = 1 Hour
    .accesskey = H

calendar-context-postpone-1day =
    .label = 1 Day
    .accesskey = D

calendar-context-postpone-1week =
    .label = 1 Week
    .accesskey = W

calendar-context-new-server =
    .label = New Calendar…
    .accesskey = N

calendar-context-delete-server =
    .label = Delete Calendar…
    .accesskey = D

calendar-context-remove-server =
    .label = Remove Calendar…
    .accesskey = R

calendar-context-unsubscribe-server =
    .label = Unsubscribe Calendar…
    .accesskey = U

calendar-context-publish =
    .label = Publish Calendar…
    .accesskey = b

calendar-context-export =
    .label = Export Calendar…
    .accesskey = E

calendar-context-properties =
    .label = Properties
    .accesskey = P

calendar-context-showall =
    .label = Show All Calendars
    .accesskey = A

calendar-context-convert-menu =
    .label = Convert To
    .accesskey = v

calendar-context-convert-to-event =
    .label = Event…
    .accesskey = E

calendar-context-convert-to-message =
    .label = Message…
    .accesskey = M

calendar-context-convert-to-task =
    .label = Task…
    .accesskey = T

calendar-task-filter-title = Show

calendar-task-filter-all =
    .label = All
    .accesskey = A

calendar-task-filter-today =
    .label = Today
    .accesskey = T

calendar-task-filter-next7days =
    .label = Next Seven Days
    .accesskey = N

calendar-task-filter-notstarted =
    .label = Not Started Tasks
    .accesskey = a

calendar-task-filter-overdue =
    .label = Overdue Tasks
    .accesskey = O

calendar-task-filter-completed =
    .label = Completed Tasks
    .accesskey = C

calendar-task-filter-open =
    .label = Incomplete Tasks
    .accesskey = m

# LOCALIZATION NOTE (calendar-task-filter-current):
# "Current Tasks" shows all tasks except those starting in the future.
calendar-task-filter-current =
    .label = Current Tasks
    .accesskey = u

calendar-task-details-title = title
calendar-task-details-organizer = from
calendar-task-details-priority = priority
calendar-task-details-priority-low = Low
calendar-task-details-priority-normal = Normal
calendar-task-details-priority-high = High
calendar-task-details-status = status
calendar-task-details-category = category
calendar-task-details-repeat = repeat
calendar-task-details-attachments = attachments
calendar-task-details-start = start date
calendar-task-details-due = due date

calendar-task-mark-completed =
    .label = Mark Completed
    .accesskey = o
    .tooltiptext = Mark selected tasks completed

calendar-task-change-priority =
    .label = Priority
    .accesskey = r
    .tooltiptext = Change the priority

calendar-task-text-filter-field =
    .emptytextbase = Filter tasks #1
    .keylabelnonmac = <Ctrl+Shift+K>
    .keylabelmac = <⇧⌘K>

calendar-copylink =
    .label = Copy Link Location
    .accesskey = C

calendar-progress-level-0 =
    .label = 0% Completed
    .accesskey = 0

calendar-progress-level-25 =
    .label = 25% Completed
    .accesskey = 2

calendar-progress-level-50 =
    .label = 50% Completed
    .accesskey = 5

calendar-progress-level-75 =
    .label = 75% Completed
    .accesskey = 7

calendar-progress-level-100 =
    .label = 100% Completed
    .accesskey = 1

calendar-priority-none =
    .label = Not specified
    .accesskey = s

calendar-priority-low =
    .label = Low
    .accesskey = L

calendar-priority-normal =
    .label = Normal
    .accesskey = N

calendar-priority-high =
    .label = High
    .accesskey = H

calendar-tasks-view-minimonth =
    .label = Mini-Month
    .accesskey = M

calendar-tasks-view-calendarlist =
    .label = Calendar List
    .accesskey = L

calendar-tasks-view-filtertasks =
    .label = Filter Tasks
    .accesskey = F

calendar-properties-color =
    .value = Color:
calendar-properties-location =
    .value = Location:
calendar-properties-refresh =
    .value = Refresh Calendar:
calendar-properties-refresh-manual =
    .label = Manually
calendar-properties-read-only =
    .label = Read Only
calendar-properties-show-reminders =
    .label = Show Reminders
calendar-properties-offline-support =
    .label = Offline Support
calendar-properties-enable-calendar =
    .label = Enable This Calendar
calendar-properties-provider-missing = The provider for this calendar could not be found. This often happens if you have disabled or uninstalled certain addons.
calendar-properties-unsubscribe =
    .label = Unsubscribe
    .accesskey = U
    .buttonlabelextra1 = Unsubscribe
    .buttonaccesskeyextra1 = U

calendar-alarm-dialog-title = Calendar Reminders
calendar-alarm-details =
    .value = Details…

calendar-alarm-dismiss =
    .label = Dismiss
calendar-alarm-dismiss-all =
    .label = Dismiss All

calendar-alarm-snooze-for =
    .label = Snooze for
calendar-alarm-snooze-all-for =
    .label = Snooze All for

# Variables:
# $count (Number) - The number of minutes to snooze.
calendar-alarm-snooze-preset-minutes =
    .label =
        { $count ->
            [one] { $count } Minute
           *[other] { $count } Minutes
        }

# Variables:
# $count (Number) - The number of hours to snooze.
calendar-alarm-snooze-preset-hours =
    .label =
        { $count ->
            [one] { $count } Hour
           *[other] { $count } Hours
        }

# Variables:
# $count (Number) - The number of days to snooze.
calendar-alarm-snooze-preset-days =
    .label =
        { $count ->
            [one] { $count } Day
           *[other] { $count } Days
        }

# LOCALIZATION NOTE (calendar-alarm-snooze-cancel):
# This string is not visible in the UI. It is read by screen readers when the
# user focuses the "Cancel" button in the "Snooze for..." popup of the alarm dialog.
calendar-alarm-snooze-cancel =
    .aria-label = Cancel Snooze

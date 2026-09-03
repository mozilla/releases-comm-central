# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

calendar-dialog-close-button =
  .aria-label = Close
  .title = Close

calendar-event-create-edit-dialog =
  .aria-label = Event

calendar-dialog-menu-button =
  .aria-label = Open menu
  .title = Open Menu

calendar-dialog-back-button =
  .aria-label = Back
  .title = Back

calendar-dialog-date-row-icon =
  .alt = Date and time

calendar-dialog-date-row-recurring-icon =
  .alt = Recurring

calendar-dialog-location-row-icon =
  .alt = Location

calendar-dialog-description-row-icon =
  .alt = Description

calendar-dialog-reminders-row-icon =
  .alt = Reminders

calendar-dialog-attendees-row-icon =
  .alt = Guests

# Variables:
#   $count (Number): Number of guests.
calendar-dialog-attendee-count =
  { $count ->
      [one] { $count } Guest
      *[other] { $count } Guests

  }

## These strings are formatted as a list using Intl.Listformat,
## resulting for example in "1 attending, 2 maybe, etc.".

# Variables:
#   $count (Number): Number of guests that responded "attending".
calendar-dialog-attendee-summary-going =
  {
    $count ->
      [one] {$count} attending
      *[other] {$count} attending
  }

# Variables:
#   $count (Number): Number of guests that responded "maybe".
calendar-dialog-attendee-summary-maybe =
  {
    $count ->
      [one] {$count} maybe
      *[other] {$count} maybe
  }

# Variables:
#   $count (Number): Number of guests that responded "declined".
calendar-dialog-attendee-summary-declined =
  {
    $count ->
      [one] {$count} declined
      *[other] {$count} declined
  }

# Variables:
#   $count (Number): Number of guests whose response is pending (didn't reply yet).
calendar-dialog-attendee-summary-pending =
  {
    $count ->
      [one] {$count} pending
      *[other] {$count} pending
  }

calendar-dialog-attendee-organizer =
  Organizer

calendar-dialog-attendee-optional =
  Optional

calendar-dialog-icon-attending =
  .alt = Attending

calendar-dialog-icon-declined =
  .alt = Declined

calendar-dialog-icon-maybe =
  .alt = Maybe

calendar-dialog-attendees-expand-icon =
  .alt = Show all guests

calendar-dialog-description-label = Description

calendar-dialog-description-expand-icon =
  .alt = Show full description

calendar-dialog-menu-duplicate =
  .label = Duplicate event

calendar-dialog-menu-delete =
  .label = Delete event

calendar-dialog-menu-print =
  .label = Print

calendar-dialog-menu =
  .aria-label = More actions menu
  .title = More Actions Menu

# Variables:
#   $additionalCategories (Number): Number of categoires not shown.
#   $categories (String): List of all categories.
calendar-dialog-more-categories =
  { $additionalCategories ->
    *[other] +{ $additionalCategories } more
  }
  .title = { $categories }

calendar-dialog-delete-reminder-button =
 .alt = Delete Reminder

calendar-dialog-add-reminder-button = Add reminder

calendar-dialog-reminder-select =
  .aria-label = Select new reminder duration

calendar-dialog-save-reminder-button = Save

calendar-dialog-reminder-event-start = 0 minutes before

# Variables:
#  $count (Number): Number of minutes before the event.
calendar-dialog-reminder-minutes-before =
  { $count ->
    [one] { $count } minute before
    *[other] { $count } minutes before
  }

# Variables:
#  $count (Number): Number of hours before the event.
calendar-dialog-reminder-hours-before =
  { $count ->
    [one] { $count } hour before
    *[other] { $count } hours before
  }
# Variables:
#  $count (Number): Number of days before the event.
calendar-dialog-reminder-days-before =
  { $count ->
    [one] { $count } day before
    *[other] { $count } days before
  }

calendar-dialog-reminder-week-before = 1 week before

# Variables:
#   $count (Number): Number of reminders.
calendar-dialog-reminder-count =
  { $count ->
      [one] { $count } Reminder
      *[other] { $count } Reminders
  }

calendar-dialog-accept = Going
  .title = Going

calendar-dialog-accept-tentative = Maybe
  .title = Maybe

calendar-dialog-decline = Not Going
  .title = Not Going

calendar-dialog-join-meeting-button = Join Meeting

calendar-dialog-join-meeting-row-icon =
  .alt = Join Meeting

calendar-dialog-attachments-row-icon =
  .alt = Attachments

calendar-dialog-attachments-label = Attachments

calendar-dialog-attachment-link-icon =
  .alt = Linked attachment

calendar-dialog-attachments-expand-icon =
  .alt = Show all attachments

# Variables:
#   $count (Number): Number of attachments.
calendar-dialog-attachments-summary-label =
  { $count ->
    [one] { $count } Attachment
    *[other] {$count} Attachments
  }

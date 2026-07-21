# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Tab titles
calendar-tab-title-calendar = Calendar
calendar-tab-title-tasks = Tasks

## Email invitation preview (HTML rendering of an iTIP invitation)

imip-html-header = Event Invitation

# Field labels of the invitation preview table.
imip-html-summary = Title:
imip-html-location = Location:
imip-html-when = When:
imip-html-organizer = Organizer:
imip-html-description = Description:
imip-html-attachments = Attachments:
imip-html-comment = Comment:
imip-html-attendees = Attendees:
imip-html-url = Related Link:
imip-html-canceled-occurrences = Canceled Occurrences:
imip-html-modified-occurrences = Modified Occurrences:

# Variables:
#   $location (String) - The new location of a modified occurrence.
imip-html-new-location = New Location: { $location }

# Appended behind an attendee name in the email invitation preview.
# Variables:
#   $delegators (String) - A single delegator or a comma separated list of delegators.
imip-html-attendee-delegated-from = (delegated from { $delegators })

# Tooltip for the attendee icon, composed from the role and the participation
# status sentences.
# Variables:
#   $role (String) - One of the imip-html-attendee-role-* strings.
#   $partStat (String) - One of the imip-html-attendee-part-stat-* strings.
imip-html-attendee-combined = { $role } { $partStat }

# Attendee roles. Composed into imip-html-attendee-combined.
# Variables:
#   $userType (String) - One of the imip-html-attendee-user-type-* strings.
imip-html-attendee-role-chair = { $userType } chairs the event.

# Variables:
#   $userType (String) - One of the imip-html-attendee-user-type-* strings.
imip-html-attendee-role-non-participant = { $userType } is a non-participant.

# Variables:
#   $userType (String) - One of the imip-html-attendee-user-type-* strings.
imip-html-attendee-role-opt-participant = { $userType } is an optional participant.

# Variables:
#   $userType (String) - One of the imip-html-attendee-user-type-* strings.
imip-html-attendee-role-req-participant = { $userType } is a required participant.

# Attendee participation statuses. Composed into imip-html-attendee-combined.
# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-part-stat-accepted = { $attendee } has confirmed attendance.

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-part-stat-declined = { $attendee } has declined attendance.

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
#   $delegatees (String) - A single delegatee or a comma separated list of delegatees.
imip-html-attendee-part-stat-delegated = { $attendee } has delegated attendance to { $delegatees }.

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-part-stat-needs-action = { $attendee } still needs to reply.

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-part-stat-tentative = { $attendee } has confirmed attendance tentatively.

# Attendee user types. Composed into imip-html-attendee-role-*.
# Variables:
#   $attendee (String) - Email address or common name <email address> of the attendee.
imip-html-attendee-user-type-individual = { $attendee }

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-user-type-group = { $attendee } (group)

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-user-type-resource = { $attendee } (resource)

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-user-type-room = { $attendee } (room)

# Variables:
#   $attendee (String) - Common name or email address of the attendee.
imip-html-attendee-user-type-unknown = { $attendee }

## iTIP processing result text

imip-added-item-to-cal = The event has been added to your calendar.
imip-canceled-item = The event has been deleted from your calendar.
imip-updated-item = The event has been updated.

## iTIP bar labels

imip-bar-cancel-text = This message contains an event cancellation.
imip-bar-counter-error-text = This message contains a counterproposal to an invitation that cannot be processed.
imip-bar-counter-previous-version-text = This message contains a counterproposal to a previous version of an invitation.
imip-bar-counter-text = This message contains a counterproposal to an invitation.
imip-bar-disallowed-counter-text = This message contains a counterproposal although you disallowed countering for this event.
imip-bar-decline-counter-text = This message contains a reply to your counterproposal.
imip-bar-refresh-text = This message asks for an event update.
imip-bar-publish-text = This message contains an event.
imip-bar-request-text = This message contains an invitation to an event.
imip-bar-sent-text = This message contains a sent event.
imip-bar-sent-but-removed-text = This message contains a sent out event that is not in your calendar anymore.
imip-bar-update-text = This message contains an update to an existing event.
imip-bar-update-multiple-text = This message contains updates to multiple existing events.
imip-bar-update-series-text = This message contains an update to an existing series of events.
imip-bar-already-processed-text = This message contains an event that has already been processed.
imip-bar-processed-needs-action = This message contains an event that you have not yet responded to.
imip-bar-processed-multiple-needs-action = This message contains multiple events that you have not yet responded to.
imip-bar-processed-series-needs-action = This message contains an event series that you have not yet responded to.
imip-bar-reply-text = This message contains a reply to an invitation.
imip-bar-reply-to-not-existing-item = This message contains a reply referring to an event that is not in your calendar.

# Variables:
#   $deletionTime (String) - The formatted time the event was removed from the calendar.
imip-bar-reply-to-recently-removed-item = This message contains a reply referring to an event that was removed from your calendar at { $deletionTime }.
# Variables:
#   $status (String) - The hexadecimal status code of the failed processing.
imip-bar-processing-failed = Processing message failed. Status: { $status }.
imip-bar-calendar-deactivated = This message contains event information. Enable a calendar to handle it.
imip-bar-not-writable = No writable calendars are configured for invitations, please check the calendar properties.
imip-no-calendar-available = There are no writable calendars available.

## Sending invitation emails

imip-send-mail-title = Email Notification
imip-send-mail-text = Would you like to send out notification Email now?

## Calendar email identity

imip-no-identity = None
no-identity-selected-notification = If you want to use this calendar to store invitations to or from other people you should assign an email identity below.

## Invitations panel

# Variables:
#   $count (Number) - The number of pending invitations.
invitations-link-label = Invitations: { $count }

## Process invitation confirmation prompt

confirm-process-invitation = You have recently deleted this item, are you sure you want to process this invitation?
confirm-process-invitation-title = Process Invitation?

## iTIP email subjects and bodies

# Variables:
#   $summary (String) - The event title.
itip-request-subject = Invitation: { $summary }

# Variables:
#   $summary (String) - The event title.
itip-request-updated-subject = Updated: { $summary }

# Variables:
#   $organizer (String) - The event organizer.
#   $summary (String) - The event title.
itip-request-body = { $organizer } has invited you to { $summary }

# Variables:
#   $summary (String) - The event title.
itip-cancel-subject = Canceled: { $summary }

# Variables:
#   $organizer (String) - The event organizer.
#   $summary (String) - The event title.
itip-cancel-body = { $organizer } has canceled this event: { $summary }

# Variables:
#   $attendee (String) - The attendee who made the counterproposal.
#   $summary (String) - The event title.
itip-counter-body = { $attendee } has made a counterproposal for "{ $summary }":

# Variables:
#   $organizer (String) - The event organizer.
#   $summary (String) - The event title.
itip-decline-counter-body = { $organizer } has declined your counterproposal for "{ $summary }".

# Variables:
#   $summary (String) - The event title.
itip-decline-counter-subject = Counterproposal Declined: { $summary }

# Variables:
#   $summary (String) - The event title.
itip-reply-subject = Invitation Reply: { $summary }

# Variables:
#   $summary (String) - The event title.
itip-reply-subject-accept = Accepted: { $summary }

# Variables:
#   $summary (String) - The event title.
itip-reply-subject-decline = Invitation Declined: { $summary }

# Variables:
#   $summary (String) - The event title.
itip-reply-subject-tentative = Tentative: { $summary }

# Variables:
#   $attendee (String) - The attendee who replied.
itip-reply-body-accept = { $attendee } has accepted your event invitation.

# Variables:
#   $attendee (String) - The attendee who replied.
itip-reply-body-decline = { $attendee } has declined your event invitation.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

rule-menuitem-spam =
  .label = Spam

rule-menuitem-not-spam =
  .label = Not Spam

run-filter-before-spam =
  .label = Filter before Spam Classification

run-filter-after-spam =
  .label = Filter after Spam Classification

# Variables:
#   $minutes - the number of minutes
run-periodically =
    .label = {
        $minutes ->
            [one] Periodically, every minute
            *[other] Periodically, every { $minutes } minutes
        }
    .accesskey = e

rule-action-set-spam-status =
  .label = Set Spam Status to

# Variables:
# $author (String) - The author of the message.
# $subject (String) - The subject of the message.
# $date (String) - The date of the message.
spam-message-detection-log = Detected spam from { $author } - { $subject } at { $date }

# Variables:
# $errorMsg (String) - The error message about the action that failed.
# $errorCode (String) - The hexadecimal error code.
filter-failure-warning-prefix =
    Filter action failed: "{ $errorMsg }" with error code={ $errorCode } while attempting:

filter-failure-sending-reply-error = Error sending reply
filter-failure-sending-reply-aborted = Sending reply aborted
filter-failure-move-failed = Move failed
filter-failure-copy-failed = Copy failed
filter-failure-action = Failed applying the filter action

# Variables:
# $filterName (String) - The name of the filter that was applied.
# $author (String) - The sender of the message.
# $subject (String) - The subject line of the message.
# $date (String) - The date/time the filter was applied.
filter-log-match-summary =
    Applied filter "{ $filterName }" to message from { $author } - { $subject } at { $date }

# Variables:
# $id (String) - The author of the moved message.
# $folder (String) - The destination folder of the moved message.
moved-message-log = moved message id = { $id } to { $folder }

# Variables:
# $id (String) - The author of the copied message.
# $folder (String) - The destination folder of the copied message.
copied-message-log = copied message id = { $id } to { $folder }

filter-missing-custom-action = Missing Custom Action

filter-action-log-priority = priority changed
filter-action-log-deleted = deleted
filter-action-log-read = marked as read
filter-action-log-kill = thread killed
filter-action-log-watch = thread watched
filter-action-log-starred = starred
filter-action-log-replied = replied
filter-action-log-forwarded = forwarded
filter-action-log-stop = execution stopped
filter-action-log-pop3-delete = deleted from POP3 server
filter-action-log-pop3-leave = left on POP3 server
filter-action-log-spam = spam score
filter-action-log-pop3-fetch = body fetched from POP3 server
filter-action-log-tagged = tagged
filter-action-log-ignore-subthread = ignored subthread
filter-action-log-unread = marked as unread

# Variables:
# $timestamp (String) - The timestamp of the log entry.
# $message (String) - The actual log message.
filter-log-line = [{ $timestamp }] { $message }

# Variables:
# $filterName (String) - The name of the filter.
# $message (String) - The log message from the filter.
filter-log-message = Message from filter "{ $filterName }": { $message }

filter-editor-must-select-target-folder = You must select a target folder.
filter-editor-enter-valid-email-forward = Enter a valid email address to forward to.
filter-editor-pick-template-reply = Choose a template to reply with.

# Variables:
# $filterName (String) - The name of the filter that was applied.
filter-continue-execution = Applying filter { $filterName } failed. Would you like to continue applying filters?

filter-list-backup-message =
    Your filters do not work because the msgFilterRules.dat file, which contains your filters, could not be read. A new msgFilterRules.dat file will be created and a backup of the old file, called rulesbackup.dat, will be created in the same directory.

filter-invalid-custom-header =
    One of your filters uses a custom header that contains an invalid character, such as ‘:’, a non-printable character, a non-ascii character, or an eight-bit ascii character. Please edit the msgFilterRules.dat file, which contains your filters, to remove invalid characters from your custom headers.

## Filter List Dialog

filter-window-title = Message Filters

filter-name-column =
    .label = Filter Name

filter-active-column =
    .label = Enabled

filter-new-button =
    .label = New…
    .accesskey = N

filter-new-copy-button =
    .label = Copy…
    .accesskey = C

filter-edit-button =
    .label = Edit…
    .accesskey = E

filter-delete-button =
    .label = Delete
    .accesskey = t

filter-reorder-top-button =
    .label = Move to Top
    .accesskey = o
    .tooltiptext = Rearrange filter so it executes before all others

filter-reorder-up-button =
    .label = Move Up
    .accesskey = U

filter-reorder-down-button =
    .label = Move Down
    .accesskey = D

filter-reorder-bottom-button =
    .label = Move to Bottom
    .accesskey = B
    .tooltiptext = Rearrange filter so it executes after all others

filter-header-label =
    .value = Enabled filters are run automatically in the order shown below.

filter-filters-for-prefix =
    .value = Filters for:
    .accesskey = F

filter-view-log-button =
    .label = Filter Log
    .accesskey = L

filter-run-filters-button =
    .label = Run Now
    .accesskey = R

filter-folder-picker-prefix =
    .value = Run selected filter(s) on:
    .accesskey = c

filter-search-box =
    .placeholder = Search filters by name…

filter-close-key =
    .key = W

filter-delete-confirmation = Are you sure you want to delete the selected filter(s)?

filter-dont-warn-delete-checkbox = Don’t ask me again

filter-cannot-enable-incompatible = This filter was probably created by a newer or incompatible version of { -brand-product-name }. You cannot enable this filter because we don’t know how to apply it.

filter-running-title = Running Filters

filter-running-message =
    You are currently in the process of filtering messages.
    Would you like to continue applying filters?

filter-stop-button = Stop

filter-continue-button = Continue

# Variables:
#   $count - the number items
filter-count-items = {
    $count ->
        [one] { $count } item
        *[other] { $count } items
    }

# Variables:
#   $visible - the number of visible items
#   $total - the total number of items
filter-count-visible-of-total = { $visible } of { $total }

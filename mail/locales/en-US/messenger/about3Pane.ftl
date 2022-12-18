# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Quick Filter Bar

quick-filter-bar-no-results = No results

# Variables:
# $count (Number) - The number of messages that match selected filters.
quick-filter-bar-results =
    { $count ->
         [one] { $count } message
        *[other] { $count } messages
    }

# The first line of the panel popup that tells the user we found no matches
# but we can convert to a global search for them.
quick-filter-bar-gloda-upsell-line1 = Continue this search across all folders
# The second line of the panel popup that tells the user we found no matches.
# Variables:
# $text (String) - What the user has typed so far.
quick-filter-bar-gloda-upsell-line2 = Press ‘Enter’ again to continue your search for: { $text }

## Message thread pane

threadpane-column-header-select =
  .title = Toggle select all messages
threadpane-column-header-select-all =
  .title = Select all messages
threadpane-column-header-deselect-all =
  .title = Deselect all messages
threadpane-column-label-select =
  .label = Select Messages

threadpane-column-header-thread =
  .title = Toggle message threads
threadpane-column-label-thread =
  .label = Thread

threadpane-column-header-flagged =
  .title = Sort by star
threadpane-column-label-flagged =
  .label = Starred

threadpane-column-header-attachments =
  .title = Sort by attachments
threadpane-column-label-attachments =
  .label = Attachments

threadpane-column-header-spam =
  .title = Sort by spam status
threadpane-column-label-spam =
  .label = Spam

threadpane-column-header-unread-button =
  .title = Sort by read status
threadpane-column-label-unread-button =
  .label = Read status

threadpane-column-header-sender = From
  .title = Sort by from
threadpane-column-label-sender =
  .label = From

threadpane-column-header-recipient = Recipient
  .title = Sort by recipient
threadpane-column-label-recipient =
  .label = Recipient

threadpane-column-header-correspondents = Correspondents
  .title = Sort by correspondents
threadpane-column-label-correspondents =
  .label = Correspondents

threadpane-column-header-subject = Subject
  .title = Sort by subject
threadpane-column-label-subject =
  .label = Subject

threadpane-column-header-date = Date
  .title = Sort by date
threadpane-column-label-date =
  .label = Date

threadpane-column-header-received = Received
  .title = Sort by date received
threadpane-column-label-received =
  .label = Received

threadpane-column-header-status = Status
  .title = Sort by status
threadpane-column-label-status =
  .label = Status

threadpane-column-header-size = Size
  .title = Sort by size
threadpane-column-label-size =
  .label = Size

threadpane-column-header-tags = Tags
  .title = Sort by tags
threadpane-column-label-tags =
  .label = Tags

threadpane-column-header-account = Account
  .title = Sort by account
threadpane-column-label-account =
  .label = Account

threadpane-column-header-priority = Priority
  .title = Sort by priority
threadpane-column-label-priority =
  .label = Priority

threadpane-column-header-unread = Unread
  .title = Number of unread messages in thread
threadpane-column-label-unread =
  .label = Unread

threadpane-column-header-total = Total
  .title = Total number of messages in thread
threadpane-column-label-total =
  .label = Total

threadpane-column-header-location = Location
  .title = Sort by location
threadpane-column-label-location =
  .label = Location

threadpane-column-header-id = Order Received
  .title = Sort by order received
threadpane-column-label-id =
  .label = Order Received

threadpane-column-header-delete =
  .title = Delete a message
threadpane-column-label-delete =
  .label = Delete

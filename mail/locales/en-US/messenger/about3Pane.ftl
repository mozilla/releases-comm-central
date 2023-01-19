# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Quick Filter Bar

# The tooltip to display when the user hovers over the sticky button
# (currently displayed as a push-pin). When active, the sticky button
# causes the current filter settings to be retained when the user changes
# folders or opens new tabs. (When inactive, only the state of the text
# filters are propagated between folder changes and when opening new tabs.)
quick-filter-bar-sticky =
    .title = Keep filters applied when switching folders

# The tooltip for the filter button that causes us to filter results to only
# include unread messages.
quick-filter-bar-unread =
    .title = Show only unread messages
# The label for the filter button that causes us to filter results to only
# include unread messages.
quick-filter-bar-unread-label = Unread

# The tooltip for the filter button that causes us to filter results to only
# include messages that have been starred/flagged.
quick-filter-bar-starred =
    .title = Show only starred messages
# The label for the filter button that causes us to filter results to only
# include messages that have been starred/flagged.
quick-filter-bar-starred-label = Starred

# The tooltip for the filter button that causes us to filter results to only
# include messages from contacts in one of the user's non-remote address
# books.
quick-filter-bar-inaddrbook =
    .title = Show only messages from people in your address book
# The label for the filter button that causes us to filter results to only
# include messages from contacts in one of the user's non-remote address
# books.
quick-filter-bar-inaddrbook-label = Contact

# The tooltip for the filter button that causes us to filter results to only
# include messages with at least one tag on them.
quick-filter-bar-tags =
    .title = Show only messages with tags on them
# The label for the filter button that causes us to filter results to only
# include messages with at least one tag on them.
quick-filter-bar-tags-label = Tags

# The tooltip for the filter button that causes us to filter results to only
# include messages with attachments.
quick-filter-bar-attachment =
    .title = Show only messages with attachments
# The label for the filter button that causes us to filter results to only
# include messages with attachments.
quick-filter-bar-attachment-label = Attachment

# The contents of the results box when there is a filter active but there
# are no messages matching the filter.
quick-filter-bar-no-results = No results

# This is used to populate the results box; it either displays the
# number of messages found using this string, that there are no messages
# (using quick-filter-bar-no-results), or the box is hidden.
# Variables:
# $count (Number) - The number of messages that match selected filters.
quick-filter-bar-results =
    { $count ->
         [one] { $count } message
        *[other] { $count } messages
    }

# Keyboard shortcut for the text search box.
# This should match quick-filter-bar-show in messenger.ftl.
quick-filter-bar-textbox-shortcut =
    { PLATFORM() ->
        [macos] ⇧ ⌘ K
       *[other] Ctrl+Shift+K
    }

# This is the empty text for the text search box.
# The goal is to convey to the user that typing in the box will filter
# the messages and that there is a hotkey they can press to get to the
# box faster.
quick-filter-bar-textbox =
    .placeholder = Filter these messages <{ quick-filter-bar-textbox-shortcut }>

# Tooltip of the Any-of/All-of tagging mode selector.
quick-filter-bar-boolean-mode =
    .title = Tag filtering mode
# The Any-of tagging mode.
quick-filter-bar-boolean-mode-any =
    .label = Any of
    .title = At least one of the selected tag criteria should match
# The All-of tagging mode.
quick-filter-bar-boolean-mode-all =
    .label = All of
    .title = All of the selected tag criteria must match

# This label explains what the sender/recipients/subject/body buttons do.
# This string should ideally be kept short because the label and the text
# filter buttons share their bar (that appears when there is text in the text
# filter box) with the list of tags when the tag filter is active, and the
# tag sub-bar wants as much space as possible. (Overflow is handled by an
# arrow scroll box.)
quick-filter-bar-text-filter-explanation = Filter messages by:
# The button label that toggles whether the text filter searches the message
# sender for the string.
quick-filter-bar-text-filter-sender = Sender
# The button label that toggles whether the text filter searches the message
# recipients (to, cc) for the string.
quick-filter-bar-text-filter-recipients = Recipients
# The button label that toggles whether the text filter searches the message
# subject for the string.
quick-filter-bar-text-filter-subject = Subject
# The button label that toggles whether the text filter searches the message
# body for the string.
quick-filter-bar-text-filter-body = Body

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

## Message state variations

threadpane-message-new =
  .alt = New message indicator
  .title = New message

threadpane-message-replied =
  .alt = Replied indicator
  .title = Message replied

threadpane-message-redirected =
  .alt = Redirected indicator
  .title = Message redirected

threadpane-message-forwarded =
  .alt = Forwarded indicator
  .title = Message forwarded

threadpane-message-replied-forwarded =
  .alt = Replied and forwarded indicator
  .title = Message replied and forwarded

threadpane-message-replied-redirected =
  .alt = Replied and redirected indicator
  .title = Message replied and redirected

threadpane-message-forwarded-redirected =
  .alt = Forwarded and redirected indicator
  .title = Message forwarded and redirected

threadpane-message-replied-forwarded-redirected =
  .alt = Replied, forwarded, and redirected indicator
  .title = Message replied, forwarded, and redirected

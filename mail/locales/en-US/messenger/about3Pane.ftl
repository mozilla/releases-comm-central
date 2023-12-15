# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Message List Header Bar

quick-filter-button =
  .title = Toggle the Quick Filter Bar
quick-filter-button-label = Quick Filter

thread-pane-header-display-button =
  .title = Message list display options

# Variables:
# $count (Number) - The number of messages in this folder.
thread-pane-folder-message-count =
  { $count ->
    [one] { $count } Message
    *[other] { $count } Messages
  }

# Variables:
# $count (Number) - The number of messages currently selected.
thread-pane-folder-selected-count =
  { $count ->
    *[other] { $count } Selected
  }

thread-pane-header-context-table-view =
  .label = Table View

thread-pane-header-context-cards-view =
  .label = Cards View

thread-pane-header-context-hide =
  .label = Hide Message List Header

## Quick Filter Bar

# The tooltip to display when the user hovers over the sticky button
# (currently displayed as a push-pin). When active, the sticky button
# causes the current filter settings to be retained when the user changes
# folders or opens new tabs. (When inactive, only the state of the text
# filters are propagated between folder changes and when opening new tabs.)
quick-filter-bar-sticky =
    .title = Keep filters applied when switching folders

# The tooltip for the filter button that replaces the quick filter buttons with
# a dropdown menu.
quick-filter-bar-dropdown =
    .title = Quick filter menu

quick-filter-bar-dropdown-unread =
    .label = Unread

quick-filter-bar-dropdown-starred =
    .label = Starred

quick-filter-bar-dropdown-inaddrbook =
    .label = Contact

quick-filter-bar-dropdown-tags =
    .label = Tags

quick-filter-bar-dropdown-attachment =
    .label = Attachment

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

quick-filter-bar-search =
    .label = Filter messages:

# Keyboard shortcut for the text search box.
# This should match quick-filter-bar-show in messenger.ftl.
quick-filter-bar-search-shortcut = {
  PLATFORM() ->
    [macos] <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>K</kbd>
    *[other] <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd>
}

# This is the empty text for the text search box.
# The goal is to convey to the user that typing in the box will filter the
# messages and that there is a hotkey they can press to get to the box faster.
quick-filter-bar-search-placeholder-with-key = Filter messages… { quick-filter-bar-search-shortcut }

# Label of the search button in the quick filter bar text box. Clicking it will
# launch a global search.
quick-filter-bar-search-button =
  .alt = Search everywhere

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

## Folder pane

folder-pane-get-messages-button =
  .title = Get Messages

folder-pane-get-all-messages-menuitem =
  .label = Get All New Messages
  .accesskey = G

folder-pane-write-message-button = New Message
  .title = Compose a new message

folder-pane-more-menu-button =
  .title = Folder pane options

# Context menu item to show/hide different folder types in the folder pane
folder-pane-header-folder-modes =
  .label = Folder Modes

# Context menu item to toggle display of "Get messages" button in folder pane header
folder-pane-header-context-toggle-get-messages =
  .label = Show “Get Messages”

# Context menu item to toggle display of "New Message" button in folder pane header
folder-pane-header-context-toggle-new-message =
  .label = Show “New Message”

folder-pane-header-context-hide =
  .label = Hide Folder Pane Header

folder-pane-show-total-toggle =
  .label = Show Total Message Count

# Context menu item to show or hide folder sizes
folder-pane-header-toggle-folder-size =
  .label = Show Folder Size

folder-pane-header-hide-local-folders =
  .label = Hide Local Folders

folder-pane-mode-context-button =
  .title = Folder mode options

folder-pane-mode-context-toggle-compact-mode =
  .label = Compact View
  .accesskey = C

folder-pane-mode-move-up =
  .label = Move Up

folder-pane-mode-move-down =
  .label = Move Down

# Variables:
# $count (Number) - Number of unread messages.
folder-pane-unread-aria-label =
  { $count ->
    [one] 1 unread message
    *[other] { $count } unread messages
  }

# Variables:
# $count (Number) - Number of total messages.
folder-pane-total-aria-label =
  { $count ->
    [one] 1 total message
    *[other] { $count } total messages
  }

## Message thread pane

threadpane-column-header-select =
  .title = Toggle select all messages
threadpane-column-header-select-all =
  .title = Select all messages
threadpane-column-header-deselect-all =
  .title = Deselect all messages
threadpane-column-label-select =
  .label = Select Messages
threadpane-cell-select =
  .aria-label = Select message

threadpane-column-header-thread =
  .title = Toggle message threads
threadpane-column-label-thread =
  .label = Thread
threadpane-cell-thread =
  .aria-label = Thread status

threadpane-column-header-flagged =
  .title = Sort by star
threadpane-column-label-flagged =
  .label = Starred
threadpane-cell-flagged =
  .aria-label = Starred

threadpane-flagged-cell-label = Starred

threadpane-column-header-attachments =
  .title = Sort by attachments
threadpane-column-label-attachments =
  .label = Attachments
threadpane-cell-attachments =
  .aria-label = Attachments

threadpane-attachments-cell-label = Attachments

threadpane-column-header-spam =
  .title = Sort by spam status
threadpane-column-label-spam =
  .label = Spam
threadpane-cell-spam =
  .aria-label = Spam status

threadpane-spam-cell-label = Spam

threadpane-column-header-unread-button =
  .title = Sort by read status
threadpane-column-label-unread-button =
  .label = Read status

threadpane-cell-read-status =
  .aria-label = Read status

threadpane-read-cell-label = Read
threadpane-unread-cell-label = Unread

threadpane-column-header-sender = From
  .title = Sort by from
threadpane-column-label-sender =
  .label = From
threadpane-cell-sender =
  .aria-label = From

threadpane-column-header-recipient = Recipient
  .title = Sort by recipient
threadpane-column-label-recipient =
  .label = Recipient
threadpane-cell-recipient =
  .aria-label = Recipient

threadpane-column-header-correspondents = Correspondents
  .title = Sort by correspondents
threadpane-column-label-correspondents =
  .label = Correspondents
threadpane-cell-correspondents =
  .aria-label = Correspondents

threadpane-column-header-subject = Subject
  .title = Sort by subject
threadpane-column-label-subject =
  .label = Subject
threadpane-cell-subject =
  .aria-label = Subject

threadpane-column-header-date = Date
  .title = Sort by date
threadpane-column-label-date =
  .label = Date
threadpane-cell-date =
  .aria-label = Date

threadpane-column-header-received = Received
  .title = Sort by date received
threadpane-column-label-received =
  .label = Received
threadpane-cell-received =
  .aria-label = Date received

threadpane-column-header-status = Status
  .title = Sort by status
threadpane-column-label-status =
  .label = Status
threadpane-cell-status =
  .aria-label = Status

threadpane-column-header-size = Size
  .title = Sort by size
threadpane-column-label-size =
  .label = Size
threadpane-cell-size =
  .aria-label = Size

threadpane-column-header-tags = Tags
  .title = Sort by tags
threadpane-column-label-tags =
  .label = Tags
threadpane-cell-tags =
  .aria-label = Tags

threadpane-column-header-account = Account
  .title = Sort by account
threadpane-column-label-account =
  .label = Account
threadpane-cell-account =
  .aria-label = Account

threadpane-column-header-priority = Priority
  .title = Sort by priority
threadpane-column-label-priority =
  .label = Priority
threadpane-cell-priority =
  .aria-label = Priority

threadpane-column-header-unread = Unread
  .title = Number of unread messages in thread
threadpane-column-label-unread =
  .label = Unread
threadpane-cell-unread =
  .aria-label = Number of unread messages

threadpane-column-header-total = Total
  .title = Total number of messages in thread
threadpane-column-label-total =
  .label = Total
threadpane-cell-total =
  .aria-label = Total number of messages

threadpane-column-header-location = Location
  .title = Sort by location
threadpane-column-label-location =
  .label = Location
threadpane-cell-location =
  .aria-label = Location

threadpane-column-header-id = Order Received
  .title = Sort by order received
threadpane-column-label-id =
  .label = Order Received
threadpane-cell-id =
  .aria-label = Order received

threadpane-column-header-delete =
  .title = Delete a message
threadpane-column-label-delete =
  .label = Delete
threadpane-cell-delete =
  .aria-label = Delete

# Variables:
# $count (Number) - Number of replies in thread.
threadpane-replies =
  { $count ->
    [one] { $count } reply
    *[other] { $count } replies
  }

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

apply-columns-to-menu =
  .label = Apply columns to…

apply-current-view-to-menu =
  .label = Apply current view to…

apply-current-view-to-folder =
  .label = Folder…

apply-current-view-to-folder-children =
  .label = Folder and its children…

## Apply columns confirmation dialog

apply-changes-to-folder-title = Apply Changes?

# Variables:
#  $name (String): The name of the folder to apply to.
apply-current-columns-to-folder-message = Apply the current folder’s columns to { $name }?

# Variables:
#  $name (String): The name of the folder to apply to.
apply-current-columns-to-folder-with-children-message = Apply the current folder’s columns to { $name } and its children?

# Variables:
#  $name (String): The name of the folder to apply to.
apply-current-view-to-folder-message = Apply the current folder’s view to { $name }?
# Variables:
#  $name (String): The name of the folder to apply to.
apply-current-view-to-folder-with-children-message = Apply the current folder’s view to { $name } and its children?

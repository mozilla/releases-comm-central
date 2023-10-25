# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Window controls

messenger-window-minimize-button =
    .tooltiptext = Minimize
messenger-window-maximize-button =
    .tooltiptext = Maximize
messenger-window-restore-down-button =
    .tooltiptext = Restore Down
messenger-window-close-button =
    .tooltiptext = Close

# Variables:
# $count (Number) - Number of unread messages.
unread-messages-os-tooltip =
  { $count ->
     [one] 1 unread message
    *[other] { $count } unread messages
  }

about-rights-notification-text = { -brand-short-name } is free and open source software, built by a community of thousands from all over the world.

## Content tabs

content-tab-page-loading-icon =
    .alt = The page is loading
content-tab-security-high-icon =
    .alt = The connection is secure
content-tab-security-broken-icon =
    .alt = The connection is not secure

# Back

# Variables
#   $shortcut (String) - A keyboard shortcut for the Go Back command.
content-tab-menu-back =
    .tooltiptext = Go back one page ({ $shortcut })
    .aria-label = Back
    .accesskey = B

# This menuitem is only visible on macOS
content-tab-menu-back-mac =
    .label = Back
    .accesskey = B

# Forward

# Variables
#   $shortcut (String) - A keyboard shortcut for the Go Forward command.
content-tab-menu-forward =
    .tooltiptext = Go forward one page ({ $shortcut })
    .aria-label = Forward
    .accesskey = F

# This menuitem is only visible on macOS
content-tab-menu-forward-mac =
    .label = Forward
    .accesskey = F

# Reload

content-tab-menu-reload =
    .tooltiptext = Reload page
    .aria-label = Reload
    .accesskey = R

# This menuitem is only visible on macOS
content-tab-menu-reload-mac =
    .tooltiptext = Reload page
    .label = Reload
    .accesskey = R

# Stop

content-tab-menu-stop =
    .tooltiptext = Stop page loading
    .aria-label = Stop
    .accesskey = S

# This menuitem is only visible on macOS
content-tab-menu-stop-mac =
    .tooltiptext = Stop page loading
    .label = Stop
    .accesskey = S

## Toolbar

addons-and-themes-toolbarbutton =
    .label = Add-ons and Themes
    .tooltiptext = Manage your add-ons

quick-filter-toolbarbutton =
    .label = Quick Filter
    .tooltiptext = Filter messages

redirect-msg-button =
    .label = Redirect
    .tooltiptext = Redirect selected message

## Folder Pane

folder-pane-toolbar =
    .toolbarname = Folder Pane Toolbar
    .accesskey = F

folder-pane-toolbar-options-button =
    .tooltiptext = Folder Pane Options

folder-pane-header-label = Folders

## Folder Toolbar Header Popup

folder-toolbar-hide-toolbar-toolbarbutton =
    .label = Hide Toolbar
    .accesskey = H

show-all-folders-label =
    .label = All Folders
    .accesskey = A

show-unread-folders-label =
    .label = Unread Folders
    .accesskey = n

show-favorite-folders-label =
    .label = Favorite Folders
    .accesskey = F

show-smart-folders-label =
    .label = Unified Folders
    .accesskey = U

show-recent-folders-label =
    .label = Recent Folders
    .accesskey = R

show-tags-folders-label =
    .label = Tags
    .accesskey = T

folder-toolbar-toggle-folder-compact-view =
    .label = Compact View
    .accesskey = C

## File Menu

menu-file-save-as-file =
    .label = File…
    .accesskey = F

## Edit Menu

menu-edit-delete-folder =
    .label = Delete Folder
    .accesskey = D

menu-edit-unsubscribe-newsgroup =
    .label = Unsubscribe Newsgroup
    .accesskey = b

# Variables:
# $count (Number) - Number of selected messages.
menu-edit-delete-messages =
    .label =
        { $count ->
            [one] Delete Message
           *[other] Delete Selected Messages
        }
    .accesskey = D

# Variables:
# $count (Number) - Number of selected messages.
menu-edit-undelete-messages =
    .label =
        { $count ->
            [one] Undelete Message
           *[other] Undelete Selected Messages
        }
    .accesskey = d

menu-edit-properties =
    .label = Properties
    .accesskey = o

menu-edit-folder-properties =
    .label = Folder Properties
    .accesskey = o

menu-edit-newsgroup-properties =
    .label = Newsgroup Properties
    .accesskey = o

## Message Menu

redirect-msg-menuitem =
    .label = Redirect
    .accesskey = D

## AppMenu

appmenu-save-as-file =
    .label = File…

appmenu-settings =
    .label = Settings

appmenu-addons-and-themes =
    .label = Add-ons and Themes

## Context menu

context-menu-redirect-msg =
    .label = Redirect

# This menu item is for canceling an NNTP message
context-menu-cancel-msg =
    .label = Cancel Message

# Variables:
# $count (Number) - Number of selected messages.
mail-context-delete-messages =
    .label =
        { $count ->
            [one] Delete Message
           *[other] Delete Selected Messages
        }

# Variables:
# $count (Number) - Number of selected messages.
mail-context-undelete-messages =
    .label =
        { $count ->
            [one] Undelete Message
           *[other] Undelete Selected Messages
        }

context-menu-decrypt-to-folder2 =
    .label = Create Decrypted Copy In
    .accesskey = y

## Message header pane

other-action-redirect-msg =
    .label = Redirect

message-header-msg-flagged =
    .title = Starred
    .aria-label = Starred

# Variables:
# $address (String) - The email address of the recipient this picture belongs to.
message-header-recipient-avatar =
    .alt = Profile picture of { $address }.

## Message header customize panel

message-header-customize-panel-title = Message Header Settings

message-header-customize-button-style =
    .value = Button style
    .accesskey = B

message-header-button-style-default =
    .label = Icons and text

message-header-button-style-text =
    .label = Text

message-header-button-style-icons =
    .label = Icons

message-header-show-sender-full-address =
    .label = Always show sender’s full address
    .accesskey = f

message-header-show-sender-full-address-description = The email address will be shown underneath the display name.

message-header-show-recipient-avatar =
    .label = Show sender’s profile picture
    .accesskey = p

message-header-show-big-avatar =
    .label = Larger profile picture
    .accesskey = g

message-header-hide-label-column =
    .label = Hide labels column
    .accesskey = l

message-header-large-subject =
    .label = Large subject
    .accesskey = s

message-header-all-headers =
    .label = Show all headers
    .accesskey = a

## Action Button Context Menu

toolbar-context-menu-manage-extension =
    .label = Manage Extension
    .accesskey = E
toolbar-context-menu-remove-extension =
    .label = Remove Extension
    .accesskey = v

## Add-on removal warning

# Variables:
#  $name (String): The name of the add-on that will be removed.
addon-removal-title = Remove { $name }?
addon-removal-confirmation-button = Remove
# Variables:
#  $name (String): The name of the add-on that will be removed.
addon-removal-confirmation-message = Remove { $name } as well as its configuration and data from { -brand-short-name }?

caret-browsing-prompt-title = Caret Browsing
caret-browsing-prompt-text = Pressing F7 turns Caret Browsing on or off. This feature places a moveable cursor within some content, allowing you to select text with the keyboard. Do you want to turn Caret Browsing on?
caret-browsing-prompt-check-text = Do not ask again.

repair-text-encoding-button =
  .label = Repair Text Encoding
  .tooltiptext = Guess correct text encoding from message content

## no-reply handling

no-reply-title = Reply Not Supported
# Variables:
# $email (String) - Email address the reply will be sent to. Example: "noreply@example.com"
no-reply-message = The reply address ({ $email }) does not appear to be a monitored address. Messages to this address will likely not be read by anyone.
no-reply-reply-anyway-button = Reply Anyway

## error messages

# Variables:
# $failures (Number) - Number of messages that could not be decrypted.
# $total (Number) - Total number of messages that were attempted to be decrypted.
decrypt-and-copy-failures-multiple =
    { $failures ->
      [one] { $failures } of { $total } messages could not be decrypted and was not copied.
      *[other] { $failures } of { $total } messages could not be decrypted and were not copied.
    }

## Spaces toolbar

spaces-toolbar-element =
    .toolbarname = Spaces Toolbar
    .aria-label = Spaces Toolbar
    .aria-description = Vertical toolbar for switching between different spaces. Use the arrow keys to navigate the available buttons.

spaces-toolbar-button-mail2 =
    .title = Mail

spaces-toolbar-button-address-book2 =
    .title = Address Book

spaces-toolbar-button-calendar2 =
    .title = Calendar

spaces-toolbar-button-tasks2 =
    .title = Tasks

spaces-toolbar-button-chat2 =
    .title = Chat

spaces-toolbar-button-overflow =
    .title = More spaces…

spaces-toolbar-button-settings2 =
    .title = Settings

spaces-toolbar-button-hide =
    .title = Hide Spaces Toolbar

spaces-toolbar-button-show =
    .title = Show Spaces Toolbar

spaces-context-new-tab-item =
    .label = Open in new tab

spaces-context-new-window-item =
    .label = Open in new window

# Variables:
# $tabName (String) - The name of the tab this item will switch to.
spaces-context-switch-tab-item =
    .label = Switch to { $tabName }

settings-context-open-settings-item2 =
    .label = Settings

settings-context-open-account-settings-item2 =
    .label = Account Settings

settings-context-open-addons-item2 =
    .label = Add-ons and Themes

## Spaces toolbar pinned tab menupopup

spaces-toolbar-pinned-tab-button =
    .tooltiptext = Spaces Menu

spaces-pinned-button-menuitem-mail2 =
    .label = { spaces-toolbar-button-mail2.title }

spaces-pinned-button-menuitem-address-book2 =
    .label = { spaces-toolbar-button-address-book2.title }

spaces-pinned-button-menuitem-calendar2 =
    .label = { spaces-toolbar-button-calendar2.title }

spaces-pinned-button-menuitem-tasks2 =
    .label = { spaces-toolbar-button-tasks2.title }

spaces-pinned-button-menuitem-chat2 =
    .label = { spaces-toolbar-button-chat2.title }

spaces-pinned-button-menuitem-settings2 =
    .label = { spaces-toolbar-button-settings2.title }

spaces-pinned-button-menuitem-show =
    .label = { spaces-toolbar-button-show.title }

# Variables:
# $count (Number) - Number of unread messages.
chat-button-unread-messages = { $count }
    .title = { $count ->
        [one] One unread message
        *[other] { $count } unread messages
    }

## Spaces toolbar customize panel

menuitem-customize-label =
    .label = Customize…

spaces-customize-panel-title = Spaces Toolbar Settings

spaces-customize-background-color = Background color

spaces-customize-icon-color = Button color

# The background color used on the buttons of the spaces toolbar when they are
# `current`, meaning the related space/tab is active and visible.
spaces-customize-accent-background-color = Selected button background color

# The icon color used on the buttons of the spaces toolbar when they are
# `current`, meaning the related space/tab is active and visible.
spaces-customize-accent-text-color = Selected button color

spaces-customize-button-restore = Restore Defaults
    .accesskey = R

customize-panel-button-save = Done
    .accesskey = D

## Quick Filter Bar

# The label to display for the "View... Toolbars..." menu item that controls
# whether the quick filter bar is visible.
quick-filter-bar-toggle =
  .label = Quick Filter Bar
  .accesskey = Q

# This is the key used to show the quick filter bar.
# This should match quick-filter-bar-search-shortcut in about3Pane.ftl.
quick-filter-bar-show =
  .key = k

## OpenPGP

openpgp-forget = Forget OpenPGP passphrases

## Quota panel.

# Variables:
#   $percent (Number) - Usage percentage of the assigned IMAP quota.
#   $usage (String) - Current quota usage (may include unit)
#   $limit (String) - Current quota limit (may include unit)
quota-panel-percent-used = { $percent }% full
  .title = IMAP quota: { $usage } used of { $limit } total

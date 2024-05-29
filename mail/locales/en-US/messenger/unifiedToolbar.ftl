# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Unified Toolbar strings

## Search bar

search-bar-button =
  .alt = Search

search-bar-item2 =
  .label = Search

search-bar-placeholder = Search…

# Search bar placeholder with formatted key shortcut hint (platform dependent).
# The key after the control modifier should match the key from quickSearchCmd.key
# in messenger.dtd.
search-bar-placeholder-with-key2 = {
  PLATFORM() ->
    [macos] {search-bar-placeholder} <kbd>⌘</kbd> <kbd>K</kbd>
    *[other] {search-bar-placeholder} <kbd>Ctrl</kbd> + <kbd>K</kbd>
}

## Unified toolbar context menu

customize-menu-customize =
  .label = Customize…

# Unified toolbar get messages button context menu

toolbar-get-all-messages-menuitem =
  .label = Get All New Messages
  .accesskey = G

## Unified Toolbar customization

customize-title = Customize Toolbars

customize-space-tab-mail = Mail
  .title = Mail

customize-space-tab-addressbook = Address Book
  .title = Address Book

customize-space-tab-calendar = Calendar
  .title = Calendar

customize-space-tab-tasks = Tasks
  .title = Tasks

customize-space-tab-chat = Chat
  .title = Chat

customize-space-tab-settings = Settings
  .title = Settings

customize-restore-default = Restore default

customize-change-appearance = Change appearance…

customize-button-style-label = Button style:

customize-button-style-icons-beside-text-option = Icons beside text

customize-button-style-icons-above-text-option = Icons above text

customize-button-style-icons-only-option = Icons only

customize-button-style-text-only-option = Text only

customize-cancel = Cancel

customize-save = Save

customize-unsaved-changes = Unsaved changes in other spaces

customize-search-bar2 =
  .label = Search toolbar buttons
  .placeholder = Search toolbar buttons…

customize-spaces-tabs =
  .aria-label = Spaces

customize-main-toolbar-target =
  .aria-label = Main toolbar

customize-palette-generic-title = Available for all Spaces

customize-palette-mail-specific-title = Available for Mail Space only

customize-palette-addressbook-specific-title = Available for Address Book Space only

customize-palette-calendar-specific-title = Available for Calendar Space only

customize-palette-tasks-specific-title = Available for Tasks Space only

customize-palette-chat-specific-title = Available for Chat Space only

customize-palette-settings-specific-title = Available for Settings Space only

customize-palette-extension-specific-title = Available for this Space only

## Unified toolbar customization palette context menu

# Variables:
# $target (String) - Name of the target the item should be added to.
customize-palette-add-to =
  .label = Add to { $target }

customize-palette-add-everywhere =
  .label = Add to all toolbars

## Unified toolbar customization target context menu

customize-target-forward =
  .label = Move forward

customize-target-backward =
  .label = Move backward

customize-target-remove =
  .label = Remove

customize-target-remove-everywhere =
  .label = Remove from all toolbars

customize-target-add-everywhere =
  .label = Add to all toolbars

customize-target-start =
  .label = Move to the start

customize-target-end =
  .label = Move to the end

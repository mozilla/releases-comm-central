# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Unified Toolbar strings

## Search bar

search-bar-button =
  .alt = Search

search-bar-item =
  .label = Search:

search-bar-placeholder = Search…

# Search bar placeholder with formatted key shortcut hint (platform dependent).
# The key after the control modifier should match the key from quickSearchCmd.key
# in messenger.dtd.
search-bar-placeholder-with-key = {
  PLATFORM() ->
    [macos] {search-bar-placeholder} <kbd>⌃</kbd> <kbd>K</kbd>
    *[other] {search-bar-placeholder} <kbd>Ctrl</kbd> + <kbd>K</kbd>
}

## Unified toolbar context menu

customize-menu-customize =
  .label = Customize…

## Unified Toolbar customization

customize-title = Customize Toolbars

customize-space-mail = Mail

customize-space-addressbook = Address Book

customize-space-calendar = Calendar

customize-space-tasks = Tasks

customize-space-chat = Chat

customize-space-settings = Settings

customize-restore-default = Restore default

customize-change-appearance = Change appearance…

customize-button-style-label = Button style:

customize-button-style-icons-beside-text =
  .label = Icons beside text

customize-button-style-icons-above-text =
  .label = Icons above text

customize-button-style-icons-only =
  .label = Icons only

customize-button-style-text-only =
  .label = Text only

customize-cancel = Cancel

customize-save = Save

customize-unsaved-changes = Unsaved changes in other spaces

customize-search-bar =
  .label = Search toolbar buttons…

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

## Unified toolbar customization palette context menu

# Variables:
# $target (String) - Name of the target the item should be added to.
customize-palette-add-to =
  .label = Add to { $target }

## Unified toolbar customization target context menu

customize-target-forward =
  .label = Move forward

customize-target-backward =
  .label = Move backward

customize-target-remove =
  .label = Remove

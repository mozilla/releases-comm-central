# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


pane-general-title = General
category-general =
    .tooltiptext = { pane-general-title }

general-language-and-appearance-header = Language & Appearance

general-incoming-mail-header = Incoming Mails

general-files-and-attachment-header = Files & Attachments

general-tags-header = Tags

general-reading-and-display-header = Reading & Display

general-updates-header = Updates

general-network-and-diskspace-header = Network & Disk Space

general-indexing-label = Indexing

composition-category-header = Composition

composition-attachments-header = Attachments

composition-spelling-title = Spelling

compose-html-style-title = HTML Style

composition-addressing-header = Addressing

choose-messenger-language-description = Choose the languages used to display menus, messages, and notifications from { -brand-short-name }.
manage-messenger-languages-button =
  .label = Set Alternatives…
  .accesskey = l
confirm-messenger-language-change-description = Restart { -brand-short-name } to apply these changes
confirm-messenger-language-change-button = Apply and Restart

update-setting-write-failure-title = Error saving Update preferences

# Variables:
#   $path (String) - Path to the configuration file
# The newlines between the main text and the line containing the path is
# intentional so the path is easier to identify.
update-setting-write-failure-message =
    { -brand-short-name } encountered an error and didn’t save this change. Note that setting this update preference requires permission to write to the file below. You or a system administrator may be able resolve the error by granting the Users group full control to this file.

    Could not write to file: { $path }

update-in-progress-title = Update In Progress

update-in-progress-message = Do you want { -brand-short-name } to continue with this update?

update-in-progress-ok-button = &Discard
# Continue is the cancel button so pressing escape or using a platform standard
# method of closing the UI will not discard the update.
update-in-progress-cancel-button = &Continue

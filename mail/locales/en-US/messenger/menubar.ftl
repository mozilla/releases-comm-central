# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

toolbar-context-menu-menu-bar =
    .toolbarname = Menu Bar
    .accesskey = M

## Tools Menu

menu-tools-settings =
    .label = Settings
    .accesskey = e

menu-addons-and-themes =
    .label = Add-ons and Themes
    .accesskey = A

## Help Menu

menu-help-help-title =
    .label = Help
    .accesskey = H

menu-help-get-help =
    .label = Get Help
    .accesskey = H

menu-help-get-release-help =
    .label = Get Help with { -brand-short-name }
    .accesskey = R

menu-help-shortcuts =
    .label = Keyboard Shortcuts
    .accesskey = K

menu-help-get-involved =
    .label = Get Involved
    .accesskey = G

menu-help-donation =
    .label = Make a Donation
    .accesskey = D

menu-help-share-feedback =
    .label = Share Ideas and Feedback
    .accesskey = S

menu-help-enter-troubleshoot-mode =
    .label = Troubleshoot Mode…
    .accesskey = M

menu-help-exit-troubleshoot-mode =
    .label = Turn Troubleshoot Mode Off
    .accesskey = M

menu-help-troubleshooting-info =
    .label = Troubleshooting Information
    .accesskey = T

menu-help-about-product =
    .label = About { -brand-short-name }
    .accesskey = A

# These menu-quit strings are only used on Windows and Linux.
menu-quit =
    .label =
        { PLATFORM() ->
            [windows] Exit
           *[other] Quit
        }
    .accesskey =
        { PLATFORM() ->
            [windows] x
           *[other] Q
        }

# This menu-quit-mac string is only used on macOS.
menu-quit-mac =
    .label = Quit { -brand-shorter-name }

# Localization note: Do not translate unless your locale's keyboard layout
# does not include this key, as it determines the keyboard shortcut for
# shutting down the application.
quit-app-shortcut =
    .key = Q

## Mail Toolbar

toolbar-junk-button =
    .label = Junk
    .tooltiptext = Mark the selected messages as junk
toolbar-not-junk-button =
    .label = Not Junk
    .tooltiptext = Mark the selected messages as not junk
toolbar-delete-button =
    .label = Delete
    .tooltiptext = Delete selected messages or folder
toolbar-undelete-button =
    .label = Undelete
    .tooltiptext = Undelete selected messages

## View

menu-view-repair-text-encoding =
    .label = Repair Text Encoding
    .accesskey = c

## View / Folders

menu-view-folders-toggle-header =
    .label = Folder Pane Header
    .accesskey = F

## View / Layout

menu-view-toggle-thread-pane-header =
    .label = Message List Header
    .accesskey = H

menu-font-size-label =
    .label = Font Size
    .accesskey = o

menuitem-font-size-enlarge =
    .label = Increase Font Size
    .accesskey = I

menuitem-font-size-reduce =
    .label = Reduce Font Size
    .accesskey = D

menuitem-font-size-reset =
    .label = Reset Font Size
    .accesskey = R

mail-uidensity-label =
    .label = Density
    .accesskey = D

mail-uidensity-compact =
    .label = Compact
    .accesskey = C

mail-uidensity-default =
    .label = Default
    .accesskey = D

mail-uidensity-relaxed =
    .label = Relaxed
    .accesskey = R

menu-spaces-toolbar-button =
    .label = Spaces Toolbar
    .accesskey = S

## File

file-new-email-account =
    .label = Email Account…
    .accesskey = E

file-new-newsgroup-account =
    .label = Newsgroup Account…
    .accesskey = N

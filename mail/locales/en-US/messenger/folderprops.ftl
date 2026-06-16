# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

### Folder Properties dialog

folder-props-window-title = Properties

## General Information tab

folder-props-general-tab =
    .label = General Information

folder-props-name =
    .value = Name:
    .accesskey = N

folder-props-color =
    .value = Icon Color:
    .accesskey = I

folder-props-reset-color =
    .tooltiptext = Restore default color

folder-props-location =
    .value = Location:
    .accesskey = L

folder-props-number-of-messages =
    .value = Number of messages:

folder-props-number-unknown =
    .value = unknown

folder-props-size-on-disk =
    .value = Size on disk:

folder-props-size-unknown =
    .value = unknown

folder-props-rebuild-summary =
    .label = Repair Folder
    .accesskey = R
    .tooltiptext = Rebuild Summary File Index

folder-props-include-in-global-search =
    .label = Include messages in this folder in Global Search results
    .accesskey = G

folder-props-check-for-new-messages =
    .label = When getting new messages for this account, always check this folder
    .accesskey = c

folder-props-rebuild-summary-explanation = Sometimes the folder index (.msf) file becomes damaged and messages may appear missing or deleted messages continue showing; repairing the folder may fix these issues.

## Retention tab (see retention.ftl)
##
## Synchronization tab

folder-props-synchronization-tab =
    .label = Synchronization

folder-props-select-for-offline =
    .label = Select this folder for offline use
    .accesskey = S

folder-props-download-now =
    .label = Download Now
    .accesskey = D

folder-props-select-newsgroup-for-offline =
    .label = Select this newsgroup for offline use
    .accesskey = o

folder-props-download-newsgroup-now =
    .label = Download Now
    .accesskey = D

## Sharing tab

folder-props-sharing-tab =
    .label = Sharing

folder-props-privileges =
    .label = Privileges…
    .accesskey = P

folder-props-permissions =
    .value = You have the following permissions:

folder-props-other-users =
    .value = Others with access to this folder:

folder-props-type =
    .value = Folder Type:

## Quota tab

folder-props-quota-tab =
    .label = Quota

# Variables:
#   $percent (Number) - Usage percentage of the assigned IMAP quota.
quota-percent-used = { $percent }% full

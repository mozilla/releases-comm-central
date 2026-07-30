# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

remove-account-dialog-title = Remove Account and Data

remove-account-dialog-accept =
    .label = Remove
    .accesskey = R

# Variables:
# $accountName (String) - The name of the account to be removed.
remove-account-question = Are you sure you want to remove the account “{ $accountName }”?

remove-account-checkbox =
    .label = Remove account information
    .accesskey = a

remove-account-description = Removes only { -brand-short-name }’s knowledge of this account. Does not affect the account itself on the server.

remove-data-checkbox =
    .label = Remove message data
    .accesskey = d

remove-chat-data-checkbox =
    .label = Remove conversation data
    .accesskey = d

remove-data-local-account-description = Removes all messages, folders and filters associated with this account from your local disk. This does not affect some messages which may still be kept on the server. Do not choose this if you plan to archive the local data or reuse it in { -brand-short-name } later.

remove-data-server-account-description = Removes all messages, folders and filters associated with this account from your local disk. Your messages and folders are still kept on the server.

remove-data-chat-account-description = Removes all logs of conversations stored for this account on your local disk.

show-data-button =
    .label = Show data location
    .accesskey = S

# Variables:
# $count (Number) - The number of outgoing servers to be removed.
remove-outgoing-servers-checkbox =
    .label = {
        $count ->
            [one] Remove outgoing server
            *[other] Remove { $count } outgoing servers
    }

# Variables:
# $count (Number) - The number of address books to be removed.
remove-address-books-checkbox =
    .label = {
        $count ->
            [one] Remove address book
            *[other] Remove { $count } address books
    }

# Variables:
# $count (Number) - The number of calendars to be removed.
remove-calendars-checkbox =
    .label = {
        $count ->
            [one] Remove calendar
            *[other] Remove { $count } calendars
    }

# Variables:
# $count (Number) - The number of passwords to be removed.
remove-passwords-checkbox =
    .label = {
        $count ->
            [one] Remove password
            *[other] Remove { $count } passwords
    }

# Variables:
# $count (Number) - The number of OAuth tokens to be removed.
remove-oauth-tokens-checkbox =
    .label = {
        $count ->
            [one] Remove OAuth token
            *[other] Remove { $count } OAuth tokens
    }

remove-account-progress-success = Account removed successfully.

remove-account-progress-failure = Something went wrong! Unable to complete account removal.

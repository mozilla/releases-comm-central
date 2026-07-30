# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

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

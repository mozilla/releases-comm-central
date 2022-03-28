# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

openpgp-key-assistant-title = OpenPGP Key Assistant

openpgp-key-assistant-description-issue = To send an end-to-end encrypted message, you must obtain and accept a public key for each recipient. Avoid accepting a rogue key. <a data-l10n-name="openpgp-link">Learn more…</a>

## Encryption status

openpgp-key-assistant-recipients-issue-title = Recipients with issues

# Variables:
# $count (Number) - The number of recipients that need attention.
openpgp-key-assistant-recipients-issue-description =
    { $count ->
        [one] Impossible to encrypt because there are missing, invalid, or not accepted public keys for one recipient.
        *[other] Impossible to encrypt because there are missing, invalid, or not accepted public keys for { $count } recipients.
    }

openpgp-key-assistant-issue-info = { -brand-short-name } normally requires that the recipient’s public key contains a user ID with a matching email address. This can be overridden by using OpenPGP recipient alias rule. <a data-l10n-name="openpgp-link">Learn more…</a>

openpgp-key-assistant-recipients-title = Recipients without issues

# Variables:
# $count (Number) - The number of recipients that need attention.
openpgp-key-assistant-recipients-description =
    { $count ->
        [one] For one recipient you have valid and accepted keys and no action is required.
        *[other] For { $count } recipients you have valid and accepted keys and no action is required.
    }

openpgp-key-assistant-recipients-description-no-issues = This message can be encrypted because you have public keys for all the recipients.

## Resolve section

# Variables:
# $recipient (String) - The email address of the recipient needing resolution.
openpgp-key-assistant-resolve-title = Public keys for { $recipient }

# Variables:
# $count (Number) - The number of available keys.
openpgp-key-assistant-valid-title =
    { $count ->
        [one] Usable key
        *[other] Usable keys
    }

# Variables:
# $count (Number) - The number of available keys.
openpgp-key-assistant-valid-description =
    { $count ->
        [one] Only one key available
        *[other] Choose one of the multiple keys available
    }

openpgp-key-assistant-invalid-title = Problematic keys

openpgp-key-assistant-no-key-available = No key available

openpgp-key-assistant-multiple-keys = Multiple keys available

# Variables:
# $count (Number) - The number of unaccepted keys.
openpgp-key-assistant-key-unaccepted =
    { $count ->
        [one] A key is available, but it hasn’t been accepted yet
        *[other] Multiple keys are available, but you haven’t accepted one to use yet.
    }

# Variables:
# $date (String) - The expiration date of the key.
openpgp-key-assistant-key-accepted-expired = This key was previously accepted but expired on { $date }.

openpgp-key-assistant-keys-accepted-expired = Multiple keys previously accepted but expired.

# Variables:
# $count (Number) - The number of expired keys.
# $date (String) - The expiration date of the key.
openpgp-key-assistant-key-unaccepted-expired-one =
    Key expired on { $date }
openpgp-key-assistant-key-unaccepted-expired-many =
    Multiple expired keys

openpgp-key-assistant-keys-collected = Multiple alleged collected keys

openpgp-key-assistant-key-collected-multiple = Alleged key collected from multiple sources

openpgp-key-assistant-key-collected-email = Alleged key collected from an email

openpgp-key-assistant-key-collected-keyserver = Alleged key downloaded from a keyserver

openpgp-key-assistant-key-collected-wkd = Alleged key downloaded from Web Key Directory (WKD)

openpgp-key-assistant-key-source-default = Alleged key previously collected

# Variables:
# $recipient (String) - The email address of the recipient needing resolution.
openpgp-key-assistant-resolve-discover-info = You can also discover additional or updated keys for { $recipient } online, or import them from a file.

## Discovery section

openpgp-key-assistant-discover-title = Online discovery in progress…

# Variables:
# $recipient (String) - The email address which we're discovering keys.
openpgp-key-assistant-discover-keys = Discovering keys for { $recipient }… <span></span>

# Variables:
# $recipient (String) - The email address which we're discovering keys.
openpgp-key-assistant-expired-key-update = An update was found for one of the previously accepted keys for { $recipient }, and it can now be used as it is no longer expired.

## Dialog buttons

openpgp-key-assistant-discover-online-button = Discover Public Keys Online…

openpgp-key-assistant-import-keys-button = Import Public Keys From File…

openpgp-key-assistant-issue-resolve-button = Resolve…

openpgp-key-assistant-view-key-button = View Key…

openpgp-key-assistant-recipients-show-button = Show All

openpgp-key-assistant-recipients-hide-button = Hide All

openpgp-key-assistant-cancel-button = Cancel

openpgp-key-assistant-back-button = Back

openpgp-key-assistant-accept-button = Accept

openpgp-key-assistant-close-button = Close

openpgp-key-assistant-disable-button = Disable Encryption

openpgp-key-assistant-confirm-button = Send Encrypted

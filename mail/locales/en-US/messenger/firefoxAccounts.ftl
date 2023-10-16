# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

# “Account” can be localized, “Firefox” must be treated as a brand,
# and kept in English.
-fxaccount-brand-name =
    { $capitalization ->
        [sentence] Firefox account
       *[title] Firefox Account
    }

## These strings are shown in a desktop notification after the user requests we resend a verification email.

fxa-verification-sent-title = Verification Sent
# Variables:
# $userEmail (String) - Email address of user's Firefox Account.
fxa-verification-sent-body = A verification link has been sent to { $userEmail }.
fxa-verification-not-sent-title = Unable to Send Verification
fxa-verification-not-sent-body = We are unable to send a verification mail at this time, please try again later.

## These strings are shown in a confirmation dialog when the user chooses to sign out.

fxa-signout-dialog-title = Sign out of { -fxaccount-brand-name(capitalization: "sentence") }?
fxa-signout-dialog-body = Synced data will remain in your account.
fxa-signout-dialog-button = Sign out

## These strings are shown in a confirmation dialog when the user chooses to stop syncing.

sync-disconnect-dialog-title = Disconnect?
sync-disconnect-dialog-body = { -brand-product-name } will stop syncing but won’t delete any of your data on this device.
sync-disconnect-dialog-button = Disconnect

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

# The strings in this file relate to the configuration of Mozilla accounts for sync.

## These strings are shown in a desktop notification after the user requests we resend a verification email.

sync-verification-sent-title = Verification Sent
# Variables:
# $userEmail (String) - Email address of the account used for sync.
sync-verification-sent-body = A verification link has been sent to { $userEmail }.
sync-verification-not-sent-title = Unable to Send Verification
sync-verification-not-sent-body = We are unable to send a verification mail at this time, please try again later.

## These strings are shown in a confirmation dialog when the user chooses to sign out.

sync-signout-dialog-title = Sign out of account?
sync-signout-dialog-body = Synced data will remain in your account.
sync-signout-dialog-button = Sign out

## These strings are shown in a confirmation dialog when the user chooses to stop syncing.

sync-disconnect-dialog-title = Disconnect?
sync-disconnect-dialog-body = { -brand-product-name } will stop syncing but won’t delete any of your data on this device.
sync-disconnect-dialog-button = Disconnect

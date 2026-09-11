# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Message sending

send-alert-queued-delivery-failed = An error occurred while delivering the unsent messages.

send-alert-followup-to-sender = The author of this message has requested that responses be sent only to the author. If you also want to reply to the newsgroup, add a new row to the addressing area, choose Newsgroup from the recipients list, and enter the name of the newsgroup.

send-unable-to-save-template = Unable to save your message as a template.

send-unable-to-save-draft = Unable to save your message as a draft.

send-error-failed = Sending of the message failed.

send-unable-to-send-later = Sorry, we were unable to save your message for sending later.

# Variables:
# $hostname - outgoing server hostname
send-error-smtp-unknown-server = An error occurred while sending mail: Outgoing server (SMTP) { $hostname } is unknown. The server may be incorrectly configured. Please verify that your Outgoing server (SMTP) settings are correct and try again.

# Variables:
# $hostname - outgoing server hostname
send-error-smtp-request-refused = The message could not be sent because connecting to Outgoing server (SMTP) { $hostname } failed. The server may be unavailable or is refusing SMTP connections. Please verify that your Outgoing server (SMTP) settings are correct and try again.

# Variables:
# $hostname - outgoing server hostname
send-error-smtp-interrupted = The message could not be sent because the connection to Outgoing server (SMTP) { $hostname } was lost in the middle of the transaction. Try again.

# Variables:
# $hostname - outgoing server hostname
send-error-smtp-timeout = The message could not be sent because the connection to Outgoing server (SMTP) { $hostname } timed out. Try again.

send-error-title = Send Message Error

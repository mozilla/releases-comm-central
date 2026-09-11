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

send-progress-assembling-mail-information = Assembling mail information…

send-progress-assembling-message = Assembling message…

send-progress-creating-mail-message = Creating mail message…

# Variables:
# $filename - name or URL of the file that could not be attached
send-error-attaching-file = There was an error attaching { $filename }. Please check that you have access to the file.

send-progress-assembling-message-done = Assembling message…Done

send-progress-copy-complete = Copy complete.

send-progress-copy-failed = Copy failed.

# Variables:
# $folder - destination folder name; $localFolder - local folders name; $account - account name
send-error-save-sent-locally = Your message was sent but a copy was not placed in your sent folder ({ $folder }) due to network or file access errors.
    You can retry or save the message locally to { $localFolder }/{ $folder }-{ $account }.

# Variables:
# $folder - destination folder name; $localFolder - local folders name; $account - account name
send-error-save-draft-locally = Your draft message was not copied to your drafts folder ({ $folder }) due to network or file access errors.
    You can retry or save the draft locally to { $localFolder }/{ $folder }-{ $account }.

# Variables:
# $folder - destination folder name; $localFolder - local folders name; $account - account name
send-error-save-template-locally = Your template was not copied to your templates folder ({ $folder }) due to network or file access errors.
    You can retry or save the template locally to { $localFolder }/{ $folder }-{ $account }.

send-dialog-save-title = Save Message

send-dialog-retry = &Retry

send-error-save-to-local-folders = Unable to save your message to local folders. Possibly out of file storage space.

send-progress-filter-complete = Filter complete.

send-progress-filter-failed = Filter failed.

send-error-filtering-message = Your message has been sent and saved, but there was an error while running message filters on it.

# Variables:
# $hostname - outgoing server hostname
send-error-smtp-security-issue = The configuration related to { $hostname } must be corrected.

send-error-post-failed = The message could not be posted because connecting to the news server failed. The server may be unavailable or is refusing connections. Please verify that your news server settings are correct and try again.

# Variables:
# $size - formatted message size
send-warning-large-message = Warning! You are about to send a message of size { $size }. Are you sure you want to do this?

# Variables:
# $folder - destination folder name
send-progress-copy-start = Copying message to { $folder } folder…

send-progress-sending-message = Sending message…

send-error-nntp-ok = Your message has been posted to the newsgroup but has not been sent to the other recipient.

send-error-copy-operation = The message was sent successfully, but could not be copied to your Sent folder.

send-later-error-title = Send Later Error

send-save-draft-error-title = Save Draft Error

send-save-template-error-title = Save Template Error

# LOCALIZATION NOTE: This string must use only US-ASCII characters.
send-undisclosed-recipients = undisclosed-recipients

# Variables:
# $recipient - recipient address
smtp-error-illegal-local-part = There are non-ASCII characters in the local part of the recipient address { $recipient } and your server does not support SMTPUTF8. Please change this address and try again.

smtp-error-no-recipients = No recipients were specified for SMTP delivery.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-hint-encrypt-to-plain-no-ssl = The Outgoing server (SMTP) { $hostname } does not seem to support encrypted passwords. If you just set up the account, try changing the ‘Authentication method’ in ‘Account Settings | Outgoing server (SMTP)’ to ‘Password, transmitted insecurely’. If it used to work but now doesn’t, you may be susceptible to getting your password stolen.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-hint-encrypt-to-plain-ssl = The Outgoing server (SMTP) { $hostname } does not seem to support encrypted passwords. If you just set up the account, try changing the ‘Authentication method’ in ‘Account settings | Outgoing server (SMTP)’ to ‘Normal password’.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-hint-plain-to-encrypt = The Outgoing server (SMTP) { $hostname } does not allow plaintext passwords. Please try changing the ‘Authentication method’ in ‘Account Settings | Outgoing server (SMTP)’ to ‘Encrypted password’.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-failure = Unable to authenticate to Outgoing server (SMTP) { $hostname }. Please check the password and verify the ‘Authentication method’ in ‘Account Settings | Outgoing server (SMTP)’.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-gssapi = The Kerberos/GSSAPI ticket was not accepted by the Outgoing server (SMTP) { $hostname }. Please check that you are logged in to the Kerberos/GSSAPI realm.

# Variables:
# $hostname - outgoing server hostname
smtp-auth-mechanism-not-supported = The Outgoing server (SMTP) { $hostname } does not support the selected authentication method. Please change the ‘Authentication method’ in ‘Account Settings | Outgoing Server (SMTP)’.

# Variables:
# $serverResponse - server response
smtp-server-error = An error occurred while sending mail: Outgoing server (SMTP) error. The server responded:  { $serverResponse }.

# Variables:
# $hostname - outgoing server hostname
smtp-starttls-failed = An error occurred while sending mail: Unable to establish a secure link with Outgoing server (SMTP) { $hostname } using STARTTLS since it doesn’t advertise that feature. Switch off STARTTLS for that server or contact your service provider.

# Variables:
# $serverResponse - server response
smtp-too-many-recipients = The message was not sent due to exceeding the allowed number of recipients. The server responded: { $serverResponse }.

# Variables:
# $serverResponse - server response
smtp-error-sending-from-command = An error occurred while sending mail. The mail server responded: { $serverResponse }. Please verify that your email address is correct in your account settings and try again.

# Variables:
# $serverResponse - server response
smtp-permanent-size-exceeded = The size of the message you are trying to send exceeds the global size limit of the server. The message was not sent; reduce the message size and try again. The server responded:  { $serverResponse }.

# Variables:
# $serverResponse - server response; $recipient - intended recipient
smtp-error-sending-recipient-command = An error occurred while sending mail. The mail server responded:
    { $serverResponse }.
    Please check the message recipient "{ $recipient }" and try again.

# Variables:
# $serverResponse - server response
smtp-error-sending-data-command = An Outgoing server (SMTP) error occurred while sending mail. The server responded:  { $serverResponse }.

# Variables:
# $serverResponse - server response
smtp-error-sending-message = An error occurred while sending mail. The mail server responded:  { $serverResponse }. Please check the message and try again.

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.syntax import ast as FTL


def migrate(ctx):
    """Bug 2069617 - Migrate message sending strings to Fluent, part {index}."""

    source = "mail/chrome/messenger/messengercompose/composeMsgs.properties"
    target = reference = "mail/messenger/messageSend.ftl"

    filename_replacements = {"%1$S": VARIABLE_REFERENCE("filename")}
    save_replacements = {
        "%1$S": VARIABLE_REFERENCE("folder"),
        "%2$S": VARIABLE_REFERENCE("account"),
        "%3$S": VARIABLE_REFERENCE("localFolder"),
    }
    hostname_replacements = {"%1$S": VARIABLE_REFERENCE("hostname")}
    hostname_typography_replacements = {
        "%1$S": VARIABLE_REFERENCE("hostname"),
        " '": FTL.TextElement(" ‘"),
        "'.": FTL.TextElement("’."),
        "' ": FTL.TextElement("’ "),
        "n't": FTL.TextElement("n’t"),
    }
    size_replacements = {"%1$S": VARIABLE_REFERENCE("size")}
    folder_replacements = {"%1$S": VARIABLE_REFERENCE("folder")}
    recipient_replacements = {"%1$s": VARIABLE_REFERENCE("recipient")}
    server_response_replacements = {"%1$s": VARIABLE_REFERENCE("serverResponse")}
    recipient_command_replacements = {
        "%1$S": VARIABLE_REFERENCE("serverResponse"),
        "%2$S": VARIABLE_REFERENCE("recipient"),
    }

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
send-progress-assembling-mail-information = { COPY(from_path, "assemblingMailInformation") }
send-progress-assembling-message = { COPY(from_path, "assemblingMessage") }
send-progress-creating-mail-message = { COPY(from_path, "creatingMailMessage") }
send-error-attaching-file = { REPLACE(from_path, "errorAttachingFile", filename_replacements) }
send-progress-assembling-message-done = { COPY(from_path, "assemblingMessageDone") }
send-progress-copy-complete = { COPY(from_path, "copyMessageComplete") }
send-progress-copy-failed = { COPY(from_path, "copyMessageFailed") }
send-error-save-sent-locally = { REPLACE(from_path, "promptToSaveSentLocally2", save_replacements) }
send-error-save-draft-locally = { REPLACE(from_path, "promptToSaveDraftLocally2", save_replacements) }
send-error-save-template-locally = { REPLACE(from_path, "promptToSaveTemplateLocally2", save_replacements) }
send-dialog-save-title = { COPY(from_path, "SaveDialogTitle") }
send-dialog-retry = { COPY(from_path, "buttonLabelRetry2") }
send-error-save-to-local-folders = { COPY(from_path, "saveToLocalFoldersFailed") }
send-progress-filter-complete = { COPY(from_path, "filterMessageComplete") }
send-progress-filter-failed = { COPY(from_path, "filterMessageFailed") }
send-error-filtering-message = { COPY(from_path, "errorFilteringMsg") }
send-error-smtp-security-issue = { REPLACE(from_path, "smtpSecurityIssue", hostname_replacements) }
send-error-post-failed = { COPY(from_path, "postFailed") }
send-warning-large-message = { REPLACE(from_path, "largeMessageSendWarning", size_replacements) }
send-progress-copy-start = { REPLACE(from_path, "copyMessageStart", folder_replacements) }
send-progress-sending-message = { COPY(from_path, "sendingMessage") }
send-error-nntp-ok = { COPY(from_path, "sendFailedButNntpOk") }
send-error-copy-operation = { COPY(from_path, "failedCopyOperation") }
send-later-error-title = { COPY(from_path, "sendLaterErrorTitle") }
send-save-draft-error-title = { COPY(from_path, "saveDraftErrorTitle") }
send-save-template-error-title = { COPY(from_path, "saveTemplateErrorTitle") }
send-undisclosed-recipients = { COPY(from_path, "undisclosedRecipients") }
smtp-error-illegal-local-part = { REPLACE(from_path, "errorIllegalLocalPart2", recipient_replacements) }
smtp-auth-hint-encrypt-to-plain-no-ssl = { REPLACE(from_path, "smtpHintAuthEncryptToPlainNoSsl", hostname_typography_replacements) }
smtp-auth-hint-encrypt-to-plain-ssl = { REPLACE(from_path, "smtpHintAuthEncryptToPlainSsl", hostname_typography_replacements) }
smtp-auth-hint-plain-to-encrypt = { REPLACE(from_path, "smtpHintAuthPlainToEncrypt", hostname_typography_replacements) }
smtp-auth-failure = { REPLACE(from_path, "smtpAuthFailure", hostname_typography_replacements) }
smtp-auth-gssapi = { REPLACE(from_path, "smtpAuthGssapi", hostname_replacements) }
smtp-auth-mechanism-not-supported = { REPLACE(from_path, "smtpAuthMechNotSupported", hostname_typography_replacements) }
smtp-server-error = { REPLACE(from_path, "smtpServerError", server_response_replacements) }
smtp-starttls-failed = { REPLACE(from_path, "startTlsFailed", hostname_typography_replacements) }
smtp-too-many-recipients = { REPLACE(from_path, "smtpTooManyRecipients", server_response_replacements) }
smtp-error-sending-from-command = { REPLACE(from_path, "errorSendingFromCommand", server_response_replacements) }
smtp-permanent-size-exceeded = { REPLACE(from_path, "smtpPermSizeExceeded2", server_response_replacements) }
smtp-error-sending-recipient-command = { REPLACE(from_path, "errorSendingRcptCommand", recipient_command_replacements) }
smtp-error-sending-data-command = { REPLACE(from_path, "errorSendingDataCommand", server_response_replacements) }
smtp-error-sending-message = { REPLACE(from_path, "errorSendingMessage", server_response_replacements) }
            """,
            from_path=source,
            filename_replacements=filename_replacements,
            save_replacements=save_replacements,
            hostname_replacements=hostname_replacements,
            hostname_typography_replacements=hostname_typography_replacements,
            size_replacements=size_replacements,
            folder_replacements=folder_replacements,
            recipient_replacements=recipient_replacements,
            server_response_replacements=server_response_replacements,
            recipient_command_replacements=recipient_command_replacements,
        ),
    )

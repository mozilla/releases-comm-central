#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from


def migrate(ctx):
    """Bug 2069617 - Migrate compose alerts to Fluent, part {index}."""

    source = "mail/chrome/messenger/messengercompose/composeMsgs.properties"
    compose_target = compose_reference = "mail/messenger/messengercompose/messengercompose.ftl"
    send_target = send_reference = "mail/messenger/messageSend.ftl"
    hostname_replacements = {"%1$S": VARIABLE_REFERENCE("hostname")}

    ctx.add_transforms(
        compose_target,
        compose_reference,
        transforms_from(
            """
compose-message-attachment-name = { COPY(from_path, "messageAttachmentSafeName") }
compose-message-cancelling = { COPY(from_path, "msgCancelling") }
            """,
            from_path=source,
        ),
    )

    ctx.add_transforms(
        send_target,
        send_reference,
        transforms_from(
            """
send-alert-queued-delivery-failed = { COPY(from_path, "errorQueuedDeliveryFailed") }
send-alert-followup-to-sender = { COPY(from_path, "followupToSenderMessage") }
send-unable-to-save-template = { COPY(from_path, "unableToSaveTemplate") }
send-unable-to-save-draft = { COPY(from_path, "unableToSaveDraft") }
send-error-failed = { COPY(from_path, "sendFailed") }
send-unable-to-send-later = { COPY(from_path, "unableToSendLater") }
send-error-smtp-unknown-server = { REPLACE(from_path, "smtpSendFailedUnknownServer", hostname_replacements) }
send-error-smtp-request-refused = { REPLACE(from_path, "smtpSendRequestRefused", hostname_replacements) }
send-error-smtp-interrupted = { REPLACE(from_path, "smtpSendInterrupted", hostname_replacements) }
send-error-smtp-timeout = { REPLACE(from_path, "smtpSendTimeout", hostname_replacements) }
send-error-title = { COPY(from_path, "sendMessageErrorTitle") }
            """,
            from_path=source,
            hostname_replacements=hostname_replacements,
        ),
    )

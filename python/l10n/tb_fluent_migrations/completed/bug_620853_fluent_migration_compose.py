# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY


def migrate(ctx):
    """Bug 620853 - Handle compose send actions on keyup with the new shortcuts controller to avoid accidental long press sends. part {index}"""
    from_dtd = "mail/chrome/messenger/messengercompose/messengercompose.dtd"
    target = reference = "mail/messenger/messengercompose/messengercompose.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
compose-button-send =
    .label = { COPY(from_dtd, "sendButton.label") }
    .tooltiptext = { COPY(from_dtd, "sendButton.tooltip") }

compose-button-send-later =
    .label = { COPY(from_dtd, "sendLaterCmd.label") }
    .tooltiptext = { COPY(from_dtd, "sendlaterButton.tooltip") }

compose-menu-item-send =
    .label = { COPY(from_dtd, "sendButton.label") }
    .tooltiptext = { COPY(from_dtd, "sendButton.tooltip") }
    .accesskey = { COPY(from_dtd, "sendNowCmd.accesskey") }

compose-menu-item-send-later =
    .label = { COPY(from_dtd, "sendLaterCmd.label") }
    .tooltiptext = { COPY(from_dtd, "sendlaterButton.tooltip") }
    .accesskey = { COPY(from_dtd, "sendLaterCmd.accesskey") }
            """,
            from_dtd=from_dtd,
        ),
    )

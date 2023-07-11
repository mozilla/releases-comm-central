# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1827199 - Message summary preview header buttons are not keyboard accessible"""

    target = reference = "mail/locales/en-US/messenger/multimessageview.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
multi-message-window-title =
    .title = {{COPY_PATTERN(from_path, "window.title")}}

selected-messages-label =
    .label = {{COPY_PATTERN(from_path, "selectedmessages.label")}}

multi-message-archive-button =
    .label = {{COPY_PATTERN(from_path, "archiveButton.label")}}
    .tooltiptext = {{COPY_PATTERN(from_path, "archiveButton.label")}}

multi-message-delete-button =
    .label = {{COPY_PATTERN(from_path, "deleteButton.label")}}
    .tooltiptext = {{COPY_PATTERN(from_path, "deleteButton.label")}}
            """,
            from_path="mail/locales/en-US/chrome/messenger/multimessageview.dtd",
        ),
    )

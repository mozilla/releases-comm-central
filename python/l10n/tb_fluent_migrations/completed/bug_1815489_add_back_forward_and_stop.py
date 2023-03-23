# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1815489 - Add back, forward and stop to unified toolbar fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-go-back-label = { COPY(from_path, "backButton1.label") }

toolbar-go-back =
    .title = { COPY(from_path, "goBackButton.tooltip") }

toolbar-go-forward-label = { COPY(from_path, "goForwardButton1.label") }

toolbar-go-forward =
    .title = { COPY(from_path, "goForwardButton.tooltip") }

toolbar-stop-label = { COPY(from_path, "stopButton.label") }

toolbar-stop =
    .title = { COPY(from_path, "stopButton.tooltip") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

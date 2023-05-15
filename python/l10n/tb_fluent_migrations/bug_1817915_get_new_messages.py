# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1817915 - Add context menu to Get Messages folder pane button to fetch all messages or per account, part {index}."""

    ctx.add_transforms(
        "mail/chrome/messenger/messenger.dtd",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
folder-pane-get-all-messages-menuitem =
    .label = { COPY(from_path, "getAllNewMsgCmd.label") }
    .accesskey = { COPY(from_path, "getAllNewMsgCmd.accesskey") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

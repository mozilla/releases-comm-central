# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY_PATTERN


def migrate(ctx):
    """Bug 1837152 - Add context menu to unified toolbar get messages button, part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
toolbar-get-all-messages-menuitem =
    .label = { COPY_PATTERN(from_path, "folder-pane-get-all-messages-menuitem.label") }
    .accesskey = { COPY_PATTERN(from_path, "folder-pane-get-all-messages-menuitem.accesskey") }
            """,
            from_path="mail/messenger/about3Pane.ftl",
        ),
    )

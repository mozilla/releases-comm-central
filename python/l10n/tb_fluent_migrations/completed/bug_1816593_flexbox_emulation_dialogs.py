# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1816593 - Fix wrong sized dialogs due to flexbox emulation, part {index}"""

    ctx.add_transforms(
        "mail/messenger/compactFoldersDialog.ftl",
        "mail/messenger/compactFoldersDialog.ftl",
        transforms_from(
            """
compact-dialog-window-title =
    .title = {{COPY_PATTERN(from_path, "compact-dialog-window.title")}}
            """,
            from_path="mail/messenger/compactFoldersDialog.ftl",
        ),
    )

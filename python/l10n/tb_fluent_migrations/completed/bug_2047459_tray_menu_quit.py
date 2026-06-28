# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2047459 - Add context menu to the Windows tray icon. part {index}"""

    source = target = reference = "mail/messenger/menubar.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
system-tray-menuitem-quit = {COPY_PATTERN(from_path, "system-tray-menu-quit.label")}
            """,
            from_path=source,
        ),
    )

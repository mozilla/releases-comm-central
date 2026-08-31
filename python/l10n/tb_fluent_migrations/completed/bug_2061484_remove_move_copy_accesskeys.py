# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2061484 - Remove explicit accesskeys in Move To and Copy To menus, part {index}."""

    target = reference = "mail/messenger/messenger.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
menu-move-copy-recent-destinations-no-accesskey =
    .label = { COPY_PATTERN(from_path, "menu-move-copy-recent-destinations.label") }

menu-move-copy-favorites-no-accesskey =
    .label = { COPY_PATTERN(from_path, "menu-move-copy-favorites.label") }
            """,
            from_path=target,
        ),
    )

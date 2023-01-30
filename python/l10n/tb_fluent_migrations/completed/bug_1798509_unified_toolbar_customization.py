# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1798509 - Unified toolbar customization fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
customize-menu-customize =
  .label = { COPY(from_path, "customizeToolbar.label") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
customize-space-mail = { COPY_PATTERN(from_path, "spaces-toolbar-button-mail2.title") }

customize-space-addressbook = { COPY_PATTERN(from_path, "spaces-toolbar-button-address-book2.title") }

customize-space-calendar = { COPY_PATTERN(from_path, "spaces-toolbar-button-calendar2.title") }

customize-space-tasks = { COPY_PATTERN(from_path, "spaces-toolbar-button-tasks2.title") }

customize-space-chat = { COPY_PATTERN(from_path, "spaces-toolbar-button-chat2.title") }

customize-space-settings = { COPY_PATTERN(from_path, "spaces-toolbar-button-settings2.title") }
            """,
            from_path="mail/messenger/messenger.ftl",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
customize-button-style-icons-beside-text =
  .label = { COPY(from_path, "iconsBesideText.label") }
            """,
            from_path="mail/chrome/messenger/customizeToolbar.dtd",
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1814393 - Unified toolbar customization tab titles part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
customize-space-tab-mail = { COPY_PATTERN(from_path, "customize-space-mail") }
  .title = { COPY_PATTERN(from_path, "customize-space-mail") }

customize-space-tab-addressbook = { COPY_PATTERN(from_path, "customize-space-addressbook") }
  .title = { COPY_PATTERN(from_path, "customize-space-addressbook") }

customize-space-tab-calendar = { COPY_PATTERN(from_path, "customize-space-calendar") }
  .title = { COPY_PATTERN(from_path, "customize-space-calendar") }

customize-space-tab-tasks = { COPY_PATTERN(from_path, "customize-space-tasks") }
  .title = { COPY_PATTERN(from_path, "customize-space-tasks") }

customize-space-tab-chat = { COPY_PATTERN(from_path, "customize-space-chat") }
  .title = { COPY_PATTERN(from_path, "customize-space-chat") }

customize-space-tab-settings = { COPY_PATTERN(from_path, "customize-space-settings") }
  .title = { COPY_PATTERN(from_path, "customize-space-settings") }
            """,
            from_path="mail/messenger/unifiedToolbar.ftl",
        ),
    )

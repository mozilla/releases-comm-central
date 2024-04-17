# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1890267 - Attachment context menu fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/messenger.ftl",
        "mail/messenger/messenger.ftl",
        transforms_from(
            """
mail-context-menu-forward-forward =
  .label = { COPY(from_path, "contextForward.label") }
  .accesskey = { COPY(from_path, "contextForward.accesskey") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

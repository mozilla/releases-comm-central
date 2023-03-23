# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1823033 - Add activity indicator to unified toolbar fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-throbber-label = { COPY(from_path, "throbberItem.title") }

toolbar-throbber =
    .title = { COPY(from_path, "throbberItem.title") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

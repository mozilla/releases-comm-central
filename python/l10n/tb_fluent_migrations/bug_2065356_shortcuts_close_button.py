# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2065356 - Add the close button aria-label, part {index}."""

    target = reference = "mail/messenger/customizableshortcuts/customizableShortcuts.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
shortcuts-close-button =
    .title = { COPY_PATTERN(from_path, "shortcuts-close-button-title.title") }
    .aria-label = { COPY_PATTERN(from_path, "shortcuts-close-button-title.title") }
            """,
            from_path=target,
        ),
    )

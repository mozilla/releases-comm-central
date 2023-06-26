# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY_PATTERN


def migrate(ctx):
    """Bug 1833042 - Don't automatically update the button style preference when changed in the unified toolbar customization panel, part {index}."""
    ctx.add_transforms(
        "mail/messenger/unifiedToolbar.ftl",
        "mail/messenger/unifiedToolbar.ftl",
        transforms_from(
            """
customize-button-style-icons-beside-text-option = {COPY_PATTERN(from_path, "customize-button-style-icons-beside-text.label")}

customize-button-style-icons-above-text-option = {COPY_PATTERN(from_path, "customize-button-style-icons-above-text.label")}

customize-button-style-icons-only-option = {COPY_PATTERN(from_path, "customize-button-style-icons-only.label")}

customize-button-style-text-only-option = {COPY_PATTERN(from_path, "customize-button-style-text-only.label")}
    """,
            from_path="mail/messenger/unifiedToolbar.ftl",
        ),
    )

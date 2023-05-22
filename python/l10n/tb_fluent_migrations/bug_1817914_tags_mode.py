# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1820700 - Implement a Tags folder pane mode, part {index}."""

    ctx.add_transforms(
        "mail/messenger/messenger.ftl",
        "mail/messenger/messenger.ftl",
        transforms_from(
            """
show-tags-folders-label =
    .label = {COPY(from_path, "viewTags.label")}
    .accesskey = {COPY(from_path, "viewTags.accesskey")}
""",
            from_path="mail/chrome/messenger/msgViewPickerOverlay.dtd",
        ),
    )

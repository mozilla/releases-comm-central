# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migrate.transforms import REPLACE


def migrate(ctx):
    """Bug 1811400 - Migrate thread pane strings, part {index}."""

    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
apply-columns-to-menu =
    .label = { COPY(from_path, "columnPicker.applyTo.label") }

apply-current-view-to-folder =
    .label = { COPY(from_path, "columnPicker.applyToFolder.label") }

apply-current-view-to-folder-children =
    .label = { COPY(from_path, "columnPicker.applyToFolderAndChildren.label") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
apply-current-view-to-menu =
    .label = { COPY_PATTERN(from_path, "apply-current-view-to-menu.label") }

apply-changes-to-folder-title = {
    COPY_PATTERN(from_path, "threadpane-apply-changes-prompt-title")
}

apply-current-view-to-folder-message = {
    COPY_PATTERN(from_path, "threadpane-apply-changes-prompt-no-children-text")
}

apply-current-view-to-folder-with-children-message = {
    COPY_PATTERN(from_path, "threadpane-apply-changes-prompt-with-children-text")
}
            """,
            from_path="mail/messenger/mailWidgets.ftl",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("apply-current-columns-to-folder-message"),
                value=REPLACE(
                    "mail/chrome/messenger/messenger.properties",
                    "threadPane.columnPicker.confirmFolder.noChildren.message",
                    {
                        "%1$S": VARIABLE_REFERENCE("name"),
                    },
                    normalize_printf=True,
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("apply-current-columns-to-folder-with-children-message"),
                value=REPLACE(
                    "mail/chrome/messenger/messenger.properties",
                    "threadPane.columnPicker.confirmFolder.withChildren.message",
                    {
                        "%1$S": VARIABLE_REFERENCE("name"),
                    },
                    normalize_printf=True,
                ),
            ),
        ],
    )

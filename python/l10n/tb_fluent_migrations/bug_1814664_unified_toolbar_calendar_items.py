# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1814664 - Add calendar items to unified toolbar fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-synchronize-label = { COPY(from_path, "lightning.toolbar.sync.label") }

toolbar-synchronize =
    .title = { COPY(from_path, "lightning.toolbar.sync.tooltip") }

toolbar-delete-event-label = { COPY(from_path, "lightning.toolbar.delete.label") }

toolbar-delete-event =
    .title = { COPY(from_path, "lightning.toolbar.delete.tooltip") }

toolbar-go-to-today-label = { COPY(from_path, "lightning.toolbar.gototoday.label") }

toolbar-go-to-today =
    .title = { COPY(from_path, "lightning.toolbar.gototoday.tooltip") }

toolbar-print-event-label = { COPY(from_path, "lightning.toolbar.print.label") }

toolbar-print-event =
    .title = { COPY(from_path, "lightning.toolbar.print.tooltip") }

toolbar-new-event-label = { COPY(from_path, "lightning.toolbar.newevent.label") }

toolbar-new-event =
    .title = { COPY(from_path, "lightning.toolbar.newevent.tooltip") }

toolbar-new-task-label = { COPY(from_path, "lightning.toolbar.newtask.label") }

toolbar-new-task =
    .title = { COPY(from_path, "lightning.toolbar.newtask.tooltip") }
            """,
            from_path="calendar/chrome/lightning/lightning-toolbar.dtd",
        ),
    )

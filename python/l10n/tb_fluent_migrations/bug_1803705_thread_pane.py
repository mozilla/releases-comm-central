# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import transforms_from
from fluent.migrate import COPY


def migrate(ctx):
    """Bug 1803705 - Migrate thread tree strings to fluent, part {index}."""

    ctx.add_transforms(
        "mail/messenger/treeView.ftl",
        "mail/messenger/treeView.ftl",
        transforms_from(
            """
tree-list-view-column-picker =
    .title = { COPY(from_path, "columnChooser2.tooltip") }
""",
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
threadpane-column-header-select =
    .title = { COPY(from_path, "selectColumn.tooltip") }
threadpane-column-label-select =
    .label = { COPY(from_path, "selectColumn.label") }
threadpane-column-label-thread =
    .label = { COPY(from_path, "threadColumn.label") }
threadpane-column-header-flagged =
    .title = { COPY(from_path, "starredColumn2.tooltip") }
threadpane-column-label-flagged =
    .label = { COPY(from_path, "starredColumn.label") }
threadpane-column-header-attachments =
    .title = { COPY(from_path, "attachmentColumn2.tooltip") }
threadpane-column-label-attachments =
    .label = { COPY(from_path, "attachmentColumn.label") }
threadpane-column-header-sender = { COPY(from_path, "fromColumn.label") }
    .title = { COPY(from_path, "fromColumn2.tooltip") }
threadpane-column-label-sender =
    .label = { COPY(from_path, "fromColumn.label") }
threadpane-column-header-recipient = { COPY(from_path, "recipientColumn.label") }
    .title = { COPY(from_path, "recipientColumn2.tooltip") }
threadpane-column-label-recipient =
    .label = { COPY(from_path, "recipientColumn.label") }
threadpane-column-header-correspondents = { COPY(from_path, "correspondentColumn.label") }
    .title = { COPY(from_path, "correspondentColumn2.tooltip") }
threadpane-column-label-correspondents =
    .label = { COPY(from_path, "correspondentColumn.label") }
threadpane-column-header-subject = { COPY(from_path, "subjectColumn.label") }
    .title = { COPY(from_path, "subjectColumn2.tooltip") }
threadpane-column-label-subject =
    .label = { COPY(from_path, "subjectColumn.label") }
threadpane-column-header-date = { COPY(from_path, "dateColumn.label") }
    .title = { COPY(from_path, "dateColumn2.tooltip") }
threadpane-column-label-date =
    .label = { COPY(from_path, "dateColumn.label") }
threadpane-column-header-received = { COPY(from_path, "receivedColumn.label") }
    .title = { COPY(from_path, "receivedColumn2.tooltip") }
threadpane-column-label-received =
    .label = { COPY(from_path, "receivedColumn.label") }
threadpane-column-header-status = { COPY(from_path, "statusColumn.label") }
    .title = { COPY(from_path, "statusColumn2.tooltip") }
threadpane-column-label-status =
    .label = { COPY(from_path, "statusColumn.label") }
threadpane-column-header-size = { COPY(from_path, "sizeColumn.label") }
    .title = { COPY(from_path, "sizeColumn2.tooltip") }
threadpane-column-label-size =
    .label = { COPY(from_path, "sizeColumn.label") }
threadpane-column-header-tags = { COPY(from_path, "tagsColumn.label") }
    .title = { COPY(from_path, "tagsColumn2.tooltip") }
threadpane-column-label-tags =
    .label = { COPY(from_path, "tagsColumn.label") }
threadpane-column-header-account = { COPY(from_path, "accountColumn.label") }
    .title = { COPY(from_path, "accountColumn2.tooltip") }
threadpane-column-label-account =
    .label = { COPY(from_path, "accountColumn.label") }
threadpane-column-header-priority = { COPY(from_path, "priorityColumn.label") }
    .title = { COPY(from_path, "priorityColumn2.tooltip") }
threadpane-column-label-priority =
    .label = { COPY(from_path, "priorityColumn.label") }
threadpane-column-header-unread = { COPY(from_path, "unreadColumn.label") }
    .title = { COPY(from_path, "unreadColumn2.tooltip") }
threadpane-column-label-unread =
    .label = { COPY(from_path, "unreadColumn.label") }
threadpane-column-header-total = { COPY(from_path, "totalColumn.label") }
    .title = { COPY(from_path, "totalColumn2.tooltip") }
threadpane-column-label-total =
    .label = { COPY(from_path, "totalColumn.label") }
threadpane-column-header-location = { COPY(from_path, "locationColumn.label") }
    .title = { COPY(from_path, "locationColumn2.tooltip") }
threadpane-column-label-location =
    .label = { COPY(from_path, "locationColumn.label") }
threadpane-column-header-id = { COPY(from_path, "idColumn.label") }
    .title = { COPY(from_path, "idColumn2.tooltip") }
threadpane-column-label-id =
    .label = { COPY(from_path, "idColumn.label") }
threadpane-column-header-delete =
    .title = { COPY(from_path, "deleteColumn.tooltip") }
threadpane-column-label-delete =
    .label = { COPY(from_path, "deleteColumn.label") }
""",
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

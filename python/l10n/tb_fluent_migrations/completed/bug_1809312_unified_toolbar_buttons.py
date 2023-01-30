# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate import COPY_PATTERN
from fluent.migrate.helpers import transforms_from


def migrate(ctx):
    """Bug 1809312 - Implement mail space actions for unified toolbar fluent migration part {index}."""

    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
spacer-label = { COPY(from_path, "springTitle") }
            """,
            from_path="mail/chrome/messenger/customizeToolbar.properties",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-write-message-label = { COPY(from_path, "newMsgButton.label") }

toolbar-write-message =
    .title = { COPY(from_path, "newMsgButton.tooltip") }

toolbar-folder-location-label = { COPY(from_path, "folderLocationToolbarItem.title") }

toolbar-get-messages-label = { COPY(from_path, "getMsgButton1.label") }

toolbar-reply-label = { COPY(from_path, "replyButton.label") }

toolbar-reply =
    .title = { COPY(from_path, "replyButton.tooltip") }

toolbar-reply-all-label = { COPY(from_path, "replyAllButton.label") }

toolbar-reply-all =
    .title = { COPY(from_path, "replyAllButton.tooltip") }

toolbar-reply-to-list-label = { COPY(from_path, "replyListButton.label") }

toolbar-reply-to-list =
    .title = { COPY(from_path, "replyListButton.tooltip") }

toolbar-archive-label = { COPY(from_path, "archiveButton.label") }

toolbar-archive =
    .title = { COPY(from_path, "archiveButton.tooltip") }

toolbar-conversation-label = { COPY(from_path, "openConversationButton.label") }

toolbar-conversation =
    .title = { COPY(from_path, "openMsgConversationButton.tooltip") }

toolbar-previous-unread-label = { COPY(from_path, "previousButtonToolbarItem.label") }

toolbar-previous-unread =
    .title = { COPY(from_path, "previousButton.tooltip") }

toolbar-previous-label = { COPY(from_path, "previousButton.label") }

toolbar-previous =
    .title = { COPY(from_path, "previousMsgButton.tooltip") }

toolbar-next-unread-label = { COPY(from_path, "nextButtonToolbarItem.label") }

toolbar-next-unread =
    .title = { COPY(from_path, "nextButton.tooltip") }

toolbar-next-label = { COPY(from_path, "nextMsgButton.label") }

toolbar-next =
    .title = { COPY(from_path, "nextMsgButton.tooltip") }

toolbar-compact-label = { COPY(from_path, "compactButton.label") }

toolbar-compact =
    .title = { COPY(from_path, "compactButton.tooltip") }

toolbar-tag-message-label = { COPY(from_path, "tagButton.label") }

toolbar-tag-message =
    .title = { COPY(from_path, "tagButton.tooltip") }

toolbar-forward-inline-label = { COPY(from_path, "forwardButton.label") }

toolbar-forward-inline =
    .title = { COPY(from_path, "forwardAsInline.tooltip") }

toolbar-forward-attachment-label = { COPY(from_path, "buttonMenuForwardAsAttachment.label") }

toolbar-forward-attachment =
    .title = { COPY(from_path, "forwardAsAttachment.tooltip") }

toolbar-mark-as-label = { COPY(from_path, "markButton.label") }

toolbar-mark-as =
    .title = { COPY(from_path, "markButton.tooltip") }

toolbar-address-book-label = { COPY(from_path, "addressBookButton.title") }

toolbar-address-book =
    .title = { COPY(from_path, "addressBookButton.tooltip") }

toolbar-chat-label = { COPY(from_path, "chatButton.label") }

toolbar-chat =
    .title = { COPY(from_path, "chatButton.tooltip") }

toolbar-print-label = { COPY(from_path, "printButton.label") }

toolbar-print =
    .title = { COPY(from_path, "printButton.tooltip") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-unifinder-label = { COPY(from_path, "showUnifinderCmd.label") }

toolbar-unifinder =
    .title = { COPY(from_path, "showUnifinderCmd.tooltip") }
            """,
            from_path="calendar/chrome/calendar/menuOverlay.dtd",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-edit-event-label = { COPY(from_path, "lightning.toolbar.edit.label") }

toolbar-edit-event =
    .title = { COPY(from_path, "lightning.toolbar.edit.tooltip") }

toolbar-calendar-label = { COPY(from_path, "lightning.toolbar.calendar.label") }

toolbar-calendar =
    .title = { COPY(from_path, "lightning.toolbar.calendar.tooltip") }

toolbar-tasks-label = { COPY(from_path, "lightning.toolbar.task.label") }

toolbar-tasks =
    .title = { COPY(from_path, "lightning.toolbar.task.tooltip") }
            """,
            from_path="calendar/chrome/lightning/lightning-toolbar.dtd",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-redirect-label = { COPY_PATTERN(from_path, "redirect-msg-button.label") }

toolbar-redirect =
    .title = { COPY_PATTERN(from_path, "redirect-msg-button.tooltiptext") }

toolbar-add-ons-and-themes-label = { COPY_PATTERN(from_path, "addons-and-themes-toolbarbutton.label") }

toolbar-add-ons-and-themes =
    .title = { COPY_PATTERN(from_path, "addons-and-themes-toolbarbutton.tooltiptext") }


toolbar-quick-filter-bar-label = { COPY_PATTERN(from_path, "quick-filter-toolbarbutton.label") }

toolbar-quick-filter-bar =
    .title = { COPY_PATTERN(from_path, "quick-filter-toolbarbutton.tooltiptext") }
            """,
            from_path="mail/messenger/messenger.ftl",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-junk-label = { COPY_PATTERN(from_path, "toolbar-junk-button.label") }

toolbar-junk =
    .title = { COPY_PATTERN(from_path, "toolbar-junk-button.tooltiptext") }

toolbar-delete-label = { COPY_PATTERN(from_path, "toolbar-delete-button.label") }

toolbar-delete =
    .title = { COPY_PATTERN(from_path, "toolbar-delete-button.tooltiptext") }
            """,
            from_path="mail/messenger/menubar.ftl",
        ),
    )
    ctx.add_transforms(
        "mail/messenger/unifiedToolbarItems.ftl",
        "mail/messenger/unifiedToolbarItems.ftl",
        transforms_from(
            """
toolbar-add-as-event-label = { COPY(from_path, "calendar.extract.event.button") }

toolbar-add-as-event =
    .title = { COPY(from_path, "calendar.extract.event.button.tooltip") }

toolbar-add-as-task-label = { COPY(from_path, "calendar.extract.task.button") }

toolbar-add-as-task =
    .title = { COPY(from_path, "calendar.extract.task.button.tooltip") }
            """,
            from_path="calendar/chrome/calendar/calendar.dtd",
        ),
    )

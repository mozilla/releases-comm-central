# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from

folder_name = dict({"%1$S": VARIABLE_REFERENCE("name")})


def migrate(ctx):
    """Bug 2057045 - Confirm folder deletion in the front end, part {index}."""

    target = reference = "mail/messenger/about3Pane.ftl"
    imap_source = "mail/chrome/messenger/imapMsgs.properties"
    messenger_source = "mail/chrome/messenger/messenger.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
folder-delete-title = {COPY(from_path, "imapDeleteFolderDialogTitle")}

folder-delete-button = {COPY(from_path, "imapDeleteFolderButtonLabel")}

folder-delete-confirm = {REPLACE(from_path, "imapMoveFolderToTrash", folder_name)}

folder-delete-no-trash-confirm = {REPLACE(from_path, "imapDeleteNoTrash", folder_name)}
            """,
            from_path=imap_source,
            folder_name=folder_name,
        ),
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
folder-delete-filter-confirm = {REPLACE(from_path, "confirmFolderDeletionForFilter", folder_name)}
            """,
            from_path=messenger_source,
            folder_name=folder_name,
        ),
    )

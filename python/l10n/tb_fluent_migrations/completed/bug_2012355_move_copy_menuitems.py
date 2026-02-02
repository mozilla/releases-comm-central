# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

def migrate(ctx):
    """Bug 2012355 - Migrate 'Move To' and 'Copy To' menu items to Fluent, part {index}."""

    dtd_source= "mail/chrome/messenger/messenger.dtd"
    properties_source = "mail/chrome/messenger/messenger.properties"
    ftl_target = "mail/messenger/messenger.ftl"

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
menu-move-again =
    .label = { COPY(from_path, "moveToFolderAgain.label") }

move-to-folder-again-key =
    .key = { COPY(from_path, "moveToFolderAgainCmd.key") }

menu-move-to =
    .label = { COPY(from_path, "contextMoveMsgMenu.label") }
    .accesskey = { COPY(from_path, "contextMoveMsgMenu.accesskey") }

menu-copy-to =
    .label = { COPY(from_path, "contextCopyMsgMenu.label") }
    .accesskey = { COPY(from_path, "contextCopyMsgMenu.accesskey") }

menu-move-copy-recent-destinations =
    .label = { COPY(from_path, "contextMoveCopyMsgRecentDestinationMenu.label") }
    .accesskey = { COPY(from_path, "contextMoveCopyMsgRecentDestinationMenu.accesskey") }

menu-move-copy-favorites =
    .label = { COPY(from_path, "contextMoveCopyMsgFavoritesMenu.label") }
    .accesskey = { COPY(from_path, "contextMoveCopyMsgFavoritesMenu.accesskey") }
            """,
            from_path=dtd_source,
        ),
    )

    replacements_folder_again = {
        "%1$S": VARIABLE_REFERENCE("folderName"),
    }

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
menu-move-to-folder-again =
    .label = { REPLACE(from_path, "moveToFolderAgain", replacements) }
    .accesskey = { COPY(from_path, "moveToFolderAgainAccessKey") }

menu-copy-to-folder-again =
    .label = { REPLACE(from_path, "copyToFolderAgain", replacements) }
    .accesskey = { COPY(from_path, "copyToFolderAgainAccessKey") }
            """,
            from_path=properties_source,
            replacements=replacements_folder_again,
        ),
    )

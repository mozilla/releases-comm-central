# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY

def migrate(ctx):
    """Bug 2044793 - Migrate newFolderDialog.dtd to Fluent, part {index}"""

    target = reference = "mail/messenger/new-folder-dialog.ftl"
    source = "mail/chrome/messenger/newFolderDialog.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
new-folder-dialog-title = { COPY(source, "newFolderDialog.title") }

new-folder-dialog-accept-button =
    .buttonlabelaccept = { COPY(source, "accept.label") }
    .buttonaccesskeyaccept = { COPY(source, "accept.accesskey") }

new-folder-name-label = { COPY(source, "name.label") }
    .accesskey = { COPY(source, "name.accesskey") }

new-folder-description-label = { COPY(source, "description.label") }
    .accesskey = { COPY(source, "description.accesskey") }

new-folder-restriction-1 = { COPY(source, "folderRestriction1.label") }

new-folder-restriction-2 = { COPY(source, "folderRestriction2.label") }

new-folder-folders-only =
    .label = { COPY(source, "foldersOnly.label") }

new-folder-messages-only =
    .label = { COPY(source, "messagesOnly.label") }
            """,
            source=source,
        ),
    )

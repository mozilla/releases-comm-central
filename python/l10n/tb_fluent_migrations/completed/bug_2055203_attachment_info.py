# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY, REPLACE
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from

file_name_replacement = {"%1$S": VARIABLE_REFERENCE("filename")}
attachments_replacement = {"%1$S": VARIABLE_REFERENCE("attachments")}


def migrate(ctx):
    """Bug 2055203 - Migrate AttachmentInfo.sys.mjs to Fluent, part {index}."""

    target = reference = "mail/messenger/attachmentInfo.ftl"
    source = "mail/chrome/messenger/messenger.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
attachment-save-dialog-title = { COPY(source, "SaveAttachment") }

attachment-save-all-dialog-title = { COPY(source, "SaveAllAttachments") }

attachment-detach-dialog-title = { COPY(source, "DetachAttachment") }

attachment-detach-all-dialog-title = { COPY(source, "DetachAllAttachments") }

attachment-save-failed = { COPY(source, "saveAttachmentFailed") }

# Variables:
#   $filename (String) - Name of the file that already exists.
attachment-file-exists = { REPLACE(source, "fileExists", file_name_replacement) }

# Variables:
#   $attachments (String) - Newline separated list of attachment names.
attachment-delete-confirm = { REPLACE(source, "deleteAttachments", attachments_replacement) }

# Variables:
#   $attachments (String) - Newline separated list of attachment names.
attachment-detach-confirm = { REPLACE(source, "detachAttachments", attachments_replacement) }

attachment-empty = { COPY(source, "emptyAttachment") }

attachment-external-not-found = { COPY(source, "externalAttachmentNotFound") }
            """,
            source=source,
            file_name_replacement=file_name_replacement,
            attachments_replacement=attachments_replacement,
        ),
    )

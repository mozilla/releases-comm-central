# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY, REPLACE
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from


def migrate(ctx):
    """Bug 1140323 - Migrate nsMessenger save strings to Fluent, part {index}."""

    source = "mail/chrome/messenger/messenger.properties"
    target = reference = "mail/messenger/messenger.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
messenger-eml-files-filter = { COPY(source, "EMLFiles") }
messenger-open-eml-file-title = { COPY(source, "OpenEMLFiles") }

# Keep the .eml extension and use an 8.3 file name.
messenger-default-save-message-file-name = { COPY(source, "defaultSaveMessageAsFileName") }

messenger-save-message-as = { COPY(source, "SaveMailAs") }
messenger-choose-folder = { COPY(source, "ChooseFolder") }
messenger-save-message-failed = { COPY(source, "saveMessageFailed") }

# Variables:
# $filename (String) - Full path of the file that already exists.
messenger-file-exists = { REPLACE(source, "fileExists", replacements) }
            """,
            source=source,
            replacements={"%1$S": VARIABLE_REFERENCE("filename")},
        ),
    )

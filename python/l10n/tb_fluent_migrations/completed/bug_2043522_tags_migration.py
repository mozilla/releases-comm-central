# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE
from fluent.migratetb import COPY, REPLACE

def migrate(ctx):
    """Bug 2043522 - Migrate mailnews tags and UI labels to Fluent, part {index}."""

    # 1. Messenger targets and sources
    target_messenger = reference_messenger = "mail/messenger/messenger.ftl"
    source_dtd = "mail/chrome/messenger/messenger.dtd"
    source_properties = "mail/chrome/messenger/messenger.properties"

    # Define replacements for positional variables in tags-format
    tags_format_replacements = {
        "%1$S": VARIABLE_REFERENCE("accesskey"),
        "%2$S": VARIABLE_REFERENCE("name"),
    }

    # Apply the messenger.ftl transforms
    ctx.add_transforms(
        target_messenger,
        reference_messenger,
        transforms_from(
            """
tags-add-new =
    .label = { COPY(source_dtd, "addNewTag.label") }
    .accesskey = { COPY(source_dtd, "addNewTag.accesskey") }

tags-manage =
    .label = { COPY(source_dtd, "manageTags.label") }
    .accesskey = { COPY(source_dtd, "manageTags.accesskey") }

tags-remove-all =
    .label = { COPY(source_properties, "mailnews.tags.remove") }
    .accesskey = 0

tags-label-1 = { COPY(source_properties, "mailnews.labels.description.1") }
tags-label-2 = { COPY(source_properties, "mailnews.labels.description.2") }
tags-label-3 = { COPY(source_properties, "mailnews.labels.description.3") }
tags-label-4 = { COPY(source_properties, "mailnews.labels.description.4") }
tags-label-5 = { COPY(source_properties, "mailnews.labels.description.5") }

tags-format-with-accesskey =
    .label = { REPLACE(source_properties, "mailnews.tags.format", tags_format_replacements) }
    .accesskey = { $accesskey }
tags-format-without-accesskey =
    .label = { $name }
""",
            source_dtd=source_dtd,
            source_properties=source_properties,
            tags_format_replacements=tags_format_replacements,
        ),
    )

    # 2. Preferences targets and sources
    target_newtag = reference_newtag = "mail/messenger/preferences/new-tag.ftl"

    # Apply the new-tag.ftl transforms
    ctx.add_transforms(
        target_newtag,
        reference_newtag,
        transforms_from(
            """
tag-edit-dialog-title = { COPY(source_properties, "editTagTitle") }
tag-already-exists = { COPY(source_properties, "tagExists") }
""",
            source_properties=source_properties,
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY


def migrate(ctx):
    """Bug 697706 - Migrate Archive Options strings to Fluent, part {index}."""
    target = reference = "mail/messenger/preferences/am-archiveoptions.ftl"
    source = "mail/chrome/messenger/am-archiveoptions.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
archive-options-title = { COPY(from_path, "dialogTitle.label") }
archive-granularity-prefix-label = { COPY(from_path, "archiveGranularityPrefix.label") }
archive-flat =
    .label = { COPY(from_path, "archiveFlat.label") }
    .accesskey = { COPY(from_path, "archiveFlat.accesskey") }
archive-yearly =
    .label = { COPY(from_path, "archiveYearly.label") }
    .accesskey = { COPY(from_path, "archiveYearly.accesskey") }
archive-monthly =
    .label = { COPY(from_path, "archiveMonthly.label") }
    .accesskey = { COPY(from_path, "archiveMonthly.accesskey") }
keep-folder-structure =
    .label = { COPY(from_path, "keepFolderStructure.label") }
    .accesskey = { COPY(from_path, "keepFolderStructure.accesskey") }
archive-example-label = { COPY(from_path, "archiveExample.label") }
archive-folder-name =
    .label = { COPY(from_path, "archiveFolderName.label") }
inbox-folder-name =
    .label = { COPY(from_path, "inboxFolderName.label") }
""",
            from_path=source,
        ),
    )

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from

def migrate(ctx):
    """Bug 1744107 - Migrate message retention strings to Fluent, part {index}."""

    target = reference = "mail/messenger/retention.ftl"

    am_offline_dtd = "mail/chrome/messenger/am-offline.dtd"
    folder_props_dtd = "mail/chrome/messenger/folderProps.dtd"
    prefs_properties = "mail/chrome/messenger/prefs.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
retention-tab =
    .label = { COPY(folder_props, "retention.label") }

retention-use-default =
    .label = { COPY(folder_props, "retentionUseAccount.label") }
    .accesskey = { COPY(folder_props, "retentionUseAccount.accesskey") }

retention-button =
    .label = { COPY(folder_props, "retention.label") }

retention-dialog-title = { COPY(folder_props, "retention.label") }

retention-description = { COPY(am_offline, "retentionCleanup.label") }
retention-description-imap = { COPY(am_offline, "retentionCleanupImap.label") }
retention-description-pop = { COPY(am_offline, "retentionCleanupPop.label") }

retention-retain-all =
    .label = { COPY(am_offline, "retentionKeepAll.label") }
    .accesskey = { COPY(am_offline, "retentionKeepAll.accesskey") }

retention-retain-by-num-headers =
    .label = { COPY(am_offline, "retentionKeepRecent.label") }
    .accesskey = { COPY(am_offline, "retentionKeepRecent.accesskey") }

retention-messages = { COPY(am_offline, "message.label") }

retention-retain-by-age =
    .label = { COPY(am_offline, "retentionKeepMsg.label") }
    .accesskey = { COPY(am_offline, "retentionKeepMsg.accesskey") }

retention-days-old = { COPY(am_offline, "daysOld.label") }

retention-always-keep-starred =
    .label = { COPY(am_offline, "retentionApplyToFlagged.label") }
    .accesskey = { COPY(am_offline, "retentionApplyToFlagged.accesskey") }

retention-removal-warning = { COPY(prefs, "removeFromServer") }
            """,
            folder_props=folder_props_dtd,
            am_offline=am_offline_dtd,
            prefs=prefs_properties
        ),
    )

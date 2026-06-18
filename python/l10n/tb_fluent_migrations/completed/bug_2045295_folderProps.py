# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY

def migrate(ctx):
    """Bug 2045295 - Migrate folderProps.dtd strings to Fluent, part {index}."""

    # Adjust these paths if your actual comm-central directory structure differs
    target = reference = "mail/messenger/folderprops.ftl"
    source = "mail/chrome/messenger/folderProps.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
folder-props-window-title = { COPY(from_path, "folderProps.windowtitle.label") }

folder-props-general-tab =
    .label = { COPY(from_path, "generalInfo.label") }

folder-props-name =
    .value = { COPY(from_path, "folderProps.name.label") }
    .accesskey = { COPY(from_path, "folderProps.name.accesskey") }

folder-props-color =
    .value = { COPY(from_path, "folderProps.color.label") }
    .accesskey = { COPY(from_path, "folderProps.color.accesskey") }

folder-props-reset-color =
    .tooltiptext = { COPY(from_path, "folderProps.reset.tooltip") }

folder-props-location =
    .value = { COPY(from_path, "folderProps.location.label") }
    .accesskey = { COPY(from_path, "folderProps.location.accesskey") }

folder-props-number-of-messages =
    .value = { COPY(from_path, "numberOfMessages.label") }

folder-props-number-unknown =
    .value = { COPY(from_path, "numberUnknown.label") }

folder-props-size-on-disk =
    .value = { COPY(from_path, "sizeOnDisk.label") }

folder-props-size-unknown =
    .value = { COPY(from_path, "sizeUnknown.label") }

folder-props-rebuild-summary =
    .label = { COPY(from_path, "folderRebuildSummaryFile2.label") }
    .accesskey = { COPY(from_path, "folderRebuildSummaryFile2.accesskey") }
    .tooltiptext = { COPY(from_path, "folderRebuildSummaryFileTip2.label") }

folder-props-include-in-global-search =
    .label = { COPY(from_path, "folderIncludeInGlobalSearch.label") }
    .accesskey = { COPY(from_path, "folderIncludeInGlobalSearch.accesskey") }

folder-props-check-for-new-messages =
    .label = { COPY(from_path, "folderCheckForNewMessages2.label") }
    .accesskey = { COPY(from_path, "folderCheckForNewMessages2.accesskey") }

folder-props-rebuild-summary-explanation = { COPY(from_path, "folderRebuildSummaryFile.explanation") }

folder-props-synchronization-tab =
    .label = { COPY(from_path, "folderSynchronizationTab.label") }

folder-props-select-for-offline =
    .label = { COPY(from_path, "offlineFolder.check.label") }
    .accesskey = { COPY(from_path, "offlineFolder.check.accesskey") }

folder-props-download-now =
    .label = { COPY(from_path, "offlineFolder.button.label") }
    .accesskey = { COPY(from_path, "offlineFolder.button.accesskey") }

folder-props-select-newsgroup-for-offline =
    .label = { COPY(from_path, "selectofflineNewsgroup.check.label") }
    .accesskey = { COPY(from_path, "selectofflineNewsgroup.check.accesskey") }

folder-props-download-newsgroup-now =
    .label = { COPY(from_path, "offlineNewsgroup.button.label") }
    .accesskey = { COPY(from_path, "offlineNewsgroup.button.accesskey") }

folder-props-sharing-tab =
    .label = { COPY(from_path, "folderSharingTab.label") }

folder-props-privileges =
    .label = { COPY(from_path, "privileges.button.label") }
    .accesskey = { COPY(from_path, "privileges.button.accesskey") }

folder-props-permissions =
    .value = { COPY(from_path, "permissionsDesc.label") }

folder-props-other-users =
    .value = { COPY(from_path, "folderOtherUsers.label") }

folder-props-type =
    .value = { COPY(from_path, "folderType.label") }

folder-props-quota-tab =
    .label = { COPY(from_path, "folderQuotaTab.label") }
            """,
            from_path=source,
        )
    )

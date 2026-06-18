# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE
from fluent.migratetb import COPY, REPLACE

title_replacements = {
    "%S": VARIABLE_REFERENCE("folderName"),
    "%1$S": VARIABLE_REFERENCE("folderName"),
}

def migrate(ctx):
    """Bug 2044980 - Migrate virtualFolder properties and list dialog to Fluent, part {index}"""

    target = reference = "mail/messenger/virtualFolderProperties.ftl"
    source_props = "mail/chrome/messenger/virtualFolderProperties.dtd"
    source_list = "mail/chrome/messenger/virtualFolderListDialog.dtd"
    source_messenger = "mail/chrome/messenger/messenger.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
virtual-folder-no-search-folders-selected = { COPY(source_messenger, "alertNoSearchFoldersSelected") }

virtual-folder-properties-title = { COPY(source_props, "virtualFolderProperties.title") }

# Variables:
#   $folderName (String): The name of the saved search folder.
virtual-folder-properties-edit-title = { REPLACE(source_messenger, "editVirtualFolderPropertiesTitle", title_replacements) }

virtual-folder-name = { COPY(source_props, "name.label") }
    .accesskey = { COPY(source_props, "name.accesskey") }

virtual-folder-description = { COPY(source_props, "description.label") }
    .accesskey = { COPY(source_props, "description.accesskey") }

virtual-folder-folder-selection-caption = { COPY(source_props, "folderSelectionCaption.label") }

virtual-folder-choose-folders-button =
    .label = { COPY(source_props, "chooseFoldersButton.label") }
    .accesskey = { COPY(source_props, "chooseFoldersButton.accesskey") }

virtual-folder-search-online =
    .label = { COPY(source_props, "searchOnline.label") }
    .accesskey = { COPY(source_props, "searchOnline.accesskey") }

virtual-folder-search-term-caption = { COPY(source_props, "searchTermCaption.label") }

virtual-folder-accept-button-create =
    .label = { COPY(source_props, "newFolderButton.label") }
    .accesskey = { COPY(source_props, "newFolderButton.accesskey") }

virtual-folder-accept-button-update =
    .label = { COPY(source_props, "editFolderButton.label") }
    .accesskey = { COPY(source_props, "editFolderButton.accesskey") }

virtual-folder-list-title = { COPY(source_list, "virtualFolderListTitle.title") }

virtual-folder-list-desc = { COPY(source_list, "virtualFolderDesc.label") }
            """,
            source_props=source_props,
            source_list=source_list,
            source_messenger=source_messenger,
            title_replacements=title_replacements,
        ),
    )

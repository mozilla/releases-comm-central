# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, TERM_REFERENCE

def migrate(ctx):
    """Bug 2012697 - Migrate FilterListDialog to Fluent. part {index}"""

    target = reference = "mail/messenger/filterEditor.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
filter-window-title = {COPY(dtd, "window.title")}

filter-name-column =
    .label = {COPY(dtd, "nameColumn.label")}

filter-active-column =
    .label = {COPY(dtd, "activeColumn.label")}

filter-new-button =
    .label = {COPY(dtd, "newButton.label")}
    .accesskey = {COPY(dtd, "newButton.accesskey")}

filter-new-copy-button =
    .label = {COPY(dtd, "newButton.popupCopy.label")}
    .accesskey = {COPY(dtd, "newButton.popupCopy.accesskey")}

filter-edit-button =
    .label = {COPY(dtd, "editButton.label")}
    .accesskey = {COPY(dtd, "editButton.accesskey")}

filter-delete-button =
    .label = {COPY(dtd, "deleteButton.label")}
    .accesskey = {COPY(dtd, "deleteButton.accesskey")}

filter-reorder-top-button =
    .label = {COPY(dtd, "reorderTopButton")}
    .accesskey = {COPY(dtd, "reorderTopButton.accessKey")}
    .tooltiptext = {COPY(dtd, "reorderTopButton.toolTip")}

filter-reorder-up-button =
    .label = {COPY(dtd, "reorderUpButton.label")}
    .accesskey = {COPY(dtd, "reorderUpButton.accesskey")}

filter-reorder-down-button =
    .label = {COPY(dtd, "reorderDownButton.label")}
    .accesskey = {COPY(dtd, "reorderDownButton.accesskey")}

filter-reorder-bottom-button =
    .label = {COPY(dtd, "reorderBottomButton")}
    .accesskey = {COPY(dtd, "reorderBottomButton.accessKey")}
    .tooltiptext = {COPY(dtd, "reorderBottomButton.toolTip")}

filter-header-label =
    .value = {COPY(dtd, "filterHeader.label")}

filter-filters-for-prefix =
    .value = {COPY(dtd, "filtersForPrefix.label")}
    .accesskey = {COPY(dtd, "filtersForPrefix.accesskey")}

filter-view-log-button =
    .label = {COPY(dtd, "viewLogButton.label")}
    .accesskey = {COPY(dtd, "viewLogButton.accesskey")}

filter-run-filters-button =
    .label = {COPY(dtd, "runFilters.label")}
    .accesskey = {COPY(dtd, "runFilters.accesskey")}

filter-folder-picker-prefix =
    .value = {COPY(dtd, "folderPickerPrefix.label")}
    .accesskey = {COPY(dtd, "folderPickerPrefix.accesskey")}

filter-search-box =
    .placeholder = {COPY(dtd, "searchBox.emptyText")}

filter-close-key =
    .key = {COPY(dtd, "closeCmd.key")}
            """,
            dtd="mail/chrome/messenger/FilterListDialog.dtd",
        ),
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
filter-delete-confirmation = {COPY(prop, "deleteFilterConfirmation")}

filter-dont-warn-delete-checkbox = {COPY(prop, "dontWarnAboutDeleteCheckbox")}

filter-cannot-enable-incompatible = {REPLACE(prop, "cannotEnableIncompatFilter", replacement)}

filter-running-title = {COPY(prop, "promptTitle")}

filter-running-message = {COPY(prop, "promptMsg")}

filter-stop-button = {COPY(prop, "stopButtonLabel")}

filter-continue-button = {COPY(prop, "continueButtonLabel")}
            """,
            prop="mail/chrome/messenger/filter.properties",
            replacement={
                "%S": TERM_REFERENCE("brand-product-name"),
                "%1$S": TERM_REFERENCE("brand-product-name")
            },
        ),
    )

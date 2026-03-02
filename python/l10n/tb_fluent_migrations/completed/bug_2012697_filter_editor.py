# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

def migrate(ctx):
    """Bug 2012697 - Migrate FilterEditor and Search Widgets to Fluent. part {index}"""

    target_editor = reference_editor = "mail/messenger/filterEditor.ftl"

    ctx.add_transforms(
        target_editor,
        reference_editor,
        transforms_from(
            """
filter-editor-window-title = {COPY(dtd, "window.title")}

filter-editor-name =
    .value = {COPY(dtd, "filterName.label")}
    .accesskey = {COPY(dtd, "filterName.accesskey")}

filter-editor-context-desc = {COPY(dtd, "contextDesc.label")}

filter-editor-context-incoming =
    .label = {COPY(dtd, "contextIncomingMail.label")}
    .accesskey = {COPY(dtd, "contextIncomingMail.accesskey")}

filter-editor-context-manual =
    .label = {COPY(dtd, "contextManual.label")}
    .accesskey = {COPY(dtd, "contextManual.accesskey")}

filter-editor-context-outgoing =
    .label = {COPY(dtd, "contextOutgoing.label")}
    .accesskey = {COPY(dtd, "contextOutgoing.accesskey")}

filter-editor-context-archive =
    .label = {COPY(dtd, "contextArchive.label")}
    .accesskey = {COPY(dtd, "contextArchive.accesskey")}

filter-editor-action-desc =
    .value = {COPY(dtd, "filterActionDesc.label")}
    .accesskey = {COPY(dtd, "filterActionDesc.accesskey")}

filter-editor-action-order-warning =
    .value = {COPY(dtd, "filterActionOrderWarning.label")}

filter-editor-action-order-link =
    .value = {COPY(dtd, "filterActionOrder.label")}
""",
            dtd="mail/chrome/messenger/FilterEditor.dtd",
        ),
    )

    ctx.add_transforms(
        target_editor,
        reference_editor,
        transforms_from(
            """
filter-editor-duplicate-title = {COPY(prop, "cannotHaveDuplicateFilterTitle")}
filter-editor-duplicate-msg = {COPY(prop, "cannotHaveDuplicateFilterMessage")}
filter-editor-no-event-title = {COPY(prop, "mustHaveFilterTypeTitle")}
filter-editor-no-event-msg = {COPY(prop, "mustHaveFilterTypeMessage")}
filter-editor-match-all-name = {COPY(prop, "matchAllFilterName")}

filter-editor-copy-name = {REPLACE(prop, "copyToNewFilterName", replacement_copy_name)}

filter-editor-invalid-search-title = {COPY(prop, "searchTermsInvalidTitle")}

filter-editor-invalid-search-rule = {REPLACE(prop, "searchTermsInvalidRule", replacement_invalid_search_rule)}
filter-editor-action-order-explanation = {COPY(prop, "filterActionOrderExplanation")}

filter-editor-action-order-title = {COPY(prop, "filterActionOrderTitle")}

filter-editor-action-item = {REPLACE(prop, "filterActionItem", replacement_action_item)}

filter-editor-auto-name = {REPLACE(prop, "filterAutoNameStr", replacement_auto_name)}
            """,
            prop="mail/chrome/messenger/filter.properties",
            replacement_copy_name = {
                "%S": VARIABLE_REFERENCE("name"),
                "%1$S": VARIABLE_REFERENCE("name")
            },
            replacement_invalid_search_rule={
                "%1$S": VARIABLE_REFERENCE("attribute"),
                "%2$S": VARIABLE_REFERENCE("operator")
            },
            replacement_action_item={
                "%1$S": VARIABLE_REFERENCE("number"),
                "%2$S": VARIABLE_REFERENCE("action"),
                "%3$S": VARIABLE_REFERENCE("argument")
            },
            replacement_auto_name={
                "%1$S": VARIABLE_REFERENCE("attribute"),
                "%2$S": VARIABLE_REFERENCE("operator"),
                "%3$S": VARIABLE_REFERENCE("value")
            }
        ),
    )

    target_widgets = reference_widgets = "mail/messenger/searchWidgets.ftl"

    ctx.add_transforms(
        target_widgets,
        reference_widgets,
        transforms_from(
            """
search-remove-rule-button-2 =
    .label = −
    .tooltiptext = {COPY_PATTERN(widgets_ftl, "search-remove-rule-button.tooltiptext")}

rule-action-move =
    .label = {COPY(dtd, "moveMessage.label")}

rule-action-copy =
    .label = {COPY(dtd, "copyMessage.label")}

rule-action-forward =
    .label = {COPY(dtd, "forwardTo.label")}

rule-action-reply =
    .label = {COPY(dtd, "replyWithTemplate.label")}

rule-action-read =
    .label = {COPY(dtd, "markMessageRead.label")}

rule-action-unread =
    .label = {COPY(dtd, "markMessageUnread.label")}

rule-action-star =
    .label = {COPY(dtd, "markMessageStarred.label")}

rule-action-priority =
    .label = {COPY(dtd, "setPriority.label")}

rule-action-tag =
    .label = {COPY(dtd, "addTag.label")}

rule-action-set-spam-status =
    .label = {COPY_PATTERN(source_ftl, "rule-action-set-spam-status.label")}

rule-action-delete =
    .label = {COPY(dtd, "deleteMessage.label")}

rule-action-delete-pop =
    .label = {COPY(dtd, "deleteFromPOP.label")}

rule-action-fetch-pop =
    .label = {COPY(dtd, "fetchFromPOP.label")}

rule-action-ignore-thread =
    .label = {COPY(dtd, "ignoreThread.label")}

rule-action-ignore-subthread =
    .label = {COPY(dtd, "ignoreSubthread.label")}

rule-action-watch-thread =
    .label = {COPY(dtd, "watchThread.label")}

rule-action-stop =
    .label = {COPY(dtd, "stopExecution.label")}

rule-menuitem-spam =
    .label = {COPY_PATTERN(source_ftl, "rule-menuitem-spam.label")}

rule-menuitem-not-spam =
    .label = {COPY_PATTERN(source_ftl, "rule-menuitem-not-spam.label")}

rule-priority-highest =
    .label = {COPY(dtd, "highestPriorityCmd.label")}

rule-priority-high =
    .label = {COPY(dtd, "highPriorityCmd.label")}

rule-priority-normal =
    .label = {COPY(dtd, "normalPriorityCmd.label")}

rule-priority-low =
    .label = {COPY(dtd, "lowPriorityCmd.label")}

rule-priority-lowest =
    .label = {COPY(dtd, "lowestPriorityCmd.label")}

rule-add-action-button =
    .label = +
    .tooltiptext = {COPY(dtd, "addAction.tooltip")}

rule-remove-action-button =
    .label = −
    .tooltiptext = {COPY(dtd, "removeAction.tooltip")}
            """,
            dtd="mail/chrome/messenger/FilterEditor.dtd",
            source_ftl="mail/messenger/filterEditor.ftl",
            widgets_ftl=reference_widgets
        ),
    )

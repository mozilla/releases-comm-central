# coding=utf8

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migrate.helpers import (
    MESSAGE_REFERENCE,
    VARIABLE_REFERENCE,
    transforms_from,
)
from fluent.migrate.transforms import (
    CONCAT,
    PLURALS,
    REPLACE,
    REPLACE_IN_TEXT,
    Transform,
)


def migrate(ctx):
    """Bug 1806567 - Migrate Quick Filter Bar strings from DTD to FTL, part {index}"""

    source = "mail/chrome/messenger/quickFilterBar.dtd"
    target1 = reference1 = "mail/messenger/about3Pane.ftl"
    ctx.add_transforms(
        target1,
        reference1,
        transforms_from(
            """

quick-filter-bar-sticky =
    .title = { COPY(from_path, "quickFilterBar.sticky.tooltip") }
quick-filter-bar-unread =
    .title = { COPY(from_path, "quickFilterBar.unread.tooltip") }
quick-filter-bar-unread-label = { COPY(from_path, "quickFilterBar.unread.label") }
quick-filter-bar-starred =
    .title = { COPY(from_path, "quickFilterBar.starred.tooltip") }
quick-filter-bar-starred-label = { COPY(from_path, "quickFilterBar.starred.label") }
quick-filter-bar-inaddrbook =
    .title = { COPY(from_path, "quickFilterBar.inaddrbook.tooltip") }
quick-filter-bar-inaddrbook-label = { COPY(from_path, "quickFilterBar.inaddrbook.label") }
quick-filter-bar-tags =
    .title = { COPY(from_path, "quickFilterBar.tags.tooltip") }
quick-filter-bar-tags-label = { COPY(from_path, "quickFilterBar.tags.label") }
quick-filter-bar-attachment =
    .title = { COPY(from_path, "quickFilterBar.attachment.tooltip") }
quick-filter-bar-attachment-label = { COPY(from_path, "quickFilterBar.attachment.label") }
quick-filter-bar-no-results = { COPY(from_path, "quickFilterBar.resultsLabel.none") }
""",
            from_path=source,
        ),
    )
    ctx.add_transforms(
        target1,
        reference1,
        [
            FTL.Message(
                id=FTL.Identifier("quick-filter-bar-results"),
                value=PLURALS(
                    source,
                    "quickFilterBar.resultsLabel.some.formatString",
                    VARIABLE_REFERENCE("count"),
                    lambda text: REPLACE_IN_TEXT(text, {"#1": VARIABLE_REFERENCE("count")}),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("quick-filter-bar-textbox-shortcut"),
                value=Transform.pattern_of(
                    FTL.SelectExpression(
                        selector=FTL.FunctionReference(
                            id=FTL.Identifier("PLATFORM"),
                            arguments=FTL.CallArguments(),
                        ),
                        variants=[
                            FTL.Variant(
                                key=FTL.Identifier("macos"),
                                default=False,
                                value=REPLACE(
                                    source,
                                    "quickFilterBar.textbox.emptyText.keyLabel2.mac",
                                    {
                                        "<": FTL.TextElement(""),
                                        "⇧⌘": FTL.TextElement("⇧ ⌘ "),
                                        ">": FTL.TextElement(""),
                                    },
                                ),
                            ),
                            FTL.Variant(
                                key=FTL.Identifier("other"),
                                default=True,
                                value=REPLACE(
                                    source,
                                    "quickFilterBar.textbox.emptyText.keyLabel2.nonmac",
                                    {
                                        "<": FTL.TextElement(""),
                                        ">": FTL.TextElement(""),
                                    },
                                ),
                            ),
                        ],
                    )
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("quick-filter-bar-textbox"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("placeholder"),
                        value=REPLACE(
                            source,
                            "quickFilterBar.textbox.emptyText.base1",
                            {
                                "#1": CONCAT(
                                    FTL.TextElement("<"),
                                    MESSAGE_REFERENCE("quick-filter-bar-textbox-shortcut"),
                                    FTL.TextElement(">"),
                                )
                            },
                        ),
                    ),
                ],
            ),
        ],
    )
    ctx.add_transforms(
        target1,
        reference1,
        transforms_from(
            """
quick-filter-bar-boolean-mode =
    .title = { COPY(from_path, "quickFilterBar.booleanMode.tooltip") }
quick-filter-bar-boolean-mode-any =
    .label = { COPY(from_path, "quickFilterBar.booleanModeAny.label") }
    .title = { COPY(from_path, "quickFilterBar.booleanModeAny.tooltip") }
quick-filter-bar-boolean-mode-all =
    .label = { COPY(from_path, "quickFilterBar.booleanModeAll.label") }
    .title = { COPY(from_path, "quickFilterBar.booleanModeAll.tooltip") }
quick-filter-bar-text-filter-explanation = { COPY(from_path, "quickFilterBar.textFilter.explanation.label") }
quick-filter-bar-text-filter-sender = { COPY(from_path, "quickFilterBar.textFilter.sender.label") }
quick-filter-bar-text-filter-recipients = { COPY(from_path, "quickFilterBar.textFilter.recipients.label") }
quick-filter-bar-text-filter-subject = { COPY(from_path, "quickFilterBar.textFilter.subject.label") }
quick-filter-bar-text-filter-body = { COPY(from_path, "quickFilterBar.textFilter.body.label") }
quick-filter-bar-gloda-upsell-line1 = { COPY(from_path, "quickFilterBar.glodaUpsell.continueSearch") }
""",
            from_path=source,
        ),
    )
    ctx.add_transforms(
        target1,
        reference1,
        [
            FTL.Message(
                id=FTL.Identifier("quick-filter-bar-gloda-upsell-line2"),
                value=REPLACE(
                    source,
                    "quickFilterBar.glodaUpsell.pressEnterAndCurrent",
                    {
                        "#1": VARIABLE_REFERENCE("text"),
                        " '": FTL.TextElement(" ‘"),
                        "' ": FTL.TextElement("’ "),
                    },
                ),
            ),
        ],
    )

    target2 = reference2 = "mail/messenger/messenger.ftl"
    ctx.add_transforms(
        target2,
        reference2,
        transforms_from(
            """
quick-filter-bar-toggle =
  .label = { COPY(from_path, "quickFilterBar.toggleBarVisibility.menu.label") }
  .accesskey = { COPY(from_path, "quickFilterBar.toggleBarVisibility.menu.accesskey") }
quick-filter-bar-show =
  .key = { COPY(from_path, "quickFilterBar.show.key2") }
""",
            from_path=source,
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.transforms import COPY, REPLACE


def migrate(ctx):
    """Bug 1823084 - Migrate Junk properties strings to Spam fluent strings, part {index}"""

    filter_properties = "mail/chrome/messenger/filter.properties"
    mailviews_properties = "mail/chrome/messenger/mailviews.properties"

    ctx.add_transforms(
        "mail/messenger/filterEditor.ftl",
        "mail/messenger/filterEditor.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("moved-message-log"),
                value=REPLACE(
                    filter_properties,
                    "logMoveStr",
                    {
                        "%1$S": VARIABLE_REFERENCE("id"),
                        "%2$S": VARIABLE_REFERENCE("folder"),
                    },
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/mailViews.ftl",
        "mail/messenger/mailViews.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("mail-view-known-people"),
                value=COPY(
                    mailviews_properties,
                    "mailViewPeopleIKnow",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("mail-view-recent"),
                value=COPY(
                    mailviews_properties,
                    "mailViewRecentMail",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("mail-view-last-five-days"),
                value=COPY(
                    mailviews_properties,
                    "mailViewLastFiveDays",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("mail-view-has-attachments"),
                value=COPY(
                    mailviews_properties,
                    "mailViewHasAttachments",
                ),
            ),
        ],
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import TERM_REFERENCE, transforms_from, VARIABLE_REFERENCE
from fluent.migratetb.transforms import REPLACE


def migrate(ctx):
    """Bug 1498052 - Remove account dialog, part {index}"""

    ctx.add_transforms(
        "mail/messenger/removeAccount.ftl",
        "mail/messenger/removeAccount.ftl",
        transforms_from(
            """
remove-account-dialog-title = { COPY(dtd_path, "dialogTitle") }

remove-account-dialog-accept =
    .label = { COPY(dtd_path, "removeButton.label") }
    .accesskey = { COPY(dtd_path, "removeButton.accesskey") }

remove-account-checkbox =
    .label = { COPY(dtd_path, "removeAccount.label") }
    .accesskey = { COPY(dtd_path, "removeAccount.accesskey") }

remove-data-checkbox =
    .label = { COPY(dtd_path, "removeData.label") }
    .accesskey = { COPY(dtd_path, "removeData.accesskey") }

remove-chat-data-checkbox =
    .label = { COPY(dtd_path, "removeDataChat.label") }
    .accesskey = { COPY(dtd_path, "removeDataChat.accesskey") }

remove-data-server-account-description = { COPY(dtd_path, "removeDataServerAccount.desc") }

remove-data-chat-account-description = { COPY(dtd_path, "removeDataChatAccount.desc") }

show-data-button =
    .label = { COPY(dtd_path, "showData.label") }
    .accesskey = { COPY(dtd_path, "showData.accesskey") }
            """,
            dtd_path="mail/chrome/messenger/removeAccount.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/removeAccount.ftl",
        "mail/messenger/removeAccount.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("remove-account-question"),
                value=REPLACE(
                    "mail/chrome/messenger/removeAccount.properties",
                    "removeQuestion",
                    {"%1$S": VARIABLE_REFERENCE("accountName")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("remove-account-description"),
                value=REPLACE(
                    "mail/chrome/messenger/removeAccount.dtd",
                    "removeAccount.desc",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("remove-data-local-account-description"),
                value=REPLACE(
                    "mail/chrome/messenger/removeAccount.dtd",
                    "removeDataLocalAccount.desc",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
        ],
    )

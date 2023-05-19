# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE


def migrate(ctx):
    """Bug 1830004 - Migrate a quota string, part {index}."""

    ctx.add_transforms(
        "mail/messenger/folderprops.ftl",
        "mail/messenger/folderprops.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("quota-percent-used"),
                value=REPLACE(
                    "mail/chrome/messenger/messenger.properties",
                    "quotaPercentUsed",
                    {
                        "%1$S": VARIABLE_REFERENCE("percent"),
                    },
                    normalize_printf=True,
                ),
            ),
        ],
    )

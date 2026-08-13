# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.transforms import COPY_PATTERN


def migrate(ctx):
    """Bug 2060734 - Stop using moz-support-link, part {index}"""

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("remote-content-privacy-info"),
                value=COPY_PATTERN(
                    "mail/messenger/preferences/preferences.ftl",
                    "remote-content-info.value",
                ),
            )
        ],
    )

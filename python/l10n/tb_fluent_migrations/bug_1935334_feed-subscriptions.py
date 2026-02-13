#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 1935334 - Migrate feed-subscriptions from PluralForm.sys.mjs, part {index}."""

    source = "mail/chrome/messenger-newsblog/newsblog.properties"
    target = reference = "mail/messenger/feeds.ftl"
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("subscribe-opml-import-unique-feeds"),
                value=PLURALS(
                    source,
                    "subscribe-OPMLImportUniqueFeeds",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("subscribe-opml-import-found-feeds"),
                value=PLURALS(
                    source,
                    "subscribe-OPMLImportFoundFeeds",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("subscribe-opml-import-feed-count"),
                value=PLURALS(
                    source,
                    "subscribe-OPMLImportFeedCount",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("count"),
                            }
                        ),
                    ),
                ),
            )
        ],
    )

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

    source = "mail/chrome/messenger/multimessageview.properties"
    target = reference = "mail/messenger/multimessageview.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("num-conversations"),
                value=PLURALS(
                    source,
                    "numConversations",
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
                id=FTL.Identifier("at-least-num-conversations"),
                value=PLURALS(
                    source,
                    "atLeastNumConversations",
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
                id=FTL.Identifier("num-messages"),
                value=PLURALS(
                    source,
                    "numMessages",
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
                id=FTL.Identifier("num-unread"),
                value=PLURALS(
                    source,
                    "numUnread",
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
                id=FTL.Identifier("num-ignored"),
                value=PLURALS(
                    source,
                    "numIgnored",
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
                id=FTL.Identifier("at-least-num-ignored"),
                value=PLURALS(
                    source,
                    "atLeastNumIgnored",
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
        transforms_from(
            """
no-subject = {COPY(from_path, "noSubject")}
""",
            from_path=source,
        ),
     )
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
messages-total-size = {REPLACE(from_path, "messagesTotalSize", replacements)}
messages-total-size-more-than= {REPLACE(from_path, "messagesTotalSizeMoreThan", replacements)}
""",
            from_path=source,
            replacements=dict(
                {
                    "#1": VARIABLE_REFERENCE("numBytes"),
                }
            ),
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
max-count-exceeded = {REPLACE(from_path, "maxCountExceeded", replacements)}
max-thread-count-exceeded = {REPLACE(from_path, "maxThreadCountExceeded", replacements)}
""",
            from_path=source,
            replacements=dict(
                {
                    "#1": VARIABLE_REFERENCE("total"),
                    "#2": VARIABLE_REFERENCE("shown"),
                }
            ),
        ),
    )

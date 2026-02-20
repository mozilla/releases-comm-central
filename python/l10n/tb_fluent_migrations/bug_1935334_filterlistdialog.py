#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 1935334 - Remove usage of PluralForm.sys.mjs from filterlistdialog, part {index}."""

    source = "mail/chrome/messenger/filter.properties"
    target = reference = "mail/messenger/filterEditor.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("filter-count-items"),
                value=PLURALS(
                    source,
                    "filterCountItems",
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
                id=FTL.Identifier("filter-count-visible-of-total"),
                value=REPLACE(
                    source,
                    "filterCountVisibleOfTotal",
                    {
                        "%1$S": VARIABLE_REFERENCE("visible"),
                        "%2$S": VARIABLE_REFERENCE("total"),
                    },
                ),
            )
        ],
    )

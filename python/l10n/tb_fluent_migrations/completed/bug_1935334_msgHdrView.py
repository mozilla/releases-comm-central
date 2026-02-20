#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 1935334 - Migrate msgHdrView from PluralForm.sys.mjs, part {index}."""

    source = "mail/chrome/messenger/messenger.properties"
    target = reference = "mail/messenger/messenger.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("attachment-view-attachment-count"),
                value=PLURALS(
                    source,
                    "attachmentCount",
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
                id=FTL.Identifier("allow-remote-content-resource"),
                attributes=[
                    FTL.Attribute(
                       id=FTL.Identifier("label"),
                       value=PLURALS(
                          source,
                          "remoteAllowResource",
                          VARIABLE_REFERENCE("count"),
                          foreach=lambda n: REPLACE_IN_TEXT(
                              n,
                              dict(
                                {
                                    "%S": VARIABLE_REFERENCE("origin"),
                                },
                              ),
                          ),
                       )
                    ),
                ],
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("remote-content-option-allow-all"),
                attributes=[
                    FTL.Attribute(
                       id=FTL.Identifier("label"),
                       value=PLURALS(
                          source,
                          "remoteAllowAll",
                          VARIABLE_REFERENCE("count"),
                          foreach=lambda n: REPLACE_IN_TEXT(
                              n,
                              dict(
                                {
                                    "%S": VARIABLE_REFERENCE("origin"),
                                    "#1": VARIABLE_REFERENCE("count"),
                                },
                              ),
                          ),
                       )
                    ),
                ],
            )
        ],
    )

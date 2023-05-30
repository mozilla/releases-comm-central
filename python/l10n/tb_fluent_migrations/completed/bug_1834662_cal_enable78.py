#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE
from fluent.migratetb.transforms import COPY


def migrate(ctx):
    """Bug 1834662 - Migrate calendar enable button, part {index}."""
    target = reference = "calendar/calendar/calendar-widgets.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("calendar-enable-button"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.sideloadEnable.label",
                ),
            ),
        ],
    )

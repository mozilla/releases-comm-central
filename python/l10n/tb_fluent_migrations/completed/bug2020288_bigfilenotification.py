#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, TERM_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT, COPY


def migrate(ctx):
    """Bug 2020288 - Fix migration of big-file-notification , part {index}."""

    source = target = reference = "mail/messenger/messengercompose/messengercompose.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
big-file-notification-text =
    { COPY_PATTERN(from_path, "big-file-notification.label") }
""",
            from_path=source,
        ),
    )

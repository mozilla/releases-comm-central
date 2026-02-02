#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE

def migrate(ctx):
    """Bug 1952231 - Migrate img priority to correct format, part {index}."""

    target = reference = source = "calendar/calendar/calendar.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
status-priority-img-high-priority =
    .alt = {COPY_PATTERN(from_path, "high-priority")}

status-priority-img-normal-priority =
    .alt = {COPY_PATTERN(from_path, "normal-priority")}

status-priority-img-low-priority =
    .alt = {COPY_PATTERN(from_path, "low-priority")}
""",
            from_path=source,
        ),
    )

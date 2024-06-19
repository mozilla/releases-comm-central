# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 6. part {index}"""
    target = reference = "calendar/calendar/categories.ftl"
    source = "calendar/chrome/calendar/categories.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
categories2 = {COPY(from_path, "categories2")}

""",
            from_path=source,
        ),
    )

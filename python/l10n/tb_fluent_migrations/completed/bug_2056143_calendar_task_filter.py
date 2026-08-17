# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

import fluent.syntax.ast as FTL
from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.transforms import TransformPattern


class REMOVE_FILTER_COUNT_PLACEHOLDER(TransformPattern):
    def visit_TextElement(self, node):
        node.value = re.sub(r"\s*#1\s*", " ", node.value).strip()
        return node


def migrate(ctx):
    """Bug 2056143 - Migrate calendar task filter field Fluent ID, part {index}."""

    target = reference = "calendar/calendar/calendar.ftl"

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("calendar-task-input-filter-field"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("aria-label"),
                        value=REMOVE_FILTER_COUNT_PLACEHOLDER(
                            target, "calendar-task-text-filter-field.emptytextbase"
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("emptytextbase"),
                        value=COPY_PATTERN(target, "calendar-task-text-filter-field.emptytextbase"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("keylabelnonmac"),
                        value=COPY_PATTERN(target, "calendar-task-text-filter-field.keylabelnonmac"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("keylabelmac"),
                        value=COPY_PATTERN(target, "calendar-task-text-filter-field.keylabelmac"),
                    ),
                ],
            )
        ],
    )

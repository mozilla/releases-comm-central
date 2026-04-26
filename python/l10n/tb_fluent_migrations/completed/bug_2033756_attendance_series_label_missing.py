# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from

def migrate(ctx):
    """Bug 2033756 - Fix attendance series/occurrence label. part {index}"""
    source = target = reference = "calendar/calendar/calendar.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
calendar-context-attendance-occurrence-label =
  .value = {COPY_PATTERN(from_path, "calendar-context-attendance-occurrence.label")}

calendar-context-attendance-all-series-label =
  .value = {COPY_PATTERN(from_path, "calendar-context-attendance-all-series.label")}
            """,
            from_path=source,
        ),
    )

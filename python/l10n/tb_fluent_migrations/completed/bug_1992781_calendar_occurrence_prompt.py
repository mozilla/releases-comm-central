# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1992781 - Migrate calendar-occurrence-prompt.dtd to Fluent. part {index}"""
    from_dtd = "calendar/chrome/calendar/calendar-occurrence-prompt.dtd"
    from_ftl = "calendar/calendar/calendar-occurrence-prompt.ftl"

    ctx.add_transforms(
        "calendar/calendar/calendar-occurrence-prompt.ftl",
        "calendar/calendar/calendar-occurrence-prompt.ftl",
        transforms_from(
            """
button-single-occurrence-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-occurrence-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-single-occurrence-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-occurrence-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-single-occurrence-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-occurrence-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-single-occurrence-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-occurrence-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }

button-multiple-occurrence-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-occurrence-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-multiple-occurrence-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-occurrence-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-multiple-occurrence-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-occurrence-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }
button-multiple-occurrence-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-occurrence-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.occurrence.accesskey") }

button-single-allfollowing-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-allfollowing-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-single-allfollowing-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-allfollowing-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-single-allfollowing-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-allfollowing-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-single-allfollowing-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-allfollowing-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }

button-multiple-allfollowing-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-allfollowing-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-multiple-allfollowing-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-allfollowing-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-multiple-allfollowing-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-allfollowing-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }
button-multiple-allfollowing-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-allfollowing-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.allfollowing.accesskey") }

button-single-parent-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-parent-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-single-parent-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-parent-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-single-parent-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-parent-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-single-parent-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-single-parent-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }

button-multiple-parent-copy =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-parent-copy.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-multiple-parent-cut =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-parent-cut.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-multiple-parent-delete =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-parent-delete.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
button-multiple-parent-edit =
    .label = { COPY_PATTERN(from_ftl, "buttons-multiple-parent-edit.label") }
    .accesskey = { COPY(from_dtd, "buttons.parent.accesskey") }
            """,
            from_dtd=from_dtd,
            from_ftl=from_ftl,
        ),
    )

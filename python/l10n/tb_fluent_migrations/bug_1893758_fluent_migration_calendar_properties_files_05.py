# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 5. part {index}"""
    target = reference = "calendar/calendar/calendar-occurrence-prompt.ftl"
    source = "calendar/chrome/calendar/calendar-occurrence-prompt.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
header-isrepeating-event =
    .label = {COPY(from_path, "header.isrepeating.event.label")}
header-isrepeating-task =
    .label = {COPY(from_path, "header.isrepeating.task.label")}
header-containsrepeating-event =
    .label = {COPY(from_path, "header.containsrepeating.event.label")}
header-containsrepeating-task =
    .label = {COPY(from_path, "header.containsrepeating.task.label")}
header-containsrepeating-mixed =
    .label = {COPY(from_path, "header.containsrepeating.mixed.label")}
windowtitle-event-copy = {COPY(from_path, "windowtitle.event.copy")}
windowtitle-task-copy = {COPY(from_path, "windowtitle.task.copy")}
windowtitle-mixed-copy = {COPY(from_path, "windowtitle.mixed.copy")}
windowtitle-event-cut = {COPY(from_path, "windowtitle.event.cut")}
windowtitle-task-cut = {COPY(from_path, "windowtitle.task.cut")}
windowtitle-mixed-cut = {COPY(from_path, "windowtitle.mixed.cut")}
windowtitle-event-delete = {COPY(from_path, "windowtitle.event.delete")}
windowtitle-task-delete = {COPY(from_path, "windowtitle.task.delete")}
windowtitle-mixed-delete = {COPY(from_path, "windowtitle.mixed.delete")}
windowtitle-event-edit = {COPY(from_path, "windowtitle.event.edit")}
windowtitle-task-edit = {COPY(from_path, "windowtitle.task.edit")}
windowtitle-mixed-edit = {COPY(from_path, "windowtitle.mixed.edit")}
windowtitle-multipleitems =
    .value = {COPY(from_path, "windowtitle.multipleitems")}
buttons-single-occurrence-copy =
    .label = {COPY(from_path, "buttons.single.occurrence.copy.label")}
buttons-single-occurrence-cut =
    .label = {COPY(from_path, "buttons.single.occurrence.cut.label")}
buttons-single-occurrence-delete =
    .label = {COPY(from_path, "buttons.single.occurrence.delete.label")}
buttons-single-occurrence-edit =
    .label = {COPY(from_path, "buttons.single.occurrence.edit.label")}
buttons-multiple-occurrence-copy =
    .label = {COPY(from_path, "buttons.multiple.occurrence.copy.label")}
buttons-multiple-occurrence-cut =
    .label = {COPY(from_path, "buttons.multiple.occurrence.cut.label")}
buttons-multiple-occurrence-delete =
    .label = {COPY(from_path, "buttons.multiple.occurrence.delete.label")}
buttons-multiple-occurrence-edit =
    .label = {COPY(from_path, "buttons.multiple.occurrence.edit.label")}
buttons-single-allfollowing-copy =
    .label = {COPY(from_path, "buttons.single.allfollowing.copy.label")}
buttons-single-allfollowing-cut =
    .label = {COPY(from_path, "buttons.single.allfollowing.cut.label")}
buttons-single-allfollowing-delete =
    .label = {COPY(from_path, "buttons.single.allfollowing.delete.label")}
buttons-single-allfollowing-edit =
    .label = {COPY(from_path, "buttons.single.allfollowing.edit.label")}
buttons-multiple-allfollowing-copy =
    .label = {COPY(from_path, "buttons.multiple.allfollowing.copy.label")}
buttons-multiple-allfollowing-cut =
    .label = {COPY(from_path, "buttons.multiple.allfollowing.cut.label")}
buttons-multiple-allfollowing-delete =
    .label = {COPY(from_path, "buttons.multiple.allfollowing.delete.label")}
buttons-multiple-allfollowing-edit =
    .label = {COPY(from_path, "buttons.multiple.allfollowing.edit.label")}
buttons-single-parent-copy =
    .label = {COPY(from_path, "buttons.single.parent.copy.label")}
buttons-single-parent-cut =
    .label = {COPY(from_path, "buttons.single.parent.cut.label")}
buttons-single-parent-delete =
    .label = {COPY(from_path, "buttons.single.parent.delete.label")}
buttons-single-parent-edit =
    .label = {COPY(from_path, "buttons.single.parent.edit.label")}
buttons-multiple-parent-copy =
    .label = {COPY(from_path, "buttons.multiple.parent.copy.label")}
buttons-multiple-parent-cut =
    .label = {COPY(from_path, "buttons.multiple.parent.cut.label")}
buttons-multiple-parent-delete =
    .label = {COPY(from_path, "buttons.multiple.parent.delete.label")}
buttons-multiple-parent-edit =
    .label = {COPY(from_path, "buttons.multiple.parent.edit.label")}

""",
            from_path=source,
        ),
    )

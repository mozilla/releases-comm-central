# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.transforms import Transform, TransformPattern, PLURALS, REPLACE_IN_TEXT


replacements_label = dict({"%1$S": VARIABLE_REFERENCE("label")})
replacements_unit = dict({"%1$S": VARIABLE_REFERENCE("unit")})
replacements_unit_reminderCustomOrigin = dict(
    {"%1$S": VARIABLE_REFERENCE("unit"), "%2$S": VARIABLE_REFERENCE("reminderCustomOrigin")}
)


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 2. part {index}"""
    target = reference = "calendar/calendar/calendar-alarms.ftl"
    source = "calendar/chrome/calendar/calendar-alarms.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

reminder-custom-title = {REPLACE(from_path, "reminderCustomTitle", replacements_unit_reminderCustomOrigin)}
reminder-title-at-start-event = {COPY(from_path, "reminderTitleAtStartEvent")}
reminder-title-at-start-task = {COPY(from_path, "reminderTitleAtStartTask")}
reminder-title-at-end-event = {COPY(from_path, "reminderTitleAtEndEvent")}
reminder-title-at-end-task = {COPY(from_path, "reminderTitleAtEndTask")}
reminder-snooze-ok-a11y =
    .aria-label = {REPLACE(from_path, "reminderSnoozeOkA11y", replacements_unit)}

reminder-custom-origin-begin-before-event = {COPY(from_path, "reminderCustomOriginBeginBeforeEvent")}
reminder-custom-origin-begin-after-event = {COPY(from_path, "reminderCustomOriginBeginAfterEvent")}
reminder-custom-origin-end-before-event = {COPY(from_path, "reminderCustomOriginEndBeforeEvent")}
reminder-custom-origin-end-after-event = {COPY(from_path, "reminderCustomOriginEndAfterEvent")}
reminder-custom-origin-begin-before-task = {COPY(from_path, "reminderCustomOriginBeginBeforeTask")}
reminder-custom-origin-begin-after-task = {COPY(from_path, "reminderCustomOriginBeginAfterTask")}
reminder-custom-origin-end-before-task = {COPY(from_path, "reminderCustomOriginEndBeforeTask")}
reminder-custom-origin-end-after-task = {COPY(from_path, "reminderCustomOriginEndAfterTask")}
reminder-custom-origin-begin-before-event-dom =
    .label = { reminder-custom-origin-begin-before-event }
reminder-custom-origin-begin-after-event-dom =
    .label = { reminder-custom-origin-begin-after-event }
reminder-custom-origin-end-before-event-dom =
    .label = { reminder-custom-origin-end-before-event }
reminder-custom-origin-end-after-event-dom =
    .label = { reminder-custom-origin-end-after-event }
reminder-custom-origin-begin-before-task-dom =
    .label = { reminder-custom-origin-begin-before-task }
reminder-custom-origin-begin-after-task-dom =
    .label = { reminder-custom-origin-begin-after-task }
reminder-custom-origin-end-before-task-dom =
    .label = { reminder-custom-origin-end-before-task }
reminder-custom-origin-end-after-task-dom =
    .label = { reminder-custom-origin-end-after-task }
""",
            from_path=source,
            replacements_unit=replacements_unit,
            replacements_unit_reminderCustomOrigin=replacements_unit_reminderCustomOrigin,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("reminder-error-max-count-reached-event"),
                value=PLURALS(
                    source,
                    "reminderErrorMaxCountReachedEvent",
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
                id=FTL.Identifier("reminder-error-max-count-reached-task"),
                value=PLURALS(
                    source,
                    "reminderErrorMaxCountReachedTask",
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
        transforms_from(
            """

reminder-readonly-notification = {REPLACE(from_path, "reminderReadonlyNotification", replacements_label)}
reminder-disabled-snooze-button-tooltip =
    .tooltiptext = {COPY(from_path, "reminderDisabledSnoozeButtonTooltip")}

""",
            from_path=source,
            replacements_label=replacements_label,
            replacements_unit=replacements_unit,
            replacements_unit_reminderCustomOrigin=replacements_unit_reminderCustomOrigin,
        ),
    )

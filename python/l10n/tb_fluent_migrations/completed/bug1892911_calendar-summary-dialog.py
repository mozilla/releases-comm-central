#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, COPY


def migrate(ctx):
    """Bug 1892911 - Migrate calendar-summary-dialog to Fluent, part {index}."""

    source = "calendar/chrome/calendar/calendar-event-dialog.properties"

    target = reference = "calendar/calendar/calendar-summary-dialog.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
event-accepted = { COPY(from_path, "eventAccepted") }
event-tentative = { COPY(from_path, "eventTentative") }
event-declined = { COPY(from_path, "eventDeclined") }
event-delegated = { COPY(from_path, "eventDelegated") }
event-needs-action = { COPY(from_path, "eventNeedsAction") }

task-accepted = { COPY(from_path, "taskAccepted") }
task-tentative = { COPY(from_path, "taskTentative") }
task-declined = { COPY(from_path, "taskDeclined") }
task-delegated = { COPY(from_path, "taskDelegated") }
task-needs-action = { COPY(from_path, "taskNeedsAction") }
task-in-progress = { COPY(from_path, "taskInProgress") }
task-completed = { COPY(from_path, "taskCompleted") }
""",
            from_path=source,
        ),
    )

    target = reference = "calendar/calendar/calendar.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
new-event-input =
    .placeholder = { COPY(from_path, "newEvent") }

new-task-input =
    .placeholder = { COPY(from_path, "newTask") }

item-menu-label-event =
    .label = { COPY(from_path, "itemMenuLabelEvent") }
    .accesskey = { COPY(from_path, "itemMenuAccesskeyEvent2") }

item-menu-label-task =
    .label = { COPY(from_path, "itemMenuLabelTask") }
    .accesskey = { COPY(from_path, "itemMenuAccesskeyTask2") }

specify-link-location = { COPY(from_path, "specifyLinkLocation") }
enter-link-location = { COPY(from_path, "enterLinkLocation") }

select-a-file = { COPY(from_path, "selectAFile") }

event-recurrence-forever =
    .label = { COPY(from_path, "eventRecurrenceForeverLabel") }

sendandclose-button =
    .label = { COPY(from_path, "sendandcloseButtonLabel") }
    .tooltiptext = { COPY(from_path, "sendandcloseButtonTooltip") }
saveandsend-button =
    .label = { COPY(from_path, "saveandsendButtonLabel") }
    .tooltiptext = { COPY(from_path, "saveandsendButtonTooltip") }
saveandsend-menu =
    .label = { COPY(from_path, "saveandsendMenuLabel") }
sendandclose-menu =
    .label = { COPY(from_path, "sendandcloseMenuLabel") }

counter-on-previous-version-notification = { COPY(from_path, "counterOnPreviousVersionNotification") }
counter-on-counter-disallowed-notification = { COPY(from_path, "counterOnCounterDisallowedNotification") }
""",
            from_path=source,
        ),
    )

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("attach-via-filelink"),
                value=REPLACE(
                    source,
                    "attachViaFilelink",
                    {"%1$S": VARIABLE_REFERENCE("providerName")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("counter-accepted"),
                value=REPLACE(
                    source,
                    "counterSummaryAccepted",
                    {"%1$S": VARIABLE_REFERENCE("name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("counter-tentative"),
                value=REPLACE(
                    source,
                    "counterSummaryTentative",
                    {"%1$S": VARIABLE_REFERENCE("name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("counter-declined"),
                value=REPLACE(
                    source,
                    "counterSummaryDeclined",
                    {"%1$S": VARIABLE_REFERENCE("name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("counter-delegated"),
                value=REPLACE(
                    source,
                    "counterSummaryDelegated",
                    {"%1$S": VARIABLE_REFERENCE("name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("counter-needs-action"),
                value=REPLACE(
                    source,
                    "counterSummaryNeedsAction",
                    {"%1$S": VARIABLE_REFERENCE("name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("attendees-tab-label"),
                value=REPLACE(
                    source,
                    "attendeesTabLabel",
                    {"%1$S": VARIABLE_REFERENCE("count")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("attachments-tab-label"),
                value=REPLACE(
                    source,
                    "attachmentsTabLabel",
                    {"%1$S": VARIABLE_REFERENCE("count")},
                ),
            ),
        ],
    )

#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT


def migrate(ctx):
    """Bug 1935334 - Migrate calendar PluralForm.sys.mjs, part {index}."""

    source = "calendar/chrome/calendar/calendar-event-dialog.properties"
    target = reference = "calendar/calendar/calendar.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
prompt-remove-attachments-title = {COPY(from_path, "removeCalendarsTitle")}
""",
            from_path=source,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("prompt-remove-attachments-text"),
                comment=FTL.Comment(" $count will be replaced with number of attachments"),
                value=PLURALS(
                    source,
                    "removeAttachmentsText",
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

    target = reference = "calendar/calendar/recurrence.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
recurrence-rule-too-complex = {COPY(from_path, "ruleTooComplexSummary")}
recurrence-every-weekday = { COPY(from_path, "repeatDetailsRuleDaily4") }
recurrence-repeat-ordinal-1 = { COPY(from_path, "repeatOrdinal1Nounclass1") }
recurrence-repeat-ordinal-2 = { COPY(from_path, "repeatOrdinal2Nounclass1") }
recurrence-repeat-ordinal-3 = { COPY(from_path, "repeatOrdinal3Nounclass1") }
recurrence-repeat-ordinal-4 = { COPY(from_path, "repeatOrdinal4Nounclass1") }
recurrence-repeat-ordinal-5 = { COPY(from_path, "repeatOrdinal5Nounclass1") }
recurrence-repeat-ordinal--1 = { COPY(from_path, "repeatOrdinal-1Nounclass1") }
recurrence-monthly-last-day = { COPY(from_path, "monthlyLastDay") }

""",
            from_path=source,
        ),
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("recurrence-daily-every-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "dailyEveryNth",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-weekly-every-nth-on"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "weeklyNthOnNounclass1",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#2": VARIABLE_REFERENCE("interval"),
                                "%1$S": VARIABLE_REFERENCE("weekdays"),
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
                id=FTL.Identifier("recurrence-weekly-every-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "weeklyEveryNth",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-monthly-every-day-of-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "monthlyEveryDayOfNth",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#2": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-ordinal-weekday"),
                comment=FTL.Comment(" $ordinal - ordinal with article"),
                value=REPLACE(
                    source,
                    "ordinalWeekdayOrder",
                    {
                        "%1$S": VARIABLE_REFERENCE("ordinal"),
                        "%2$S": VARIABLE_REFERENCE("weekday"),
                    },
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("recurrence-monthly-every-of-every"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "monthlyEveryOfEveryNounclass1",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("weekdays"),
                                "#2": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-monthly-nth-of-every"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "monthlyRuleNthOfEveryNounclass1",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("weekdays"),
                                "#2": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-monthly-last-day-of-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "monthlyLastDayOfNth",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "#1": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-monthly-days-of-nth-day"),
                comment=FTL.Comment(" $days - day of month or a sequence of days of month, possibly followed by an ordinal symbol"),
                value=PLURALS(
                    source,
                    "monthlyDaysOfNth_day",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("days"),
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
                id=FTL.Identifier("recurrence-monthly-days-of-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "monthlyDaysOfNth",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("monthlyDays"),
                                "#2": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-yearly-nth-on"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "yearlyNthOn",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("month"),
                                "%2$S": VARIABLE_REFERENCE("monthDay"),
                                "#3": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-yearly-every-day-of"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "yearlyEveryDayOf",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("month"),
                                "#2": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-yearly-nth-of-nth"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "yearlyOnEveryNthOfNthNounclass1",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("weekday"),
                                "%2$S": VARIABLE_REFERENCE("month"),
                                "#3": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-yearly-nth-on-nth-of"),
                comment=FTL.Comment(" $interval is a number, the recurrence interval"),
                value=PLURALS(
                    source,
                    "yearlyNthOnNthOfNounclass1",
                    VARIABLE_REFERENCE("interval"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("ordinal"),
                                "%2$S": VARIABLE_REFERENCE("weekday"),
                                "%3$S": VARIABLE_REFERENCE("month"),
                                "#4": VARIABLE_REFERENCE("interval"),
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
                id=FTL.Identifier("recurrence-repeat-count-all-day"),
                value=PLURALS(
                    source,
                    "repeatCountAllDay",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("ruleString"),
                                "%2$S": VARIABLE_REFERENCE("startDate"),
                                "#3": VARIABLE_REFERENCE("count"),
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
                id=FTL.Identifier("recurrence-details-until-all-day"),
                value=REPLACE(
                    source,
                    "repeatDetailsUntilAllDay",
                    {
                        "%1$S": VARIABLE_REFERENCE("ruleString"),
                        "%2$S": VARIABLE_REFERENCE("startDate"),
                        "%3$S": VARIABLE_REFERENCE("untilDate"),
                    },
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("recurrence-details-infinite-all-day"),
                value=REPLACE(
                    source,
                    "repeatDetailsInfiniteAllDay",
                    {
                        "%1$S": VARIABLE_REFERENCE("ruleString"),
                        "%2$S": VARIABLE_REFERENCE("startDate"),
                    },
                ),
            )
        ],
    )
    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("recurrence-repeat-count"),
                value=PLURALS(
                    source,
                    "repeatCount",
                    VARIABLE_REFERENCE("count"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        dict(
                            {
                                "%1$S": VARIABLE_REFERENCE("ruleString"),
                                "%2$S": VARIABLE_REFERENCE("startDate"),
                                "%3$S": VARIABLE_REFERENCE("startTime"),
                                "%4$S": VARIABLE_REFERENCE("endTime"),
                                "#5": VARIABLE_REFERENCE("count"),
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
                id=FTL.Identifier("recurrence-repeat-details-until"),
                value=REPLACE(
                    source,
                    "repeatDetailsUntil",
                    {
                        "%1$S": VARIABLE_REFERENCE("ruleString"),
                        "%2$S": VARIABLE_REFERENCE("startDate"),
                        "%3$S": VARIABLE_REFERENCE("untilDate"),
                        "%4$S": VARIABLE_REFERENCE("startTime"),
                        "%5$S": VARIABLE_REFERENCE("endTime"),
                    },
                ),
            )
        ],
    )

    ctx.add_transforms(
        target,
        reference,
        [
            FTL.Message(
                id=FTL.Identifier("recurrence-repeat-details-infinite"),
                value=REPLACE(
                    source,
                    "repeatDetailsInfinite",
                    {
                        "%1$S": VARIABLE_REFERENCE("ruleString"),
                        "%2$S": VARIABLE_REFERENCE("startDate"),
                        "%3$S":  VARIABLE_REFERENCE("startTime"),
                        "%4$S": VARIABLE_REFERENCE("endTime"),
                    },
                ),
            )
        ],
    )

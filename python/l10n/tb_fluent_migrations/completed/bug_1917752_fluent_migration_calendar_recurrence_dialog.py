# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

replacements_ordinalDay = dict(
    {
        "%1$S": VARIABLE_REFERENCE("ordinal"),
        "%2$S": VARIABLE_REFERENCE("day"),
    }
)
replacements_dayMonthArticle = dict(
    {
        "%1$S": VARIABLE_REFERENCE("day"),
        "%2$S": VARIABLE_REFERENCE("month"),
        "%3$S": VARIABLE_REFERENCE("article"),
    }
)
replacements_ordinalDayArticleMonth = dict(
    {
        "%1$S": VARIABLE_REFERENCE("ordinal"),
        "%2$S": VARIABLE_REFERENCE("day"),
        "%3$S": VARIABLE_REFERENCE("article"),
        "%4$S": VARIABLE_REFERENCE("month"),
    }
)


def migrate(ctx):
    """Bug 1917752 - Migrate the calendar recurrence dialog. part {index}"""
    source = "calendar/chrome/calendar/calendar-event-dialog.properties"

    ctx.add_transforms(
        "calendar/calendar/calendar-recurrence-dialog.ftl",
        "calendar/calendar/calendar-recurrence-dialog.ftl",
        transforms_from(
            """
event-recurrence-monthly-last-day-label =
    .label = {COPY(from_path, "eventRecurrenceMonthlyLastDayLabel")}

monthly-order = {REPLACE(from_path, "monthlyOrder", replacements_ordinalDay)}

yearly-order-day = {REPLACE(from_path, "yearlyOrder", replacements_dayMonthArticle)}

yearly-order-ordinal = {REPLACE(from_path, "yearlyOrder2", replacements_ordinalDayArticleMonth)}
            """,
            from_path=source,
            replacements_ordinalDay=replacements_ordinalDay,
            replacements_dayMonthArticle=replacements_dayMonthArticle,
            replacements_ordinalDayArticleMonth=replacements_ordinalDayArticleMonth,
        ),
    )

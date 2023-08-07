#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

from fluent.migratetb import COPY

import fluent.syntax.ast as FTL


def migrate(ctx):
    """Bug 1844408 - Move unifinder strings from DTD to Fluent, part {index}."""
    source = "calendar/chrome/calendar/calendar.dtd"
    dest = "calendar/calendar/calendar-event-listing.ftl"

    ctx.add_transforms(
        dest,
        dest,
        [
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-close"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.close.tooltip"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-calendar-name"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.calendarname.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.calendarname.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-category"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.categories.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.categories.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-completed"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.done.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.done.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-completed-date"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.completeddate.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.completeddate.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-due-date"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.duedate.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.duedate.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-end-date"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.enddate.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.enddate.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-location"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.location.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.location.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-percent-complete"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.percentcomplete.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.percentcomplete.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-priority"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.priority.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.priority.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-start-date"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.startdate.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.startdate.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-status"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.status.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.status.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-time-until-due"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.duration.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.duration.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-column-title"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.unifinder.tree.title.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("tooltiptext"),
                        value=COPY(source, "calendar.unifinder.tree.title.tooltip2"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-calendar-month"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.thisCalendarMonth.label"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-current-view"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.currentview.label"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-next-7-days"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.next7Days.label"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-next-14-days"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.next14Days.label"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-next-31-days"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.next31Days.label"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("calendar-event-listing-interval-selected-day"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "calendar.events.filter.current.label"),
                    )
                ],
            ),
        ],
    )

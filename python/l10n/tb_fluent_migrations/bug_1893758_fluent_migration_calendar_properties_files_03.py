# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

replacements_locationProperty = dict({"%1$S": VARIABLE_REFERENCE("locationProperty")})
replacements_organizerProperty = dict({"%1$S": VARIABLE_REFERENCE("organizerProperty")})
replacements_attendeeProperty = dict({"%1$S": VARIABLE_REFERENCE("attendeeProperty")})


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 3. part {index}"""
    target = reference = "calendar/calendar/calendar-invitations-dialog.ftl"
    source = "calendar/chrome/calendar/calendar-invitations-dialog.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
allday-event = {COPY(from_path, "allday-event")}
recurrent-event =
    .value = {COPY(from_path, "recurrent-event")}
calendar-invitations-location =
    .value = {REPLACE(from_path, "location", replacements_locationProperty)}
organizer =
    .value = {REPLACE(from_path, "organizer", replacements_organizerProperty)}
calendar-invitations-attendee =
    .value = {REPLACE(from_path, "attendee", replacements_attendeeProperty)}
calendar-invitations-none = {COPY(from_path, "none")}

""",
            from_path=source,
            replacements_locationProperty=replacements_locationProperty,
            replacements_organizerProperty=replacements_organizerProperty,
            replacements_attendeeProperty=replacements_attendeeProperty,
        ),
    )

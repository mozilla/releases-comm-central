# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

replacements_role = dict({"%1$S": VARIABLE_REFERENCE("role")})
replacements_userType = dict({"%1$S": VARIABLE_REFERENCE("userType")})


def migrate(ctx):
    """Bug 1893758 Calendar Fluent Migrations - Properties Part A Files 4. part {index}"""
    target = reference = "calendar/calendar/calendar-event-dialog-attendees.ftl"
    source = "calendar/chrome/calendar/calendar-event-dialog-attendees.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
event-attendee-role-required =
    .title = {COPY(from_path, "event.attendee.role.required")}
event-attendee-role-optional =
    .title = {COPY(from_path, "event.attendee.role.optional")}
event-attendee-role-nonparticipant =
    .title = {COPY(from_path, "event.attendee.role.nonparticipant")}
event-attendee-role-chair =
    .title = {COPY(from_path, "event.attendee.role.chair")}
event-attendee-role-unknown =
    .title = {REPLACE(from_path, "event.attendee.role.unknown", replacements_role)}

event-attendee-usertype-individual = {COPY(from_path, "event.attendee.usertype.individual")}
event-attendee-usertype-group = {COPY(from_path, "event.attendee.usertype.group")}
event-attendee-usertype-resource = {COPY(from_path, "event.attendee.usertype.resource")}
event-attendee-usertype-room  = {COPY(from_path, "event.attendee.usertype.room")}
event-attendee-usertype-unknown = {REPLACE(from_path, "event.attendee.usertype.unknown", replacements_userType)}

""",
            from_path=source,
            replacements_role=replacements_role,
            replacements_userType=replacements_userType,
        ),
    )

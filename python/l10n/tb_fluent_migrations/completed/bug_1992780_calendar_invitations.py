# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1992780 - Migrate calendar-invitations-dialog.dtd to fluent. part {index}"""
    from_calendar = "calendar/chrome/calendar/calendar-invitations-dialog.dtd"

    ctx.add_transforms(
        "calendar/calendar/calendar-invitations-dialog.ftl",
        "calendar/calendar/calendar-invitations-dialog.ftl",
        transforms_from(
            """
calendar-invitations-title = { COPY(from_path, "calendar.invitations.dialog.invitations.text") }
calendar-invitations-status-updating = { COPY(from_path, "calendar.invitations.dialog.statusmessage.updating.text") }
calendar-invitations-status-none = { COPY(from_path, "calendar.invitations.dialog.statusmessage.noinvitations.text") }

calendar-invitations-accept =
    .label = { COPY(from_path, "calendar.invitations.list.accept.button.label") }
calendar-invitations-decline =
    .label = { COPY(from_path, "calendar.invitations.list.decline.button.label") }
            """,
            from_path=from_calendar,
        ),
    )

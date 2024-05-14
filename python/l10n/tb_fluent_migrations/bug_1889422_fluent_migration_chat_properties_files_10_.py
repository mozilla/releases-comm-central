# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

# # $statusType is the status type, $statusMessage is the status message text.
about_replacements = dict(
    {
        "%1$S": VARIABLE_REFERENCE("statusType"),
        "%2$S": VARIABLE_REFERENCE("statusMessage"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 10. part {index}"""
    target = reference = "chat/status.ftl"
    source = "chat/status.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

available-status-type = {COPY(from_path, "availableStatusType")}
away-status-type = {COPY(from_path, "awayStatusType")}
unavailable-status-type = {COPY(from_path, "unavailableStatusType")}
offline-status-type = {COPY(from_path, "offlineStatusType")}
invisible-status-type = {COPY(from_path, "invisibleStatusType")}
idle-status-type = {COPY(from_path, "idleStatusType")}
mobile-status-type = {COPY(from_path, "mobileStatusType")}
unknown-status-type = {COPY(from_path, "unknownStatusType")}
status-with-status-message = {REPLACE(from_path, "statusWithStatusMessage", about_replacements)}
messenger-status-default-idle-away-message = {COPY(from_path, "messenger.status.defaultIdleAwayMessage")}

""",
            from_path=source,
            about_replacements=about_replacements,
        ),
    )

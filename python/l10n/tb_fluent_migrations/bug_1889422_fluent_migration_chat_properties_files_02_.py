# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

about_replacements_command = dict(
    {
        "%1$S": VARIABLE_REFERENCE("command"),
    }
)

about_replacements_command_status = dict(
    {
        "%1$S": VARIABLE_REFERENCE("command"),
        "%2$S": VARIABLE_REFERENCE("status"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 2. part {index}"""
    target = reference = "chat/commands.ftl"
    source = "chat/commands.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

commands-key = {REPLACE(from_path, "commands", about_replacements_command)}
no-command = {REPLACE(from_path, "noCommand", about_replacements_command)}
no-help-key = {REPLACE(from_path, "noHelp", about_replacements_command)}
say-help-string = {COPY(from_path, "sayHelpString")}
raw-help-string = {COPY(from_path, "rawHelpString")}
help-help-string = {COPY(from_path, "helpHelpString")}
status-command = {REPLACE(from_path, "statusCommand", about_replacements_command_status)}
back-key-key = {COPY(from_path, "back")}
away-key-key = {COPY(from_path, "away")}
busy-key-key = {COPY(from_path, "busy")}
dnd-key-key = {COPY(from_path, "dnd")}
offline-key-key = {COPY(from_path, "offline")}

""",
            from_path=source,
            about_replacements_command=about_replacements_command,
            about_replacements_command_status=about_replacements_command_status,
        ),
    )

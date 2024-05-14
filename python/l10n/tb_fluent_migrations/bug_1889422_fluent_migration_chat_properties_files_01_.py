# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.migratetb.helpers
from fluent.migratetb import COPY
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.helpers import VARIABLE_REFERENCE

about_replacements = dict(
    {
        "%1$S": VARIABLE_REFERENCE("accountName"),
    }
)


def migrate(ctx):
    """Bug 1889422. - Chat Fluent Migrations - Properties Files 1. part {index}"""
    target = reference = "chat/accounts-properties.ftl"
    source = "chat/accounts.properties"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """

password-prompt-title = {REPLACE(from_path, "passwordPromptTitle", about_replacements)}
password-prompt-text = {REPLACE(from_path, "passwordPromptText", about_replacements)}
password-prompt-save-checkbox = {COPY(from_path, "passwordPromptSaveCheckbox")}

""",
            from_path=source,
            about_replacements=about_replacements,
        ),
    )

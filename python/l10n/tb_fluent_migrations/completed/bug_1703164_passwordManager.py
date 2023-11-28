# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1703164 - convert mail/components/preferences/passwordManager.xhtml to top level html"""

    target = reference = "mail/messenger/preferences/passwordManager.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
saved-logins-title= {{COPY_PATTERN(from_path, "saved-logins.title")}}
            """,
            from_path="mail/messenger/preferences/passwordManager.ftl",
        ),
    )

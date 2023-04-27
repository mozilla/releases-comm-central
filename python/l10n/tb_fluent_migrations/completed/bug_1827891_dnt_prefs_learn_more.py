# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1827891 - DNT Prefs 'learn more' link fix, part {index}."""

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
dnt-learn-more-button =
    .value = {{ COPY_PATTERN(from_path, "learn-button.label") }}
            """,
            from_path="mail/messenger/preferences/preferences.ftl",
        ),
    )

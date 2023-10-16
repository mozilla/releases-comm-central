# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY_PATTERN


def migrate(ctx):
    """Bug 1857555 - Remove any mention of Firefox accounts in l10n strings, part {index}"""

    ctx.add_transforms(
        "mail/messenger/syncAccount.ftl",
        "mail/messenger/syncAccount.ftl",
        transforms_from(
            """
sync-verification-sent-title = COPY_PATTERN(from_path, "fxa-verification-sent-title")
sync-verification-sent-body = COPY_PATTERN(from_path, "fxa-verification-sent-body")
sync-verification-not-sent-title = COPY_PATTERN(from_path, "fxa-verification-not-sent-title")
sync-verification-not-sent-body = COPY_PATTERN(from_path, "fxa-verification-not-sent-body")
sync-signout-dialog-body = COPY_PATTERN(from_path, "fxa-signout-dialog-body")
sync-signout-dialog-button = COPY_PATTERN(from_path, "fxa-signout-dialog-button")
            """,
            from_path="mail/messenger/firefoxAccount.ftl",
        ),
    )

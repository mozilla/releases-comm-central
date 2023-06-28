# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1831422 - migrations in OpenPGP key backup dialog"""

    target = reference = "mail/messenger/openpgp/backupKeyPassword.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
set-password-window-title = {{COPY_PATTERN(from_path, "set-password-window.title")}}

set-password-backup-pw-label = {{COPY_PATTERN(from_path, "set-password-backup-pw.value")}}

set-password-backup-pw2-label = {{COPY_PATTERN(from_path, "set-password-repeat-backup-pw.value")}}
            """,
            from_path="mail/messenger/openpgp/backupKeyPassword.ftl",
        ),
    )

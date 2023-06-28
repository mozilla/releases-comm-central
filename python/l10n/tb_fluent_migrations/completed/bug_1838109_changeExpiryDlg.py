# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1838109 - migrate some strings in changeExpiryDlg.xhtml"""

    target = reference = "mail/messenger/openpgp/changeExpiryDlg.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
openpgp-change-expiry-title = {{COPY_PATTERN(from_path, "openpgp-change-key-expiry-title.title")}}

expire-no-change-label = {{COPY_PATTERN(from_path, "expire-dont-change.label")}}

expire-in-time-label = {{COPY_PATTERN(from_path, "expire-in-label.label")}}

expire-never-expire-label = {{COPY_PATTERN(from_path, "expire-never-label.label")}}
            """,
            from_path="mail/messenger/openpgp/changeExpiryDlg.ftl",
        ),
    )

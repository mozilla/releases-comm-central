# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1703164 - mail/extensions/openpgp/content/ui/enigmailKeyImportInfo.xhtml to top level html part {index}"""

    target = reference = "mail/messenger/openpgp/openpgp.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
import-info-dialog-title = {{COPY_PATTERN(from_path, "import-info-title.title")}}
            """,
            from_path="mail/messenger/openpgp/openpgp.ftl",
        ),
    )

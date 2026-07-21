#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY_PATTERN

def migrate(ctx):
    """Bug 1958478 - Rebuild the OpenPGP key import info dialog, part {index}."""

    target = reference = "mail/messenger/openpgp/keyImportInfo.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
key-import-info-close =
  .label = { COPY_PATTERN(from_path, "password-close-button.label") }
  .accesskey = { COPY_PATTERN(from_path, "password-close-button.accesskey") }
            """,
            from_path="mail/messenger/preferences/passwordManager.ftl",
        ),
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
import-info-dialog-title = { COPY_PATTERN(from_path, "import-info-dialog-title") }
import-info-created = { COPY_PATTERN(from_path, "import-info-created") }
import-info-fpr = { COPY_PATTERN(from_path, "import-info-fpr") }
import-info-details = { COPY_PATTERN(from_path, "import-info-details") }
import-info-no-keys = { COPY_PATTERN(from_path, "import-info-no-keys") }
            """,
            from_path="mail/messenger/openpgp/openpgp.ftl",
        ),
    )

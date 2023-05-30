#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY


def migrate(ctx):
    """Bug 1827261 - Add enable/disable compact mode options to Folder Mode context menu, part {index}."""

    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
folder-pane-mode-context-toggle-compact-mode =
    .label = { COPY(from_path, "compactVersion.label") }
    .accesskey = { COPY(from_path, "compactVersion.accesskey") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

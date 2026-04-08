#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import transforms_from
from fluent.migratetb.transforms import COPY


def migrate(ctx):
    """Bug 2030225 - Folder pane mode headers, part {index}."""

    ctx.add_transforms(
        "mail/messenger/about3Pane.ftl",
        "mail/messenger/about3Pane.ftl",
        transforms_from(
            """
folder-pane-mode-header-all = { COPY(from_path, "folderPaneModeHeader_all") }

folder-pane-mode-header-unread = { COPY(from_path, "folderPaneModeHeader_unread") }

folder-pane-mode-header-favorite = { COPY(from_path, "folderPaneModeHeader_favorite") }

folder-pane-mode-header-recent = { COPY(from_path, "folderPaneModeHeader_recent") }

folder-pane-mode-header-smart = { COPY(from_path, "folderPaneModeHeader_smart") }

folder-pane-mode-header-tags = { COPY(from_path, "tag") }
            """,
            from_path="mail/chrome/messenger/messenger.properties",
        ),
    )

#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2030867 - Remove the XUL tree from archive options dialog, part {index}."""

    source = target = reference = "mail/messenger/preferences/am-archiveoptions.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
archive-folder-name-label = { COPY_PATTERN(from_path, "archive-folder-name.label") }

inbox-folder-name-label = { COPY_PATTERN(from_path, "inbox-folder-name.label") }

child-folder-name-label = { COPY_PATTERN(from_path, "child-folder-name.label") }

sibling-folder-name-label = { COPY_PATTERN(from_path, "sibling-folder-name.label") }
""",
            from_path=source,
        ),
    )

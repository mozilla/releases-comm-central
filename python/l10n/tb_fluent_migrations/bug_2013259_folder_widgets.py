# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

def migrate(ctx):
    """Bug 2013259 - Migrate folderWidgets.properties to Fluent. part {index}"""

    prop_source = "mail/chrome/messenger/folderWidgets.properties"
    ftl_target = "mail/messenger/folderWidgets.ftl"

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
folder-widgets-global-inbox = { REPLACE(from_path, "globalInbox", replacements_inbox) }
folder-widgets-verbose-folder-format = { REPLACE(from_path, "verboseFolderFormat", replacements_verbose) }
folder-widgets-choose-folder = { COPY(from_path, "chooseFolder") }
folder-widgets-choose-account = { COPY(from_path, "chooseAccount") }
folder-widgets-no-folders = { COPY(from_path, "noFolders") }
            """,
            from_path=prop_source,
            replacements_inbox = {
                "%S": VARIABLE_REFERENCE("name"),
                "%1$S": VARIABLE_REFERENCE("name"),
            },
            replacements_verbose={
                "%1$S": VARIABLE_REFERENCE("folder"),
                "%2$S": VARIABLE_REFERENCE("server"),
            },
        ),
    )

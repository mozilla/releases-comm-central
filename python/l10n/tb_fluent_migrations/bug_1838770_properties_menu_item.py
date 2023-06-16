# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb import COPY

import fluent.syntax.ast as FTL


def migrate(ctx):
    """Bug 1838770 - Edit > Folder Properties doesn't work, part {index}."""
    source = "mail/chrome/messenger/messenger.dtd"
    dest = "mail/messenger/messenger.ftl"
    ctx.add_transforms(
        dest,
        dest,
        [
            FTL.Message(
                id=FTL.Identifier("menu-edit-properties"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"), value=COPY(source, "folderPropsCmd2.label")
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "folderPropsCmd.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("menu-edit-folder-properties"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "folderPropsFolderCmd2.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "folderPropsCmd.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("menu-edit-newsgroup-properties"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(source, "folderPropsNewsgroupCmd2.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "folderPropsCmd.accesskey"),
                    ),
                ],
            ),
        ],
    )

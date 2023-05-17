# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

from fluent.migratetb import COPY, COPY_PATTERN
from fluent.migratetb.helpers import VARIABLE_REFERENCE
from fluent.migratetb.transforms import Transform, TransformPattern

import fluent.syntax.ast as FTL


def migrate(ctx):
    """Bug 1731837 - Fix multiple problems with the labelling of Delete commands, part {index}."""
    source = "mail/chrome/messenger/messenger.dtd"
    dest = "mail/messenger/messenger.ftl"
    ctx.add_transforms(
        dest,
        dest,
        [
            FTL.Message(
                id=FTL.Identifier("menu-edit-delete-folder"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"), value=COPY(source, "deleteFolderCmd.label")
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "deleteFolderCmd.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("menu-edit-delete-messages"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=Transform.pattern_of(
                            FTL.SelectExpression(
                                selector=VARIABLE_REFERENCE("count"),
                                variants=[
                                    FTL.Variant(
                                        key=FTL.Identifier("one"),
                                        value=COPY(source, "deleteMsgCmd.label"),
                                    ),
                                    FTL.Variant(
                                        key=FTL.Identifier("other"),
                                        default=True,
                                        value=COPY(source, "deleteMsgsCmd.label"),
                                    ),
                                ],
                            )
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "deleteMsgCmd.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("menu-edit-undelete-messages"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=Transform.pattern_of(
                            FTL.SelectExpression(
                                selector=VARIABLE_REFERENCE("count"),
                                variants=[
                                    FTL.Variant(
                                        key=FTL.Identifier("one"),
                                        value=COPY(source, "undeleteMsgCmd.label"),
                                    ),
                                    FTL.Variant(
                                        key=FTL.Identifier("other"),
                                        default=True,
                                        value=COPY(source, "undeleteMsgsCmd.label"),
                                    ),
                                ],
                            )
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(source, "undeleteMsgCmd.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("mail-context-undelete-messages"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=Transform.pattern_of(
                            FTL.SelectExpression(
                                selector=VARIABLE_REFERENCE("count"),
                                variants=[
                                    FTL.Variant(
                                        key=FTL.Identifier("one"),
                                        value=COPY(source, "undeleteMsgCmd.label"),
                                    ),
                                    FTL.Variant(
                                        key=FTL.Identifier("other"),
                                        default=True,
                                        value=COPY(source, "undeleteMsgsCmd.label"),
                                    ),
                                ],
                            )
                        ),
                    )
                ],
            ),
        ],
    )

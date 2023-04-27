# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import re

from fluent.migratetb import COPY_PATTERN
from fluent.migratetb.transforms import TransformPattern

import fluent.syntax.ast as FTL


class STRIP_NEWLINES(TransformPattern):
    def visit_TextElement(self, node):
        node.value = re.sub("\n", "", node.value)
        return node


def migrate(ctx):
    """Bug 1828340 - Fix aboutDialog layout issues, part {index}."""
    path = "mail/messenger/aboutDialog.ftl"
    ctx.add_transforms(
        path,
        path,
        [
            FTL.Message(
                id=FTL.Identifier("about-dialog-title"),
                value=COPY_PATTERN(path, "aboutDialog-title.title"),
            ),
            FTL.Message(
                id=FTL.Identifier("community-experimental"),
                value=STRIP_NEWLINES(path, "community-exp"),
            ),
            FTL.Message(
                id=FTL.Identifier("community-desc"),
                value=STRIP_NEWLINES(path, "community-2"),
            ),
            FTL.Message(
                id=FTL.Identifier("about-donation"),
                value=STRIP_NEWLINES(path, "about-helpus"),
            ),
        ],
    )

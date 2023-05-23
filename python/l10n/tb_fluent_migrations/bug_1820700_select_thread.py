# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE


def migrate(ctx):
    """Bug 1820700 - Migrate thread img strings to button, part {index}."""

    ctx.add_transforms(
        "mail/messenger/treeView.ftl",
        "mail/messenger/treeView.ftl",
        transforms_from(
            """
tree-list-view-row-thread-button =
    .title = {COPY_PATTERN(from_path, "tree-list-view-row-thread-icon.title")}

tree-list-view-row-ignored-thread-button =
    .title = {COPY_PATTERN(from_path, "tree-list-view-row-ignored-thread-icon.title")}

tree-list-view-row-ignored-subthread-button =
    .title = {COPY_PATTERN(from_path, "tree-list-view-row-ignored-subthread-icon.title")}

tree-list-view-row-watched-thread-button =
    .title = {COPY_PATTERN(from_path, "tree-list-view-row-watched-thread-icon.title")}
""",
            from_path="mail/messenger/treeView.ftl",
        ),
    )

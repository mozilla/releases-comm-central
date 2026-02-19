# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE, FTL, REPLACE

def migrate(ctx):
    """Bug 2012697 - Migrate filter service alerts to Fluent. part {index}"""

    prop_source = "mail/chrome/messenger/filter.properties"
    ftl_target = "mail/messenger/filterEditor.ftl"

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-list-backup-message = { COPY(from_path, "filterListBackUpMsg") }
            """,
            from_path=prop_source,
        ),
    )

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        [
            FTL.Message(
                id=FTL.Identifier("filter-invalid-custom-header"),
                value=REPLACE(
                    prop_source,
                    "invalidCustomHeader",
                    {
                        "':'": FTL.TextElement("‘:’"),
                    },
                ),
            ),
        ],
    )

    replacements_continue = {
        "%1$S": VARIABLE_REFERENCE("filterName"),
    }

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-continue-execution = { REPLACE(from_path, "continueFilterExecution", replacements) }
            """,
            from_path=prop_source,
            replacements=replacements_continue,
        ),
    )

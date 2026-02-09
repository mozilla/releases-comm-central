# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from, VARIABLE_REFERENCE

def migrate(ctx):
    """Bug 2012697 - Migrate filter log formatting templates to Fluent. part {index}"""

    prop_source = "mail/chrome/messenger/filter.properties"
    ftl_target = "mail/messenger/filterEditor.ftl"

    replacements_line = {
        "%1$S": VARIABLE_REFERENCE("timestamp"),
        "%2$S": VARIABLE_REFERENCE("message"),
    }

    replacements_msg = {
        "%1$S": VARIABLE_REFERENCE("filterName"),
        "%2$S": VARIABLE_REFERENCE("message"),
    }

    ctx.add_transforms(
        ftl_target,
        ftl_target,
        transforms_from(
            """
filter-log-line = { REPLACE(from_path, "filterLogLine", replacements_line) }

filter-log-message = { REPLACE(from_path, "filterMessage", replacements_msg) }
            """,
            from_path=prop_source,
            replacements_line=replacements_line,
            replacements_msg=replacements_msg,
        ),
    )

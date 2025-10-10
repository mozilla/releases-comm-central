# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 1823084 - Migrate Junk dtd strings to Spam fluent strings, part {index}"""

    ctx.add_transforms(
        "mail/messenger/preferences/am-spam.ftl",
        "mail/messenger/preferences/am-spam.ftl",
        transforms_from(
            """
move-message-other =
  .label = { COPY(from_path, "otherFolder.label") }
  .accesskey = { COPY(from_path, "otherFolder.accesskey") }

automatic-spam-purge-label =
  .value = { COPY(from_path, "purge2.label") }

spam-classification-legend = { COPY(from_path, "junkClassification.label") }

spam-actions-legend = { COPY(from_path, "junkActions.label") }
            """,
            from_path="mail/chrome/messenger/am-junk.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/spamLog.ftl",
        "mail/messenger/preferences/spamLog.ftl",
        transforms_from(
            """
clear-log-button =
  .label = { COPY(from_path, "clearLog.label") }
  .accesskey = { COPY(from_path, "clearLog.accesskey") }

spam-log-dialog =
  .buttonlabelaccept = { COPY(from_path, "closeLog.label") }
  .buttonaccesskeyaccept = { COPY(from_path, "closeLog.accesskey") }
            """,
            from_path="mail/chrome/messenger/junkLog.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/messenger.ftl",
        "mail/messenger/messenger.ftl",
        transforms_from(
            """
mark-as-junk-key =
  .key = { COPY(from_path, "markAsJunkCmd.key") }

mark-not-junk-key =
  .key = { COPY(from_path, "markAsNotJunkCmd.key") }
            """,
            from_path="mail/chrome/messenger/messenger.dtd",
        ),
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2001222 - Correctly set l10n attributes for MozSearchValue labels migrated to Fluent. part {index}"""

    source = "mail/messenger/messenger.ftl"
    target = reference = "mail/messenger/searchWidgets.ftl"
    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
search-val-priority-lowest =
  .label = { COPY_PATTERN(from_path, "message-priority-lowest") }

search-val-priority-low =
  .label = { COPY_PATTERN(from_path, "message-priority-low") }

search-val-priority-normal =
  .label = { COPY_PATTERN(from_path, "message-priority-normal") }

search-val-priority-high =
  .label = { COPY_PATTERN(from_path, "message-priority-high") }

search-val-priority-highest =
  .label = { COPY_PATTERN(from_path, "message-priority-highest") }

search-val-flag-replied =
  .label = { COPY_PATTERN(from_path, "message-flag-replied") }

search-val-flag-read =
  .label = { COPY_PATTERN(from_path, "message-flag-read") }

search-val-flag-new =
  .label = { COPY_PATTERN(from_path, "message-flag-new") }

search-val-flag-forwarded =
  .label = { COPY_PATTERN(from_path, "message-flag-forwarded") }

search-val-flag-starred =
  .label = { COPY_PATTERN(from_path, "message-flag-starred") }

search-val-spam =
  .label = { COPY_PATTERN(from_path, "menuitem-label-spam.label") }
            """,
            from_path=source,
        ),
    )

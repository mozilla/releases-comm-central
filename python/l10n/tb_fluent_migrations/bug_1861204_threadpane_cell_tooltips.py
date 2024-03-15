# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY_PATTERN


def migrate(ctx):
    """Bug 1861204 - Ensure tooltip for subject displays in Table View, part {index}"""

    target = source = "mail/messenger/about3Pane.ftl"

    ctx.add_transforms(
        target,
        source,
        transforms_from(
            """
threadpane-cell-subject-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-subject.aria-label") }
  .title = { $title }

threadpane-cell-correspondents-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-correspondents.aria-label") }
  .title = { $title }

threadpane-cell-date-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-date.aria-label") }
  .title = { $title }

threadpane-cell-sender-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-sender.aria-label") }
  .title = { $title }

threadpane-cell-recipient-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-recipient.aria-label") }
  .title = { $title }

threadpane-cell-received-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-received.aria-label") }
  .title = { $title }

threadpane-cell-status-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-status.aria-label") }
  .title = { $title }

threadpane-cell-size-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-size.aria-label") }
  .title = { $title }

threadpane-cell-tags-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-tags.aria-label") }
  .title = { $title }

threadpane-cell-account-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-account.aria-label") }
  .title = { $title }

threadpane-cell-priority-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-priority.aria-label") }
  .title = { $title }

threadpane-cell-unread-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-unread.aria-label") }
  .title = { $title }

threadpane-cell-total-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-total.aria-label") }
  .title = { $title }

threadpane-cell-location-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-location.aria-label") }
  .title = { $title }

threadpane-cell-id-title =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-id.aria-label") }
  .title = { $title }
            """,
            from_path="mail/messenger/about3Pane.ftl",
        ),
    )

#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import VARIABLE_REFERENCE, TERM_REFERENCE, transforms_from
from fluent.migratetb.transforms import REPLACE, PLURALS, REPLACE_IN_TEXT, COPY


def migrate(ctx):
    """Bug 2021804 - Add more aria attributes to tree views, part {index}."""

    about3Pane = "mail/messenger/about3Pane.ftl"
    aboutAddressBook = "mail/messenger/addressbook/aboutAddressBook.ftl"

    ctx.add_transforms(
        about3Pane,
        about3Pane,
        transforms_from(
            """
threadpane-column-header-a11y-select =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-select.label") }

threadpane-column-header-a11y-thread =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-cell-thread.aria-label") }

threadpane-column-header-a11y-flagged =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-flagged.label") }

threadpane-column-header-a11y-attachments =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-attachments.label") }

threadpane-column-header-a11y-spam =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-spam.label") }

threadpane-column-header-a11y-unread-button =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-unread-button.label") }

threadpane-column-header-a11y-sender =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-sender.label") }

threadpane-column-header-a11y-recipient =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-recipient.label") }

threadpane-column-header-a11y-correspondents =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-correspondents.label") }

threadpane-column-header-a11y-subject =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-subject.label") }

threadpane-column-header-a11y-date =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-date.label") }

threadpane-column-header-a11y-received =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-received.label") }

threadpane-column-header-a11y-status =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-status.label") }

threadpane-column-header-a11y-size =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-size.label") }

threadpane-column-header-a11y-tags =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-tags.label") }

threadpane-column-header-a11y-account =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-account.label") }

threadpane-column-header-a11y-priority =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-priority.label") }

threadpane-column-header-a11y-unread =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-unread.label") }

threadpane-column-header-a11y-total =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-total.label") }

threadpane-column-header-a11y-location =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-location.label") }

threadpane-column-header-a11y-id =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-id.label") }

threadpane-column-header-a11y-delete =
  .aria-label = { COPY_PATTERN(from_path, "threadpane-column-label-delete.label") }

""",
            from_path=about3Pane,
        ),
    )

    ctx.add_transforms(
        aboutAddressBook,
        aboutAddressBook,
        transforms_from(
            """
about-addressbook-column-header-a11y-generatedname2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-generatedname2.label") }

about-addressbook-column-header-a11y-emailaddresses2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-emailaddresses2.label") }

about-addressbook-column-header-a11y-nickname2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-nickname2.label") }

about-addressbook-column-header-a11y-phonenumbers2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-phonenumbers2.label") }

about-addressbook-column-header-a11y-addresses2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-addresses2.label") }

about-addressbook-column-header-a11y-title2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-title2.label") }

about-addressbook-column-header-a11y-department2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-department2.label") }

about-addressbook-column-header-a11y-organization2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-organization2.label") }

about-addressbook-column-header-a11y-addrbook2 =
  .aria-label = { COPY_PATTERN(from_path, "about-addressbook-column-label-addrbook2.label") }

""",
            from_path=aboutAddressBook,
        ),
    )

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2087034 - Migrate feed account strings to Fluent, part {index}."""

    target = reference = "mail/messenger/accountSettings.ftl"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-settings-rss-enable-updates =
    .label = { COPY(from_path, "biffAll.label") }
    .accesskey = { COPY(from_path, "biffAll.accesskey") }

account-settings-rss-new-feed-defaults = { COPY(from_path, "newFeedSettings.label") }

account-settings-rss-manage-subscriptions =
    .label = { COPY(from_path, "manageSubscriptions.label") }
    .accesskey = { COPY(from_path, "manageSubscriptions.accesskey") }

account-settings-rss-wizard-title = { COPY(from_path, "feedWindowTitle.label") }

account-settings-rss-default-account-name = { COPY(from_path, "feeds.accountName") }
            """,
            from_path="mail/chrome/messenger-newsblog/am-newsblog.dtd",
        ),
    )

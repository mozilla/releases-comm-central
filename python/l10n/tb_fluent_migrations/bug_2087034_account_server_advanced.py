# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from
from fluent.syntax import ast as FTL


def migrate(ctx):
    """Bug 2087034 - Migrate advanced server settings to Fluent, part {index}."""

    target = reference = "mail/messenger/accountSettings.ftl"
    source = "mail/chrome/messenger/am-server-advanced.dtd"
    apostrophe_replacements = dict({"'": FTL.TextElement("’")})

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-settings-advanced-server-title = { COPY(from_path, "serverAdvanced.label") }

account-settings-imap-server-directory =
    .value = { COPY(from_path, "serverDirectory.label") }
    .accesskey = { COPY(from_path, "serverDirectory.accesskey") }

account-settings-imap-show-subscribed-folders =
    .label = { COPY(from_path, "usingSubscription.label") }
    .accesskey = { COPY(from_path, "usingSubscription.accesskey") }

account-settings-imap-dual-use-folders =
    .label = { COPY(from_path, "dualUseFolders.label") }
    .accesskey = { COPY(from_path, "dualUseFolders.accesskey") }

account-settings-imap-maximum-connections =
    .value = { COPY(from_path, "maximumConnectionsNumber.label") }
    .accesskey = { COPY(from_path, "maximumConnectionsNumber.accesskey") }

account-settings-imap-namespace-description = { COPY(from_path, "namespaceDesc.label") }

account-settings-imap-personal-namespace =
    .value = { COPY(from_path, "personalNamespace.label") }
    .accesskey = { COPY(from_path, "personalNamespace.accesskey") }

account-settings-imap-public-namespace =
    .value = { COPY(from_path, "publicNamespace.label") }
    .accesskey = { COPY(from_path, "publicNamespace.accesskey") }

account-settings-imap-other-users-namespace =
    .value = { COPY(from_path, "otherUsersNamespace.label") }
    .accesskey = { COPY(from_path, "otherUsersNamespace.accesskey") }

account-settings-imap-override-namespaces =
    .label = { COPY(from_path, "overrideNamespaces.label") }
    .accesskey = { COPY(from_path, "overrideNamespaces.accesskey") }

account-settings-pop-inbox-description = { REPLACE(from_path, "pop3DeferringDesc.label", apostrophe_replacements) }

account-settings-pop-inbox-current-account =
    .label = { COPY(from_path, "accountInbox.label") }
    .accesskey = { COPY(from_path, "accountInbox.accesskey") }

account-settings-pop-inbox-other-account =
    .label = { COPY(from_path, "deferToServer.label") }
    .accesskey = { COPY(from_path, "deferToServer.accesskey") }

account-settings-pop-include-server =
    .label = { COPY(from_path, "deferGetNewMail.label") }
    .accesskey = { COPY(from_path, "deferGetNewMail.accesskey") }
            """,
            from_path=source,
            apostrophe_replacements=apostrophe_replacements,
        ),
    )

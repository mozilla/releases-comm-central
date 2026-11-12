# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from fluent.migratetb.helpers import transforms_from


def migrate(ctx):
    """Bug 2087034 - Migrate Account Settings server strings to Fluent, part {index}."""

    target = reference = "mail/messenger/accountSettings.ftl"
    source = "mail/chrome/messenger/am-server-top.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-settings-server-document-title = { COPY_PATTERN(reference, "account-settings-server-title.value") }

account-settings-server-type =
    .value = { COPY(from_path, "serverType.label") }

account-settings-server-name =
    .value = { COPY(from_path, "serverName.label") }
    .accesskey = { COPY(from_path, "serverName.accesskey") }

account-settings-user-name =
    .value = { COPY(from_path, "userName.label") }
    .accesskey = { COPY(from_path, "userName.accesskey") }

account-settings-port =
    .value = { COPY(from_path, "port.label") }
    .accesskey = { COPY(from_path, "port.accesskey") }

account-settings-default-port =
    .value = { COPY(from_path, "serverPortDefault.label") }

account-settings-connection-security =
    .value = { COPY(from_path, "connectionSecurity.label") }
    .accesskey = { COPY(from_path, "connectionSecurity.accesskey") }

account-settings-connection-security-none =
    .label = { COPY(from_path, "connectionSecurityType-0.label") }

account-settings-connection-security-starttls =
    .label = { COPY(from_path, "connectionSecurityType-2.label") }

account-settings-connection-security-ssl-tls =
    .label = { COPY(from_path, "connectionSecurityType-3.label") }

account-settings-rss-server-settings = { COPY(from_path, "serverSettings.label") }

account-settings-check-new-messages-every =
    .label = { COPY(from_path, "biffStart.label") }
    .accesskey = { COPY(from_path, "biffStart.accesskey") }

account-settings-minutes =
    .value = { COPY(from_path, "biffEnd.label") }

account-settings-automatically-download-new-messages =
    .label = { COPY(from_path, "downloadOnBiff.label") }
    .accesskey = { COPY(from_path, "downloadOnBiff.accesskey") }

account-settings-fetch-headers-only =
    .label = { COPY(from_path, "headersOnly.label") }
    .accesskey = { COPY(from_path, "headersOnly.accesskey") }

account-settings-leave-messages-on-server =
    .label = { COPY(from_path, "leaveOnServer.label") }
    .accesskey = { COPY(from_path, "leaveOnServer.accesskey") }

account-settings-leave-messages-for =
    .label = { COPY(from_path, "deleteByAgeFromServer.label") }
    .accesskey = { COPY(from_path, "deleteByAgeFromServer.accesskey") }

account-settings-days =
    .value = { COPY(from_path, "daysEnd.label") }

account-settings-leave-messages-until-deleted =
    .label = { COPY(from_path, "deleteOnServer2.label") }
    .accesskey = { COPY(from_path, "deleteOnServer2.accesskey") }

account-settings-move-to-trash =
    .label = { COPY(from_path, "modelMoveToTrash.label") }
    .accesskey = { COPY(from_path, "modelMoveToTrash.accesskey") }

account-settings-ask-before-download =
    .label = { COPY(from_path, "maxMessagesStart.label") }
    .accesskey = { COPY(from_path, "maxMessagesStart.accesskey") }

account-settings-messages =
    .value = { COPY(from_path, "maxMessagesEnd.label") }

account-settings-always-authenticate =
    .label = { COPY(from_path, "alwaysAuthenticate.label") }
    .accesskey = { COPY(from_path, "alwaysAuthenticate.accesskey") }

account-settings-message-storage = { COPY(from_path, "messageStorage.label") }

account-settings-empty-trash-on-exit =
    .label = { COPY(from_path, "emptyTrashOnExit.label") }
    .accesskey = { COPY(from_path, "emptyTrashOnExit.accesskey") }

account-settings-message-store-type =
    .value = { COPY(from_path, "storeType.label") }
    .accesskey = { COPY(from_path, "storeType.accesskey") }

account-settings-message-store-mbox =
    .label = { COPY(from_path, "mboxStore2.label") }

account-settings-message-store-maildir =
    .label = { COPY(from_path, "maildirStore.label") }

account-settings-newsrc-file =
    .value = { COPY(from_path, "newsrcFilePath1.label") }

account-settings-browse-newsrc =
    .label = { COPY(from_path, "browseNewsrc.label") }
    .accesskey = { COPY(from_path, "browseNewsrc.accesskey") }
    .filepickertitle = { COPY(from_path, "newsrcPicker1.label") }

account-settings-local-directory =
    .value = { COPY(from_path, "localPath1.label") }

account-settings-browse-local-directory =
    .label = { COPY(from_path, "browseFolder.label") }
    .accesskey = { COPY(from_path, "browseFolder.accesskey") }
    .filepickertitle = { COPY(from_path, "localFolderPicker.label") }

account-settings-default-text-encoding =
    .value = { COPY(from_path, "serverDefaultCharset2.label") }

account-settings-document-title = { COPY(from_path, "accountTitle.label") }

account-settings-title =
    .value = { COPY(from_path, "accountTitle.label") }

account-settings-document-title-with-name = { account-settings-document-title } - { $accountName }

account-settings-title-with-name =
    .value = { account-settings-document-title-with-name }

account-settings-special-account-description =
    { COPY(from_path, "accountSettingsDesc.label") }
            """,
            from_path=source,
            reference=reference,
        ),
    )

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
account-settings-account-name =
    .value = { COPY(from_path, "accountName.label") }
    .accesskey = { COPY(from_path, "accountName.accesskey") }
            """,
            from_path="mail/chrome/messenger/am-serverwithnoidentities.dtd",
        ),
    )

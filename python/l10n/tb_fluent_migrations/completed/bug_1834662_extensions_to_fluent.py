# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb.helpers import TERM_REFERENCE, VARIABLE_REFERENCE
from fluent.migratetb.transforms import (
    COPY,
    COPY_PATTERN,
    PLURALS,
    REPLACE,
    REPLACE_IN_TEXT,
)


def migrate(ctx):
    """Bug 1834662 - Migrate addon/extension stuff, part {index}."""

    # extensionPermissions.ftl - from addons.properties
    ctx.add_transforms(
        "mail/messenger/extensionPermissions.ftl",
        "mail/messenger/extensionPermissions.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-accountsFolders"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.accountsFolders",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-accountsIdentities"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.accountsIdentities",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-accountsRead"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.accountsRead2",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-addressBooks"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.addressBooks",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-compose"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.compose",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-compose"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.compose",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-compose-send"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.compose.send",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-compose-save"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.compose.save",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-experiment"),
                value=REPLACE(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.experiment",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesImport"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesImport",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesModify"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesModify",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesMove"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesMove2",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesDelete"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesDelete",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesRead"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesRead",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-messagesTags"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.messagesTags",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-description-sensitiveDataUpload"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.description.sensitiveDataUpload",
                ),
            ),
        ],
    )

    # extensionsUI.ftl - from here and there
    ctx.add_transforms(
        "mail/messenger/extensionsUI.ftl",
        "mail/messenger/extensionsUI.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("webext-experiment-warning"),
                value=COPY(
                    "mail/chrome/messenger/addons.properties",
                    "webextPerms.experimentWarning",
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-learn-more"),
                value=COPY("mail/chrome/messenger/addons.properties", "webextPerms.learnMore2"),
            ),
        ],
    )

    # addonNotifications.ftl - copied from browser/ migration script

    addons_properties = "mail/chrome/messenger/addons.properties"
    notifications = "mail/messenger/addonNotifications.ftl"

    ctx.add_transforms(
        notifications,
        notifications,
        [
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt"),
                value=REPLACE(
                    addons_properties,
                    "xpinstallPromptMessage",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-header"),
                value=REPLACE(
                    addons_properties,
                    "xpinstallPromptMessage.header",
                    {"%1$S": VARIABLE_REFERENCE("host")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-message"),
                value=REPLACE(
                    addons_properties,
                    "xpinstallPromptMessage.message",
                    {"%1$S": VARIABLE_REFERENCE("host")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-header-unknown"),
                value=COPY(addons_properties, "xpinstallPromptMessage.header.unknown"),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-message-unknown"),
                value=COPY(addons_properties, "xpinstallPromptMessage.message.unknown"),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-dont-allow"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "xpinstallPromptMessage.dontAllow"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            addons_properties,
                            "xpinstallPromptMessage.dontAllow.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-never-allow"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "xpinstallPromptMessage.neverAllow"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            addons_properties,
                            "xpinstallPromptMessage.neverAllow.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-never-allow-and-report"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(
                            addons_properties,
                            "xpinstallPromptMessage.neverAllowAndReport",
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            addons_properties,
                            "xpinstallPromptMessage.neverAllowAndReport.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("site-permission-install-first-prompt-midi-header"),
                value=COPY(addons_properties, "sitePermissionInstallFirstPrompt.midi.header"),
            ),
            FTL.Message(
                id=FTL.Identifier("site-permission-install-first-prompt-midi-message"),
                value=COPY(addons_properties, "sitePermissionInstallFirstPrompt.midi.message"),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-prompt-install"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "xpinstallPromptMessage.install"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            addons_properties,
                            "xpinstallPromptMessage.install.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-disabled-locked"),
                value=COPY(addons_properties, "xpinstallDisabledMessageLocked"),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-disabled"),
                value=COPY(addons_properties, "xpinstallDisabledMessage"),
            ),
            FTL.Message(
                id=FTL.Identifier("xpinstall-disabled-button"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "xpinstallDisabledButton"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(addons_properties, "xpinstallDisabledButton.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-blocked-by-policy"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallBlockedByPolicy",
                    {
                        "%1$S": VARIABLE_REFERENCE("addonName"),
                        "%2$S": VARIABLE_REFERENCE("addonId"),
                        "%3$S": FTL.TextElement(""),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-domain-blocked-by-policy"),
                value=COPY(addons_properties, "addonDomainBlockedByPolicy"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-full-screen-blocked"),
                value=COPY(addons_properties, "addonInstallFullScreenBlocked"),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-sideload-menu-item"),
                value=REPLACE(
                    addons_properties,
                    "webextPerms.sideloadMenuItem",
                    {
                        "%1$S": VARIABLE_REFERENCE("addonName"),
                        "%2$S": TERM_REFERENCE("brand-short-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("webext-perms-update-menu-item"),
                value=REPLACE(
                    addons_properties,
                    "webextPerms.updateMenuItem",
                    {"%1$S": VARIABLE_REFERENCE("addonName")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-removal-message"),
                value=REPLACE(
                    addons_properties,
                    "webext.remove.confirmation.message",
                    {
                        "%1$S": VARIABLE_REFERENCE("name"),
                        "%2$S": TERM_REFERENCE("brand-shorter-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-removal-button"),
                value=COPY(addons_properties, "webext.remove.confirmation.button"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-downloading-and-verifying"),
                value=PLURALS(
                    addons_properties,
                    "addonDownloadingAndVerifying",
                    VARIABLE_REFERENCE("addonCount"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        {"#1": VARIABLE_REFERENCE("addonCount")},
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-download-verifying"),
                value=COPY(addons_properties, "addonDownloadVerifying"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-cancel-button"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "addonInstall.cancelButton.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(addons_properties, "addonInstall.cancelButton.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-accept-button"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=COPY(addons_properties, "addonInstall.acceptButton2.label"),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(addons_properties, "addonInstall.acceptButton2.accesskey"),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("addon-confirm-install-message"),
                value=PLURALS(
                    addons_properties,
                    "addonConfirmInstall.message",
                    VARIABLE_REFERENCE("addonCount"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        {
                            "#1": TERM_REFERENCE("brand-short-name"),
                            "#2": VARIABLE_REFERENCE("addonCount"),
                        },
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-confirm-install-unsigned-message"),
                value=PLURALS(
                    addons_properties,
                    "addonConfirmInstallUnsigned.message",
                    VARIABLE_REFERENCE("addonCount"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        {
                            "#1": TERM_REFERENCE("brand-short-name"),
                            "#2": VARIABLE_REFERENCE("addonCount"),
                        },
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-confirm-install-some-unsigned-message"),
                value=PLURALS(
                    addons_properties,
                    "addonConfirmInstallSomeUnsigned.message",
                    VARIABLE_REFERENCE("addonCount"),
                    foreach=lambda n: REPLACE_IN_TEXT(
                        n,
                        {
                            "#1": TERM_REFERENCE("brand-short-name"),
                            "#2": VARIABLE_REFERENCE("addonCount"),
                        },
                    ),
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-network-failure"),
                value=COPY(addons_properties, "addonInstallError-1"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-incorrect-hash"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallError-2",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-corrupt-file"),
                value=COPY(addons_properties, "addonInstallError-3"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-file-access"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallError-4",
                    {
                        "%2$S": VARIABLE_REFERENCE("addonName"),
                        "%1$S": TERM_REFERENCE("brand-short-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-not-signed"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallError-5",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-invalid-domain"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallError-8",
                    {"%2$S": VARIABLE_REFERENCE("addonName")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-local-install-error-network-failure"),
                value=COPY(addons_properties, "addonLocalInstallError-1"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-local-install-error-incorrect-hash"),
                value=REPLACE(
                    addons_properties,
                    "addonLocalInstallError-2",
                    {"%1$S": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-local-install-error-corrupt-file"),
                value=COPY(addons_properties, "addonLocalInstallError-3"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-local-install-error-file-access"),
                value=REPLACE(
                    addons_properties,
                    "addonLocalInstallError-4",
                    {
                        "%2$S": VARIABLE_REFERENCE("addonName"),
                        "%1$S": TERM_REFERENCE("brand-short-name"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-local-install-error-not-signed"),
                value=COPY(addons_properties, "addonLocalInstallError-5"),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-incompatible"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallErrorIncompatible",
                    {
                        "%3$S": VARIABLE_REFERENCE("addonName"),
                        "%1$S": TERM_REFERENCE("brand-short-name"),
                        "%2$S": VARIABLE_REFERENCE("appVersion"),
                    },
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("addon-install-error-blocklisted"),
                value=REPLACE(
                    addons_properties,
                    "addonInstallErrorBlocklisted",
                    {"%1$S": VARIABLE_REFERENCE("addonName")},
                ),
            ),
        ],
    )

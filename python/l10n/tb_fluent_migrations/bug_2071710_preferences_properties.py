# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

import fluent.syntax.ast as FTL
from fluent.migratetb import COPY, COPY_PATTERN, REPLACE
from fluent.migratetb.helpers import TERM_REFERENCE, VARIABLE_REFERENCE, transforms_from


def migrate(ctx):
    """Bug 2071710 - Migrate preference properties files to Fluent, part {index}."""

    preferences_source = "mail/chrome/messenger/preferences/preferences.properties"
    applications_source = "mail/chrome/messenger/preferences/applications.properties"
    message_style_source = "mail/chrome/messenger/preferences/messagestyle.properties"
    application_manager_source = (
        "mail/chrome/messenger/preferences/applicationManager.properties"
    )

    preferences_target = preferences_reference = (
        "mail/messenger/preferences/preferences.ftl"
    )
    permissions_target = permissions_reference = (
        "mail/messenger/preferences/permissions.ftl"
    )
    cookies_target = cookies_reference = "mail/messenger/preferences/cookies.ftl"
    application_manager_target = application_manager_reference = (
        "mail/messenger/preferences/application-manager.ftl"
    )

    account_replacements = {
        "%S": VARIABLE_REFERENCE("accountName"),
        "%1$S": VARIABLE_REFERENCE("accountName"),
    }
    app_replacements = {
        "%S": VARIABLE_REFERENCE("appName"),
        "%1$S": VARIABLE_REFERENCE("appName"),
    }
    extension_replacements = {
        "%S": VARIABLE_REFERENCE("extension"),
        "%1$S": VARIABLE_REFERENCE("extension"),
    }
    locale_replacements = {
        "%S": VARIABLE_REFERENCE("localeName"),
        "%1$S": VARIABLE_REFERENCE("localeName"),
    }
    provider_replacements = {
        "%S": VARIABLE_REFERENCE("providerName"),
        "%1$S": VARIABLE_REFERENCE("providerName"),
    }
    size_replacements = {
        "%1$S": VARIABLE_REFERENCE("size"),
        "%2$S": VARIABLE_REFERENCE("unit"),
    }
    type_description_replacements = {
        "%1$S": VARIABLE_REFERENCE("type-description"),
        "%2$S": VARIABLE_REFERENCE("type"),
    }
    brand_replacements = {
        "%S": TERM_REFERENCE("brand-short-name"),
        "%1$S": TERM_REFERENCE("brand-short-name"),
    }
    apostrophe_replacements = {"'": FTL.TextElement("’")}
    preview_message_replacements = {
        "'": FTL.TextElement("’"),
        "Thunderbird": TERM_REFERENCE("brand-short-name"),
    }

    ctx.add_transforms(
        preferences_target,
        preferences_reference,
        transforms_from(
            """
confirm-reset-junk-training-title = { COPY(from_path, "confirmResetJunkTrainingTitle") }
confirm-reset-junk-training-message = { COPY(from_path, "confirmResetJunkTrainingText") }
download-folder-desktop = { COPY(from_path, "desktopFolderName") }
download-folder-system = { COPY(from_path, "myDownloadsFolderName") }
download-choose-folder-title = { COPY(from_path, "chooseAttachmentsFolderTitle") }
applications-file-ending = { REPLACE(from_path, "fileEnding", extension_replacements) }
applications-save-file = { COPY(from_path, "saveFile") }
    .label = { COPY(from_path, "saveFile") }
    .tooltiptext = { COPY(from_path, "saveFile") }
applications-use-app = { REPLACE(from_path, "useApp", app_replacements) }
    .label = { REPLACE(from_path, "useApp", app_replacements) }
    .tooltiptext = { REPLACE(from_path, "useApp", app_replacements) }
applications-use-default = { REPLACE(from_path, "useDefault", app_replacements) }
    .label = { REPLACE(from_path, "useDefault", app_replacements) }
    .tooltiptext = { $appName }
applications-use-other-app =
    .label = { COPY(from_path, "useOtherApp") }
    .tooltiptext = { COPY(from_path, "useOtherApp") }
applications-choose-app-title = { COPY(from_path, "fpTitleChooseApp") }
applications-manage-app =
    .label = { COPY(from_path, "manageApp") }
applications-always-ask = { COPY(from_path, "alwaysAsk") }
    .label = { COPY(from_path, "alwaysAsk") }
    .tooltiptext = { COPY(from_path, "alwaysAsk") }
applications-delete-action =
    .label = { COPY(from_path, "delete") }
applications-delete-action-title = { COPY(from_path, "confirmDeleteTitle") }
applications-delete-action-confirm = { COPY(from_path, "confirmDeleteText") }
applications-type-details-with-ext = { REPLACE(from_path, "typeDetailsWithTypeAndExt", type_description_replacements) }
sound-file-picker-title = { COPY(from_path, "soundFilePickerTitle") }
actual-disk-cache-size =
    .value = { REPLACE(from_path, "actualDiskCacheSize", size_replacements) }
actual-disk-cache-size-calculating =
    .value = { COPY(from_path, "actualDiskCacheSizeCalculated") }
date-time-app-locale =
    .label = { REPLACE(from_path, "appLocale.label", locale_replacements) }
    .accesskey = { COPY(from_path, "appLocale.accesskey") }
date-time-regional-locale =
    .label = { REPLACE(from_path, "rsLocale.label", locale_replacements) }
    .accesskey = { COPY(from_path, "rsLocale.accesskey") }
applications-type-pdf = { COPY(from_path, "applications-type-pdf") }
applications-preview-in-app = { REPLACE(from_path, "previewInApp", brand_replacements) }
    .label = { REPLACE(from_path, "previewInApp", brand_replacements) }
    .tooltiptext = { REPLACE(from_path, "previewInApp", brand_replacements) }
            """,
            from_path=preferences_source,
            app_replacements=app_replacements,
            extension_replacements=extension_replacements,
            locale_replacements=locale_replacements,
            size_replacements=size_replacements,
            type_description_replacements=type_description_replacements,
            brand_replacements=brand_replacements,
        ),
    )

    ctx.add_transforms(
        preferences_target,
        preferences_reference,
        transforms_from(
            """
filelink-add-provider =
    .label = { REPLACE(from_path, "addProvider", provider_replacements) }
    .tooltiptext = { REPLACE(from_path, "addProvider", provider_replacements) }
filelink-account-not-configured =
    .title = { COPY(from_path, "notConfiguredYet") }
filelink-remove-account-confirm = { REPLACE(from_path, "dialog_removeAccount", account_replacements) }
            """,
            from_path=applications_source,
            provider_replacements=provider_replacements,
            account_replacements=account_replacements,
        ),
    )

    ctx.add_transforms(
        preferences_target,
        preferences_reference,
        transforms_from(
            """
chat-theme-preview-default =
    .label = { COPY(from_path, "default") }
chat-theme-preview-nick-1 = { COPY(from_path, "nick1") }
chat-theme-preview-buddy-1 = { COPY(from_path, "buddy1") }
chat-theme-preview-nick-2 = { COPY(from_path, "nick2") }
chat-theme-preview-buddy-2 = { COPY(from_path, "buddy2") }
chat-theme-preview-message-1 = { COPY(from_path, "message1") }
chat-theme-preview-message-2 = { REPLACE(from_path, "message2", apostrophe_replacements) }
chat-theme-preview-message-3 = { REPLACE(from_path, "message3", preview_message_replacements) }
            """,
            from_path=message_style_source,
            apostrophe_replacements=apostrophe_replacements,
            preview_message_replacements=preview_message_replacements,
        ),
    )

    ctx.add_transforms(
        permissions_target,
        permissions_reference,
        transforms_from(
            """
remote-content-permissions-title = { COPY(from_path, "imagepermissionstitle") }
remote-content-permissions-description = { COPY(from_path, "imagepermissionstext") }
cookie-permissions-title = { COPY(from_path, "cookiepermissionstitle") }
cookie-permissions-description = { COPY(from_path, "cookiepermissionstext") }
            """,
            from_path=preferences_source,
        ),
    )

    # "cookiesAll" is intentionally not migrated: its wording ("The following
    # cookies are stored on your computer:") was replaced by the existing
    # cookies-stored-label message in bug 2068722, which already covers the
    # unfiltered state. Preserve its translation in the new label attribute.
    ctx.add_transforms(
        cookies_target,
        cookies_reference,
        transforms_from(
            """
cookies-stored-label2 =
    .value = { COPY_PATTERN(cookies_path, "cookies-stored-label") }
cookies-filtered-label =
    .value = { COPY(from_path, "cookiesFiltered") }
cookie-secure-only = { COPY(from_path, "forSecureOnly") }
cookie-any-connection = { COPY(from_path, "forAnyConnection") }
cookie-expires-at-end-of-session = { COPY(from_path, "expireAtEndOfSession") }
cookie-none-selected = { COPY(from_path, "noCookieSelected") }
cookie-default-user-context = { COPY(from_path, "defaultUserContextLabel") }
props-host-label =
    .value = { COPY(from_path, "hostColon") }
props-domain-label2 =
    .value = { COPY(from_path, "domainColon") }
            """,
            from_path=preferences_source,
            cookies_path=cookies_target,
        ),
    )

    description_replacements = {
        "%S": VARIABLE_REFERENCE("description"),
        "%1$S": VARIABLE_REFERENCE("description"),
    }
    file_description = REPLACE(
        application_manager_source,
        "handleFile",
        description_replacements,
    )
    protocol_description = REPLACE(
        application_manager_source,
        "handleProtocol",
        description_replacements,
    )
    ctx.add_transforms(
        application_manager_target,
        application_manager_reference,
        [
            FTL.Message(
                id=FTL.Identifier("app-manager-description-file"),
                value=REPLACE(
                    application_manager_source,
                    "descriptionApplications",
                    {"%S": file_description, "%1$S": file_description},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("app-manager-description-protocol"),
                value=REPLACE(
                    application_manager_source,
                    "descriptionApplications",
                    {"%S": protocol_description, "%1$S": protocol_description},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("app-manager-web-app"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("value"),
                        value=COPY(application_manager_source, "descriptionWebApp"),
                    )
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("app-manager-local-app"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("value"),
                        value=COPY(application_manager_source, "descriptionLocalApp"),
                    )
                ],
            ),
        ],
    )

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import
import fluent.syntax.ast as FTL
from fluent.migrate.helpers import transforms_from
from fluent.migrate import CONCAT, REPLACE
from fluent.migrate.helpers import COPY, TERM_REFERENCE, MESSAGE_REFERENCE


def migrate(ctx):
    """Bug 1615501 - Fluent migration recipe for Preferences Tab, part {index}."""

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
close-button =
    .aria-label = { COPY(from_path, "preferencesCloseButton.label") }
preferences-title =
    .title = { PLATFORM() ->
        [windows] { COPY(from_path, "prefWindow.titleWin") }
        *[other] { COPY(from_path, "prefWindow.titleMAC") }
    }
pane-compose-title = { COPY(from_path, "paneComposition.title") }
category-compose =
    .tooltiptext = { COPY(from_path, "paneComposition.title") }
pane-privacy-title = { COPY(from_path, "panePrivacySecurity.title") }
category-privacy =
    .tooltiptext = { COPY(from_path, "panePrivacySecurity.title") }
pane-chat-title = { COPY(from_path, "paneChat.title") }
category-chat =
    .tooltiptext = { COPY(from_path, "paneChat.title") }
addons-button = { COPY(from_path, "addonsButton.label") }
""",
            from_path="mail/chrome/messenger/preferences/preferences.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
pane-calendar-title = { COPY(from_path, "lightning.preferencesLabel") }
category-calendar =
    .tooltiptext = { COPY(from_path, "lightning.preferencesLabel") }
""",
            from_path="calendar/chrome/lightning/lightning.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
location-label =
    .value = { COPY(from_path, "location.label") }
    .accesskey = { COPY(from_path, "location1.accesskey") }
restore-default-label =
    .label = { COPY(from_path, "useDefault.label") }
    .accesskey = { COPY(from_path, "useDefault.accesskey") }

default-search-engine = { COPY(from_path, "defaultSearchEngine.label") }
add-search-engine =
    .label = { COPY(from_path, "addSearchEngine.label") }
    .accesskey = { COPY(from_path, "addSearchEngine.accesskey") }
remove-search-engine =
    .label = { COPY(from_path, "removeSearchEngine.label") }
    .accesskey = { COPY(from_path, "removeSearchEngine.accesskey") }

new-message-arrival = { COPY(from_path, "newMessagesArrive.label") }

change-dock-icon = { COPY(from_path, "changeDockIconOptions.label") }
app-icon-options =
    .label = { COPY(from_path, "dockOptions.label") }
    .accesskey = { COPY(from_path, "dockOptions.accesskey") }

notification-settings = { COPY(from_path, "notificationAlertSettings2.label") }

animated-alert-label =
    .label = { COPY(from_path, "showAnimatedAlert.label") }
    .accesskey = { COPY(from_path, "showAnimatedAlert.accesskey") }
customize-alert-label =
    .label = { COPY(from_path, "customizeMailAlert.label") }
    .accesskey = { COPY(from_path, "customizeMailAlert.accesskey") }

tray-icon-label =
    .label = { COPY(from_path, "showTrayIcon.label") }
    .accesskey = { COPY(from_path, "showTrayIcon.accesskey") }

mail-play-sound-label =
    .label = { PLATFORM() ->
        [macos] { COPY(from_path, "playSoundMac.label") }
        *[other] { COPY(from_path, "playSound.label") }
    }
    .accesskey = { PLATFORM() ->
        [macos] { COPY(from_path, "playSoundMac.accesskey") }
        *[other] { COPY(from_path, "playSound1.accesskey") }
    }

mail-play-button =
    .label = { COPY(from_path, "play.label") }
    .accesskey = { COPY(from_path, "play.accesskey") }

mail-system-sound-label =
    .label = { COPY(from_path, "systemSound.label") }
    .accesskey = { COPY(from_path, "systemSound.accesskey") }

mail-custom-sound-label =
    .label = { COPY(from_path, "customsound.label") }
    .accesskey = { COPY(from_path, "customsound.accesskey") }

mail-browse-sound-button =
    .label = { COPY(from_path, "browse.label") }
    .accesskey = { COPY(from_path, "browse.accesskey") }

""",
            from_path="mail/chrome/messenger/preferences/general.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("general-legend"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/general.dtd",
                    "messengerStartPage.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("start-page-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/general.dtd",
                            "enableStartPage.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/general.dtd",
                            "enableStartPage.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("minimize-to-tray-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/general.dtd",
                            "minimizeToTray.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/general.dtd",
                            "minimizeToTray.accesskey",
                        ),
                    ),
                ],
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
enable-gloda-search-label =
    .label = { COPY(from_path, "enableGlodaSearch.label") }
    .accesskey = { COPY(from_path, "enableGlodaSearch.accesskey") }

datetime-formatting-legend = { COPY(from_path, "dateTimeFormatting.label") }
language-selector-legend = { COPY(from_path, "languageSelector.label") }

allow-hw-accel =
    .label = { COPY(from_path, "allowHWAccel.label") }
    .accesskey = { COPY(from_path, "allowHWAccel.accesskey") }

store-type-label =
    .value = { COPY(from_path, "storeType.label") }
    .accesskey = { COPY(from_path, "storeType.accesskey") }

mbox-store-label =
    .label = { COPY(from_path, "mboxStore2.label") }
maildir-store-label =
    .label = { COPY(from_path, "maildirStore.label") }

scrolling-legend = { COPY(from_path, "scrolling.label") }
autoscroll-label =
    .label = { COPY(from_path, "useAutoScroll.label") }
    .accesskey = { COPY(from_path, "useAutoScroll.accesskey") }
smooth-scrolling-label =
    .label = { COPY(from_path, "useSmoothScrolling.label") }
    .accesskey = { COPY(from_path, "useSmoothScrolling.accesskey") }

system-integration-legend = { COPY(from_path, "systemIntegration.label") }
check-default-button =
    .label = { COPY(from_path, "checkDefaultsNow.label") }
    .accesskey = { COPY(from_path, "checkDefaultsNow.accesskey") }

search-engine-name = { PLATFORM() ->
    [macos] { COPY("mail/chrome/messenger/searchIntegrationMac.dtd", "searchIntegration.engineName") }
    [windows] { COPY("mail/chrome/messenger/searchIntegrationWin.dtd", "searchIntegration.engineName") }
    *[other] { COPY("mail/chrome/messenger/searchIntegrationDefault.dtd", "searchIntegration.engineName") }
}

config-editor-button =
    .label = { COPY(from_path, "configEdit.label") }
    .accesskey = { COPY(from_path, "configEdit.accesskey") }

return-receipts-button =
    .label = { COPY(from_path, "showReturnReceipts.label") }
    .accesskey = { COPY(from_path, "showReturnReceipts.accesskey") }

automatic-updates-label =
    .label = { COPY(from_path, "updateAuto.label") }
    .accesskey = { COPY(from_path, "updateAuto.accesskey") }

check-updates-label =
    .label = { COPY(from_path, "updateCheck.label") }
    .accesskey = { COPY(from_path, "updateCheck.accesskey") }

update-history-button =
    .label = { COPY(from_path, "updateHistory.label") }
    .accesskey = { COPY(from_path, "updateHistory.accesskey") }

use-service =
    .label = { COPY(from_path, "useService.label") }
    .accesskey = { COPY(from_path, "useService.accesskey") }

network-settings-button =
    .label = { COPY(from_path, "showSettings.label") }
    .accesskey = { COPY(from_path, "showSettings.accesskey") }

networking-legend = { COPY(from_path, "connectionsInfo.caption") }
offline-legend = { COPY(from_path, "offlineInfo.caption") }
offline-settings = { COPY(from_path, "offlineInfo.label") }

offline-settings-button =
    .label = { COPY(from_path, "showOffline.label") }
    .accesskey = { COPY(from_path, "showOffline.accesskey") }

diskspace-legend = { COPY(from_path, "Diskspace") }

offline-compact-folder =
    .label = { COPY(from_path, "offlineCompactFolders.label") }
    .accesskey = { COPY(from_path, "offlineCompactFolders.accesskey") }

compact-folder-size =
    .value = { COPY(from_path, "offlineCompactFoldersMB.label") }

use-cache-before =
    .value = { COPY(from_path, "useCacheBefore.label") }
    .accesskey = { COPY(from_path, "useCacheBefore.accesskey") }

use-cache-after = { COPY(from_path, "useCacheAfter.label") }

smart-cache-label =
    .label = { COPY(from_path, "overrideSmartCacheSize.label") }
    .accesskey = { COPY(from_path, "overrideSmartCacheSize.accesskey") }

clear-cache-button =
    .label = { COPY(from_path, "clearCacheNow.label") }
    .accesskey = { COPY(from_path, "clearCacheNow.accesskey") }

update-app-version = { COPY(from_path, "updateApp.version.pre") }{ $version }{ COPY(from_path, "updateApp.version.post") }
""",
            from_path="mail/chrome/messenger/preferences/advanced.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("return-receipts-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "returnReceiptsInfo.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("update-app-legend"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "updateApp2.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("allow-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "updateAppAllow.description",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("cross-user-udpate-warning"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "updateCrossUserSettingWarning.description",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("proxy-config-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "proxiesConfigure.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("always-check-default"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "alwaysCheckDefault.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "alwaysCheckDefault.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("search-integration-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "searchIntegration.label",
                            {
                                "&searchIntegration.engineName;": MESSAGE_REFERENCE(
                                    "search-engine-name"
                                )
                            },
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "searchIntegration.accesskey",
                        ),
                    ),
                ],
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
focus-search-shortcut =
    .key = { COPY(from_path, "focusSearch1.key") }
focus-search-shortcut-alt =
    .key = { COPY(from_path, "focusSearch2.key") }

search-input =
    .placeholder = { COPY(from_path, "filter.placeholder") }

type-column-label =
    .label = { COPY(from_path, "typeColumn.label") }
    .accesskey = { COPY(from_path, "typeColumn.accesskey") }

action-column-label =
    .label = { COPY(from_path, "actionColumn2.label") }
    .accesskey = { COPY(from_path, "actionColumn2.accesskey") }

save-to-label =
    .label = { COPY(from_path, "saveTo.label") }
    .accesskey = { COPY(from_path, "saveTo.accesskey") }

choose-folder-label =
    .label = { PLATFORM() ->
        [macos] { COPY(from_path, "chooseFolderMac.label") }
        *[other] { COPY(from_path, "chooseFolderWin.label") }
    }
    .accesskey = { PLATFORM() ->
        [macos] { COPY(from_path, "chooseFolderMac.accesskey") }
        *[other] { COPY(from_path, "chooseFolderWin.accesskey") }
    }

always-ask-label =
    .label = { COPY(from_path, "alwaysAsk.label") }
    .accesskey = { COPY(from_path, "alwaysAsk.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/applications.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
fonts-legend = { COPY(from_path, "fontsAndColors1.label") }

default-font-label =
    .value = { COPY(from_path, "defaultFont.label") }
    .accesskey = { COPY(from_path, "defaultFont.accesskey") }

default-size-label =
    .value = { COPY(from_path, "defaultSize.label") }
    .accesskey = { COPY(from_path, "defaultSize.accesskey") }

font-options-button =
    .label = { COPY(from_path, "fontOptions.label") }
    .accesskey = { COPY(from_path, "fontOptions.accesskey") }

color-options-button =
    .label = { COPY(from_path, "colorButton.label") }
    .accesskey = { COPY(from_path, "colorButton.accesskey") }

display-width-legend = { COPY(from_path, "displayWidth.label") }

convert-emoticons-label =
    .label = { COPY(from_path, "convertEmoticons.label") }
    .accesskey = { COPY(from_path, "convertEmoticons.accesskey") }

display-text-label = { COPY(from_path, "displayText.label") }

style-label =
    .value = { COPY(from_path, "style.label") }
    .accesskey = { COPY(from_path, "style.accesskey") }

regular-style-item =
    .label = { COPY(from_path, "regularStyle.label") }
bold-style-item =
    .label = { COPY(from_path, "bold.label") }
italic-style-item =
    .label = { COPY(from_path, "italic.label") }
bold-italic-style-item =
    .label = { COPY(from_path, "boldItalic.label") }

size-label =
    .value = { COPY(from_path, "size.label") }
    .accesskey = { COPY(from_path, "size.accesskey") }

regular-size-item =
    .label = { COPY(from_path, "regularSize.label") }
bigger-size-item =
    .label = { COPY(from_path, "bigger.label") }
smaller-size-item =
    .label = { COPY(from_path, "smaller.label") }

quoted-text-color =
    .label = { COPY(from_path, "quotedTextColor.label") }
    .accesskey = { COPY(from_path, "quotedTextColor.accesskey") }

display-tags-text = { COPY(from_path, "displayTagsText.label") }

new-tag-button =
    .label = { COPY(from_path, "newTagButton.label") }
    .accesskey = { COPY(from_path, "newTagButton.accesskey") }

edit-tag-button =
    .label = { COPY(from_path, "editTagButton1.label") }
    .accesskey = { COPY(from_path, "editTagButton1.accesskey") }

delete-tag-button =
    .label = { COPY(from_path, "removeTagButton.label") }
    .accesskey = { COPY(from_path, "removeTagButton.accesskey") }

auto-mark-as-read =
    .label = { COPY(from_path, "autoMarkAsRead.label") }
    .accesskey = { COPY(from_path, "autoMarkAsRead.accesskey") }

mark-read-no-delay =
    .label = { COPY(from_path, "markAsReadNoDelay.label") }
    .accesskey = { COPY(from_path, "markAsReadNoDelay.accesskey") }

mark-read-delay =
    .label = { COPY(from_path, "markAsReadDelay.label") }
    .accesskey = { COPY(from_path, "markAsReadDelay.accesskey") }

seconds-label = { COPY(from_path, "secondsLabel.label") }

open-msg-label =
    .value = { COPY(from_path, "openMsgIn.label") }

open-msg-tab =
    .label = { COPY(from_path, "openMsgInNewTab.label") }
    .accesskey = { COPY(from_path, "openMsgInNewTab.accesskey") }

open-msg-window =
    .label = { COPY(from_path, "reuseExpRadio0.label") }
    .accesskey = { COPY(from_path, "reuseExpRadio0.accesskey") }

open-msg-ex-window =
    .label = { COPY(from_path, "reuseExpRadio1.label") }
    .accesskey = { COPY(from_path, "reuseExpRadio1.accesskey") }

close-move-delete =
    .label = { COPY(from_path, "closeMsgOnMoveOrDelete.label") }
    .accesskey = { COPY(from_path, "closeMsgOnMoveOrDelete.accesskey") }

display-name-label =
    .value = { COPY(from_path, "displayName.label") }

condensed-addresses-label =
    .label = { COPY(from_path, "showCondensedAddresses.label") }
    .accesskey = { COPY(from_path, "showCondensedAddresses.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/display.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("return-receipts-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/advanced.dtd",
                    "returnReceiptsInfo.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("always-check-default"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "alwaysCheckDefault.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/advanced.dtd",
                            "alwaysCheckDefault.accesskey",
                        ),
                    ),
                ],
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
forward-label =
    .value = { COPY(from_path, "forwardMsg.label") }
    .accesskey = { COPY(from_path, "forwardMsg.accesskey") }

inline-label =
    .label = { COPY(from_path, "inline.label") }

as-attachment-label =
    .label = { COPY(from_path, "asAttachment.label") }

extension-label =
    .label = { COPY(from_path, "addExtension.label") }
    .accesskey = { COPY(from_path, "addExtension.accesskey") }

auto-save-label =
    .label = { COPY(from_path, "autoSave.label") }
    .accesskey = { COPY(from_path, "autoSave.accesskey") }

auto-save-end = { COPY(from_path, "autoSaveEnd.label") }

warn-on-send-accel-key =
    .label = { COPY(from_path, "warnOnSendAccelKey.label") }
    .accesskey = { COPY(from_path, "warnOnSendAccelKey.accesskey") }

spellcheck-label =
    .label = { COPY(from_path, "spellCheck.label") }
    .accesskey = { COPY(from_path, "spellCheck.accesskey") }

spellcheck-inline-label =
    .label = { COPY(from_path, "spellCheckInline.label") }
    .accesskey = { COPY(from_path, "spellCheckInline1.accesskey") }

language-popup-label =
    .value = { COPY(from_path, "languagePopup.label") }
    .accesskey = { COPY(from_path, "languagePopup.accessKey") }

download-dictionaries-link = { COPY(from_path, "downloadDictionaries.label") }

font-label =
    .value = { COPY(from_path, "font.label") }
    .accesskey = { COPY(from_path, "font.accesskey") }

font-size-label =
    .value = { COPY(from_path, "fontSize.label") }
    .accesskey = { COPY(from_path, "fontSize.accesskey") }

default-colors-label =
    .label = { COPY(from_path, "useReaderDefaults.label") }
    .accesskey = { COPY(from_path, "useReaderDefaults.accesskey") }

font-color-label =
    .value = { COPY(from_path, "fontColor.label") }
    .accesskey = { COPY(from_path, "fontColor.accesskey") }

bg-color-label =
    .value = { COPY(from_path, "bgColor.label") }
    .accesskey = { COPY(from_path, "bgColor.accesskey") }

restore-html-label =
    .label = { COPY(from_path, "restoreHTMLDefaults.label") }
    .accesskey = { COPY(from_path, "restoreHTMLDefaults.accesskey") }

default-format-label =
    .label = { COPY(from_path, "defaultToParagraph.label") }
    .accesskey = { COPY(from_path, "defaultToParagraph.accesskey") }

format-description = { COPY(from_path, "sendOptionsDescription.label") }

send-options-label =
    .label = { COPY(from_path, "sendOptions.label") }
    .accesskey = { COPY(from_path, "sendOptions.accesskey") }

autocomplete-description = { COPY(from_path, "autocompleteText.label") }

ab-label =
    .label = { COPY(from_path, "addressingEnable.label") }
    .accesskey = { COPY(from_path, "addressingEnable.accesskey") }

directories-label =
    .label = { COPY(from_path, "directories.label") }
    .accesskey = { COPY(from_path, "directories.accesskey") }

directories-none-label =
    .none = { COPY(from_path, "directoriesNone.label") }

edit-directories-label =
    .label = { COPY(from_path, "editDirectories.label") }
    .accesskey = { COPY(from_path, "editDirectories.accesskey") }

email-picker-label =
    .label = { COPY(from_path, "emailCollectionPicker.label") }
    .accesskey = { COPY(from_path, "emailCollectionPicker.accesskey") }

default-directory-label =
    .value = { COPY(from_path, "showAsDefault.label") }
    .accesskey = { COPY(from_path, "showAsDefault.accesskey") }

default-last-label =
    .none = { COPY(from_path, "showAsDefaultLast.label") }

attachment-label =
    .label = { COPY(from_path, "attachmentReminder.label") }
    .accesskey = { COPY(from_path, "attachmentReminder.accesskey") }

attachment-options-label =
    .label = { COPY(from_path, "attachmentReminderOptions.label") }
    .accesskey = { COPY(from_path, "attachmentReminderOptions.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/compose.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
enable-cloud-share =
    .label = { COPY(from_path, "enableCloudFileAccountOffer.label") }
cloud-share-size =
    .value = { COPY(from_path, "enableCloudFileAccountOffer.mb") }

add-cloud-account =
    .label = { COPY(from_path, "addCloudFileAccount1.label") }
    .accesskey = { COPY(from_path, "addCloudFileAccount1.accesskey") }
    .defaultlabel = { COPY(from_path, "addCloudFileAccount1.label") }

remove-cloud-account =
    .label = { COPY(from_path, "removeCloudFileAccount.label") }
    .accesskey = { COPY(from_path, "removeCloudFileAccount.accesskey") }

find-cloud-providers =
    .value = { COPY(from_path, "findCloudFileProviders.label") }

cloud-account-description = { COPY(from_path, "addCloudFileAccount.description") }
""",
            from_path="mail/chrome/messenger/preferences/applications.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
mail-content = { COPY(from_path, "captionMailContent.label") }

remote-content-label =
    .label = { COPY(from_path, "acceptRemoteContent.label") }
    .accesskey = { COPY(from_path, "acceptRemoteContent.accesskey") }

exceptions-button =
    .label = { COPY(from_path, "remoteContentExceptions.label") }
    .accesskey = { COPY(from_path, "cookieExceptions.accesskey") }

remote-content-info =
    .value = { COPY(from_path, "acceptRemoteContentInfo.label") }

web-content = { COPY(from_path, "captionWebContent.label") }

history-label =
    .label = { COPY(from_path, "keepHistory.label") }
    .accesskey = { COPY(from_path, "keepHistory.accesskey") }

cookies-label =
    .label = { COPY(from_path, "acceptCookies.label") }
    .accesskey = { COPY(from_path, "acceptCookies.accesskey") }

third-party-label =
    .value = { COPY(from_path, "acceptThirdParty.pre.label") }
    .accesskey = { COPY(from_path, "acceptThirdParty.pre.accesskey") }

third-party-always =
    .label = { COPY(from_path, "acceptThirdParty.always.label") }
third-party-never =
    .label = { COPY(from_path, "acceptThirdParty.never.label") }
third-party-visited =
    .label = { COPY(from_path, "acceptThirdParty.visited.label") }

keep-label =
    .value = { COPY(from_path, "keepUntil.label") }
    .accesskey = { COPY(from_path, "keepUntil.accesskey") }

keep-expire =
    .label = { COPY(from_path, "expire.label") }
keep-ask =
    .label = { COPY(from_path, "askEachTime.label") }

cookies-button =
    .label = { COPY(from_path, "showCookies.label") }
    .accesskey = { COPY(from_path, "showCookies.accesskey") }

do-not-track-label =
    .label = { COPY(from_path, "doNotTrackCheck.label") }
    .accesskey = { COPY(from_path, "doNotTrackCheck.accesskey") }

learn-button =
    .label = { COPY(from_path, "doNotTrackLearnMore.label") }
""",
            from_path="mail/chrome/messenger/preferences/privacy.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("keep-close"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/privacy.dtd",
                            "close.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                ],
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
passwords-button =
    .label = { COPY(from_path, "savedPasswords.label") }
    .accesskey = { COPY(from_path, "savedPasswords.accesskey") }

master-password-description = { COPY(from_path, "masterPassword.intro") }

master-password-label =
    .label = { COPY(from_path, "useMasterPassword.label") }
    .accesskey = { COPY(from_path, "useMasterPassword.accesskey") }

master-password-button =
    .label = { COPY(from_path, "changeMasterPassword.label") }
    .accesskey = { COPY(from_path, "changeMasterPassword.accesskey") }

junk-description = { COPY(from_path, "junkMail.intro") }

junk-label =
    .label = { COPY(from_path, "manualMark.label") }
    .accesskey = { COPY(from_path, "manualMark.accesskey") }

junk-move-label =
    .label = { COPY(from_path, "manualMarkModeMove.label") }
    .accesskey = { COPY(from_path, "manualMarkModeMove.accesskey") }

junk-delete-label =
    .label = { COPY(from_path, "manualMarkModeDelete.label") }
    .accesskey = { COPY(from_path, "manualMarkModeDelete.accesskey") }

junk-read-label =
    .label = { COPY(from_path, "markAsReadOnSpam.label") }
    .accesskey = { COPY(from_path, "markAsReadOnSpam.accesskey") }

junk-log-label =
    .label = { COPY(from_path, "enableAdaptiveJunkLogging.label") }
    .accesskey = { COPY(from_path, "enableAdaptiveJunkLogging.accesskey") }

junk-log-button =
    .label = { COPY(from_path, "openJunkLog.label") }
    .accesskey = { COPY(from_path, "openJunkLog.accesskey") }

reset-junk-button =
    .label = { COPY(from_path, "resetTrainingData.label") }
    .accesskey = { COPY(from_path, "resetTrainingData.accesskey") }

phishing-label =
    .label = { COPY(from_path, "enablePhishingDetector1.label") }
    .accesskey = { COPY(from_path, "enablePhishingDetector1.accesskey") }

antivirus-label =
    .label = { COPY(from_path, "antiVirus.label") }
    .accesskey = { COPY(from_path, "antiVirus.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/security.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("passwords-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/security.dtd",
                    "savedPasswords.intro",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("phishing-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/security.dtd",
                    "phishingDetector1.intro",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("antivirus-description"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/security.dtd",
                    "antiVirus.intro",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
certificate-description = { COPY(from_path, "certSelection.description") }

certificate-auto =
    .label = { COPY(from_path, "certs.auto") }
    .accesskey = { COPY(from_path, "certs.auto.accesskey") }

certificate-ask =
    .label = { COPY(from_path, "certs.ask") }
    .accesskey = { COPY(from_path, "certs.ask.accesskey") }

ocsp-label =
    .label = { COPY(from_path, "enableOCSP.label") }
    .accesskey = { COPY(from_path, "enableOCSP.accesskey") }

certificate-button =
    .label = { COPY(from_path, "manageCertificates2.label") }
    .accesskey = { COPY(from_path, "manageCertificates2.accesskey") }

security-devices-button =
    .label = { COPY(from_path, "viewSecurityDevices2.label") }
    .accesskey = { COPY(from_path, "viewSecurityDevices2.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/advanced.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        transforms_from(
            """
offline-label =
    .label = { COPY(from_path, "startupOffline.label") }

auto-connect-label =
    .label = { COPY(from_path, "startupConnectAuto.label") }

idle-label =
    .label = { COPY(from_path, "reportIdleAfter.label") }
    .accesskey = { COPY(from_path, "reportIdleAfter.accesskey") }

idle-time-label = { COPY(from_path, "idleTime") }

away-message-label =
    .label = { COPY(from_path, "andSetStatusToAway.label") }
    .accesskey = { COPY(from_path, "andSetStatusToAway.accesskey") }

send-typing-label =
    .label = { COPY(from_path, "sendTyping.label") }
    .accesskey = { COPY(from_path, "sendTyping.accesskey") }

notification-label = { COPY(from_path, "chatNotifications.label") }

show-notification-label =
    .label = { COPY(from_path, "desktopChatNotifications.label") }
    .accesskey = { COPY(from_path, "desktopChatNotifications.accesskey") }

notification-all =
    .label = { COPY(from_path, "completeNotification.label") }
notification-name =
    .label = { COPY(from_path, "buddyInfoOnly.label") }
notification-empty =
    .label = { COPY(from_path, "dummyNotification.label") }

notification-type-label =
    .label = { PLATFORM() ->
        [macos] { COPY(from_path, "getAttentionMac.label") }
        *[other] { COPY(from_path, "getAttention.label") }
    }
    .accesskey = { PLATFORM() ->
        [macos] { COPY(from_path, "getAttentionMac.accesskey") }
        *[other] { COPY(from_path, "getAttention.accesskey") }
    }

chat-play-sound-label =
    .label = { COPY(from_path, "chatSound.label") }
    .accesskey = { COPY(from_path, "chatSound.accesskey") }

chat-play-button =
    .label = { COPY(from_path, "play.label") }
    .accesskey = { COPY(from_path, "play.accesskey") }

chat-system-sound-label =
    .label = { COPY(from_path, "systemSound.label") }
    .accesskey = { COPY(from_path, "systemSound.accesskey") }

chat-custom-sound-label =
    .label = { COPY(from_path, "customsound.label") }
    .accesskey = { COPY(from_path, "customsound.accesskey") }

chat-browse-sound-button =
    .label = { COPY(from_path, "browse.label") }
    .accesskey = { COPY(from_path, "browse.accesskey") }

theme-label =
    .value = { COPY(from_path, "messageStyleTheme.label") }
    .accesskey = { COPY(from_path, "messageStyleTheme.accesskey") }

style-thunderbird =
    .label = { COPY(from_path, "messageStyleThunderbirdTheme.label") }
style-bubbles =
    .label = { COPY(from_path, "messageStyleBubblesTheme.label") }
style-dark =
    .label = { COPY(from_path, "messageStyleDarkTheme.label") }
style-paper =
    .label = { COPY(from_path, "messageStylePaperSheetsTheme.label") }
style-simple =
    .label = { COPY(from_path, "messageStyleSimpleTheme.label") }

preview-label = { COPY(from_path, "messageStylePreview.label") }
no-preview-label = { COPY(from_path, "messageStyleNoPreview.title") }
no-preview-description = { COPY(from_path, "messageStyleNoPreview.description") }

chat-variant-label =
    .value = { COPY(from_path, "messageStyleVariant.label") }
    .accesskey = { COPY(from_path, "messageStyleVariant.accesskey") }

chat-header-label =
    .label = { COPY(from_path, "messageStyleShowHeader.label") }
    .accesskey = { COPY(from_path, "messageStyleShowHeader.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/chat.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/preferences.ftl",
        "mail/messenger/preferences/preferences.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("startup-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("value"),
                        value=REPLACE(
                            "mail/chrome/messenger/preferences/chat.dtd",
                            "startupAction.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/preferences/chat.dtd",
                            "startupAction.accesskey",
                        ),
                    ),
                ],
            ),
        ],
    )

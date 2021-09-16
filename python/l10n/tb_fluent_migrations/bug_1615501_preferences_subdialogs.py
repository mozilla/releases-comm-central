# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import
import fluent.syntax.ast as FTL
from fluent.migrate.helpers import transforms_from
from fluent.migrate import CONCAT, REPLACE
from fluent.migrate.helpers import COPY, TERM_REFERENCE, MESSAGE_REFERENCE


def migrate(ctx):
    """Bug 1615501 - Fluent migration recipe for Preferences subdialogs, part {index}."""

    ctx.add_transforms(
        "mail/messenger/preferences/system-integration.ftl",
        "mail/messenger/preferences/system-integration.ftl",
        transforms_from(
            """
system-integration-title =
    .title = { COPY(from_path, "systemIntegration.title") }

system-integration-dialog =
    .buttonlabelaccept = { COPY(from_path, "acceptIntegration.label") }
    .buttonlabelcancel = { COPY(from_path, "cancelIntegration.label") }
    .buttonlabelcancel2 = { COPY(from_path, "cancelIntegration2.label") }

checkbox-email-label =
    .label = { COPY(from_path, "email.label") }
    .tooltiptext = { unset-default-tooltip }
checkbox-newsgroups-label =
    .label = { COPY(from_path, "newsgroups.label") }
    .tooltiptext = { unset-default-tooltip }
checkbox-feeds-label =
    .label = { COPY(from_path, "feeds.label") }
    .tooltiptext = { unset-default-tooltip }

system-search-engine-name = { PLATFORM() ->
    [macos] { COPY("mail/chrome/messenger/searchIntegrationMac.dtd", "searchIntegration.engineName") }
    [windows] { COPY("mail/chrome/messenger/searchIntegrationWin.dtd", "searchIntegration.engineName") }
    *[other] { COPY("mail/chrome/messenger/searchIntegrationDefault.dtd", "searchIntegration.engineName") }
}
""",
            from_path="mail/chrome/messenger/systemIntegrationDialog.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/system-integration.ftl",
        "mail/messenger/preferences/system-integration.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("default-client-intro"),
                value=REPLACE(
                    "mail/chrome/messenger/systemIntegrationDialog.dtd",
                    "defaultClient.intro",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("unset-default-tooltip"),
                value=REPLACE(
                    "mail/chrome/messenger/systemIntegrationDialog.dtd",
                    "unsetDefault.tooltip",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
            FTL.Message(
                id=FTL.Identifier("system-search-integration-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/systemIntegrationDialog.dtd",
                            "searchIntegration.label",
                            {
                                "&searchIntegration.engineName;": MESSAGE_REFERENCE(
                                    "system-search-engine-name"
                                )
                            },
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/systemIntegrationDialog.dtd",
                            "searchIntegration.accesskey",
                        ),
                    ),
                ],
            ),
            FTL.Message(
                id=FTL.Identifier("check-on-startup-label"),
                attributes=[
                    FTL.Attribute(
                        id=FTL.Identifier("label"),
                        value=REPLACE(
                            "mail/chrome/messenger/systemIntegrationDialog.dtd",
                            "checkOnStartup.label",
                            {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                        ),
                    ),
                    FTL.Attribute(
                        id=FTL.Identifier("accesskey"),
                        value=COPY(
                            "mail/chrome/messenger/systemIntegrationDialog.dtd",
                            "checkOnStartup.accesskey",
                        ),
                    ),
                ],
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/fonts.ftl",
        "mail/messenger/preferences/fonts.ftl",
        transforms_from(
            """
fonts-encoding-dialog-title =
    .title = { COPY(from_path, "fontsAndEncodingsDialog.title") }

fonts-language-legend =
    .value = { COPY(from_path, "language.label") }
    .accesskey = { COPY(from_path, "language.accesskey") }

fonts-proportional-label =
    .value = { COPY(from_path, "proportional.label") }
    .accesskey = { COPY(from_path, "proportional.accesskey") }

font-language-group-latin =
    .label = { COPY(from_path, "font.langGroup.latin") }
font-language-group-japanese =
    .label = { COPY(from_path, "font.langGroup.japanese") }
font-language-group-trad-chinese =
    .label = { COPY(from_path, "font.langGroup.trad-chinese") }
font-language-group-simpl-chinese =
    .label = { COPY(from_path, "font.langGroup.simpl-chinese") }
font-language-group-trad-chinese-hk =
    .label = { COPY(from_path, "font.langGroup.trad-chinese-hk") }
font-language-group-korean =
    .label = { COPY(from_path, "font.langGroup.korean") }
font-language-group-cyrillic =
    .label = { COPY(from_path, "font.langGroup.cyrillic") }
font-language-group-el =
    .label = { COPY(from_path, "font.langGroup.el") }
font-language-group-other =
    .label = { COPY(from_path, "font.langGroup.other") }
font-language-group-thai =
    .label = { COPY(from_path, "font.langGroup.thai") }
font-language-group-hebrew =
    .label = { COPY(from_path, "font.langGroup.hebrew") }
font-language-group-arabic =
    .label = { COPY(from_path, "font.langGroup.arabic") }
font-language-group-devanagari =
    .label = { COPY(from_path, "font.langGroup.devanagari") }
font-language-group-tamil =
    .label = { COPY(from_path, "font.langGroup.tamil") }
font-language-group-armenian =
    .label = { COPY(from_path, "font.langGroup.armenian") }
font-language-group-bengali =
    .label = { COPY(from_path, "font.langGroup.bengali") }
font-language-group-canadian =
    .label = { COPY(from_path, "font.langGroup.canadian") }
font-language-group-ethiopic =
    .label = { COPY(from_path, "font.langGroup.ethiopic") }
font-language-group-georgian =
    .label = { COPY(from_path, "font.langGroup.georgian") }
font-language-group-gujarati =
    .label = { COPY(from_path, "font.langGroup.gujarati") }
font-language-group-gurmukhi =
    .label = { COPY(from_path, "font.langGroup.gurmukhi") }
font-language-group-khmer =
    .label = { COPY(from_path, "font.langGroup.khmer") }
font-language-group-malayalam =
    .label = { COPY(from_path, "font.langGroup.malayalam") }
font-language-group-math =
    .label = { COPY(from_path, "font.langGroup.math") }
font-language-group-odia =
    .label = { COPY(from_path, "font.langGroup.odia") }
font-language-group-telugu =
    .label = { COPY(from_path, "font.langGroup.telugu") }
font-language-group-kannada =
    .label = { COPY(from_path, "font.langGroup.kannada") }
font-language-group-sinhala =
    .label = { COPY(from_path, "font.langGroup.sinhala") }
font-language-group-tibetan =
    .label = { COPY(from_path, "font.langGroup.tibetan") }

default-font-serif =
    .label = { COPY(from_path, "useDefaultFontSerif.label") }

default-font-sans-serif =
    .label = { COPY(from_path, "useDefaultFontSansSerif.label") }

font-size-label =
    .value = { COPY(from_path, "size.label") }
    .accesskey = { COPY(from_path, "sizeProportional.accesskey") }

font-size-monospace-label =
    .value = { COPY(from_path, "size.label") }
    .accesskey = { COPY(from_path, "sizeMonospace.accesskey") }

font-serif-label =
    .value = { COPY(from_path, "serif.label") }
    .accesskey = { COPY(from_path, "serif.accesskey") }

font-sans-serif-label =
    .value = { COPY(from_path, "sans-serif.label") }
    .accesskey = { COPY(from_path, "sans-serif.accesskey") }

font-monospace-label =
    .value = { COPY(from_path, "monospace.label") }
    .accesskey = { COPY(from_path, "monospace.accesskey") }

font-min-size-label =
    .value = { COPY(from_path, "minSize.label") }
    .accesskey = { COPY(from_path, "minSize.accesskey") }

min-size-none =
    .label = { COPY(from_path, "minSize.none") }

font-control-legend = { COPY(from_path, "fontControl.label") }

use-document-fonts-checkbox =
    .label = { COPY(from_path, "useDocumentFonts.label") }
    .accesskey = { COPY(from_path, "useDocumentFonts.accesskey") }

use-fixed-width-plain-checkbox =
    .label = { COPY(from_path, "useFixedWidthForPlainText.label") }
    .accesskey = { COPY(from_path, "fixedWidth.accesskey") }

text-encoding-legend = { COPY(from_path, "languagesTitle2.label") }

text-encoding-description = { COPY(from_path, "composingDescription2.label") }

font-outgoing-email-label =
    .value = { COPY(from_path, "sendDefaultCharset.label") }
    .accesskey = { COPY(from_path, "sendDefaultCharset.accesskey") }

font-incoming-email-label =
    .value = { COPY(from_path, "viewDefaultCharsetList.label") }
    .accesskey = { COPY(from_path, "viewDefaultCharsetList.accesskey") }

default-font-reply-checkbox =
    .label = { COPY(from_path, "replyInDefaultCharset3.label") }
    .accesskey = { COPY(from_path, "replyInDefaultCharset3.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/fonts.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/colors.ftl",
        "mail/messenger/preferences/colors.ftl",
        transforms_from(
            """
colors-dialog-window =
    .title = { COPY(from_path, "colorsDialog.title") }
    .style = { PLATFORM() ->
        [macos] width: { COPY(from_path, "window.macWidth") } !important
        *[other] width: { COPY(from_path, "window.width") } !important
    }

colors-dialog-legend = { COPY(from_path, "color") }

text-color-label =
    .value = { COPY(from_path, "textColor.label") }
    .accesskey = { COPY(from_path, "textColor.accesskey") }

background-color-label =
    .value = { COPY(from_path, "backgroundColor.label") }
    .accesskey = { COPY(from_path, "backgroundColor.accesskey") }

use-system-colors =
    .label = { COPY(from_path, "useSystemColors.label") }
    .accesskey = { COPY(from_path, "useSystemColors.accesskey") }

colors-link-legend = { COPY(from_path, "links") }

link-color-label =
    .value = { COPY(from_path, "linkColor.label") }
    .accesskey = { COPY(from_path, "linkColor.accesskey") }

visited-link-color-label =
    .value = { COPY(from_path, "visitedLinkColor.label") }
    .accesskey = { COPY(from_path, "visitedLinkColor.accesskey") }

underline-link-checkbox =
    .label = { COPY(from_path, "underlineLinks.label") }
    .accesskey = { COPY(from_path, "underlineLinks.accesskey") }

override-color-label =
    .value = { COPY(from_path, "overridePageColors.label") }
    .accesskey = { COPY(from_path, "overridePageColors.accesskey") }

override-color-always =
    .label = { COPY(from_path, "overridePageColors.always.label") }

override-color-auto =
    .label = { COPY(from_path, "overridePageColors.auto.label") }

override-color-never =
    .label = { COPY(from_path, "overridePageColors.never.label") }
""",
            from_path="mail/chrome/messenger/preferences/colors.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/notifications.ftl",
        "mail/messenger/preferences/notifications.ftl",
        transforms_from(
            """
notifications-dialog-window =
    .title = { COPY(from_path, "notificationsDialog2.title") }

customize-alert-description = { COPY(from_path, "alertCustomization.intro") }

preview-text-checkbox =
    .label = { COPY(from_path, "previewText.label") }
    .accesskey = { COPY(from_path, "previewText.accesskey") }

subject-checkbox =
    .label = { COPY(from_path, "subject.label") }
    .accesskey = { COPY(from_path, "subject.accesskey") }

sender-checkbox =
    .label = { COPY(from_path, "sender.label") }
    .accesskey = { COPY(from_path, "sender.accesskey") }

open-time-label-before =
    .value = { COPY(from_path, "totalOpenTimeBefore.label") }
    .accesskey = { COPY(from_path, "totalOpenTimeBefore.accesskey") }

open-time-label-after =
    .value = { COPY(from_path, "totalOpenTimeEnd.label") }
""",
            from_path="mail/chrome/messenger/preferences/notifications.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/new-tag.ftl",
        "mail/messenger/preferences/new-tag.ftl",
        transforms_from(
            """
tag-dialog-window =
    .title = { COPY(from_path, "newTagDialog1.title") }

tag-name-label =
    .value = { COPY(from_path, "name.label") }
    .accesskey = { COPY(from_path, "name.accesskey") }
""",
            from_path="mail/chrome/messenger/newTagDialog.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/receipts.ftl",
        "mail/messenger/preferences/receipts.ftl",
        transforms_from(
            """
receipts-dialog-window =
    .title = { COPY(from_path, "dialog.title") }

return-receipt-checkbox-control =
    .label = { COPY(from_path, "requestReceipt.label") }
    .acceskey = { COPY(from_path, "requestReceipt.accesskey") }

receipt-arrive-label = { COPY(from_path, "receiptArrive.label") }

receipt-leave-radio-control =
    .label = { COPY(from_path, "leaveIt.label") }
    .acceskey = { COPY(from_path, "leaveIt.accesskey") }

receipt-move-radio-control =
    .label = { COPY(from_path, "moveToSent.label") }
    .acceskey = { COPY(from_path, "moveToSent.accesskey") }

receipt-request-label = { COPY(from_path, "requestMDN.label") }

receipt-return-never-radio-control =
    .label = { COPY(from_path, "never.label") }
    .acceskey = { COPY(from_path, "never.accesskey") }

receipt-return-some-radio-control =
    .label = { COPY(from_path, "returnSome.label") }
    .acceskey = { COPY(from_path, "returnSome.accesskey") }

receipt-not-to-cc-label =
    .value = { COPY(from_path, "notInToCc.label") }
    .acceskey = { COPY(from_path, "notInToCc.accesskey") }

receipt-send-never-label =
    .label = { COPY(from_path, "neverSend.label") }

receipt-send-always-label =
    .label = { COPY(from_path, "alwaysSend.label") }

receipt-send-ask-label =
    .label = { COPY(from_path, "askMe.label") }

sender-outside-domain-label =
    .value = { COPY(from_path, "outsideDomain.label") }
    .acceskey = { COPY(from_path, "outsideDomain.accesskey") }

other-cases-text-label =
    .value = { COPY(from_path, "otherCases.label") }
    .acceskey = { COPY(from_path, "otherCases.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/receipts.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/connection.ftl",
        "mail/messenger/preferences/connection.ftl",
        transforms_from(
            """
connection-dialog-window =
    .title = { COPY(from_path, "connectionsDialog.title") }
    .style = { PLATFORM() ->
        [macos] width: { COPY(from_path, "window.macWidth") } !important
        *[other] width: { COPY(from_path, "window.width") } !important
    }

connection-proxy-legend = { COPY(from_path, "proxyTitle.label") }

proxy-type-no =
    .label = { COPY(from_path, "noProxyTypeRadio.label") }
    .accesskey = { COPY(from_path, "noProxyTypeRadio.accesskey") }

proxy-type-wpad =
    .label = { COPY(from_path, "WPADTypeRadio.label") }
    .accesskey = { COPY(from_path, "WPADTypeRadio.accesskey") }

proxy-type-system =
    .label = { COPY(from_path, "systemTypeRadio.label") }
    .accesskey = { COPY(from_path, "systemTypeRadio.accesskey") }

proxy-type-manual =
    .label = { COPY(from_path, "manualTypeRadio.label") }
    .accesskey = { COPY(from_path, "manualTypeRadio.accesskey") }

proxy-http-label =
    .value = { COPY(from_path, "http.label") }
    .accesskey = { COPY(from_path, "http.accesskey") }

http-port-label =
    .value = { COPY(from_path, "HTTPport.label") }
    .accesskey = { COPY(from_path, "HTTPport.accesskey") }

proxy-http-sharing =
    .label = { COPY(from_path, "proxyHttpSharing.label") }
    .accesskey = { COPY(from_path, "proxyHttpSharing.accesskey") }

proxy-https-label =
    .value = { COPY(from_path, "https.label") }
    .accesskey = { COPY(from_path, "https.accesskey") }

ssl-port-label =
    .value = { COPY(from_path, "SSLport.label") }
    .accesskey = { COPY(from_path, "SSLport.accesskey") }

proxy-socks-label =
    .value = { COPY(from_path, "socks.label") }
    .accesskey = { COPY(from_path, "socks.accesskey") }

socks-port-label =
    .value = { COPY(from_path, "SOCKSport.label") }
    .accesskey = { COPY(from_path, "SOCKSport.accesskey") }

proxy-socks4-label =
    .label = { COPY(from_path, "socks4.label") }
    .accesskey = { COPY(from_path, "socks4.accesskey") }

proxy-socks5-label =
    .label = { COPY(from_path, "socks5.label") }
    .accesskey = { COPY(from_path, "socks5.accesskey") }

proxy-type-auto =
    .label = { COPY(from_path, "autoTypeRadio.label") }
    .accesskey = { COPY(from_path, "autoTypeRadio.accesskey") }

proxy-reload-label =
    .label = { COPY(from_path, "reload.label") }
    .accesskey = { COPY(from_path, "reload.accesskey") }

no-proxy-label =
    .value = { COPY(from_path, "noproxy.label") }
    .accesskey = { COPY(from_path, "noproxy.accesskey") }

no-proxy-example = { COPY(from_path, "noproxyExplain.label") }

no-proxy-localhost-label = { COPY(from_path, "noproxyLocalhostDesc.label") }

proxy-password-prompt =
    .label = { COPY(from_path, "autologinproxy.label") }
    .accesskey = { COPY(from_path, "autologinproxy.accesskey") }
    .tooltiptext = { COPY(from_path, "autologinproxy.tooltip") }

proxy-remote-dns =
    .label = { COPY(from_path, "socksRemoteDNS.label") }
    .accesskey = { COPY(from_path, "socksRemoteDNS.accesskey") }

proxy-enable-doh =
    .label = { COPY(from_path, "dnsOverHttps.label") }
    .accesskey = { COPY(from_path, "dnsOverHttps.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/connection.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/offline.ftl",
        "mail/messenger/preferences/offline.ftl",
        transforms_from(
            """
offline-dialog-window =
    .title = { COPY(from_path, "offlineDialog.title") }

autodetect-online-label =
    .label = { COPY(from_path, "checkAutoDetect.label") }
    .accesskey = { COPY(from_path, "checkAutoDetect.accesskey") }

startup-label = { COPY(from_path, "titleStartUp") }

status-radio-remember =
    .label = { COPY(from_path, "radioRememberPrevState.label") }
    .accesskey = { COPY(from_path, "radioRememberPrevState.accesskey") }

status-radio-ask =
    .label = { COPY(from_path, "radioAskState.label") }
    .accesskey = { COPY(from_path, "radioAskState.accesskey") }

status-radio-always-online =
    .label = { COPY(from_path, "radioAlwaysOnlineState.label") }
    .accesskey = { COPY(from_path, "radioAlwaysOnlineState.accesskey") }

status-radio-always-offline =
    .label = { COPY(from_path, "radioAlwaysOffline.label") }
    .accesskey = { COPY(from_path, "radioAlwaysOffline.accesskey") }

going-online-label = { COPY(from_path, "textGoingOnline") }

going-online-auto =
    .label = { COPY(from_path, "radioAutoSend.label") }
    .accesskey = { COPY(from_path, "radioAutoSend.accesskey") }

going-online-not =
    .label = { COPY(from_path, "radioNotSend.label") }
    .accesskey = { COPY(from_path, "radioNotSend.accesskey") }

going-online-ask =
    .label = { COPY(from_path, "radioAskUnsent.label") }
    .accesskey = { COPY(from_path, "radioAskUnsent.accesskey") }

going-offline-label = { COPY(from_path, "textGoingOffline") }

going-offline-auto =
    .label = { COPY(from_path, "radioAutoDownload.label") }
    .accesskey = { COPY(from_path, "radioAutoDownload.accesskey") }

going-offline-not =
    .label = { COPY(from_path, "radioNotDownload.label") }
    .accesskey = { COPY(from_path, "radioNotDownload.accesskey") }

going-offline-ask =
    .label = { COPY(from_path, "radioAskDownload.label") }
    .accesskey = { COPY(from_path, "radioAskDownload.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/offline.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/sendoptions.ftl",
        "mail/messenger/preferences/sendoptions.ftl",
        transforms_from(
            """
sendoptions-dialog-window =
    .title = { COPY(from_path, "dialog.title") }

send-mail-title = { COPY(from_path, "sendMail.title") }

auto-downgrade-label =
    .label = { COPY(from_path, "autoDowngrade.label") }
    .accesskey = { COPY(from_path, "autoDowngrade.accesskey") }

default-html-format-label = { COPY(from_path, "sendMaildesc.label") }

html-format-ask =
    .label = { COPY(from_path, "askMe.label") }
    .accesskey = { COPY(from_path, "askMe.accesskey") }

html-format-convert =
    .label = { COPY(from_path, "convertPlain.label") }
    .accesskey = { COPY(from_path, "convertPlain.accesskey") }

html-format-send-html =
    .label = { COPY(from_path, "sendHTML.label") }
    .accesskey = { COPY(from_path, "sendHTML.accesskey") }

html-format-send-both =
    .label = { COPY(from_path, "sendBoth.label") }
    .accesskey = { COPY(from_path, "sendBoth.accesskey") }

default-html-format-info = { COPY(from_path, "override.label") }

html-tab-label =
    .label = { COPY(from_path, "HTMLTab.label") }
    .accesskey = { COPY(from_path, "HTMLTab.accesskey") }

plain-tab-label =
    .label = { COPY(from_path, "PlainTextTab.label") }
    .accesskey = { COPY(from_path, "PlainTextTab.accesskey") }

add-domain-button =
    .label = { COPY(from_path, "AddHtmlDomain.label") }
    .accesskey = { COPY(from_path, "AddHtmlDomain.accesskey") }

delete-domain-button =
    .label = { COPY(from_path, "DeleteHtmlDomain.label") }
    .accesskey = { COPY(from_path, "DeleteHtmlDomain.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/sendoptions.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/sendoptions.ftl",
        "mail/messenger/preferences/sendoptions.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("send-message-domain-label"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/sendoptions.dtd",
                    "domaindesc.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/attachment-reminder.ftl",
        "mail/messenger/preferences/attachment-reminder.ftl",
        transforms_from(
            """
attachment-reminder-window =
    .title = { COPY(from_path, "attachmentReminderDialog.title") }

keyword-new-button =
    .label = { COPY(from_path, "newKeywordButton.label") }
    .accesskey = { COPY(from_path, "newKeywordButton.accesskey") }

keyword-edit-button =
    .label = { COPY(from_path, "editKeywordButton1.label") }
    .accesskey = { COPY(from_path, "editKeywordButton1.accesskey") }

keyword-remove-button =
    .label = { COPY(from_path, "removeKeywordButton.label") }
    .accesskey = { COPY(from_path, "removeKeywordButton.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/attachmentReminder.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/attachment-reminder.ftl",
        "mail/messenger/preferences/attachment-reminder.ftl",
        [
            FTL.Message(
                id=FTL.Identifier("attachment-reminder-label"),
                value=REPLACE(
                    "mail/chrome/messenger/preferences/attachmentReminder.dtd",
                    "attachKeywordText.label",
                    {"&brandShortName;": TERM_REFERENCE("brand-short-name")},
                ),
            ),
        ],
    )

    ctx.add_transforms(
        "mail/messenger/preferences/attachment-reminder.ftl",
        "mail/messenger/preferences/attachment-reminder.ftl",
        transforms_from(
            """
new-keyword-title = { COPY(from_path, "attachmentReminderNewDialogTitle") }
new-keyword-label = { COPY(from_path, "attachmentReminderNewText") }

edit-keyword-title = { COPY(from_path, "attachmentReminderEditDialogTitle") }
edit-keyword-label = { COPY(from_path, "attachmentReminderEditText") }
""",
            from_path="mail/chrome/messenger/preferences/preferences.properties",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/permissions.ftl",
        "mail/messenger/preferences/permissions.ftl",
        transforms_from(
            """
permissions-reminder-window =
    .title = { COPY(from_path, "window.title") }
    .style = width: { COPY(from_path, "window.width") };

window-close-key =
    .key = { COPY(from_path, "windowClose.key") }

website-address-label =
    .value = { COPY(from_path, "address.label") }
    .accesskey = { COPY(from_path, "address.accesskey") }

block-button =
    .label = { COPY(from_path, "block.label") }
    .accesskey = { COPY(from_path, "block.accesskey") }

allow-session-button =
    .label = { COPY(from_path, "session.label") }
    .accesskey = { COPY(from_path, "session.accesskey") }

allow-button =
    .label = { COPY(from_path, "allow.label") }
    .accesskey = { COPY(from_path, "allow.accesskey") }

treehead-sitename-label =
    .label = { COPY(from_path, "treehead.sitename.label") }

treehead-status-label =
    .label = { COPY(from_path, "treehead.status.label") }

remove-site-button =
    .label = { COPY(from_path, "removepermission.label") }
    .accesskey = { COPY(from_path, "removepermission.accesskey") }

remove-all-site-button =
    .label = { COPY(from_path, "removeallpermissions.label") }
    .accesskey = { COPY(from_path, "removeallpermissions.accesskey") }

cancel-button =
    .label = { COPY(from_path, "button.cancel.label") }
    .accesskey = { COPY(from_path, "button.cancel.accesskey") }

save-button =
    .label = { COPY(from_path, "button.ok.label") }
    .accesskey = { COPY(from_path, "button.ok.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/permissions.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/permissions.ftl",
        "mail/messenger/preferences/permissions.ftl",
        transforms_from(
            """
permission-can-label = { COPY(from_path, "can") }
permission-can-access-first-party-label = { COPY(from_path, "canAccessFirstParty") }
permission-can-session-label = { COPY(from_path, "canSession") }
permission-cannot-label = { COPY(from_path, "cannot") }

invalid-uri-message = { COPY(from_path, "invalidURI") }
invalid-uri-title = { COPY(from_path, "invalidURITitle") }
""",
            from_path="mail/chrome/messenger/preferences/preferences.properties",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/cookies.ftl",
        "mail/messenger/preferences/cookies.ftl",
        transforms_from(
            """
cookies-window-dialog =
    .title = { COPY(from_path, "window.title") }
    .style = width: { COPY(from_path, "window.width") };

window-close-key =
    .key = { COPY(from_path, "windowClose.key") }

window-focus-search-key =
    .key = { COPY(from_path, "focusSearch1.key") }

window-focus-search-alt-key =
    .key = { COPY(from_path, "focusSearch2.key") }

filter-search-label =
    .value = { COPY(from_path, "filter.label") }
    .accesskey = { COPY(from_path, "filter.accesskey") }

cookies-on-system-label = { COPY(from_path, "cookiesonsystem.label") }

treecol-site-header =
    .label = { COPY(from_path, "cookiedomain.label") }

treecol-name-header =
    .label = { COPY(from_path, "cookiename.label") }

props-name-label =
    .value = { COPY(from_path, "props.name.label") }
props-value-label =
    .value = { COPY(from_path, "props.value.label") }
props-domain-label =
    .value = { COPY(from_path, "props.domain.label") }
props-path-label =
    .value = { COPY(from_path, "props.path.label") }
props-secure-label =
    .value = { COPY(from_path, "props.secure.label") }
props-expires-label =
    .value = { COPY(from_path, "props.expires.label") }
props-container-label =
    .value = { COPY(from_path, "props.container.label") }

remove-cookie-button =
    .label = { COPY(from_path, "button.removecookie.label") }
    .accesskey = { COPY(from_path, "button.removecookie.accesskey") }

remove-all-cookies-button =
    .label = { COPY(from_path, "button.removeallcookies.label") }
    .accesskey = { COPY(from_path, "button.removeallcookies.accesskey") }

cookie-close-button =
    .label = { COPY(from_path, "button.close.label") }
    .accesskey = { COPY(from_path, "button.close.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/cookies.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/dock-options.ftl",
        "mail/messenger/preferences/dock-options.ftl",
        transforms_from(
            """
dock-options-window-dialog =
    .title = { COPY(from_path, "dockOptionsDialog.title") }
    .style = width: { COPY(from_path, "window.macWidth") };

bounce-system-dock-icon =
    .label = { COPY(from_path, "bounceSystemDockIcon.label") }
    .accesskey = { COPY(from_path, "bounceSystemDockIcon.accesskey") }

dock-icon-legend = { COPY(from_path, "dockIconBadge.label") }

dock-icon-show-label =
    .value = { COPY(from_path, "dockIconShow.label") }

count-unread-messages-radio =
    .label = { COPY(from_path, "showAllUnreadMessagesCount.label") }
    .accesskey = { COPY(from_path, "showAllUnreadMessagesCount.accesskey") }

count-new-messages-radio =
    .label = { COPY(from_path, "newMessagesCountDock.label") }
    .accesskey = { COPY(from_path, "newMessagesCountDock.accesskey") }

notification-settings-info = { COPY(from_path, "directNotificationSettings.label") }
""",
            from_path="mail/chrome/messenger/preferences/dockoptions.dtd",
        ),
    )

    ctx.add_transforms(
        "mail/messenger/preferences/application-manager.ftl",
        "mail/messenger/preferences/application-manager.ftl",
        transforms_from(
            """
app-manager-window-dialog =
    .title = { COPY(from_path, "appManager.title") }
    .style = { COPY(from_path, "appManager.style") }

remove-app-button =
    .label = { COPY(from_path, "remove.label") }
    .accesskey = { COPY(from_path, "remove.accesskey") }
""",
            from_path="mail/chrome/messenger/preferences/applicationManager.dtd",
        ),
    )

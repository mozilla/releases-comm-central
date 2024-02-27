#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// This file contains Thunderbird specific settings and overrides to settings
// from mailnews.js, all.js etc. Settings in this file will take
// precedence for Thunderbird.

#ifdef XP_UNIX
#ifndef XP_MACOSX
#define UNIX_BUT_NOT_MAC
#endif
#endif

pref("general.skins.selectedSkin", "classic/1.0");

#ifdef XP_MACOSX
pref("mail.biff.animate_dock_icon", false);
#endif

pref("mail.rights.version", 0);

// Don't show the about:rights notification in debug or non-official builds.
#ifdef DEBUG
pref("mail.rights.override", true);
#endif
#ifndef MOZILLA_OFFICIAL
pref("mail.rights.override", true);
#endif

// At startup, should we check to see if the installation
// date is older than some threshold
pref("app.update.checkInstallTime", true);

// The number of days a binary is permitted to be old without checking is defined in
// thunderbird-branding.js (app.update.checkInstallTime.days)

// The minimum delay in seconds for the timer to fire between the notification
// of each consumer of the timer manager.
// minimum=30 seconds, default=120 seconds, and maximum=300 seconds
pref("app.update.timerMinimumDelay", 120);

// The minimum delay in milliseconds for the first firing after startup of the timer
// to notify consumers of the timer manager.
// minimum=10 seconds, default=30 seconds, and maximum=120 seconds
pref("app.update.timerFirstInterval", 30000);

// App-specific update preferences

// The interval to check for updates (app.update.interval) is defined in
// the branding files.

// Enables some extra Application Update Logging (can reduce performance)
pref("app.update.log", false);
// Causes Application Update Logging to be sent to a file in the profile
// directory. This preference is automatically disabled on application start to
// prevent it from being left on accidentally. Turning this pref on enables
// logging, even if app.update.log is false.
pref("app.update.log.file", false);

// The number of general background check failures to allow before notifying the
// user of the failure. User initiated update checks always notify the user of
// the failure.
pref("app.update.backgroundMaxErrors", 10);

// Ids of the links to the "What's new" update documentation
pref("app.update.link.updateAvailableWhatsNew", "update-available-whats-new");
pref("app.update.link.updateManualWhatsNew", "update-manual-whats-new");

// How many times we should let downloads fail before prompting the user to
// download a fresh installer.
pref("app.update.download.promptMaxAttempts", 2);

// How many times we should let an elevation prompt fail before prompting the user to
// download a fresh installer.
pref("app.update.elevation.promptMaxAttempts", 2);

#ifdef NIGHTLY_BUILD
  // Whether to delay popup notifications when an update is available and
  // suppress them when an update is installed and waiting for user to restart.
  // If set to true, these notifications will immediately be shown as banners in
  // the app menu and as badges on the app menu button. Update available
  // notifications will not create popup prompts until a week has passed without
  // the user installing the update. Update restart notifications will not
  // create popup prompts at all. This doesn't affect update notifications
  // triggered by errors/failures or manual install prompts.
  pref("app.update.suppressPrompts", false);
#endif

// If set to true, a message will be displayed in the hamburger menu while
// an update is being downloaded.
pref("app.update.notifyDuringDownload", false);

// If set to true, the Update Service will automatically download updates when
// user can apply updates. This pref is no longer used on Windows, except as the
// default value to migrate to the new location that this data is now stored
// (which is in a file in the update directory). Because of this, this pref
// should no longer be used directly. Instead, getAppUpdateAutoEnabled and
// getAppUpdateAutoEnabled from UpdateUtils.jsm should be used.
#ifndef XP_WIN
 pref("app.update.auto", true);
#endif

// If set to true, the Update Service will apply updates in the background
// when it finishes downloading them.
pref("app.update.staging.enabled", true);

// Update service URL:
// app.update.url was removed in Bug 1630041
// app.update.url.manual is in branding section
// app.update.url.details is in branding section
// app.update.promptWaitTime is in branding section

// Whether or not to attempt using the service for updates.
#ifdef MOZ_MAINTENANCE_SERVICE
pref("app.update.service.enabled", true);
#endif

#ifdef XP_WIN
// This pref prevents BITS from being used by Thunderbird to download updates.
pref("app.update.BITS.enabled", false);
#endif

// Release notes URL
pref("app.releaseNotesURL", "https://live.thunderbird.net/%APP%/releasenotes?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%");

#ifdef XP_MACOSX
  // If set to true, Thunderbird will automatically restart if it is left
  // running with no windows open.
  pref("app.update.noWindowAutoRestart.enabled", true);
  // How long to wait after all windows are closed before restarting,
  // in milliseconds. 5 min = 300000 ms.
  pref("app.update.noWindowAutoRestart.delayMs", 300000);
#endif

// URL for "Learn More" for DataCollection
pref("toolkit.datacollection.infoURL",
     "https://www.mozilla.org/thunderbird/legal/privacy/#telemetry");

// URL for "Learn More" for Crash Reporter.
pref("toolkit.crashreporter.infoURL",
     "https://www.mozilla.org/thunderbird/legal/privacy/#crash-reporter");

pref("datareporting.healthreport.uploadEnabled", true); // Required to enable telemetry pings.
pref("datareporting.healthreport.infoURL", "https://www.mozilla.org/thunderbird/legal/privacy/#health-report");

#ifdef MOZ_DATA_REPORTING
pref("datareporting.policy.dataSubmissionEnabled", true);
pref("datareporting.policy.dataSubmissionPolicyAcceptedVersion", 0);
pref("datareporting.policy.dataSubmissionPolicyBypassNotification", false);
pref("datareporting.policy.currentPolicyVersion", 2);
pref("datareporting.policy.firstRunURL", "https://www.mozilla.org/thunderbird/legal/privacy/");
#endif

// Base URL for web-based support pages.
pref("app.support.baseURL", "https://support.thunderbird.net/%APP%/%VERSION%/%OS%/%LOCALE%/");

// Base url for web-based feedback pages.
pref("app.feedback.baseURL", "https://connect.mozilla.org/");

// Allows using Thundebird without a configured email account, blocking the
// account setup prompt at startup.
pref("app.use_without_mail_account", false);

// Show error messages in error console.
pref("javascript.options.showInConsole", true);

#ifdef NIGHTLY_BUILD
pref("signon.management.page.os-auth.enabled", true);
#else
pref("signon.management.page.os-auth.enabled", false);
#endif

// Controls enabling of the extension system logging (can reduce performance)
pref("extensions.logging.enabled", false);
pref("extensions.overlayloader.loglevel", "warn");

pref("extensions.abuseReport.enabled", false);

// Strict compatibility makes add-ons incompatible by default.
#ifndef RELEASE_OR_BETA
pref("extensions.strictCompatibility", false);
#else
pref("extensions.strictCompatibility", true);
#endif

pref("extensions.update.autoUpdateDefault", true);

pref("extensions.systemAddon.update.enabled", true);  // See bug 1462160.

// Disable add-ons installed into the shared user and shared system areas by
// default. This does not include the application directory. See the SCOPE
// constants in AddonManager.jsm for values to use here
pref("extensions.autoDisableScopes", 15);

// Enable add-ons installed and owned by the application, like the default theme.
pref("extensions.startupScanScopes", 4);

// Gecko Profiler
pref("extensions.geckoProfiler.acceptedExtensionIds", "geckoprofiler@mozilla.com,quantum-foxfooding@mozilla.com,raptor@mozilla.org");

// Allow "legacy" XUL/XPCOM extensions.
pref("extensions.legacy.enabled", true);

// Preferences for AMO integration
pref("extensions.getAddons.cache.enabled", true);
pref("extensions.getAddons.maxResults", 15);
pref("extensions.getAddons.get.url", "https://services.addons.thunderbird.net/api/v3/addons/search/?guid=%IDS%&lang=%LOCALE%");
pref("extensions.getAddons.compatOverides.url", "https://services.addons.thunderbird.net/api/v3/addons/compat-override/?guid=%IDS%&lang=%LOCALE%");
pref("extensions.getAddons.link.url", "https://addons.thunderbird.net/%LOCALE%/%APP%/");
pref("browser.dictionaries.download.url", "https://addons.thunderbird.net/%LOCALE%/%APP%/language-tools/");
pref("extensions.getAddons.recommended.url", "https://services.addons.thunderbird.net/%LOCALE%/%APP%/api/%API_VERSION%/list/recommended/all/%MAX_RESULTS%/%OS%/%VERSION%?src=thunderbird");
pref("extensions.getAddons.search.browseURL", "https://addons.thunderbird.net/%LOCALE%/%APP%/search/?q=%TERMS%&appver=%VERSION%&platform=%OS%");
pref("extensions.getAddons.search.url", "https://services.addons.thunderbird.net/%LOCALE%/%APP%/api/%API_VERSION%/search/%TERMS%/all/%MAX_RESULTS%/%OS%/%VERSION%/%COMPATIBILITY_MODE%?src=thunderbird");
pref("extensions.webservice.discoverURL", "https://services.addons.thunderbird.net/%LOCALE%/%APP%/discovery/pane/%VERSION%/%OS%");
pref("extensions.getAddons.langpacks.url", "https://services.addons.thunderbird.net/api/v3/addons/language-tools/?app=thunderbird&type=language&appversion=%VERSION%");
pref("extensions.getAddons.discovery.api_url", "https://services.addons.thunderbird.net/api/v4/discovery/?lang=%LOCALE%&edition=%DISTRIBUTION%");

// Blocklist preferences
pref("extensions.blocklist.detailsURL", "https://blocked.cdn.mozilla.net/");
pref("extensions.blocklist.itemURL", "https://blocked.cdn.mozilla.net/%blockID%.html");

// Remote settings preferences
pref("services.settings.server", "https://thunderbird-settings.thunderbird.net/v1");
pref("services.settings.default_bucket", "thunderbird");
pref("security.content.signature.root_hash", "[CONTENT SIGNING DISABLED - see bug 1612380]");

// Show new install UI with permission lists
pref("extensions.webextOptionalPermissionPrompts", true);

// Whether to use client certificates stored in OS certificate storage.
// This does not work for S/MIME. See bug 1726442.
pref("security.osclientcerts.autoload", false);

// Symmetric (can be overridden by individual extensions) update preferences.
// e.g.
//  extensions.{GUID}.update.enabled
//  extensions.{GUID}.update.url
//  extensions.{GUID}.update.interval
//  .. etc ..
//
pref("extensions.update.enabled", true);
pref("extensions.update.url", "https://versioncheck.addons.thunderbird.net/update/VersionCheck.php?reqVersion=%REQ_VERSION%&id=%ITEM_ID%&version=%ITEM_VERSION%&maxAppVersion=%ITEM_MAXAPPVERSION%&status=%ITEM_STATUS%&appID=%APP_ID%&appVersion=%APP_VERSION%&appOS=%APP_OS%&appABI=%APP_ABI%&locale=%APP_LOCALE%&currentAppVersion=%CURRENT_APP_VERSION%&updateType=%UPDATE_TYPE%&compatMode=%COMPATIBILITY_MODE%");

pref("extensions.update.background.url", "https://versioncheck-bg.addons.thunderbird.net/update/VersionCheck.php?reqVersion=%REQ_VERSION%&id=%ITEM_ID%&version=%ITEM_VERSION%&maxAppVersion=%ITEM_MAXAPPVERSION%&status=%ITEM_STATUS%&appID=%APP_ID%&appVersion=%APP_VERSION%&appOS=%APP_OS%&appABI=%APP_ABI%&locale=%APP_LOCALE%&currentAppVersion=%CURRENT_APP_VERSION%&updateType=%UPDATE_TYPE%&compatMode=%COMPATIBILITY_MODE%");

pref("extensions.update.interval", 86400);  // Check for updates to Extensions and
                                            // Themes every day

pref("extensions.dss.switchPending", false);    // Non-dynamic switch pending after next

// Don't show recommendations on the extension and theme list views.
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
// Don't allow content scripts on these web sites
pref("extensions.webextensions.restrictedDomains", "accounts-static.cdn.mozilla.net,accounts.firefox.com,addons.cdn.mozilla.net,addons.mozilla.org,api.accounts.firefox.com,content.cdn.mozilla.net,discovery.addons.mozilla.org,install.mozilla.org,oauth.accounts.firefox.com,profile.accounts.firefox.com,support.mozilla.org,sync.services.mozilla.com,addons.thunderbird.net");

// Define Thunderbird specific add-on related URLs (not used in toolkit code).
pref("extensions.canonicalAddonServer.url", "https://addons.thunderbird.net");
pref("extensions.alternativeAddonSearch.url", "https://extension-finder.thunderbird.net");

pref("lightweightThemes.update.enabled", true);

// Use for in-content pages the theme's toolbar color scheme when none is set in the theme.
pref("browser.theme.unified-color-scheme", true);

// Built-in default permissions.
pref("permissions.manager.defaultsUrl", "resource://app/defaults/permissions");

#ifdef UNIX_BUT_NOT_MAC
pref("general.autoScroll", false);
#else
pref("general.autoScroll", true);
#endif

pref("mail.shell.checkDefaultClient", true);
pref("mail.spellcheck.inline", true);

// Force the unit shown for the size of all folders. If empty, the unit
// is determined automatically for each folder. Allowed values: KB/MB/<empty string>
pref("mail.folderpane.sizeUnits", "");
// Summarize messages count and size of subfolders into a collapsed parent?
// Allowed values: true/false
pref("mail.folderpane.sumSubfolders", true);

// target folder URI used for the last move or copy
pref("mail.last_msg_movecopy_target_uri", "");
// last move or copy operation was a move
pref("mail.last_msg_movecopy_was_move", true);

//Set the font color for links to something lighter
pref("browser.anchor_color", "#0B6CDA");

#ifdef XP_MACOSX
pref("browser.preferences.animateFadeIn", true);
#else
pref("browser.preferences.animateFadeIn", false);
#endif
pref("browser.preferences.search", true);

// Whether the results panel should be kept open during IME composition.
// The default value is false because some IME open a picker panel, and we end
// up with two panels on top of each other. Since for now we can't detect that
// we leave this choice to the user, hopefully in the future this can be flipped
// for everyone.
pref("browser.urlbar.keepPanelOpenDuringImeComposition", false);

pref("accessibility.typeaheadfind", false);
pref("accessibility.typeaheadfind.timeout", 5000);
pref("accessibility.typeaheadfind.linksonly", false);
pref("accessibility.typeaheadfind.flashBar", 1);

pref("mail.close_message_window.on_delete", false);

// Number of lines of To/CC/BCC address headers to show before "more"
// truncates the list.
pref("mailnews.headers.show_n_lines_before_more", 1);

// We want to keep track of what items are appropriate in
// XULStore.json. We use versioning to scrub out the things
// that have become obsolete.
// The value will always be set by startup code and must not be changed
// here. A value of 0 means a new profile.
pref("mail.ui-rdf.version", 0);

/////////////////////////////////////////////////////////////////
// Overrides of the core mailnews.js and composer.js prefs
/////////////////////////////////////////////////////////////////
pref("mail.showCondensedAddresses", true); // show the friendly display name for people I know

pref("mailnews.attachments.display.start_expanded", false);
// hidden pref for changing how we present attachments in the message pane
pref("mail.pane_config.dynamic", 2);
pref("editor.singleLine.pasteNewlines", 4);  // substitute commas for new lines in single line text boxes
pref("editor.CR_creates_new_p", true);
pref("mail.compose.default_to_paragraph", true);

// If true, when pasting a URL, paste the Open Graph / Twitter Card details
// we can extract from the URL instead.
pref("mail.compose.add_link_preview", false);

// hidden pref to ensure a certain number of headers in the message pane
// to avoid the height of the header area from changing when headers are present / not present
pref("mailnews.headers.minNumHeaders", 0); // 0 means we ignore this pref

// 0=no header, 1="<author> wrote:", 2="On <date> <author> wrote:"
// 3="<author> wrote On <date>:", 4=user specified
pref("mailnews.reply_header_type", 2);

pref("mail.operate_on_msgs_in_collapsed_threads", true);
pref("mail.warn_on_collapsed_thread_operation", true);
pref("mail.warn_on_shift_delete", true);

// When using commands like "next message" or "previous message", leave
// at least this percentage of the thread pane visible above / below the
// selected message.
pref("mail.threadpane.padding.top_percent", 10);
pref("mail.threadpane.padding.bottom_percent", 10);

// Use correspondents column instead of from/recipient columns.
pref("mail.threadpane.use_correspondents", true);

// To allow images to be inserted into a composition with an auth prompt, we
// need the following two.
pref("network.auth.subresource-img-cross-origin-http-auth-allow", true);
pref("network.auth.non-web-content-triggered-resources-http-auth-allow", true);

// 0=as attachment 2=default forward as inline with attachments
pref("mail.forward_message_mode", 2);

pref("mailnews.send.loglevel", "Warn");

// End core mailnews.js pref overrides
/////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////
// Overrides for generic app behavior from the core all.js
/////////////////////////////////////////////////////////////////

pref("browser.hiddenWindowChromeURL", "chrome://messenger/content/hiddenWindowMac.xhtml");

pref("offline.startup_state",            2);
// 0 Ask before sending unsent messages when going online
// 1 Always send unsent messages when going online
// 2 Never send unsent messages when going online
pref("offline.send.unsent_messages",            0);

// 0 Ask before synchronizing the offline mail store when going offline
// 1 Always synchronize the offline store when going offline
// 2 Never synchronize the offline store when going offline
pref("offline.download.download_messages",  0);

// All platforms can automatically move the user offline or online based on
// the network connection.
pref("offline.autoDetect", true);

// Disable preconnect and friends due to privacy concerns. They are not
// sent through content policies.
pref("network.http.speculative-parallel-limit", 0);

// Expose only select protocol handlers. All others should go
// through the external protocol handler route.
// If you are changing this list, you may need to also consider changing the
// list in nsMsgContentPolicy::IsExposedProtocol.
pref("network.protocol-handler.expose-all", false);
pref("network.protocol-handler.expose.mailto", true);
pref("network.protocol-handler.expose.mid", true);
pref("network.protocol-handler.expose.news", true);
pref("network.protocol-handler.expose.snews", true);
pref("network.protocol-handler.expose.nntp", true);
pref("network.protocol-handler.expose.imap", true);
pref("network.protocol-handler.expose.pop", true);
pref("network.protocol-handler.expose.mailbox", true);
// Although we allow these to be exposed internally, there are various places
// (e.g. message pane) where we may divert them out to external applications.
pref("network.protocol-handler.expose.about", true);
pref("network.protocol-handler.expose.blob", true);
pref("network.protocol-handler.expose.data", true);
pref("network.protocol-handler.expose.file", true);
pref("network.protocol-handler.expose.http", true);
pref("network.protocol-handler.expose.https", true);
pref("network.protocol-handler.expose.javascript", true);
pref("network.protocol-handler.expose.moz-extension", true);

// suppress external-load warning for standard browser schemes
pref("network.protocol-handler.warn-external.http", false);
pref("network.protocol-handler.warn-external.https", false);
pref("network.protocol-handler.warn-external.ftp", false);

// prevent web pages from registering mailnews protocol handlers
pref("network.protocol-handler.external.cid", false);
pref("network.protocol-handler.external.mid", false);
pref("network.protocol-handler.external.mailto", false);
pref("network.protocol-handler.external.imap", false);
pref("network.protocol-handler.external.imap-message", false);
pref("network.protocol-handler.external.pop", false);
pref("network.protocol-handler.external.pop3", false);
pref("network.protocol-handler.external.mailbox", false);
pref("network.protocol-handler.external.mailbox-message", false);
pref("network.protocol-handler.external.smtp", false);
pref("network.protocol-handler.external.smtps", false);
pref("network.protocol-handler.external.nntp", false);
pref("network.protocol-handler.external.news", false);
pref("network.protocol-handler.external.news-message", false);
pref("network.protocol-handler.external.snews", false);
pref("network.protocol-handler.external.ldap", false);
pref("network.protocol-handler.external.ldaps", false);
pref("network.protocol-handler.external.webcal", false);
pref("network.protocol-handler.external.webcals", false);
pref("network.protocol-handler.external.moz-cal-handle-itip", false);
pref("network.protocol-handler.external.smile", false);

pref("network.hosts.smtp_server",           "mail");
pref("network.hosts.pop_server",            "mail");

// For testing purposes only: Flipping this pref to true allows
// to skip the assertion that every about page ships with a CSP.
pref("dom.security.skip_about_page_has_csp_assert", true);

pref("security.warn_entering_secure", false);
pref("security.warn_entering_weak", false);
pref("security.warn_leaving_secure", false);
pref("security.warn_viewing_mixed", false);
pref("security.aboutcertificate.enabled", true);

// Don't automatically cleanup intermediate CA certificates that core
// has on a preloaded list, it causes S/MIME failures. (Bug 1777336)
pref("security.intermediate_preloading_healer.enabled", false);

// Don't show a prompt for external applications.
pref("security.external_protocol_requires_permission", false);

// Prompt for the primary password prior to opening application windows,
// to avoid the race that triggers multiple prompts (see bug 177175).
pref("security.prompt_for_master_password_on_startup", true);

pref("general.config.obscure_value", 0); // for MCD .cfg files

pref("browser.display.auto_quality_min_font_size", 0);

pref("view_source.syntax_highlight", false);

/////////////////////////////////////////////////////////////////
// End core all.js pref overrides
/////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////
// Generic browser related prefs.
/////////////////////////////////////////////////////////////////
pref("browser.send_pings", false);
pref("browser.xul.error_pages.expert_bad_cert", false);

// Attachment download manager settings
pref("browser.download.useDownloadDir", false);
pref("browser.download.folderList", 0);
pref("browser.download.manager.showAlertOnComplete", false);
pref("browser.download.manager.showAlertInterval", 2000);
pref("browser.download.manager.retention", 1);
pref("browser.download.manager.showWhenStarting", false);
pref("browser.download.manager.closeWhenDone", true);
pref("browser.download.manager.focusWhenStarting", false);
pref("browser.download.manager.flashCount", 0);
pref("browser.download.manager.addToRecentDocs", true);
#ifndef XP_MACOSX
pref("browser.helperApps.deleteTempFileOnExit", true);
#endif

// Not used in Thunderbird.
pref("browser.startup.homepage.abouthome_cache.enabled", true);

pref("spellchecker.dictionary", "");
// Dictionary download preference
pref("spellchecker.dictionaries.download.url", "https://addons.thunderbird.net/%LOCALE%/%APP%/dictionaries/");

// profile.force.migration can be used to bypass the migration wizard, forcing migration from a particular
// mail application without any user intervention. Possible values are:
// seamonkey (mozilla suite) and outlook.
pref("profile.force.migration", "");

// prefs to control the mail alert notification
#ifndef XP_MACOSX
pref("alerts.totalOpenTime", 10000);
#endif

// Disable new windows notifications until they are fully supported by Thunderbird (bug 1838139).
#ifdef XP_WIN
pref("alerts.useSystemBackend", false);
#endif

// analyze urls in mail messages for scams
pref("mail.phishing.detection.enabled", true);
pref("mail.phishing.detection.disallow_form_actions", true);

pref("browser.safebrowsing.reportPhishURL", "https://%LOCALE%.phish-report.mozilla.com/?hl=%LOCALE%");

// prevent status-bar spoofing even if people are foolish enough to turn on JS
pref("dom.disable_window_status_change",          true);

// If a message is opened using Enter or a double click, what should we do?
// 0 - open it in a new window
// 1 - open it in an existing window
// 2 - open it in a new tab
pref("mail.openMessageBehavior", 2);
// If messages or folders are opened using the context menu or a middle click,
// should we open them in the foreground or in the background?
pref("mail.tabs.loadInBackground", true);

// Tabs
pref("mail.tabs.tabMinWidth", 100);
pref("mail.tabs.tabMaxWidth", 250);
pref("mail.tabs.tabClipWidth", 140);
pref("mail.tabs.autoHide", true);
pref("mail.tabs.closeWindowWithLastTab", true);

// Allow the tabs to be in the titlebar on supported systems
pref("mail.tabs.drawInTitlebar", true);

// The breakpad report server to link to in about:crashes
pref("breakpad.reportURL", "https://crash-stats.mozilla.com/report/index/");

// OS Integrated Search and Indexing
#ifdef XP_WIN
pref("mail.winsearch.enable", false);
pref("mail.winsearch.firstRunDone", false);
#else
#ifdef XP_MACOSX
pref("mail.spotlight.enable", false);
pref("mail.spotlight.firstRunDone", false);
#endif
#endif

// -- Windows Search/Spotlight logging options
#ifdef XP_WIN
pref("mail.winsearch.loglevel", "Warn");
#else
#ifdef XP_MACOSX
pref("mail.spotlight.loglevel", "Warn");
#endif
#endif

// Whether to use a panel that looks like an OS X sheet for customization
#ifdef XP_MACOSX
pref("toolbar.customization.usesheet", true);
#else
pref("toolbar.customization.usesheet", false);
#endif

// Start compositions with (empty) attachment pane showing
pref("mail.compose.show_attachment_pane", false);
// Check for missing attachments?
pref("mail.compose.attachment_reminder", true);
// Words that should trigger a missing attachments warning.
pref("mail.compose.attachment_reminder_keywords", "chrome://messenger/locale/messengercompose/composeMsgs.properties");
// When no action is taken on the inline missing attachment notification,
// show an alert on send?
pref("mail.compose.attachment_reminder_aggressive", true);

// True if the user should be notified when attaching big files
pref("mail.compose.big_attachments.notify", true);
// Size (in kB) to automatically prompt for conversion of attachments to
// cloud links
pref("mail.compose.big_attachments.threshold_kb", 5120);
// True if the user should be notified that links will be inserted into
// their message when the upload is completed
pref("mail.compose.big_attachments.insert_notification", true);

// While false, display information about editing sending identity in compose.
pref("mail.compose.warned_about_customize_from", false);

pref("browser.formfill.enable", true);

// Disable autoplay as we don't handle audio elements in emails very well.
// See bug 515082.
pref("media.autoplay.enabled", false);

// whether to hide the timeline view by default in the faceted search display
pref("gloda.facetview.hidetimeline", true);

// Behavior of sort-by setting in search results:
// 0 - default to "relevance", and don't remember user setting when it is changed (== old behavior)
// 1 - default to "date", but don't remember user setting when it is changed
// 2 - default to "relevance", but remember user preference when it is changed
// 3 - default to "date", but remember user preference when it is changed
pref("gloda.facetview.sortby", 2);

// Enable gloda by default!
pref("mailnews.database.global.indexer.enabled", true);
// Limit the number of gloda message results
pref("mailnews.database.global.search.msg.limit", 1000);

// Serif fonts look dated.  Switching those language families to sans-serif
// where we think it makes sense.  Worth investigating for other font families
// as well, viz bug 520824.  See all.js for the rest of the font families
// preferences.
pref("font.default", "sans-serif");
pref("font.default.x-unicode", "sans-serif");
pref("font.default.x-western", "sans-serif");
pref("font.default.x-cyrillic", "sans-serif");
pref("font.default.el", "sans-serif");

#ifdef XP_WIN
pref("font.name.monospace.x-unicode", "Consolas");
pref("font.name.sans-serif.x-unicode", "Calibri");
pref("font.name.serif.x-unicode", "Cambria");
pref("font.size.monospace.x-unicode", 14);
pref("font.size.variable.x-unicode", 17);

pref("font.name.monospace.x-western", "Consolas");
pref("font.name.sans-serif.x-western", "Calibri");
pref("font.name.serif.x-western", "Cambria");
pref("font.size.monospace.x-western", 14);
pref("font.size.variable.x-western", 17);

pref("font.name.monospace.x-cyrillic", "Consolas");
pref("font.name.sans-serif.x-cyrillic", "Calibri");
pref("font.name.serif.x-cyrillic", "Cambria");
pref("font.size.monospace.x-cyrillic", 14);
pref("font.size.variable.x-cyrillic", 17);

pref("font.name.monospace.el", "Consolas");
pref("font.name.sans-serif.el", "Calibri");
pref("font.name.serif.el", "Cambria");
pref("font.size.monospace.el", 14);
pref("font.size.variable.el", 17);

pref("mail.font.windows.version", 2);
#endif

#ifdef XP_MACOSX
pref("font.name.sans-serif.x-unicode", "Lucida Grande");
pref("font.name.monospace.x-unicode", "Menlo");
pref("font.name-list.sans-serif.x-unicode", "Lucida Grande");
pref("font.name-list.monospace.x-unicode", "Menlo, Monaco");
pref("font.size.variable.x-unicode", 15);
pref("font.size.monospace.x-unicode", 12);

pref("font.name.sans-serif.x-western", "Lucida Grande");
pref("font.name.monospace.x-western", "Menlo");
pref("font.name-list.sans-serif.x-western", "Lucida Grande");
pref("font.name-list.monospace.x-western", "Menlo, Monaco");
pref("font.size.variable.x-western", 15);
pref("font.size.monospace.x-western", 12);

pref("font.name.sans-serif.x-cyrillic", "Lucida Grande");
pref("font.name.monospace.x-cyrillic", "Menlo");
pref("font.name-list.sans-serif.x-cyrillic", "Lucida Grande");
pref("font.name-list.monospace.x-cyrillic", "Menlo, Monaco");
pref("font.size.variable.x-cyrillic", 15);
pref("font.size.monospace.x-cyrillic", 12);

pref("font.name.sans-serif.el", "Lucida Grande");
pref("font.name.monospace.el", "Menlo");
pref("font.name-list.sans-serif.el", "Lucida Grande");
pref("font.name-list.monospace.el", "Menlo, Monaco");
pref("font.size.variable.el", 15);
pref("font.size.monospace.el", 12);
#endif

// Since different versions of Windows need different settings, we'll handle
// this in MailMigrator.jsm.

// Linux, in other words.  Other OSes may wish to override.
#ifdef UNIX_BUT_NOT_MAC
// The font.name-list fallback is defined in case font.name isn't
// present -- e.g. in case a profile that's been used on Windows Vista or above
// is used on Linux.
pref("font.name-list.serif.x-unicode", "serif");
pref("font.name-list.sans-serif.x-unicode", "sans-serif");
pref("font.name-list.monospace.x-unicode", "monospace");

pref("font.name-list.serif.x-western", "serif");
pref("font.name-list.sans-serif.x-western", "sans-serif");
pref("font.name-list.monospace.x-western", "monospace");

pref("font.name-list.serif.x-cyrillic", "serif");
pref("font.name-list.sans-serif.x-cyrillic", "sans-serif");
pref("font.name-list.monospace.x-cyrillic", "monospace");

pref("font.name-list.serif.el", "serif");
pref("font.name-list.sans-serif.el", "sans-serif");
pref("font.name-list.monospace.el", "monospace");
#endif

pref("mail.setup.loglevel", "Warn");

// Handle links targeting new windows (from within content tabs)
// These are the values that Firefox can be set to:
// 0=default window, 1=current window/tab, 2=new window,
// 3=new tab in most recent window
//
// Thunderbird only supports a value of 3. Other values can be set, but are
// not implemented or supported.
pref("browser.link.open_newwindow", 3);

// These are the values that Firefox can be set to:
// 0: no restrictions - divert everything
// 1: don't divert window.open at all
// 2: don't divert window.open with features
//
// Thunderbird only supports a value of 0. Other values can be set, but are
// not implemented or supported.
pref("browser.link.open_newwindow.restriction", 0);

pref("browser.tabs.loadDivertedInBackground", false);

pref("extensions.webextensions.remote", true);
pref("extensions.webextensions.background-delayed-startup", true);

// Browser icon prefs
pref("browser.chrome.site_icons", true);
pref("browser.chrome.favicons", true);

// Enable places by default as we want to store global history for visited links
// Below we define reasonable defaults as copied from Firefox so that we have
// something sensible.
pref("places.history.enabled", true);

// the (maximum) number of the recent visits to sample
// when calculating frecency
pref("places.frecency.numVisits", 10);

// buckets (in days) for frecency calculation
pref("places.frecency.firstBucketCutoff", 4);
pref("places.frecency.secondBucketCutoff", 14);
pref("places.frecency.thirdBucketCutoff", 31);
pref("places.frecency.fourthBucketCutoff", 90);

// weights for buckets for frecency calculations
pref("places.frecency.firstBucketWeight", 100);
pref("places.frecency.secondBucketWeight", 70);
pref("places.frecency.thirdBucketWeight", 50);
pref("places.frecency.fourthBucketWeight", 30);
pref("places.frecency.defaultBucketWeight", 10);

// bonus (in percent) for visit transition types for frecency calculations
pref("places.frecency.embedVisitBonus", 0);
pref("places.frecency.framedLinkVisitBonus", 0);
pref("places.frecency.linkVisitBonus", 100);
pref("places.frecency.typedVisitBonus", 2000);
pref("places.frecency.bookmarkVisitBonus", 75);
pref("places.frecency.downloadVisitBonus", 0);
pref("places.frecency.permRedirectVisitBonus", 0);
pref("places.frecency.tempRedirectVisitBonus", 0);
pref("places.frecency.reloadVisitBonus", 0);
pref("places.frecency.defaultVisitBonus", 0);

// bonus (in percent) for place types for frecency calculations
pref("places.frecency.unvisitedBookmarkBonus", 140);
pref("places.frecency.unvisitedTypedBonus", 200);

// Enables alternative frecency calculation for origins.
pref("places.frecency.origins.alternative.featureGate", false);

// The default Places log level.
pref("places.loglevel", "Error");

// Windows taskbar support
#ifdef XP_WIN
pref("mail.taskbar.lists.enabled", true);
pref("mail.taskbar.lists.tasks.enabled", true);
#endif

// Account provisioner.
pref("mail.provider.providerList", "https://broker.thunderbird.net/provider/list");
pref("mail.provider.suggestFromName", "https://broker.thunderbird.net/provider/suggest");
pref("mail.provider.enabled", true);
pref("mail.provider.loglevel", "Warn");

pref("mail.chat.enabled", true);
// Whether to show chat notifications or not.
pref("mail.chat.show_desktop_notifications", true);
// Decide how much information is to be shown in the notification.
// 0 == Show all info (sender, chat message message preview),
// 1 == Show sender's info only (not message preview),
// 2 == No info (fill dummy values).
pref("mail.chat.notification_info", 0);
pref("mail.chat.play_sound", true);
// 0 == default system sound, 1 == user specified wav
pref("mail.chat.play_sound.type", 0);
// if sound is user specified, this needs to be a file url
pref("mail.chat.play_sound.url", "");
// Enable/Disable support for OTR chat encryption.
pref("chat.otr.enable", true);
// Default values for chat account prefs.
pref("chat.otr.default.requireEncryption", false);
pref("chat.otr.default.verifyNudge", true);
pref("chat.otr.default.allowMsgLog", true);

// BigFiles
pref("mail.cloud_files.enabled", true);
pref("mail.cloud_files.learn_more_url", "https://support.thunderbird.net/kb/filelink-large-attachments");

// Ignore threads
pref("mail.ignore_thread.learn_more_url", "https://support.thunderbird.net/kb/ignore-threads");

// Density control for the entire Thunderbird UI.
// The possible values are 0=compact, 1=normal, 2=touch.
pref("mail.uidensity", 1);

// Font size control for the entire Thunderbird UI. The value represents the
// pixel value which will be applied as inline style to the root element of the
// page (e.g.: 14 = font-size: 14px)
pref("mail.uifontsize", 0);

// Sanitize dialog window
pref("privacy.cpd.history", true);
pref("privacy.cpd.cookies", true);
pref("privacy.cpd.cache", true);

// What default should we use for the time span in the sanitizer:
// 0 - Clear everything
// 1 - Last Hour
// 2 - Last 2 Hours
// 3 - Last 4 Hours
// 4 - Today
pref("privacy.sanitize.timeSpan", 1);

// Enable Contextual Identity Containers
pref("privacy.userContext.enabled", false);

// Set to true to add toggles to the WebRTC indicator for globally
// muting the camera and microphone.
pref("privacy.webrtc.globalMuteToggles", false);

// If set to true, Thunderbird will collapse the main menu for new profiles
// (or, more precisely, profiles that start with no accounts created).
pref("mail.main_menu.collapse_by_default", true);

// If set to true, when saving a message to a file, use underscore
// instead of space in the file name.
pref("mail.save_msg_filename_underscores_for_space", false);

#ifdef NIGHTLY_BUILD
// See bug 1572568 for details. Disallow eval() with system principal.
pref("security.allow_eval_with_system_principal", false);
#endif

// Enable FIDO U2F
pref("security.webauth.u2f", true);

// Use OS date and time settings by default.
pref("intl.regional_prefs.use_os_locales", true);

// Multi-lingual preferences:
//  *.enabled - Are langpacks available for the build of Firefox?
//  *.downloadEnabled - Langpacks are allowed to be downloaded from ATN. ATN only serves
//      langpacks for release and beta. There is no release-only define, so we also enable
//      it for beta.
//  *.liveReload - Switching a langpack will change the language without a restart.
//  *.liveReloadBidirectional - Allows switching when moving between LTR and RTL
//      languages without a full restart.
pref("intl.multilingual.enabled", true);
#if defined(RELEASE_OR_BETA)
pref("intl.multilingual.downloadEnabled", true);
pref("intl.multilingual.liveReload", false);
pref("intl.multilingual.liveReloadBidirectional", false);
#else
pref("intl.multilingual.downloadEnabled", false);
pref("intl.multilingual.liveReload", false);
pref("intl.multilingual.liveReloadBidirectional", false);
#endif

// if true, use full page zoom instead of text zoom
pref("browser.zoom.full", true);

pref("toolkit.osKeyStore.loglevel", "Warn");

// Developer Tools related preferences
pref("devtools.chrome.enabled", true);
pref("devtools.debugger.remote-enabled", true);
pref("devtools.selfxss.count", 5);
// Enable extensionStorage storage actor by default
pref("devtools.storage.extensionStorage.enabled", true);

// Toolbox preferences
pref("devtools.toolbox.footer.height", 250);
pref("devtools.toolbox.sidebar.width", 500);
pref("devtools.toolbox.host", "bottom");
pref("devtools.toolbox.previousHost", "right");
pref("devtools.toolbox.selectedTool", "inspector");
pref("devtools.toolbox.sideEnabled", true);
pref("devtools.toolbox.zoomValue", "1");
pref("devtools.toolbox.splitconsoleEnabled", false);
pref("devtools.toolbox.splitconsoleHeight", 100);
pref("devtools.toolbox.tabsOrder", "");
pref("devtools.netmonitor.features.newEditAndResend", false);

// The fission pref for enabling the "Multiprocess Browser Toolbox", which will
// make it possible to debug anything in Firefox (See Bug 1570639 for more
// information).
#if defined(NIGHTLY_BUILD)
pref("devtools.browsertoolbox.fission", true);
#else
pref("devtools.browsertoolbox.fission", false);
#endif

// When the Multiprocess Browser Toolbox is enabled, you can configure the scope of it:
// - "everything" will enable debugging absolutely everything in the browser
//   All processes, all documents, all workers, all add-ons.
// - "parent-process" will restrict debugging to the parent process
//   All privileged javascript, documents and workers running in the parent process.
pref("devtools.browsertoolbox.scope", "everything");

// Toolbox Button preferences
pref("devtools.command-button-pick.enabled", true);
pref("devtools.command-button-frames.enabled", true);
pref("devtools.command-button-splitconsole.enabled", true);
pref("devtools.command-button-responsive.enabled", true);
pref("devtools.command-button-screenshot.enabled", false);
pref("devtools.command-button-rulers.enabled", false);
pref("devtools.command-button-measure.enabled", false);
pref("devtools.command-button-noautohide.enabled", false);
pref("devtools.command-button-errorcount.enabled", true);
#ifndef MOZILLA_OFFICIAL
  pref("devtools.command-button-experimental-prefs.enabled", true);
#endif

// Inspector preferences
// Enable the Inspector
pref("devtools.inspector.enabled", true);
// What was the last active sidebar in the inspector
pref("devtools.inspector.selectedSidebar", "layoutview");
pref("devtools.inspector.activeSidebar", "layoutview");
pref("devtools.inspector.remote", false);

// Enable the 3 pane mode in the inspector
pref("devtools.inspector.three-pane-enabled", true);
// Enable the 3 pane mode in the chrome inspector
pref("devtools.inspector.chrome.three-pane-enabled", false);
// Collapse pseudo-elements by default in the rule-view
pref("devtools.inspector.show_pseudo_elements", false);
// The default size for image preview tooltips in the rule-view/computed-view/markup-view
pref("devtools.inspector.imagePreviewTooltipSize", 300);
// Enable user agent style inspection in rule-view
pref("devtools.inspector.showUserAgentStyles", false);
// Show native anonymous content and user agent shadow roots
pref("devtools.inspector.showAllAnonymousContent", false);
// Enable the inline CSS compatibility warning in inspector rule view
pref("devtools.inspector.ruleview.inline-compatibility-warning.enabled", false);
// Enable the compatibility tool in the inspector.
pref("devtools.inspector.compatibility.enabled", true);
// Enable color scheme simulation in the inspector.
pref("devtools.inspector.color-scheme-simulation.enabled", true);

// Grid highlighter preferences
pref("devtools.gridinspector.gridOutlineMaxColumns", 50);
pref("devtools.gridinspector.gridOutlineMaxRows", 50);
pref("devtools.gridinspector.showGridAreas", false);
pref("devtools.gridinspector.showGridLineNumbers", false);
pref("devtools.gridinspector.showInfiniteLines", false);
// Max number of grid highlighters that can be displayed
pref("devtools.gridinspector.maxHighlighters", 3);

// Whether or not simplified highlighters should be used when
// prefers-reduced-motion is enabled.
pref("devtools.inspector.simple-highlighters-reduced-motion", false);

// Whether or not the box model panel is opened in the layout view
pref("devtools.layout.boxmodel.opened", true);
// Whether or not the flexbox panel is opened in the layout view
pref("devtools.layout.flexbox.opened", true);
// Whether or not the flexbox container panel is opened in the layout view
pref("devtools.layout.flex-container.opened", true);
// Whether or not the flexbox item panel is opened in the layout view
pref("devtools.layout.flex-item.opened", true);
// Whether or not the grid inspector panel is opened in the layout view
pref("devtools.layout.grid.opened", true);

// Enable hovering Box Model values and jumping to their source CSS rule in the
// rule-view.
#if defined(NIGHTLY_BUILD)
  pref("devtools.layout.boxmodel.highlightProperty", true);
#else
  pref("devtools.layout.boxmodel.highlightProperty", false);
#endif

// By how many times eyedropper will magnify pixels
pref("devtools.eyedropper.zoom", 6);

// Enable to collapse attributes that are too long.
pref("devtools.markup.collapseAttributes", true);
// Length to collapse attributes
pref("devtools.markup.collapseAttributeLength", 120);
// Whether to auto-beautify the HTML on copy.
pref("devtools.markup.beautifyOnCopy", false);
// Whether or not the DOM mutation breakpoints context menu are enabled in the
// markup view.
pref("devtools.markup.mutationBreakpoints.enabled", true);

// DevTools default color unit
pref("devtools.defaultColorUnit", "authored");

// Enable the Memory tools
pref("devtools.memory.enabled", true);

pref("devtools.memory.custom-census-displays", "{}");
pref("devtools.memory.custom-label-displays", "{}");
pref("devtools.memory.custom-tree-map-displays", "{}");

pref("devtools.memory.max-individuals", 1000);
pref("devtools.memory.max-retaining-paths", 10);

// Enable the Performance tools
pref("devtools.performance.enabled", true);
// But not the pop-up.
pref("devtools.performance.popup.feature-flag", false);
// Override the default preset, which is "web-developer" on beta and release.
pref("devtools.performance.recording.preset", "firefox-platform");
pref("devtools.performance.recording.preset.remote", "firefox-platform");

// The default cache UI setting
pref("devtools.cache.disabled", false);

// The default service workers UI setting
pref("devtools.serviceWorkers.testing.enabled", false);

// Enable the Network Monitor
pref("devtools.netmonitor.enabled", true);

pref("devtools.netmonitor.features.search", true);
pref("devtools.netmonitor.features.requestBlocking", true);

// Enable the Application panel
pref("devtools.application.enabled", false);

// Enable the custom formatters feature
// This preference represents the user's choice to enable the custom formatters feature.
// While the preference above will be removed once the feature is stable, this one is menat to stay.
pref("devtools.custom-formatters.enabled", false);

// The default Network Monitor UI settings
pref("devtools.netmonitor.panes-network-details-width", 550);
pref("devtools.netmonitor.panes-network-details-height", 450);
pref("devtools.netmonitor.panes-search-width", 550);
pref("devtools.netmonitor.panes-search-height", 450);
pref("devtools.netmonitor.filters", "[\"all\"]");
pref("devtools.netmonitor.visibleColumns",
  "[\"status\",\"method\",\"domain\",\"file\",\"initiator\",\"type\",\"transferred\",\"contentSize\",\"waterfall\"]"
);
pref("devtools.netmonitor.columnsData",
  '[{"name":"status","minWidth":30,"width":5}, {"name":"method","minWidth":30,"width":5}, {"name":"domain","minWidth":30,"width":10}, {"name":"file","minWidth":30,"width":25}, {"name":"url","minWidth":30,"width":25},{"name":"initiator","minWidth":30,"width":10},{"name":"type","minWidth":30,"width":5},{"name":"transferred","minWidth":30,"width":10},{"name":"contentSize","minWidth":30,"width":5},{"name":"waterfall","minWidth":150,"width":15}]');
pref("devtools.netmonitor.msg.payload-preview-height", 128);
pref("devtools.netmonitor.msg.visibleColumns",
  '["data", "time"]'
);
pref("devtools.netmonitor.msg.displayed-messages.limit", 500);

pref("devtools.netmonitor.response.ui.limit", 10240);

// Save request/response bodies yes/no.
pref("devtools.netmonitor.saveRequestAndResponseBodies", true);

// The default Network monitor HAR export setting
pref("devtools.netmonitor.har.defaultLogDir", "");
pref("devtools.netmonitor.har.defaultFileName", "%hostname_Archive [%date]");
pref("devtools.netmonitor.har.jsonp", false);
pref("devtools.netmonitor.har.jsonpCallback", "");
pref("devtools.netmonitor.har.includeResponseBodies", true);
pref("devtools.netmonitor.har.compress", false);
pref("devtools.netmonitor.har.forceExport", false);
pref("devtools.netmonitor.har.pageLoadedTimeout", 1500);
pref("devtools.netmonitor.har.enableAutoExportToFile", false);

pref("devtools.netmonitor.features.webSockets", true);

// netmonitor audit
pref("devtools.netmonitor.audits.slow", 500);

// Disable the EventSource Inspector.
pref("devtools.netmonitor.features.serverSentEvents", false);

// Enable the Storage Inspector
pref("devtools.storage.enabled", true);

// Enable the Style Editor.
pref("devtools.styleeditor.enabled", true);
pref("devtools.styleeditor.autocompletion-enabled", true);
pref("devtools.styleeditor.showMediaSidebar", true);
pref("devtools.styleeditor.mediaSidebarWidth", 238);
pref("devtools.styleeditor.navSidebarWidth", 245);
pref("devtools.styleeditor.transitions", true);

// Screenshot Option Settings.
pref("devtools.screenshot.clipboard.enabled", false);
pref("devtools.screenshot.audio.enabled", true);

// Make sure the DOM panel is hidden by default
pref("devtools.dom.enabled", false);

// Enable the Accessibility panel.
pref("devtools.accessibility.enabled", true);

// Web console filters
pref("devtools.webconsole.filter.error", true);
pref("devtools.webconsole.filter.warn", true);
pref("devtools.webconsole.filter.info", true);
pref("devtools.webconsole.filter.log", true);
pref("devtools.webconsole.filter.debug", true);
pref("devtools.webconsole.filter.css", false);
pref("devtools.webconsole.filter.net", false);
pref("devtools.webconsole.filter.netxhr", false);

// Webconsole autocomplete preference
pref("devtools.webconsole.input.autocomplete",true);
#ifdef NIGHTLY_BUILD
  pref("devtools.webconsole.input.context", true);
#else
  pref("devtools.webconsole.input.context", false);
#endif

// Set to true to eagerly show the results of webconsole terminal evaluations
// when they don't have side effects.
pref("devtools.webconsole.input.eagerEvaluation", true);

// Browser console filters
pref("devtools.browserconsole.filter.error", true);
pref("devtools.browserconsole.filter.warn", true);
pref("devtools.browserconsole.filter.info", true);
pref("devtools.browserconsole.filter.log", true);
pref("devtools.browserconsole.filter.debug", true);
pref("devtools.browserconsole.filter.css", false);
pref("devtools.browserconsole.filter.net", false);
pref("devtools.browserconsole.filter.netxhr", false);

// Max number of inputs to store in web console history.
pref("devtools.webconsole.inputHistoryCount", 300);

// Persistent logging: |true| if you want the relevant tool to keep all of the
// logged messages after reloading the page, |false| if you want the output to
// be cleared each time page navigation happens.
pref("devtools.webconsole.persistlog", false);
pref("devtools.netmonitor.persistlog", false);

// Web Console timestamp: |true| if you want the logs and instructions
// in the Web Console to display a timestamp, or |false| to not display
// any timestamps.
pref("devtools.webconsole.timestampMessages", false);

// Enable the webconsole sidebar toggle in Nightly builds.
#if defined(NIGHTLY_BUILD)
  pref("devtools.webconsole.sidebarToggle", true);
#else
  pref("devtools.webconsole.sidebarToggle", false);
#endif

// Saved editor mode state in the console.
pref("devtools.webconsole.input.editor", false);
pref("devtools.browserconsole.input.editor", false);

// Editor width for webconsole and browserconsole.
pref("devtools.webconsole.input.editorWidth", 0);
pref("devtools.browserconsole.input.editorWidth", 0);

// Display an onboarding UI for the Editor mode.
pref("devtools.webconsole.input.editorOnboarding", true);

// Enable message grouping in the console, true by default
pref("devtools.webconsole.groupWarningMessages", true);

// Saved state of the Display content messages checkbox in the browser console.
pref("devtools.browserconsole.contentMessages", true);

// Enable network monitoring the browser toolbox console/browser console.
pref("devtools.browserconsole.enableNetworkMonitoring", false);

// Enable client-side mapping service for source maps
pref("devtools.source-map.client-service.enabled", true);

// The number of lines that are displayed in the web console.
pref("devtools.hud.loglimit", 10000);

// The developer tools editor configuration:
// - tabsize: how many spaces to use when a Tab character is displayed.
// - expandtab: expand Tab characters to spaces.
// - keymap: which keymap to use (can be 'default', 'emacs' or 'vim')
// - autoclosebrackets: whether to permit automatic bracket/quote closing.
// - detectindentation: whether to detect the indentation from the file
// - enableCodeFolding: Whether to enable code folding or not.
pref("devtools.editor.tabsize", 2);
pref("devtools.editor.expandtab", true);
pref("devtools.editor.keymap", "default");
pref("devtools.editor.autoclosebrackets", true);
pref("devtools.editor.detectindentation", true);
pref("devtools.editor.enableCodeFolding", true);
pref("devtools.editor.autocomplete", true);

// The angle of the viewport.
pref("devtools.responsive.viewport.angle", 0);
// The width of the viewport.
pref("devtools.responsive.viewport.width", 320);
// The height of the viewport.
pref("devtools.responsive.viewport.height", 480);
// The pixel ratio of the viewport.
pref("devtools.responsive.viewport.pixelRatio", 0);
// Whether or not the viewports are left aligned.
pref("devtools.responsive.leftAlignViewport.enabled", false);
// Whether to reload when touch simulation is toggled
pref("devtools.responsive.reloadConditions.touchSimulation", false);
// Whether to reload when user agent is changed
pref("devtools.responsive.reloadConditions.userAgent", false);
// Whether to show the notification about reloading to apply emulation
pref("devtools.responsive.reloadNotification.enabled", true);
// Whether or not touch simulation is enabled.
pref("devtools.responsive.touchSimulation.enabled", false);
// The user agent of the viewport.
pref("devtools.responsive.userAgent", "");

// Show the custom user agent input in Nightly builds.
#if defined(NIGHTLY_BUILD)
  pref("devtools.responsive.showUserAgentInput", true);
#else
  pref("devtools.responsive.showUserAgentInput", false);
#endif

// Show tab debug targets for This Firefox (on by default for local builds).
#ifdef MOZILLA_OFFICIAL
  pref("devtools.aboutdebugging.local-tab-debugging", false);
#else
  pref("devtools.aboutdebugging.local-tab-debugging", true);
#endif

// Show process debug targets.
pref("devtools.aboutdebugging.process-debugging", true);
// Stringified array of network locations that users can connect to.
pref("devtools.aboutdebugging.network-locations", "[]");
// Debug target pane collapse/expand settings.
pref("devtools.aboutdebugging.collapsibilities.installedExtension", false);
pref("devtools.aboutdebugging.collapsibilities.otherWorker", false);
pref("devtools.aboutdebugging.collapsibilities.serviceWorker", false);
pref("devtools.aboutdebugging.collapsibilities.sharedWorker", false);
pref("devtools.aboutdebugging.collapsibilities.tab", false);
pref("devtools.aboutdebugging.collapsibilities.temporaryExtension", false);

// about:debugging: only show system and hidden extensions in local builds by
// default.
#ifdef MOZILLA_OFFICIAL
  pref("devtools.aboutdebugging.showHiddenAddons", false);
#else
  pref("devtools.aboutdebugging.showHiddenAddons", true);
#endif

// Map top-level await expressions in the console
pref("devtools.debugger.features.map-await-expression", true);

// This relies on javascript.options.asyncstack as well or it has no effect.
pref("devtools.debugger.features.async-captured-stacks", true);
pref("devtools.debugger.features.async-live-stacks", false);

// Disable autohide for DevTools popups and tooltips.
// This is currently not exposed by any UI to avoid making
// about:devtools-toolbox tabs unusable by mistake.
pref("devtools.popup.disable_autohide", false);

// Enable overflow debugging in the inspector.
pref("devtools.overflow.debugging.enabled", true);
// Enable drag to edit properties in the inspector rule view.
pref("devtools.inspector.draggable_properties", true);

// Telemetry settings.

// Server to submit telemetry pings to.
pref("toolkit.telemetry.server", "https://incoming-telemetry.thunderbird.net");
pref("toolkit.telemetry.server_owner", "Thunderbird");

// Determines if Telemetry pings can be archived locally.
pref("toolkit.telemetry.archive.enabled", true);
// Enables sending the shutdown ping when Thunderbird shuts down.
pref("toolkit.telemetry.shutdownPingSender.enabled", true);
// Enables sending the shutdown ping using the pingsender from the first session.
pref("toolkit.telemetry.shutdownPingSender.enabledFirstSession", false);
// Enables sending a duplicate of the first shutdown ping from the first session.
pref("toolkit.telemetry.firstShutdownPing.enabled", true);
// Enables sending the 'new-profile' ping on new profiles.
pref("toolkit.telemetry.newProfilePing.enabled", true);
// Enables sending 'update' pings on Thunderbird updates.
pref("toolkit.telemetry.updatePing.enabled", true);
// Enables sending 'bhr' pings when the app hangs.
pref("toolkit.telemetry.bhrPing.enabled", true);
// Whether to enable Ecosystem Telemetry, requires a restart.
#ifdef NIGHTLY_BUILD
  pref("toolkit.telemetry.ecosystemtelemetry.enabled", true);
#else
  pref("toolkit.telemetry.ecosystemtelemetry.enabled", false);
#endif

#ifdef XP_WIN
pref("mail.minimizeToTray", false);
#endif

pref("prompts.defaultModalType", 3);
pref("prompts.contentPromptSubDialog", false);

// The URL for the privacy policy related to recommended extensions.
pref("extensions.recommendations.privacyPolicyUrl", "https://www.mozilla.org/en-US/privacy/thunderbird/#addons");

// Used by pdf.js to know the first time Thunderbird is run with it installed
// so it can become the default pdf viewer.
pref("pdfjs.firstRun", true);
// The values of preferredAction and alwaysAskBeforeHandling before pdf.js
// became the default.
pref("pdfjs.previousHandler.preferredAction", 0);
pref("pdfjs.previousHandler.alwaysAskBeforeHandling", false);

pref("mail.activity.loglevel", "Warn");

// The number of public recipients before we offer BCC addressing.
pref("mail.compose.warn_public_recipients.threshold", 15);

// Indicates whether to show an alert before send if no action taken while the
// too many public recipients notification is shown.
pref("mail.compose.warn_public_recipients.aggressive", false);

// The URL of most things that can be printed is useless information.
// Hide it and move the title to the center.
pref("print.print_headerleft", "");
pref("print.print_headercenter", "&T");
pref("print.print_headerright", "");

// Enable Masonry Layout for AddressBook.
pref("layout.css.grid-template-masonry-value.enabled", true);

#ifdef NIGHTLY_BUILD
// If set to false, FxAccounts and Sync will be unavailable.
// A restart is mandatory after flipping that preference.
pref("identity.fxaccounts.enabled", true);
pref("identity.fxaccounts.log.sensitive", true);
pref("services.sync.log.appender.console", "Info");
// Auto-config URL for FxA self-hosters, makes an HTTP request to
// [identity.fxaccounts.autoconfig.uri]/.well-known/fxa-client-configuration
// This is now the prefered way of pointing to a custom FxA server, instead
// of making changes to "identity.fxaccounts.*.uri".
pref("identity.fxaccounts.autoconfig.uri", "https://accounts.stage.mozaws.net");
// The remote FxA root content URL. Must use HTTPS.
pref("identity.fxaccounts.remote.root", "https://accounts.stage.mozaws.net");
// The value of the context query parameter passed in FxA requests.
pref("identity.fxaccounts.contextParam", "fx_desktop_v3");
// Token server used by the FxA Sync identity.
pref("identity.sync.tokenserver.uri", "https://token.stage.mozaws.net/1.0/sync/1.5");
// Adds stage server to the white list, because we need it.
pref("webchannel.allowObject.urlWhitelist", "https://content.cdn.mozilla.net https://support.mozilla.org https://install.mozilla.org https://accounts.stage.mozaws.net");
// Adds Firefox/10x.0 to the User-Agent string, because we need it.
// TODO: Fix this.
pref("general.useragent.compatMode.firefox", true);

// Enable the sync engines we want, and disable the ones we don't want.
pref("services.sync.engine.accounts", true);
pref("services.sync.engine.addons", false);
pref("services.sync.engine.addressbooks", true);
pref("services.sync.engine.addresses", false);
pref("services.sync.engine.calendars", true);
pref("services.sync.engine.creditcards", false);
pref("services.sync.engine.identities", true);
pref("services.sync.engine.prefs", false);
#endif

// Donation appeal.
pref("app.donation.eoy.version", 4);
pref("app.donation.eoy.version.viewed", 0);
pref("app.donation.eoy.url", "https://www.thunderbird.net/thunderbird/115.0/holidayeoy/");

// IMAP-JS disabled, Bug 1707547.
pref("mailnews.imap.jsmodule", false);

// Unified toolbar

// 0: icons beside text
// 1: icons above text
// 2: icons only
// 3: text only
pref("toolbar.unifiedtoolbar.buttonstyle", 0);

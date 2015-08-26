/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pref("toolkit.defaultChromeURI", "chrome://instantbird/content/blist.xul");
pref("toolkit.singletonWindowType", "Messenger:blist");
#ifdef XP_MACOSX
pref("browser.hiddenWindowChromeURL", "chrome://instantbird/content/hiddenWindow.xul");
#endif

#expand pref("general.useragent.extra.instantbird", "Instantbird/__APP_VERSION__");

#ifdef XP_UNIX
#ifndef XP_MACOSX
#define UNIX_BUT_NOT_MAC
#endif
#endif

pref("general.smoothScroll", false);
#ifdef UNIX_BUT_NOT_MAC
pref("general.autoScroll", false);
#else
pref("general.autoScroll", true);
#endif

// this will automatically enable inline spellchecking (if it is available) for
// editable elements in HTML
// 0 = spellcheck nothing
// 1 = check multi-line controls [default]
// 2 = check multi/single line controls
pref("layout.spellcheckDefault", 1);

pref("messenger.accounts.convertOldPasswords", true);
pref("messenger.accounts.promptOnDelete", true);

pref("messenger.buddies.showOffline", false);
pref("messenger.buddies.hideTagPrompt", true);

pref("messenger.conversations.openInTabs", true);
pref("messenger.conversations.useSeparateWindowsForMUCs", false);
pref("messenger.conversations.doubleClickToReply", true);

pref("messenger.conversations.showNicks", true);
// Timespan (in seconds) that a MUC nick is marked active after speaking.
// -1 = keep active forever
pref("messenger.conversations.nickActiveTimespan", 3600);

pref("messenger.options.getAttentionOnNewMessages", true);
pref("messenger.options.notifyOfNewMessages", false);
#ifdef XP_MACOSX
pref("messenger.options.showUnreadCountInDock", true);
#else
// For *nix and Windows set the minimize to tray options.
// Default to minimize on close
pref("extensions.mintrayr.minimizeon", 2);
pref("extensions.mintrayr.alwaysShowTrayIcon", true);
pref("extensions.mintrayr.startMinimized", false);
#ifdef XP_UNIX
// For Linux, use single click.
pref("extensions.mintrayr.singleClickRestore", true);
#else
// For Windows, use double click.
pref("extensions.mintrayr.singleClickRestore", false);
#endif
#endif

// Whether message related sounds should be played at all. If this is enabled
// then the more specific prefs are checked as well.
pref("messenger.options.playSounds.message", true);
// Specifies whether each message event should trigger a sound for incoming
// and outgoing messages, or when your nickname is mentioned in a chat.
pref("messenger.options.playSounds.outgoing", true);
pref("messenger.options.playSounds.incoming", true);
pref("messenger.options.playSounds.alert", true);
// Whether contact list related sounds should be played at all. If this is
// enabled then the more specific prefs are checked as well.
pref("messenger.options.playSounds.blist", false);
// Specifies whether sounds should be played on login/logout events.
pref("messenger.options.playSounds.login", true);
pref("messenger.options.playSounds.logout", true);

pref("font.default.x-western", "sans-serif");
pref("font.default.x-unicode", "sans-serif");
pref("font.default.x-cyrillic", "sans-serif");
#ifdef XP_MACOSX
pref("font.name.sans-serif.x-unicode", "Lucida Grande");
pref("font.name.sans-serif.x-western", "Lucida Grande");
pref("font.name.sans-serif.x-cyrillic", "Lucida Grande");
#endif
pref("font.size.variable.x-western", 13);
pref("font.size.variable.x-unicode", 13);
pref("font.size.variable.x-cyrillic", 13);

pref("messenger.proxies", "");
pref("messenger.globalProxy", "none");
pref("messenger.warnOnQuit", true);

#ifdef XP_WIN
pref("browser.preferences.instantApply", false);
#else
pref("browser.preferences.instantApply", true);
#endif
#ifdef XP_MACOSX
pref("browser.preferences.animateFadeIn", true);
#else
pref("browser.preferences.animateFadeIn", false);
#endif

pref("browser.zoom.full", true);
pref("conversation.zoomLevel", "1.0");

pref("accessibility.typeaheadfind", false);
pref("accessibility.typeaheadfind.timeout", 5000);
pref("accessibility.typeaheadfind.linksonly", false);
pref("accessibility.typeaheadfind.flashBar", 1);

// Whether or not app updates are enabled
pref("app.update.enabled", true);

// This preference turns on app.update.mode and allows automatic download and
// install to take place. We use a separate boolean toggle for this to make
// the UI easier to construct.
pref("app.update.auto", true);

// Defines how the Application Update Service notifies the user about updates:
//
// AUM Set to:        Minor Releases:     Major Releases:
// 0                  download no prompt  download no prompt
// 1                  download no prompt  download no prompt if no incompatibilities
// 2                  download no prompt  prompt
//
// See chart in nsUpdateService.js.in for more details
//
pref("app.update.mode", 1);

// If set to true, the Update Service will present no UI for any event.
pref("app.update.silent", false);

// If set to true, the Update Service will apply updates in the background
// when it finishes downloading them.
pref("app.update.staging.enabled", true);

// Update service URL:
// You do not need to use all the %VAR% parameters. Use what you need, %PRODUCT%,%VERSION%,%BUILD_ID%,%CHANNEL% for example
pref("app.update.url", "https://update.instantbird.org/1/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/update.xml");

// URL user can browse to manually if for some reason all update installation
// attempts fail.
pref("app.update.url.manual", "http://www.instantbird.com/download.html");

// A default value for the "More information about this update" link
// supplied in the "An update is available" page of the update wizard.
pref("app.update.url.details", "http://www.instantbird.com/");

// User-settable override to app.update.url for testing purposes.
//pref("app.update.url.override", "");

// Interval: Time between checks for a new version (in seconds)
//           default=1 day
pref("app.update.interval", 86400);

// Interval: Time before prompting the user to download a new version that
//           is available (in seconds) default=1 day
pref("app.update.nagTimer.download", 86400);

// Interval: Time before prompting the user to restart to install the latest
//           download (in seconds) default=30 minutes
pref("app.update.nagTimer.restart", 1800);

// Whether or not we show a dialog box informing the user that the update was
// successfully applied. This is off in Firefox by default since we show a
// upgrade start page instead! Other apps may wish to show this UI, and supply
// a whatsNewURL field in their brand.properties that contains a link to a page
// which tells users what's new in this new update.
pref("app.update.showInstalledUI", false);

// 0 = suppress prompting for incompatibilities if there are updates available
//     to newer versions of installed addons that resolve them.
// 1 = suppress prompting for incompatibilities only if there are VersionInfo
//     updates available to installed addons that resolve them, not newer
//     versions.
pref("app.update.incompatible.mode", 0);

// base URL for web-based support pages (used by toolkit)
pref("app.support.baseURL", "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/");

// Dictionary download preference
pref("browser.dictionaries.download.url", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/dictionaries/");

// search engines URL
pref("browser.search.searchEnginesURL",      "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/search-engines/");

// pointer to the default engine name. Keep this empty so that the
// first engine listed in the engine manager is used instead
pref("browser.search.defaultenginename",      "");

// disable logging for the search service by default
pref("browser.search.log", false);

// Ordering of Search Engines in the Engine list.
pref("browser.search.order.1",                "chrome://instantbird/locale/region.properties");
pref("browser.search.order.2",                "chrome://instantbird/locale/region.properties");

// send ping to the server to update
pref("browser.search.update", true);

// disable logging for the search service update system by default
pref("browser.search.update.log", false);

// Check whether we need to perform engine updates every 6 hours
pref("browser.search.updateinterval", 6);

/* Extension manager */
pref("xpinstall.dialog.confirm", "chrome://mozapps/content/xpinstall/xpinstallConfirm.xul");
pref("xpinstall.dialog.progress.skin", "chrome://mozapps/content/extensions/extensions.xul");
pref("xpinstall.dialog.progress.chrome", "chrome://mozapps/content/extensions/extensions.xul");
pref("xpinstall.dialog.progress.type.skin", "Extension:Manager");
pref("xpinstall.dialog.progress.type.chrome", "Extension:Manager");
pref("extensions.dss.enabled", false);
pref("extensions.dss.switchPending", false);
pref("extensions.ignoreMTimeChanges", false);
pref("extensions.logging.enabled", false);
pref("general.skins.selectedSkin", "classic/1.0");

pref("extensions.update.enabled", true);
pref("extensions.update.interval", 86400);
pref("extensions.update.url", "https://addons.instantbird.org/services/update.php?reqVersion=%REQ_VERSION%&id=%ITEM_ID%&version=%ITEM_VERSION%&maxAppVersion=%ITEM_MAXAPPVERSION%&status=%ITEM_STATUS%&appID=%APP_ID%&appVersion=%APP_VERSION%&appOS=%APP_OS%&appABI=%APP_ABI%&locale=%APP_LOCALE%");
pref("extensions.update.autoUpdateDefault", true);

// Preferences for the Get Add-ons pane
pref("extensions.getAddons.cache.enabled", false);
pref("extensions.getAddons.browseAddons", "https://addons.instantbird.org/%LOCALE%/%APP%");
pref("extensions.getAddons.maxResults", 5);
pref("extensions.getAddons.recommended.browseURL", "https://addons.instantbird.org/%LOCALE%/%APP%/recommended");
pref("extensions.getAddons.recommended.url", "https://services.instantbird.org/%LOCALE%/%APP%/api/%API_VERSION%/list/featured/all/10/%OS%/%VERSION%");
pref("extensions.getAddons.search.browseURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/search?q=%TERMS%");
pref("extensions.getAddons.search.url", "https://services.instantbird.org/%LOCALE%/%APP%/api/%API_VERSION%/search/%TERMS%/all/10/%OS%/%VERSION%");
pref("extensions.webservice.discoverURL", "chrome://instantbird/content/extensions-discover.xul");

pref("extensions.getMoreExtensionsURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/extensions/");
pref("extensions.getMoreThemesURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/themes/");
pref("extensions.getMorePluginsURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/plugins/");
pref("extensions.getMoreMessageStylesURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/messagestyles/");
pref("extensions.getMoreEmoticonsURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/emoticons/");
pref("extensions.getMoreProtocolsURL", "https://add-ons.instantbird.org/%LOCALE%/%APP%/%VERSION%/protocols/");

// suppress external-load warning for standard browser schemes
pref("network.protocol-handler.warn-external.http", false);
pref("network.protocol-handler.warn-external.https", false);
pref("network.protocol-handler.warn-external.ftp", false);

// don't load links inside Instantbird
pref("network.protocol-handler.expose-all", false);
// Although we allow these to be exposed internally, there are various places
// (e.g. message pane) where we may divert them out to external applications.
pref("network.protocol-handler.expose.about", true);
pref("network.protocol-handler.expose.http", true);
pref("network.protocol-handler.expose.https", true);

// expose javascript: so that message themes can use it.
// javascript: links inside messages are filtered out.
pref("network.protocol-handler.expose.javascript", true);

// 0-Accept, 1-dontAcceptForeign, 2-dontUse
pref("network.cookie.cookieBehavior", 0);

// The breakpad report server to link to in about:crashes
pref("breakpad.reportURL", "http://crash-stats.instantbird.com/report/index/");

// We have an Error Console menu item by default so let's display chrome errors
pref("javascript.options.showInConsole", true);
#ifdef DEBUG
// In debug builds, also display warnings by default
pref("javascript.options.strict", true);

// Having to click through the "I'll be careful" button all the time
// is annoying, and users of debug builds are expected to know what
// they are doing...
pref("general.warnOnAboutConfig", false);

// In debug builds, disable the XUL cache by default
pref("nglayout.debug.disable_xul_cache", true);
pref("nglayout.debug.disable_xul_fastload", true);
#else
// So that we can enable dump easily from about:config...
pref("browser.dom.window.dump.enabled", false);
#endif

// Tabbed browser
pref("browser.tabs.autoHide", false);
pref("browser.tabs.warnOnClose", true);
pref("browser.tabs.tabMinWidth", 100);
pref("browser.tabs.tabMaxWidth", 250);
pref("browser.tabs.tabClipWidth", 140);

// Where to show tab close buttons:
// 0  on active tab only
// 1  on all tabs until tabClipWidth is reached, then active tab only
// 2  no close buttons at all
// 3  at the end of the tabstrip
pref("browser.tabs.closeButtons", 1);

#expand pref("chat.irc.defaultQuitMessage", "Instantbird __APP_VERSION__ -- http://www.instantbird.com");

pref("chat.twitter.consumerKey", "TSuyS1ieRAkB3qWv8yyEw");
pref("chat.twitter.consumerSecret", "DKtKaSf5a7pBNhdBsSZHTnI5Y03hRlPFYWmb4xXBlkU");

// Comma separated list of prpl ids that should use libpurple even if there is
// a JS implementation. This is used to land JS-prpls pref'ed off in nightlies.
pref("chat.prpls.forcePurple", "prpl-jabber");

// Whether to parse log files for conversation statistics.
pref("statsService.parseLogsForStats", true);

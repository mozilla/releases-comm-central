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

// What to do when starting up
//  0 = do not connect / show the account manager
//  1 = connect automatically
//  Other values will be added later, for example to start minimized
pref("messenger.startup.action", 1);

pref("messenger.accounts", "");
pref("messenger.accounts.promptOnDelete", true);

// The intervals in seconds between automatic reconnection attempts
// The last value will be reused forever.
// A value of 0 means that there will be no more reconnection attempts.
pref("messenger.accounts.reconnectTimer", "1,5,30,60,90,300,600,1200,3600");

pref("messenger.buddies.showOffline", false);
pref("messenger.buddies.hiddenTags", "");
pref("messenger.buddies.hideTagPrompt", true);

//  1 accepts invitations automatically,
//  0 ignores the invitations,
// -1 rejects the invitations.
pref("messenger.conversations.autoAcceptChatInvitations", 1);

pref("messenger.conversations.openInTabs", true);
pref("messenger.conversations.useSeparateWindowsForMUCs", false);
pref("messenger.conversations.alwaysClose", false);

pref("messenger.conversations.doubleClickToReply", true);

pref("messenger.conversations.selections.magicCopyEnabled", true);
pref("messenger.conversations.selections.ellipsis", "chrome://instantbird/locale/instantbird.properties");
pref("messenger.conversations.selections.systemMessagesTemplate", "chrome://instantbird/locale/instantbird.properties");
pref("messenger.conversations.selections.contentMessagesTemplate", "chrome://instantbird/locale/instantbird.properties");
pref("messenger.conversations.selections.actionMessagesTemplate", "chrome://instantbird/locale/instantbird.properties");

pref("messenger.conversations.textbox.autoResize", true);
pref("messenger.conversations.textbox.defaultMaxLines", 5);

pref("messenger.conversations.sendFormat", true);

pref("messenger.options.getAttentionOnNewMessages", true);
pref("messenger.options.notifyOfNewMessages", false);
#ifdef XP_MACOSX
pref("messenger.options.showUnreadCountInDock", true);
#else
// For *nix and Windows set the minimize to tray options.
// Default to minimize on close
pref("extensions.mintrayr.minimizeon", 2);
pref("extensions.mintrayr.alwaysShowTrayIcon", true);
#ifdef XP_UNIX
// For Linux, use single click.
pref("extensions.mintrayr.singleClickRestore", true);
#else
// For Windows, use double click.
pref("extensions.mintrayr.singleClickRestore", false);
#endif
#endif
pref("messenger.options.playSounds.message", true);
pref("messenger.options.playSounds.blist", false);

// this preference changes how we filter incoming messages
// 0 = no formattings
// 1 = basic formattings (bold, italic, underlined)
// 2 = permissive mode (colors, font face, font size, ...)
pref("messenger.options.filterMode", 2);

pref("font.default.x-western", "sans-serif");
pref("font.default.x-unicode", "sans-serif");
pref("font.default.x-central-euro", "sans-serif");
pref("font.default.x-cyrillic", "sans-serif");
#ifdef XP_MACOSX
pref("font.name.sans-serif.x-unicode", "Lucida Grande");
pref("font.name.sans-serif.x-western", "Lucida Grande");
pref("font.name.sans-serif.x-central-euro", "Lucida Grande");
pref("font.name.sans-serif.x-cyrillic", "Lucida Grande");
#endif
pref("font.size.variable.x-western", 13);
pref("font.size.variable.x-unicode", 13);
pref("font.size.variable.x-central-euro", 13);
pref("font.size.variable.x-cyrillic", 13);

// use "none" to disable
pref("messenger.options.emoticonsTheme", "default");
pref("messenger.options.messagesStyle.theme", "bubbles");
pref("messenger.options.messagesStyle.variant", "default");
pref("messenger.options.messagesStyle.showHeader", false);
pref("messenger.options.messagesStyle.combineConsecutive", true);
// if the time interval in seconds between two messages is longer than
// this value, the messages will not be combined
pref("messenger.options.messagesStyle.combineConsecutiveInterval", 300); // 5 minutes

pref("messenger.status.reportIdle", true);
pref("messenger.status.timeBeforeIdle", 300); // 5 minutes
pref("messenger.status.awayWhenIdle", true);
pref("messenger.status.defaultIdleAwayMessage", "chrome://instantbird/locale/instantbird.properties");
pref("messenger.status.userIconFileName", "");
pref("messenger.status.userDisplayName", "");

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
// Reject all cookies, so that several twitter OAuth dialogs can work
// during the same session. (See bug 875)
pref("network.cookie.cookieBehavior", 2);

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

// loglevel is the minimum severity level that a libpurple message
// must have to be reported in the Error Console.
//
// The possible values are:
//   0  Show all libpurple messages (PURPLE_DEBUG_ALL)
//   1  Very verbose (PURPLE_DEBUG_MISC)
//   2  Verbose (PURPLE_DEBUG_INFO)
//   3  Show warnings (PURPLE_DEBUG_WARNING)
//   4  Show errors (PURPLE_DEBUG_ERROR)
//   5  Show only fatal errors (PURPLE_DEBUG_FATAL)

// Setting the loglevel to a value smaller than 2 will cause messages
// with an INFO or MISC severity to be displayed as warnings so that
// their file URL is clickable
#ifndef DEBUG
// By default, show only warning and errors
pref("purple.debug.loglevel", 3);
#else
// On debug builds, show warning, errors and debug information.
pref("purple.debug.loglevel", 2);
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

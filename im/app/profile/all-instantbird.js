pref("toolkit.defaultChromeURI", "chrome://instantbird/content/blist.xul");
pref("general.useragent.extra.instantbird", "Instantbird/0.1");
pref("accessibility.browsewithcaret", true);

pref("messenger.accounts", "");

/* Extension manager */
pref("xpinstall.dialog.confirm", "chrome://mozapps/content/xpinstall/xpinstallConfirm.xul");
pref("xpinstall.dialog.progress.skin", "chrome://mozapps/content/extensions/extensions.xul");
pref("xpinstall.dialog.progress.chrome", "chrome://mozapps/content/extensions/extensions.xul");
pref("xpinstall.dialog.progress.type.skin", "Extension:Manager");
pref("xpinstall.dialog.progress.type.chrome", "Extension:Manager");
pref("extensions.update.enabled", true);
pref("extensions.update.interval", 86400);
pref("extensions.dss.enabled", false);
pref("extensions.dss.switchPending", false);
pref("extensions.ignoreMTimeChanges", false);
pref("extensions.logging.enabled", false);
pref("general.skins.selectedSkin", "classic/1.0");
// NB these point at addons.instantbird.org
pref("extensions.update.enabled", false);
pref("extensions.getMoreExtensionsURL", "http://addons.instantbird.org/%LOCALE%/%VERSION%/extensions/");
pref("extensions.getMoreThemesURL", "http://addons.instantbird.org/%LOCALE%/%VERSION%/themes/");
pref("extensions.getMorePluginsURL", "http://addons.instantbird.org/%LOCALE%/%VERSION%/plugins/");
// suppress external-load warning for standard browser schemes
pref("network.protocol-handler.warn-external.http", false);
pref("network.protocol-handler.warn-external.https", false);
pref("network.protocol-handler.warn-external.ftp", false);

// don't load links inside Instantbird
pref("network.protocol-handler.expose-all", false);

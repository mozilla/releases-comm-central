/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/base/content/contentAreaClick.js
/* globals hRefForClickEvent */
// mail/base/content/specialTabs.js
/* globals specialTabs */

var { ConsoleAPI } = ChromeUtils.importESModule(
  "resource://gre/modules/Console.sys.mjs"
);

/**
 * A content tab for the account provisioner.  We use Javascript-y magic to
 * "subclass" specialTabs.contentTabType, and then override the appropriate
 * members.
 *
 * Also note that provisionerCheckoutTab is a singleton (hence the maxTabs: 1).
 */
var provisionerCheckoutTabType = Object.create(specialTabs.contentTabType, {
  name: { value: "provisionerCheckoutTab" },
  modes: {
    value: {
      provisionerCheckoutTab: {
        type: "provisionerCheckoutTab",
        maxTabs: 1,
      },
    },
  },
  _log: {
    value: new ConsoleAPI({
      prefix: "mail.provider",
      maxLogLevel: "warn",
      maxLogLevelPref: "mail.provider.loglevel",
    }),
  },
});

/**
 * Here, we're overriding openTab - first we call the openTab of contentTab
 * (for the context of this provisionerCheckoutTab "aTab") and then passing
 * special arguments "realName", "email" and "searchEngine" from the caller
 * of openTab, and passing those to our _setMonitoring function.
 */
provisionerCheckoutTabType.openTab = function (aTab, aArgs) {
  specialTabs.contentTabType.openTab.call(this, aTab, aArgs);

  // Since there's only one tab of this type ever (see the mode definition),
  // we're OK to stash this stuff here.
  this._realName = aArgs.realName;
  this._email = aArgs.email;
  this._searchEngine = aArgs.searchEngine || "";

  this._setMonitoring(
    aTab.browser,
    aArgs.realName,
    aArgs.email,
    aArgs.searchEngine
  );
};

/**
 * We're overriding closeTab - first, we call the closeTab of contentTab,
 * (for the context of this provisionerCheckoutTab "aTab"), and then we
 * unregister our observer that was registered in _setMonitoring.
 */
provisionerCheckoutTabType.closeTab = function (aTab) {
  specialTabs.contentTabType.closeTab.call(this, aTab);
  this._log.info("Performing account provisioner cleanup");
  this._log.info("Removing httpRequestObserver");
  Services.obs.removeObserver(this._observer, "http-on-examine-response");
  Services.obs.removeObserver(
    this._observer,
    "http-on-examine-cached-response"
  );
  Services.obs.removeObserver(this.quitObserver, "mail-unloading-messenger");
  delete this._observer;
  this._log.info("Account provisioner cleanup is done.");
};

/**
 * Serialize our tab into something we can restore later.
 */
provisionerCheckoutTabType.persistTab = function (aTab) {
  return {
    tabURI: aTab.browser.currentURI.spec,
    realName: this._realName,
    email: this._email,
    searchEngine: this._searchEngine,
  };
};

/**
 * Re-open the provisionerCheckoutTab with all of the stuff we stashed in
 * persistTab. This will automatically hook up our monitoring again.
 */
provisionerCheckoutTabType.restoreTab = function (aTabmail, aPersistedState) {
  aTabmail.openTab("provisionerCheckoutTab", {
    url: aPersistedState.tabURI,
    realName: aPersistedState.realName,
    email: aPersistedState.email,
    searchEngine: aPersistedState.searchEngine,
    background: true,
  });
};

/**
 * This function registers an observer to watch for HTTP requests where the
 * contentType contains text/xml.
 */
provisionerCheckoutTabType._setMonitoring = function (
  aBrowser,
  aRealName,
  aEmail,
  aSearchEngine
) {
  const mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");

  // We'll construct our special observer (defined in urlListener.js)
  // that will watch for requests where the contentType contains
  // text/xml.
  this._observer = new mail3Pane.httpRequestObserver(aBrowser, {
    realName: aRealName,
    email: aEmail,
    searchEngine: aSearchEngine,
  });

  // Register our observer
  Services.obs.addObserver(this._observer, "http-on-examine-response");
  Services.obs.addObserver(this._observer, "http-on-examine-cached-response");
  Services.obs.addObserver(this.quitObserver, "mail-unloading-messenger");

  this._log.info("httpRequestObserver wired up.");
};

/**
 * This observer listens for the mail-unloading-messenger event fired by each
 * mail window before they unload. If the mail window is the same window that
 * this provisionerCheckoutTab belongs to, then we stash a pref so that when
 * the session restarts, we go straight to the tab, as opposed to showing the
 * dialog again.
 */
provisionerCheckoutTabType.quitObserver = {
  observe(aSubject, aTopic, aData) {
    // Make sure we saw the right topic, and that the window that is closing
    // is the 3pane window that the provisionerCheckoutTab belongs to.
    if (aTopic == "mail-unloading-messenger" && aSubject === window) {
      // We quit while the provisionerCheckoutTab was opened. Set our sneaky
      // pref so that we suppress the dialog on startup.
      Services.prefs.setBoolPref(
        "mail.provider.suppress_dialog_on_startup",
        true
      );
    }
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Thunderbird UI Instrumentation, currently just the account setup process.
 */

/* :::::::: Constants and Helpers ::::::::::::::: */

const EXPORTED_SYMBOLS = ["MailInstrumentation"];

var nsIMFNService = Ci.nsIMsgFolderNotificationService;

const { logException } = ChromeUtils.import("resource:///modules/ErrUtils.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/* :::::::: The Module ::::::::::::::: */

var MailInstrumentation = {
  // JS object containing the current state object
  _currentState: null,

  /**
   * The string containing the JSON stringified representation of the last
   * state we uploaded.
   */
  _lastStateString: null,

  // if true, need to remove ourselves as a folder notification listener
  _mfnListener: false,

  // if true, we need to remove our observers in uninit.
  _observersRegistered: false,

  observe(aSubject, aTopic, aState) {
    if (aTopic == "mail:composeSendSucceeded") {
      MailInstrumentation.addEvent("msgSent", true);
    } else if (aTopic == "mail:setAsDefault") {
      MailInstrumentation.addEvent("setAsDefault", true);
    }
  },
  msgAdded(aMsg) {
    MailServices.mfn.removeListener(this);
    this._mfnListener = false;
    MailInstrumentation.addEvent("msgDownloaded", true);
  },

  _accountsChanged() {
    // check if there are at least two accounts - one is local folders account
    if (
      Services.prefs
        .getCharPref("mail.accountmanager.accounts")
        .includes(",", 1)
    ) {
      MailInstrumentation.addEvent("accountAdded", true);
      MailInstrumentation._removeObserver(
        "mail.accountmanager.accounts",
        MailInstrumentation._accountsChanged
      );
    }
  },
  _smtpServerAdded() {
    MailInstrumentation.addEvent("smtpServerAdded", true);
    MailInstrumentation._removeObserver(
      "mail.smtpservers",
      MailInstrumentation._smtpServerAdded
    );
  },
  _userOptedIn() {
    try {
      if (Services.prefs.getBoolPref("mail.instrumentation.userOptedIn")) {
        MailInstrumentation._postStateObject();
      }
    } catch (ex) {
      logException(ex);
    }
  },

  /**
   * Loads the last saved state. This should only be called by
   * _init and a unit test.
   */
  _loadState() {
    let data = Services.prefs.getCharPref(
      "mail.instrumentation.lastNotificationSent"
    );
    if (data) {
      try {
        // parse the session state into JS objects
        this._currentState = JSON.parse(data);
        return;
      } catch (ex) {}
    }
    this._currentState = this._createStateObject();
  },

  /**
   * Writes the state object to disk.
   */
  _postStateObject() {
    // This method runs for the smtp server before the account has been set up.
    if (MailServices.accounts.accounts.length == 0) {
      return;
    }

    let defaultAccount = MailServices.accounts.defaultAccount;
    if (!defaultAccount) {
      return;
    }

    if (!this._currentState.userEmailHash) {
      let identity = defaultAccount.defaultIdentity;
      if (identity) {
        // When we have only a feed account, there is no identity.
        this._currentState.userEmailHash = this._hashEmailAddress(
          identity.email
        );
      }
    }
    let data = JSON.stringify(this._currentState);
    // post data only if state changed since last write.
    if (data == this._lastStateString) {
      return;
    }

    this._lastStateString = data;
    let userOptedIn = Services.prefs.getBoolPref(
      "mail.instrumentation.userOptedIn"
    );
    if (userOptedIn) {
      this._postData();
    }
  },

  /**
   * @return an empty state object that can be populated with window states.
   */
  _createStateObject() {
    return {
      rev: 0,
      userEmailHash: "",
      // these will be a tuple, time stamp and answer, indexed by question key.
      events: {},
    };
  },
  // Convert each hashed byte into 2-hex strings, then combine them.
  _bytesAsHex(bytes) {
    return Array.from(bytes)
      .map(byte => ("0" + byte.charCodeAt().toString(16)).slice(-2))
      .join("");
  },
  /**
   * Return sha-256 hash of the passed in e-mail address
   */
  _hashEmailAddress(address) {
    let ch = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    ch.init(ch.SHA256);
    let converter = Cc[
      "@mozilla.org/intl/scriptableunicodeconverter"
    ].createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";

    let byteArray = converter.convertToByteArray(address, {});
    ch.update(byteArray, byteArray.length);
    let hashedData = ch.finish(false);
    return this._bytesAsHex(hashedData);
  },

  _postData() {
    let req = new XMLHttpRequest();
    let url = Services.prefs.getCharPref("mail.instrumentation.postUrl");
    if (!url.length) {
      return;
    }
    let dataToPost = this._lastStateString;
    req.open("POST", url, true);
    req.onerror = this._onError;
    req.onload = this._onLoad;
    req.send(dataToPost);
  },
  _onError(e) {
    logException(e);
  },
  _onLoad() {
    Services.prefs.setCharPref(
      "mail.instrumentation.lastNotificationSent",
      this._lastStateString
    );
  },
  // keeps track of whether or not we've removed the observer for a given
  // pref name.
  _prefsObserved: new Map(),
  _addObserver(pref, observer) {
    Services.prefs.addObserver(pref, observer);
    this._prefsObserved.set(pref, true);
  },
  _removeObserver(pref, observer) {
    if (this._prefsObserved.has(pref)) {
      Services.prefs.removeObserver(pref, observer);
      this._prefsObserved.set(pref, false);
    }
  },
  /* ........ Public API ................*/
  /**
   * This is called to initialize the instrumentation.
   */
  init() {
    // If we're done with instrumentation, or this is not a first run,
    // we should just return immediately.
    if (!Services.prefs.getBoolPref("mail.instrumentation.askUser")) {
      return;
    }
    if (MailServices.accounts.accounts.length > 0) {
      return;
    }

    this._loadState();
    Services.obs.addObserver(this, "mail:composeSendSucceeded");
    Services.obs.addObserver(this, "mail:setAsDefault");
    Services.prefs.addObserver(
      "mail.accountmanager.accounts",
      this._accountsChanged
    );
    Services.prefs.addObserver(
      "mail.instrumentation.userOptedIn",
      this._userOptedIn
    );
    Services.prefs.addObserver("mail.smtpservers", this._smtpServerAdded);
    MailServices.mfn.addListener(this, nsIMFNService.msgAdded);
    this._observersRegistered = true;
    this._mfnListener = true;
  },
  uninit() {
    if (!this._observersRegistered) {
      return;
    }
    Services.obs.removeObserver(this, "mail:composeSendSucceeded");
    Services.obs.removeObserver(this, "mail:setAsDefault");
    if (this._mfnListener) {
      MailServices.mfn.removeListener(this);
    }
    Services.prefs.removeObserver("mail.accountmanager.accounts", this);
    Services.prefs.removeObserver("mail.instrumentation.userOptedIn", this);
    Services.prefs.removeObserver("mail.smtpservers", this);
  },
  /**
   * This adds an event to the current state, if it doesn't exist.
   */
  addEvent(aEventKey, aData) {
    try {
      if (!(aEventKey in this._currentState.events)) {
        let newEvent = {};
        newEvent.time = Date.now();
        newEvent.data = aData;
        this._currentState.events[aEventKey] = newEvent;
        this._postStateObject();
      }
    } catch (ex) {
      logException(ex);
    }
  },
};

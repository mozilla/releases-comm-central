/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

ChromeUtils.defineESModuleGetters(this, {
  EnsureFxAccountsWebChannel:
    "resource://gre/modules/FxAccountsWebChannel.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  Weave: "resource://services-sync/main.sys.mjs",
});

var { FxAccounts, getFxAccountsSingleton } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);
var fxAccounts = getFxAccountsSingleton();

var gSyncPane = {
  init() {
    this._setupEventListeners();
    this.setupEnginesUI();

    Weave.Svc.Obs.add(UIState.ON_UPDATE, this.updateWeavePrefs, this);

    window.addEventListener("unload", () => {
      Weave.Svc.Obs.remove(UIState.ON_UPDATE, this.updateWeavePrefs, this);
    });

    const cachedComputerName = Services.prefs.getStringPref(
      "identity.fxaccounts.account.device.name",
      ""
    );
    if (cachedComputerName) {
      this._populateComputerName(cachedComputerName);
    }

    this.updateWeavePrefs();
  },

  /**
   * Update the UI based on the current state.
   */
  updateWeavePrefs() {
    const state = UIState.get();

    const noFxaAccount = document.getElementById("noFxaAccount");
    const hasFxaAccount = document.getElementById("hasFxaAccount");
    if (state.status == UIState.STATUS_NOT_CONFIGURED) {
      noFxaAccount.hidden = false;
      hasFxaAccount.hidden = true;
      return;
    }
    noFxaAccount.hidden = true;
    hasFxaAccount.hidden = false;

    let syncReady = false; // Is sync able to actually sync?
    const fxaLoginUnverified = document.getElementById("fxaLoginUnverified");
    const fxaLoginRejected = document.getElementById("fxaLoginRejected");
    const fxaLoginVerified = document.getElementById("fxaLoginVerified");
    if (state.status == UIState.STATUS_LOGIN_FAILED) {
      fxaLoginUnverified.hidden = true;
      fxaLoginRejected.hidden = false;
      fxaLoginVerified.hidden = true;
    } else if (state.status == UIState.STATUS_NOT_VERIFIED) {
      fxaLoginUnverified.hidden = false;
      fxaLoginRejected.hidden = true;
      fxaLoginVerified.hidden = true;
    } else {
      fxaLoginUnverified.hidden = true;
      fxaLoginRejected.hidden = true;
      fxaLoginVerified.hidden = false;
      syncReady = true;
    }

    this._populateComputerName(Weave.Service.clientsEngine.localName);
    for (const elt of document.querySelectorAll(".needs-account-ready")) {
      elt.disabled = !syncReady;
    }

    const syncConnected = document.getElementById("syncConnected");
    const syncDisconnected = document.getElementById("syncDisconnected");
    syncConnected.hidden = !syncReady || !state.syncEnabled;
    syncDisconnected.hidden = !syncReady || state.syncEnabled;

    document.l10n.setAttributes(
      document.getElementById("fxaAccountMailNotVerified"),
      "sync-pane-email-not-verified",
      { userEmail: state.email }
    );
    document.l10n.setAttributes(
      document.getElementById("fxaAccountLoginRejected"),
      "sync-signedin-login-failure",
      { userEmail: state.email }
    );

    document.getElementById("fxaAvatar").src =
      state.avatarURL && !state.avatarIsDefault ? state.avatarURL : "";
    document.getElementById("fxaDisplayName").textContent = state.displayName;
    document.getElementById("fxaEmailAddress").textContent = state.email;

    this._updateSyncNow(state.syncing);
  },

  _toggleComputerNameControls(editMode) {
    const textbox = document.getElementById("fxaDeviceNameInput");
    textbox.readOnly = !editMode;
    document.getElementById("fxaDeviceNameChangeDeviceName").hidden = editMode;
    document.getElementById("fxaDeviceNameCancel").hidden = !editMode;
    document.getElementById("fxaDeviceNameSave").hidden = !editMode;
  },

  _focusComputerNameTextbox() {
    const textbox = document.getElementById("fxaDeviceNameInput");
    const valLength = textbox.value.length;
    textbox.focus();
    textbox.setSelectionRange(valLength, valLength);
  },

  _blurComputerNameTextbox() {
    document.getElementById("fxaDeviceNameInput").blur();
  },

  _focusAfterComputerNameTextbox() {
    // Focus the most appropriate element that's *not* the "computer name" box.
    Services.focus.moveFocus(
      window,
      document.getElementById("fxaDeviceNameInput"),
      Services.focus.MOVEFOCUS_FORWARD,
      0
    );
  },

  _updateComputerNameValue(save) {
    if (save) {
      const textbox = document.getElementById("fxaDeviceNameInput");
      Weave.Service.clientsEngine.localName = textbox.value;
    }
    this._populateComputerName(Weave.Service.clientsEngine.localName);
  },

  _setupEventListeners() {
    function setEventListener(id, eventType, callback) {
      document
        .getElementById(id)
        .addEventListener(eventType, callback.bind(gSyncPane));
    }

    setEventListener("noFxaSignIn", "click", function () {
      window.browsingContext.topChromeWindow.gSync.initFxA();
      return false;
    });
    setEventListener(
      "fxaResendVerification",
      "click",
      gSyncPane.verifyFirefoxAccount
    );
    setEventListener("fxaUnverifiedRemoveAccount", "click", function () {
      /* No warning as account can't have previously synced. */
      gSyncPane.unlinkFirefoxAccount(false);
    });
    setEventListener("fxaRejectedSignIn", "click", gSyncPane.reSignIn);
    setEventListener("fxaRejectedRemoveAccount", "click", function () {
      gSyncPane.unlinkFirefoxAccount(true);
    });
    setEventListener("photoButton", "click", function () {
      window.browsingContext.topChromeWindow.gSync.openFxAAvatarPage(
        "preferences"
      );
    });
    setEventListener("verifiedManage", "click", function (event) {
      window.browsingContext.topChromeWindow.gSync.openFxAManagePage(
        "preferences"
      );
      event.preventDefault();
      // Stop attempts to open this link in an external browser.
      event.stopPropagation();
    });
    setEventListener("fxaAccountSignOut", "click", function () {
      gSyncPane.unlinkFirefoxAccount(true);
    });
    setEventListener("fxaDeviceNameCancel", "click", function () {
      // We explicitly blur the textbox because of bug 75324, then after
      // changing the state of the buttons, force focus to whatever the focus
      // manager thinks should be next (which on the mac, depends on an OSX
      // keyboard access preference)
      this._blurComputerNameTextbox();
      this._toggleComputerNameControls(false);
      this._updateComputerNameValue(false);
      this._focusAfterComputerNameTextbox();
    });
    setEventListener("fxaDeviceNameSave", "click", function () {
      // Work around bug 75324 - see above.
      this._blurComputerNameTextbox();
      this._toggleComputerNameControls(false);
      this._updateComputerNameValue(true);
      this._focusAfterComputerNameTextbox();
    });
    setEventListener("fxaDeviceNameChangeDeviceName", "click", function () {
      this._toggleComputerNameControls(true);
      this._focusComputerNameTextbox();
    });
    setEventListener("syncShowSyncedSyncNow", "click", function () {
      // syncing can take a little time to send the "started" notification, so
      // pretend we already got it.
      this._updateSyncNow(true);
      Weave.Service.sync({ why: "aboutprefs" });
    });
    setEventListener("enginesLearnMore", "click", function (event) {
      // TODO: A real page.
      window.browsingContext.topChromeWindow.openContentTab(
        "https://example.org/?page=learnMore"
      );
      event.preventDefault();
      // Stop attempts to open this link in an external browser.
      event.stopPropagation();
    });
    setEventListener("syncChangeOptions", "click", function () {
      gSyncPane._chooseWhatToSync(true);
    });
    setEventListener("syncSetup", "click", function () {
      gSyncPane._chooseWhatToSync(false);
    });
  },

  async _chooseWhatToSync(isAlreadySyncing) {
    // Assuming another device is syncing and we're not, we update the engines
    // selection so the correct checkboxes are pre-filled.
    if (!isAlreadySyncing) {
      try {
        await Weave.Service.updateLocalEnginesState();
      } catch (err) {
        console.error("Error updating the local engines state", err);
      }
    }
    const params = {};
    if (isAlreadySyncing) {
      // If we are already syncing then we also offer to disconnect.
      params.disconnectFun = () => this.disconnectSync();
    }
    gSubDialog.open(
      "chrome://messenger/content/preferences/syncDialog.xhtml",
      {
        features: "resizable=no",
        closingCallback: event => {
          if (!isAlreadySyncing && event.detail.button == "accept") {
            // We weren't syncing but the user has accepted the dialog - so we
            // want to start!
            fxAccounts.telemetry
              .recordConnection(["sync"], "ui")
              .then(() => {
                return Weave.Service.configure();
              })
              .catch(err => {
                console.error("Failed to enable sync", err);
              });
          }
        },
      },
      params
    );
  },

  _updateSyncNow(syncing) {
    const button = document.getElementById("syncShowSyncedSyncNow");
    if (syncing) {
      document.l10n.setAttributes(button, "sync-panel-sync-now-syncing");
      button.disabled = true;
    } else {
      document.l10n.setAttributes(button, "sync-pane-sync-now");
      button.disabled = false;
    }
  },

  /**
   * If connecting to Firefox Accounts failed, try again.
   */
  async reSignIn() {
    // There's a bit of an edge-case here - we might be forcing reauth when we've
    // lost the FxA account data - in which case we'll not get a URL as the re-auth
    // URL embeds account info and the server endpoint complains if we don't
    // supply it - so we just use the regular "sign in" URL in that case.
    if (!(await FxAccounts.canConnectAccount())) {
      return;
    }

    EnsureFxAccountsWebChannel();
    const url = await FxAccounts.config.promiseConnectAccountURI("preferences");
    window.browsingContext.topChromeWindow.openContentTab(url);
  },

  /**
   * Send a confirmation email to the account's email address.
   */
  verifyFirefoxAccount() {
    const onError = async () => {
      const [title, body] = await document.l10n.formatValues([
        "sync-verification-not-sent-title",
        "sync-verification-not-sent-body",
      ]);
      new Notification(title, { body });
    };

    const onSuccess = async data => {
      if (data) {
        const [title, body] = await document.l10n.formatValues([
          "sync-verification-sent-title",
          {
            id: "sync-verification-sent-body",
            args: { userEmail: data.email },
          },
        ]);
        new Notification(title, { body });
      } else {
        onError();
      }
    };

    fxAccounts
      .resendVerificationEmail()
      .then(() => fxAccounts.getSignedInUser(), onError)
      .then(onSuccess, onError);
  },

  /**
   * Disconnect the account, including everything linked.
   *
   * @param {boolean} confirm - If true, asks the user if they're sure.
   */
  unlinkFirefoxAccount(confirm) {
    window.browsingContext.topChromeWindow.gSync.disconnect({ confirm });
  },

  /**
   * Disconnect sync, leaving the FxA account connected.
   */
  disconnectSync() {
    return window.browsingContext.topChromeWindow.gSync.disconnect({
      confirm: true,
      disconnectAccount: false,
    });
  },

  _populateComputerName(value) {
    const textbox = document.getElementById("fxaDeviceNameInput");
    if (!textbox.hasAttribute("placeholder")) {
      textbox.setAttribute(
        "placeholder",
        fxAccounts.device.getDefaultLocalName()
      );
    }
    textbox.value = value;
  },

  /**
   * Arranges to dynamically show or hide sync engine name elements based on
   * the preferences used for the engines.
   */
  setupEnginesUI() {
    const observe = (element, prefName) => {
      element.hidden = !Services.prefs.getBoolPref(prefName, false);
    };

    const engineItems = {
      showSyncAccount: "services.sync.engine.servers",
      showSyncIdentity: "services.sync.engine.identities",
      showSyncAddress: "services.sync.engine.addressbooks",
      showSyncCalendar: "services.sync.engine.calendars",
      showSyncPasswords: "services.sync.engine.passwords",
    };

    for (const [id, prefName] of Object.entries(engineItems)) {
      const obs = observe.bind(null, document.getElementById(id), prefName);
      obs();
      Services.prefs.addObserver(prefName, obs);
      window.addEventListener("unload", () => {
        Services.prefs.removeObserver(prefName, obs);
      });
    }
  },
};

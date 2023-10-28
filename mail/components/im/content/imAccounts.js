/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements */
/* globals statusSelector */
/* globals MsgAccountManager */

var { DownloadUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/DownloadUtils.sys.mjs"
);

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineESModuleGetters(this, {
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
});

// This is the list of notifications that the account manager window observes
var events = [
  "prpl-quit",
  "account-list-updated",
  "account-added",
  "account-updated",
  "account-removed",
  "account-connected",
  "account-connecting",
  "account-disconnected",
  "account-disconnecting",
  "account-connect-progress",
  "account-connect-error",
  "autologin-processed",
  "status-changed",
  "network:offline-status-changed",
];

var gAccountManager = {
  // Sets the delay after connect() or disconnect() during which
  // it is impossible to perform disconnect() and connect()
  _disabledDelay: 500,
  disableTimerID: 0,
  _connectedLabelInterval: 0,

  get msgNotificationBar() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        document.getElementById("accounts-notification-box").prepend(element);
      });
    }
    return this._notificationBox;
  },

  load() {
    // Wait until the password service is ready before offering anything.
    Services.logins.initializationPromise.then(
      () => {
        this.accountList = document.getElementById("accountlist");
        let defaultID;
        IMServices.core.init(); // ensure the imCore is initialized.
        for (const acc of this.getAccounts()) {
          const elt = document.createXULElement("richlistitem", {
            is: "chat-account-richlistitem",
          });
          this.accountList.appendChild(elt);
          elt.build(acc);
          if (
            !defaultID &&
            acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED
          ) {
            defaultID = acc.id;
          }
        }
        for (const event of events) {
          Services.obs.addObserver(this, event);
        }
        if (!this.accountList.getRowCount()) {
          // This is horrible, but it works. Otherwise (at least on mac)
          // the wizard is not centered relatively to the account manager
          setTimeout(function () {
            gAccountManager.new();
          }, 0);
        } else {
          // we have accounts, show the list
          document.getElementById("noAccountScreen").hidden = true;
          document.getElementById("accounts-notification-box").hidden = false;

          // ensure an account is selected
          if (defaultID) {
            this.selectAccount(defaultID);
          } else {
            this.accountList.selectedIndex = 0;
          }
        }

        this.setAutoLoginNotification();

        this.accountList.addEventListener("keypress", this.onKeyPress, true);
        window.addEventListener("unload", this.unload.bind(this));
        this._connectedLabelInterval = setInterval(
          this.updateConnectedLabels,
          60000
        );
        statusSelector.init();
      },
      () => {
        this.close();
      }
    );
  },
  unload() {
    clearInterval(this._connectedLabelInterval);
    for (const event of events) {
      Services.obs.removeObserver(this, event);
    }
  },
  _updateAccountList() {
    const accountList = this.accountList;
    let i = 0;
    for (const acc of this.getAccounts()) {
      const oldItem = accountList.getItemAtIndex(i);
      if (oldItem.id != acc.id) {
        const accElt = document.getElementById(acc.id);
        accountList.insertBefore(accElt, oldItem);
        accElt.refreshState();
      }
      ++i;
    }

    if (accountList.itemCount == 0) {
      // Focus the "New Account" button if there are no accounts left.
      document.getElementById("newaccount").focus();
      // Return early, otherwise we'll run into an 'undefined property' strict
      //  warning when trying to focus the buttons. Fixes bug 408.
      return;
    }

    // The selected item is still selected
    if (accountList.selectedItem) {
      accountList.selectedItem.setFocus();
    }
    accountList.ensureSelectedElementIsVisible();

    // We need to refresh the disabled menu items
    this.disableCommandItems();
  },
  observe(aObject, aTopic, aData) {
    if (aTopic == "prpl-quit") {
      // libpurple is being uninitialized. We don't need the account
      // manager window anymore, close it.
      this.close();
      return;
    } else if (aTopic == "autologin-processed") {
      const notification =
        this.msgNotificationBar.getNotificationWithValue("autoLoginStatus");
      if (notification) {
        notification.close();
      }
      return;
    } else if (aTopic == "network:offline-status-changed") {
      this.setOffline(aData == "offline");
      return;
    } else if (aTopic == "status-changed") {
      this.setOffline(aObject.statusType == Ci.imIStatusInfo.STATUS_OFFLINE);
      return;
    } else if (aTopic == "account-list-updated") {
      this._updateAccountList();
      return;
    }

    // The following notification handlers need an account.
    const account = aObject.QueryInterface(Ci.imIAccount);

    if (aTopic == "account-added") {
      document.getElementById("noAccountScreen").hidden = true;
      document.getElementById("accounts-notification-box").hidden = false;
      const elt = document.createXULElement("richlistitem", {
        is: "chat-account-richlistitem",
      });
      this.accountList.appendChild(elt);
      elt.build(account);
      if (this.accountList.getRowCount() == 1) {
        this.accountList.selectedIndex = 0;
      }
    } else if (aTopic == "account-removed") {
      const elt = document.getElementById(account.id);
      elt.destroy();
      if (!elt.selected) {
        elt.remove();
        return;
      }
      // The currently selected element is removed,
      // ensure another element gets selected (if the list is not empty)
      var selectedIndex = this.accountList.selectedIndex;
      // Prevent errors if the timer is active and the account deleted
      clearTimeout(this.disableTimerID);
      this.disableTimerID = 0;
      elt.remove();
      var count = this.accountList.getRowCount();
      if (!count) {
        document.getElementById("noAccountScreen").hidden = false;
        document.getElementById("accounts-notification-box").hidden = true;
        return;
      }
      if (selectedIndex == count) {
        --selectedIndex;
      }
      this.accountList.selectedIndex = selectedIndex;
    } else if (aTopic == "account-updated") {
      document.getElementById(account.id).build(account);
      this.disableCommandItems();
    } else if (aTopic == "account-connect-progress") {
      document.getElementById(account.id).updateConnectingProgress();
    } else if (aTopic == "account-connect-error") {
      document.getElementById(account.id).updateConnectionError();
      // See NSSErrorsService::ErrorIsOverridable.
      if (
        [
          "MOZILLA_PKIX_ERROR_ADDITIONAL_POLICY_CONSTRAINT_FAILED",
          "MOZILLA_PKIX_ERROR_CA_CERT_USED_AS_END_ENTITY",
          "MOZILLA_PKIX_ERROR_EMPTY_ISSUER_NAME",
          "MOZILLA_PKIX_ERROR_INADEQUATE_KEY_SIZE",
          "MOZILLA_PKIX_ERROR_MITM_DETECTED",
          "MOZILLA_PKIX_ERROR_NOT_YET_VALID_CERTIFICATE",
          "MOZILLA_PKIX_ERROR_NOT_YET_VALID_ISSUER_CERTIFICATE",
          "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT",
          "MOZILLA_PKIX_ERROR_V1_CERT_USED_AS_CA",
          "SEC_ERROR_CA_CERT_INVALID",
          "SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED",
          "SEC_ERROR_EXPIRED_CERTIFICATE",
          "SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE",
          "SEC_ERROR_INVALID_TIME",
          "SEC_ERROR_UNKNOWN_ISSUER",
          "SSL_ERROR_BAD_CERT_DOMAIN",
        ].includes(account.prplAccount.securityInfo?.errorCodeString)
      ) {
        this.addException();
      }
    } else {
      const stateEvents = {
        "account-connected": "connected",
        "account-connecting": "connecting",
        "account-disconnected": "disconnected",
        "account-disconnecting": "disconnecting",
      };
      if (aTopic in stateEvents) {
        const elt = document.getElementById(account.id);
        if (!elt) {
          // Probably disconnecting a removed account.
          return;
        }
        elt.refreshState(stateEvents[aTopic]);
      }
    }
  },
  cancelReconnection() {
    this.accountList.selectedItem.cancelReconnection();
  },
  connect() {
    const account = this.accountList.selectedItem.account;
    if (account.disconnected) {
      this.temporarilyDisableButtons();
      account.connect();
    }
  },
  disconnect() {
    const account = this.accountList.selectedItem.account;
    if (account.connected || account.connecting) {
      this.temporarilyDisableButtons();
      account.disconnect();
    }
  },
  addException() {
    const account = this.accountList.selectedItem.account;
    const prplAccount = account.prplAccount;
    if (!prplAccount.connectionTarget) {
      return;
    }

    // Open the Gecko SSL exception dialog.
    const params = {
      exceptionAdded: false,
      securityInfo: prplAccount.securityInfo,
      prefetchCert: true,
      location: prplAccount.connectionTarget,
    };
    window.openDialog(
      "chrome://pippki/content/exceptionDialog.xhtml",
      "",
      "chrome,centerscreen,modal",
      params
    );
    // Reconnect the account if an exception was added.
    if (params.exceptionAdded) {
      account.disconnect();
      account.connect();
    }
  },
  copyDebugLog() {
    const account = this.accountList.selectedItem.account;
    const text = account
      .getDebugMessages()
      .map(function (dbgMsg) {
        const m = dbgMsg.message;
        let time = new Date(m.timeStamp);
        const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
          dateStyle: "short",
          timeStyle: "long",
        });
        time = dateTimeFormatter.format(time);
        let level = dbgMsg.logLevel;
        if (!level) {
          return "(" + m.errorMessage + ")";
        }
        if (level == dbgMsg.LEVEL_ERROR) {
          level = "ERROR";
        } else if (level == dbgMsg.LEVEL_WARNING) {
          level = "WARN.";
        } else if (level == dbgMsg.LEVEL_LOG) {
          level = "LOG  ";
        } else {
          level = "DEBUG";
        }
        return (
          "[" +
          time +
          "] " +
          level +
          " (@ " +
          m.sourceLine +
          " " +
          m.sourceName +
          ":" +
          m.lineNumber +
          ")\n" +
          m.errorMessage
        );
      })
      .join("\n");
    Cc["@mozilla.org/widget/clipboardhelper;1"]
      .getService(Ci.nsIClipboardHelper)
      .copyString(text);
  },
  updateConnectedLabels() {
    for (let i = 0; i < gAccountManager.accountList.itemCount; ++i) {
      const item = gAccountManager.accountList.getItemAtIndex(i);
      if (item.account.connected) {
        item.refreshConnectedLabel();
      }
    }
  },
  /* This function disables the connect/disconnect buttons for
   * `this._disabledDelay` ms before calling disableCommandItems to restore
   * the state of the buttons.
   */
  temporarilyDisableButtons() {
    document.getElementById("cmd_disconnect").setAttribute("disabled", "true");
    document.getElementById("cmd_connect").setAttribute("disabled", "true");
    clearTimeout(this.disableTimerID);
    this.accountList.focus();
    this.disableTimerID = setTimeout(
      function (aItem) {
        gAccountManager.disableTimerID = 0;
        gAccountManager.disableCommandItems();
        aItem.setFocus();
      },
      this._disabledDelay,
      this.accountList.selectedItem
    );
  },

  new() {
    this.openDialog("chrome://messenger/content/chat/imAccountWizard.xhtml");
  },
  edit() {
    // Find the nsIIncomingServer for the current imIAccount.
    let server = null;
    const imAccountId = this.accountList.selectedItem.account.numericId;
    for (const account of MailServices.accounts.accounts) {
      const incomingServer = account.incomingServer;
      if (!incomingServer || incomingServer.type != "im") {
        continue;
      }
      if (incomingServer.wrappedJSObject.imAccount.numericId == imAccountId) {
        server = incomingServer;
        break;
      }
    }

    MsgAccountManager(null, server);
  },
  autologin() {
    var elt = this.accountList.selectedItem;
    elt.autoLogin = !elt.autoLogin;
  },
  close() {
    // If a modal dialog is opened, we can't close this window now
    if (this.modalDialog) {
      setTimeout(function () {
        window.close();
      }, 0);
    } else {
      window.close();
    }
  },

  /* This function disables or enables the currently selected button and
     the corresponding context menu item */
  disableCommandItems() {
    const accountList = this.accountList;
    const selectedItem = accountList.selectedItem;
    // When opening the account manager, if accounts have errors, we
    // can be called during build(), before any item is selected.
    // In this case, just return early.
    if (!selectedItem) {
      return;
    }

    // If the timer that disables the button (for a short time) already exists,
    // we don't want to interfere and set the button as enabled.
    if (this.disableTimerID) {
      return;
    }

    const account = selectedItem.account;
    const isCommandDisabled =
      this.isOffline ||
      (account.disconnected &&
        account.connectionErrorReason == Ci.imIAccount.ERROR_UNKNOWN_PRPL);

    const disabledItems = ["connect", "disconnect"];
    for (const name of disabledItems) {
      const elt = document.getElementById("cmd_" + name);
      if (isCommandDisabled) {
        elt.setAttribute("disabled", "true");
      } else {
        elt.removeAttribute("disabled");
      }
    }
  },
  onContextMenuShowing(event) {
    const targetElt = event.target.triggerNode.closest(
      'richlistitem[is="chat-account-richlistitem"]'
    );
    document.querySelectorAll(".im-context-account-item").forEach(e => {
      e.hidden = !targetElt;
    });
    if (targetElt) {
      const account = targetElt.account;
      const hiddenItems = {
        connect: !account.disconnected,
        disconnect: account.disconnected || account.disconnecting,
        cancelReconnection: !targetElt.hasAttribute("reconnectPending"),
        accountsItemsSeparator: account.disconnecting,
      };
      for (const name in hiddenItems) {
        document.getElementById("context_" + name).hidden = hiddenItems[name];
      }
    }
  },

  selectAccount(aAccountId) {
    this.accountList.selectedItem = document.getElementById(aAccountId);
    this.accountList.ensureSelectedElementIsVisible();
  },
  onAccountSelect() {
    clearTimeout(this.disableTimerID);
    this.disableTimerID = 0;
    this.disableCommandItems();
    // Horrible hack here too, see Bug 177
    setTimeout(
      function (aThis) {
        try {
          aThis.accountList.selectedItem.setFocus();
        } catch (e) {
          /* Sometimes if the user goes too fast with VK_UP or VK_DOWN, the
           selectedItem doesn't have the expected binding attached */
        }
      },
      0,
      this
    );
  },

  onKeyPress(event) {
    if (!this.selectedItem) {
      return;
    }
    // As we stop propagation, the default action applies to the richlistbox
    // so that the selected account is changed with this default action
    if (event.keyCode == event.DOM_VK_DOWN) {
      if (this.selectedIndex < this.itemCount - 1) {
        this.ensureIndexIsVisible(this.selectedIndex + 1);
      }
      event.stopPropagation();
      return;
    }

    if (event.keyCode == event.DOM_VK_UP) {
      if (this.selectedIndex > 0) {
        this.ensureIndexIsVisible(this.selectedIndex - 1);
      }
      event.stopPropagation();
      return;
    }

    if (event.keyCode == event.DOM_VK_RETURN) {
      const target = event.target;
      if (
        target.localName != "checkbox" &&
        (target.localName != "button" ||
          /^(dis)?connect$/.test(target.getAttribute("anonid")))
      ) {
        this.selectedItem.buttons.proceedDefaultAction();
      }
    }
  },

  *getAccounts() {
    for (const account of IMServices.accounts.getAccounts()) {
      yield account;
    }
  },

  openDialog(aUrl, aArgs) {
    this.modalDialog = true;
    window.openDialog(aUrl, "", "chrome,modal,titlebar,centerscreen", aArgs);
    this.modalDialog = false;
  },

  setAutoLoginNotification() {
    var autoLoginStatus = IMServices.accounts.autoLoginStatus;
    let isOffline = false;
    let crashCount = 0;
    for (const acc of this.getAccounts()) {
      if (
        acc.autoLogin &&
        acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED
      ) {
        ++crashCount;
      }
    }

    if (
      autoLoginStatus == IMServices.accounts.AUTOLOGIN.ENABLED &&
      crashCount == 0
    ) {
      const status = IMServices.core.globalUserStatus.statusType;
      this.setOffline(isOffline || status == Ci.imIStatusInfo.STATUS_OFFLINE);
      return;
    }

    var bundle = document.getElementById("accountsBundle");
    const box = this.msgNotificationBar;
    var prio = box.PRIORITY_INFO_HIGH;
    var connectNowButton = {
      accessKey: bundle.getString(
        "accountsManager.notification.button.accessKey"
      ),
      callback: this.processAutoLogin,
      label: bundle.getString("accountsManager.notification.button.label"),
    };
    var barLabel;

    switch (autoLoginStatus) {
      case IMServices.accounts.AUTOLOGIN.USER_DISABLED:
        barLabel = bundle.getString(
          "accountsManager.notification.userDisabled.label"
        );
        break;

      case IMServices.accounts.AUTOLOGIN.SAFE_MODE:
        barLabel = bundle.getString(
          "accountsManager.notification.safeMode.label"
        );
        break;

      case IMServices.accounts.AUTOLOGIN.START_OFFLINE:
        barLabel = bundle.getString(
          "accountsManager.notification.startOffline.label"
        );
        isOffline = true;
        break;

      case IMServices.accounts.AUTOLOGIN.CRASH:
        barLabel = bundle.getString("accountsManager.notification.crash.label");
        prio = box.PRIORITY_WARNING_MEDIUM;
        break;

      /* One or more accounts made the application crash during their connection.
         If none, this function has already returned */
      case IMServices.accounts.AUTOLOGIN.ENABLED:
        barLabel = bundle.getString(
          "accountsManager.notification.singleCrash.label"
        );
        barLabel = PluralForm.get(crashCount, barLabel).replace(
          "#1",
          crashCount
        );
        prio = box.PRIORITY_WARNING_MEDIUM;
        connectNowButton.callback = this.processCrashedAccountsLogin;
        break;

      default:
        barLabel = bundle.getString("accountsManager.notification.other.label");
    }
    const status = IMServices.core.globalUserStatus.statusType;
    this.setOffline(isOffline || status == Ci.imIStatusInfo.STATUS_OFFLINE);

    box.appendNotification(
      "autologinStatus",
      {
        label: barLabel,
        priority: prio,
      },
      [connectNowButton]
    );
  },
  processAutoLogin() {
    var ioService = Services.io;
    if (ioService.offline) {
      ioService.manageOfflineStatus = false;
      ioService.offline = false;
    }

    IMServices.accounts.processAutoLogin();

    gAccountManager.accountList.selectedItem.setFocus();
  },
  processCrashedAccountsLogin() {
    for (const acc in gAccountManager.getAccounts()) {
      if (
        acc.disconnected &&
        acc.autoLogin &&
        acc.firstConnectionState == acc.FIRST_CONNECTION_CRASHED
      ) {
        acc.connect();
      }
    }

    const notification =
      this.msgNotificationBar.getNotificationWithValue("autoLoginStatus");
    if (notification) {
      notification.close();
    }

    gAccountManager.accountList.selectedItem.setFocus();
  },
  setOffline(aState) {
    this.isOffline = aState;
    if (aState) {
      this.accountList.setAttribute("offline", "true");
    } else {
      this.accountList.removeAttribute("offline");
    }
    this.disableCommandItems();
  },
};

window.addEventListener("DOMContentLoaded", () => {
  gAccountManager.load();
});

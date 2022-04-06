/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global MozElements */
/* import-globals-from ../../../../components/compose/content/MsgComposeCommands.js */
/* import-globals-from commonWorkflows.js */

"use strict";

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  KeyLookupHelper: "chrome://openpgp/content/modules/keyLookupHelper.jsm",
  OpenPGPAlias: "chrome://openpgp/content/modules/OpenPGPAlias.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
  // FIXME: using this creates a conflict with another file where this symbol
  // was imported with ChromeUtils instead of defined as lazy getter.
  // EnigmailWindows: "chrome://openpgp/content/modules/windows.jsm",
});
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);

window.addEventListener("load", () => {
  gKeyAssistant.onLoad();
});
window.addEventListener("unload", () => {
  gKeyAssistant.onUnload();
});

var gKeyAssistant = {
  dialog: null,
  recipients: [],
  currentRecip: null,

  /**
   * Initialize the main notification box for the account setup process.
   */
  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document.getElementById("modalDialogNotification").append(element);
      });
    }
    return this._notificationBox;
  },

  onLoad() {
    this.dialog = document.getElementById("keyAssistant");

    this._setupEventListeners();
  },

  _setupEventListeners() {
    document
      .getElementById("disabledEncryptionButton")
      .addEventListener("click", () => {
        setSendEncryptedAndSigned(false);
        this.close();
      });
    document
      .getElementById("sendEncryptedButton")
      .addEventListener("click", () => {
        goDoCommand("cmd_sendWithCheck");
        this.close();
      });
    document
      .getElementById("toggleRecipientsButton")
      .addEventListener("click", () => {
        this.toggleRecipientsList();
      });
  },

  async close() {
    await checkRecipientKeys();
    this.dialog.close();
  },

  onUnload() {
    this.recipients = [];
  },

  /**
   * Open the key assistant modal dialog.
   *
   * @param {string[]} recipients - An array of strings containing all currently
   *   written recipients.
   * @param {boolean} isSending - If the key assistant was triggered during a
   *   sending attempt.
   */
  show(recipients, isSending) {
    this.recipients = recipients;
    this.buildMainView();
    this.resetViews();

    document.getElementById("sendEncryptedButton").hidden = !isSending;
    document.getElementById(
      "disabledEncryptionButton"
    ).hidden = !gSendEncrypted;

    this.dialog.showModal();
  },

  resetViews() {
    this.notificationBox.removeAllNotifications();
    this.dialog.removeAttribute("style");

    for (let view of document.querySelectorAll(".dialog-body-view")) {
      view.hidden = true;
    }

    document.getElementById("mainButtons").hidden = false;
    document.getElementById("mainView").hidden = false;
  },

  changeView(view, context) {
    this.resetViews();

    this.dialog.setAttribute(
      "style",
      `min-height: ${this.dialog.getBoundingClientRect().height}px`
    );

    document.getElementById("mainView").hidden = true;
    document.getElementById(`${view}View`).hidden = false;

    switch (view) {
      case "discover":
        this.hideMainButtons();
        this.initOnlineDiscovery(context);
        break;

      case "resolve":
        this.hideMainButtons();
        break;

      default:
        break;
    }
  },

  hideMainButtons() {
    document.getElementById("mainButtons").hidden = true;
  },

  /**
   * Populate the main view of the key assistant with the list of recipients and
   * its keys, separating the recipients that have issues from those without
   * issues.
   */
  async buildMainView() {
    // Restore empty UI state.
    document.getElementById("keyAssistantIssues").hidden = true;
    document.getElementById("keysListIssues").replaceChildren();
    document.getElementById("keyAssistantValid").hidden = true;
    document.getElementById("keysListValid").replaceChildren();

    let usableKeys = 0;
    let problematicKeys = 0;

    for (let addr of this.recipients) {
      // Fetch all keys for the current recipient.
      let keyMetas = await EnigmailKeyRing.getEncryptionKeyMeta(addr);

      if (keyMetas.some(k => k.readiness == "alias")) {
        // Skip if this is an alias email.
        continue;
      }

      let acceptedKeys = keyMetas.filter(k => k.readiness == "accepted");
      if (acceptedKeys.length) {
        this.addToUsableList(addr, acceptedKeys[0]);
        usableKeys++;
        continue;
      }

      this.addToProblematicList(addr, keyMetas);
      problematicKeys++;
    }

    document.getElementById("keyAssistantIssues").hidden = !problematicKeys;
    document.l10n.setAttributes(
      document.getElementById("keyAssistantIssuesDescription"),
      "openpgp-key-assistant-recipients-issue-description",
      { count: problematicKeys }
    );

    document.getElementById("keyAssistantValid").hidden = !usableKeys;

    if (!problematicKeys && usableKeys) {
      document.l10n.setAttributes(
        document.getElementById("keyAssistantValidDescription"),
        "openpgp-key-assistant-recipients-description-no-issues"
      );
      document.getElementById("toggleRecipientsButton").click();
    } else {
      document.l10n.setAttributes(
        document.getElementById("keyAssistantValidDescription"),
        "openpgp-key-assistant-recipients-description",
        { count: usableKeys }
      );
    }

    document.getElementById("sendEncryptedButton").disabled =
      problematicKeys || !usableKeys;
  },

  async viewKey(window, keyMeta) {
    let exists = EnigmailKeyRing.getKeyById(keyMeta.keyObj.keyId);

    if (!exists) {
      if (keyMeta.readiness != "collected") {
        return;
      }
      await EnigmailKeyRing.importKeyDataSilent(
        window,
        keyMeta.collectedKey.pubKey,
        true
      );
    }

    EnigmailWindows.openKeyDetails(window, keyMeta.keyObj.keyId, false);
  },

  addToUsableList(recipient, keyMeta) {
    let list = document.getElementById("keysListValid");
    let row = document.createElement("li");
    row.classList.add("key-row");

    let info = document.createElement("div");
    info.classList.add("key-info");
    let title = document.createElement("b");
    title.textContent = recipient;

    info.appendChild(title);

    let button = document.createElement("button");
    document.l10n.setAttributes(
      button,
      "openpgp-key-assistant-view-key-button"
    );
    button.addEventListener("click", () => {
      gKeyAssistant.viewKey(window, keyMeta);
    });

    row.append(info, button);
    list.appendChild(row);
  },

  findKeysStatus(element, keyMetas) {
    // Multiple keys available.

    let unaccepted = keyMetas.filter(
      k => k.readiness == "undecided" || k.readiness == "rejected"
    );
    let collected = keyMetas.filter(k => k.readiness == "collected");

    if (unaccepted.length + collected.length > 1) {
      document.l10n.setAttributes(
        element,
        "openpgp-key-assistant-multiple-keys"
      );
      return;
    }

    // Not expired but not accepted keys.
    if (unaccepted.length) {
      document.l10n.setAttributes(
        element,
        "openpgp-key-assistant-key-unaccepted",
        {
          count: unaccepted.length,
        }
      );
      return;
    }

    let expiredAccepted = keyMetas.filter(
      k => k.readiness == "expiredAccepted"
    );

    // Key accepted but expired.
    if (expiredAccepted.length) {
      if (expiredAccepted.length == 1) {
        document.l10n.setAttributes(
          element,
          "openpgp-key-assistant-key-accepted-expired",
          {
            date: expiredAccepted[0].keyObj.effectiveExpiry,
          }
        );
      } else {
        document.l10n.setAttributes(
          element,
          "openpgp-key-assistant-keys-accepted-expired"
        );
      }
      return;
    }

    let expiredUnaccepted = keyMetas.filter(
      k => k.readiness == "expiredUndecided" || k.readiness == "expiredRejected"
    );

    // Key not accepted and expired.
    if (expiredUnaccepted.length) {
      if (expiredUnaccepted.length == 1) {
        document.l10n.setAttributes(
          element,
          "openpgp-key-assistant-key-unaccepted-expired-one",
          {
            date: expiredUnaccepted[0].keyObj.effectiveExpiry,
          }
        );
      } else {
        document.l10n.setAttributes(
          element,
          "openpgp-key-assistant-key-unaccepted-expired-many"
        );
      }
      return;
    }

    let unacceptedNotYetImported = keyMetas.filter(
      k => k.readiness == "collected"
    );

    if (unacceptedNotYetImported.length) {
      if (unacceptedNotYetImported.length == 1) {
        // Show a generic message if the key was collected from multiple
        // sources.
        if (unacceptedNotYetImported[0].collectedKey.sources.length > 1) {
          document.l10n.setAttributes(
            element,
            "openpgp-key-assistant-key-collected-multiple"
          );
          return;
        }

        // Otherwise try to find the source.
        let source = ["attachment", "autocrypt"].includes(
          unacceptedNotYetImported[0].collectedKey.sources[0].type
        )
          ? "email"
          : unacceptedNotYetImported[0].collectedKey.sources[0].type;
        // openpgp-key-assistant-key-collected-email
        // openpgp-key-assistant-key-collected-keyserver
        // openpgp-key-assistant-key-collected-wkd
        document.l10n.setAttributes(
          element,
          `openpgp-key-assistant-key-collected-${source}`
        );
        return;
      }

      document.l10n.setAttributes(
        element,
        "openpgp-key-assistant-keys-collected"
      );
      return;
    }

    // We found nothing, so let's return a default message.
    document.l10n.setAttributes(
      element,
      "openpgp-key-assistant-no-key-available"
    );
  },

  addToProblematicList(recipient, keyMetas) {
    let list = document.getElementById("keysListIssues");
    let row = document.createElement("li");
    row.classList.add("key-row");

    let info = document.createElement("div");
    info.classList.add("key-info");
    let title = document.createElement("b");
    title.textContent = recipient;
    let description = document.createElement("span");
    description.classList.add("tip-caption");
    info.append(title, description);

    let canOfferResolving = keyMetas.some(
      k =>
        k.readiness == "collected" ||
        k.readiness == "expiredAccepted" ||
        k.readiness == "expiredUndecided" ||
        k.readiness == "undecided" ||
        k.readiness == "expiredRejected" ||
        k.readiness == "rejected"
    );

    if (canOfferResolving) {
      this.findKeysStatus(description, keyMetas);
      let button = document.createElement("button");
      document.l10n.setAttributes(
        button,
        "openpgp-key-assistant-issue-resolve-button"
      );
      button.addEventListener("click", () => {
        this.buildResolveView(recipient, keyMetas);
      });
      row.append(info, button);
    } else {
      document.l10n.setAttributes(
        description,
        "openpgp-key-assistant-no-key-available"
      );
      row.appendChild(info);
    }

    list.appendChild(row);
  },

  findKeyOriginAndStatus(element, keyMeta) {
    // The key was collected from somewhere.
    if (keyMeta.collectedKey?.sources?.length == 1) {
      // Only one available source for this key.
      let type = keyMeta.collectedKey.sources[0].type;
      let source = ["attachment", "autocrypt"].includes(type) ? "email" : type;
      // openpgp-key-assistant-key-collected-email
      // openpgp-key-assistant-key-collected-keyserver
      // openpgp-key-assistant-key-collected-wkd
      document.l10n.setAttributes(
        element,
        `openpgp-key-assistant-key-collected-${source}`
      );
      return;
    } else if (keyMeta.collectedKey?.sources?.length > 1) {
      // Multiple source for this key.
      let reportedSources = [];
      for (let source of keyMeta.collectedKey.sources) {
        let span = document.createElement("span");
        span.classList.add("display-block");
        let type = ["attachment", "autocrypt"].includes(source.type)
          ? "email"
          : source.type;
        if (!reportedSources.includes(type)) {
          reportedSources.push(type);
          document.l10n.setAttributes(
            span,
            `openpgp-key-assistant-key-collected-${type}`
          );
          element.appendChild(span);
        }
      }
      return;
    }

    // The key was rejected.
    if (keyMeta.readiness == "rejected") {
      document.l10n.setAttributes(
        element,
        "openpgp-key-assistant-key-rejected" // TODO string missing!!!
      );
      return;
    }

    // Key is expired.
    if (
      keyMeta.readiness == "expiredAccepted" ||
      keyMeta.readiness == "expiredUndecided" ||
      keyMeta.readiness == "expiredRejected"
    ) {
      document.l10n.setAttributes(
        element,
        "openpgp-key-assistant-key-unaccepted-expired-one",
        {
          date: keyMeta.keyObj.effectiveExpiry,
        }
      );
      return;
    }

    // We found nothing, so let's return a default message.
    document.l10n.setAttributes(
      element,
      "openpgp-key-assistant-key-source-default"
    );
  },

  async buildResolveView(recipient, keyMetas) {
    this.currentRecip = recipient;

    document.l10n.setAttributes(
      document.getElementById("resolveViewTitle"),
      "openpgp-key-assistant-resolve-title",
      { recipient }
    );
    document.l10n.setAttributes(
      document.getElementById("resolveViewInfo"),
      "openpgp-key-assistant-resolve-discover-info",
      { recipient }
    );

    let unaccepted = keyMetas.filter(
      k => k.readiness == "undecided" || k.readiness == "rejected"
    );
    let collected = keyMetas.filter(k => k.readiness == "collected");

    let haveUsableKeys = unaccepted.length || collected.length;

    document.getElementById("resolveViewValid").hidden = !haveUsableKeys;
    let usableList = document.getElementById("resolveValidKeysList");
    usableList.replaceChildren();

    function createKeyRow(keyMeta, isValid) {
      let row = document.createElement("li");
      let label = document.createElement("label");
      label.classList.add("radio-container-with-text");

      let input = document.createElement("input");
      input.type = "radio";
      input.name = isValid ? "valid-key" : "invalid-key";
      input.value = keyMeta.keyObj.keyId;
      input.disabled = !isValid;

      if (isValid) {
        input.addEventListener("change", () => {
          document.getElementById("resolveViewAcceptKey").disabled = false;
        });
      }

      let description = document.createElement("span");
      let keyId = document.createElement("b");
      keyId.textContent = keyMeta.keyObj.keyId;
      description.appendChild(keyId);

      let button = document.createElement("button");
      button.classList.add("button-link");
      document.l10n.setAttributes(
        button,
        "openpgp-key-assistant-view-key-button"
      );
      button.addEventListener("click", () => {
        gKeyAssistant.viewKey(window, keyMeta);
      });

      let creationTime = document.createElement("time");
      creationTime.textContent = ` (${keyMeta.keyObj.created})`;
      description.appendChild(creationTime);

      let info = document.createElement("p");
      gKeyAssistant.findKeyOriginAndStatus(info, keyMeta);

      description.append(button, info);
      label.append(input, description);
      row.appendChild(label);

      return row;
    }

    let usableKeys = 0;
    for (let meta of unaccepted) {
      usableList.appendChild(createKeyRow(meta, true));
      usableKeys++;
    }

    for (let meta of collected) {
      usableList.appendChild(createKeyRow(meta, true));
      usableKeys++;
    }
    document.l10n.setAttributes(
      document.getElementById("resolveViewValidTitle"),
      "openpgp-key-assistant-valid-title",
      { count: usableKeys }
    );
    document.l10n.setAttributes(
      document.getElementById("resolveViewValidDescription"),
      "openpgp-key-assistant-valid-description",
      { count: usableKeys }
    );

    let expiredAccepted = keyMetas.filter(
      k => k.readiness == "expiredAccepted"
    );
    let expiredUnaccepted = keyMetas.filter(
      k => k.readiness == "expiredUndecided" || k.readiness == "expiredRejected"
    );

    let haveProblematicKeys =
      expiredAccepted.length || expiredUnaccepted.length;

    document.getElementById("resolveViewInvalid").hidden = !haveProblematicKeys;
    let problematicList = document.getElementById("resolveInvalidKeysList");
    problematicList.replaceChildren();

    for (let meta of expiredAccepted) {
      problematicList.appendChild(createKeyRow(meta, false));
    }
    for (let meta of expiredUnaccepted) {
      problematicList.appendChild(createKeyRow(meta, false));
    }

    document.getElementById("resolveViewAcceptKey").onclick = () => {
      this.acceptSelectedKey(recipient, keyMetas);
    };
    this.changeView("resolve");
  },

  async acceptSelectedKey(recipient, keyMetas) {
    let selectedKey = document.querySelector('input[name="valid-key"]:checked')
      .value;
    let fingerprint;

    let existingKey = EnigmailKeyRing.getKeyById(selectedKey);
    if (existingKey) {
      fingerprint = existingKey.fpr;
    } else {
      let unacceptedNotYetImported = keyMetas.filter(
        k => k.readiness == "collected"
      );

      for (let keyMeta of unacceptedNotYetImported) {
        if (keyMeta.keyObj.keyId != selectedKey) {
          continue;
        }
        await EnigmailKeyRing.importKeyDataSilent(
          window,
          keyMeta.collectedKey.pubKey,
          true
        );
        fingerprint = keyMeta.keyObj.fpr;
      }
    }

    if (!fingerprint) {
      throw new Error(`Key not found for id=${selectedKey}`);
    }

    await PgpSqliteDb2.addAcceptedEmail(fingerprint, recipient);

    // Trigger the UI refresh of the compose window.
    await checkRecipientKeys();

    this.buildMainView();
    this.resetViews();
  },

  async initOnlineDiscovery(context) {
    let container = document.getElementById("discoveryOutput");
    container.replaceChildren();

    function write(recipient) {
      let p = document.createElement("p");
      p.classList.add("loading-inline");
      document.l10n.setAttributes(p, "openpgp-key-assistant-discover-keys", {
        recipient,
      });
      container.appendChild(p);
    }

    let gotNewData = false;
    // checking gotNewData isn't really sufficient, because the discovery could
    // find an update for an existing key, which was expired, and is now valid
    // again. Let's always rebuild for now.

    if (context == "overview") {
      for (let email of this.recipients) {
        if (OpenPGPAlias.hasAliasDefinition(email)) {
          continue;
        }
        write(email);
        let rv = await KeyLookupHelper.fullOnlineDiscovery(
          "silent-collection",
          window,
          email,
          null
        );
        gotNewData = gotNewData || rv;
      }
      this.resetViews();
      this.buildMainView();
      return;
    }

    // We should never arrive here for an email address that has an
    // alias rule, because for those we don't want to perform online
    // discovery.

    if (OpenPGPAlias.hasAliasDefinition(this.currentRecip)) {
      throw new Error(`${this.currentRecip} has an alias rule`);
    }

    write(this.currentRecip);
    gotNewData = await KeyLookupHelper.fullOnlineDiscovery(
      "silent-collection",
      window,
      this.currentRecip,
      null
    );

    // If the recipient now has a usable previously accepted key, go back to
    // the main view and show a successful notification.
    let keyMetas = await EnigmailKeyRing.getEncryptionKeyMeta(
      this.currentRecip
    );

    if (keyMetas.some(k => k.readiness == "accepted")) {
      // Trigger the UI refresh of the compose window.
      await checkRecipientKeys();

      this.resetViews();
      this.buildMainView();

      let notification = this.notificationBox.getNotificationWithValue(
        "acceptedKeyUpdated"
      );

      // If a notification already exists, simply update the message.
      if (notification) {
        document.l10n.setAttributes(
          notification.messageText,
          "openpgp-key-assistant-expired-key-update",
          {
            recipient: this.currentRecip,
          }
        );
        return;
      }

      notification = this.notificationBox.appendNotification(
        "acceptedKeyUpdated",
        {
          label: {
            "l10n-id": "openpgp-key-assistant-expired-key-update",
            "l10n-args": { recipient: this.currentRecip },
          },
          priority: this.notificationBox.PRIORITY_INFO_HIGH,
        },
        null
      );
      notification.setAttribute("type", "success");
      return;
    }

    this.buildResolveView(this.currentRecip, keyMetas);
    gKeyAssistant.changeView("resolve");
  },

  toggleRecipientsList() {
    let list = document.getElementById("keysListValid");
    list.hidden = !list.hidden;

    document.l10n.setAttributes(
      document.getElementById("toggleRecipientsButton"),
      list.hidden
        ? "openpgp-key-assistant-recipients-show-button"
        : "openpgp-key-assistant-recipients-hide-button"
    );
  },

  async importFromFile(context) {
    await EnigmailCommon_importObjectFromFile("pub");
    if (context == "overview") {
      this.buildMainView();
    } else {
      this.buildResolveView(
        this.currentRecip,
        await EnigmailKeyRing.getEncryptionKeyMeta(this.currentRecip)
      );
    }
  },
};

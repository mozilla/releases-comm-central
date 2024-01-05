/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import { OTR } from "resource:///modules/OTR.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/otr/otrUI.ftl"], true)
);

function _str(id) {
  return lazy.l10n.formatValueSync(id);
}

function _strArgs(id, args) {
  return lazy.l10n.formatValueSync(id, args);
}

const OTR_ADD_FINGER_DIALOG_URL =
  "chrome://chat/content/otr-add-fingerprint.xhtml";

const AUTH_STATUS_UNVERIFIED = "otr-auth-unverified";
var authLabelMap;
var trustMap;

function initStrings() {
  authLabelMap = new Map([
    ["otr:auth-error", _str("auth-error")],
    ["otr:auth-success", _str("auth-success")],
    ["otr:auth-success-them", _str("auth-success-them")],
    ["otr:auth-fail", _str("auth-fail")],
    ["otr:auth-waiting", _str("auth-waiting")],
  ]);

  const sl = _str("start-label");
  const al = _str("auth-label");
  const rfl = _str("refresh-label");
  const ral = _str("reauth-label");

  trustMap = new Map([
    [
      OTR.trustState.TRUST_NOT_PRIVATE,
      {
        startLabel: sl,
        authLabel: al,
        disableStart: false,
        disableEnd: true,
        disableAuth: true,
        class: "not-private",
      },
    ],
    [
      OTR.trustState.TRUST_UNVERIFIED,
      {
        startLabel: rfl,
        authLabel: al,
        disableStart: false,
        disableEnd: false,
        disableAuth: false,
        class: "unverified",
      },
    ],
    [
      OTR.trustState.TRUST_PRIVATE,
      {
        startLabel: rfl,
        authLabel: ral,
        disableStart: false,
        disableEnd: false,
        disableAuth: false,
        class: "private",
      },
    ],
    [
      OTR.trustState.TRUST_FINISHED,
      {
        startLabel: sl,
        authLabel: al,
        disableStart: false,
        disableEnd: false,
        disableAuth: true,
        class: "finished",
      },
    ],
  ]);
}

var windowRefs = new Map();

export var OTRUI = {
  enabled: false,
  stringsLoaded: false,
  globalDoc: null,
  visibleConv: null,

  debug: false,
  logMsg(msg) {
    if (!OTRUI.debug) {
      return;
    }
    Services.console.logStringMessage(msg);
  },

  addMenuObserver() {
    for (const win of Services.ww.getWindowEnumerator()) {
      OTRUI.addMenus(win);
    }
    Services.obs.addObserver(OTRUI, "domwindowopened");
  },

  removeMenuObserver() {
    for (const win of Services.ww.getWindowEnumerator()) {
      OTRUI.removeMenus(win);
    }
    Services.obs.removeObserver(OTRUI, "domwindowopened");
  },

  addMenus(win) {
    const doc = win.document;
    // Account for unready windows
    if (doc.readyState !== "complete") {
      const listen = function () {
        win.removeEventListener("load", listen);
        OTRUI.addMenus(win);
      };
      win.addEventListener("load", listen);
    }
  },

  removeMenus(win) {
    const doc = win.document;
    OTRUI.removeBuddyContextMenu(doc);
  },

  addBuddyContextMenu(buddyContextMenu, doc, contact) {
    if (!buddyContextMenu || !OTR.libLoaded) {
      return; // Not the buddy list context menu
    }

    const sep = doc.createXULElement("menuseparator");
    sep.setAttribute("id", "otrsep");
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", _str("buddycontextmenu-label"));
    menuitem.setAttribute("id", "otrcont");
    menuitem.addEventListener("command", () => {
      const args = OTRUI.contactWrapper(contact);
      args.wrappedJSObject = args;
      const features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
      Services.ww.openWindow(
        null,
        OTR_ADD_FINGER_DIALOG_URL,
        "",
        features,
        args
      );
    });

    buddyContextMenu.addEventListener("popupshowing", e => {
      const target = e.target.triggerNode;
      if (target.localName == "richlistitem") {
        menuitem.hidden = false;
        sep.hidden = false;
      } else {
        /* probably imconv */
        menuitem.hidden = true;
        sep.hidden = true;
      }
    });

    buddyContextMenu.appendChild(sep);
    buddyContextMenu.appendChild(menuitem);
  },

  removeBuddyContextMenu(doc) {
    const s = doc.getElementById("otrsep");
    if (s) {
      s.remove();
    }
    const p = doc.getElementById("otrcont");
    if (p) {
      p.remove();
    }
  },

  loopKeyGenSuccess() {
    ChromeUtils.idleDispatch(OTRUI.genNextMissingKey);
  },

  loopKeyGenFailure(param) {
    ChromeUtils.idleDispatch(OTRUI.genNextMissingKey);
    OTRUI.reportKeyGenFailure(param);
  },

  reportKeyGenFailure(param) {
    throw new Error(_strArgs("otr-genkey-failed", { error: String(param) }));
  },

  accountsToGenKey: [],

  genNextMissingKey() {
    if (OTRUI.accountsToGenKey.length == 0) {
      return;
    }

    const acc = OTRUI.accountsToGenKey.pop();
    const fp = OTR.privateKeyFingerprint(acc.name, acc.prot);
    if (!fp) {
      OTR.generatePrivateKey(acc.name, acc.prot).then(
        OTRUI.loopKeyGenSuccess,
        OTRUI.loopKeyGenFailure
      );
    } else {
      ChromeUtils.idleDispatch(OTRUI.genNextMissingKey);
    }
  },

  genMissingKeys() {
    for (const acc of IMServices.accounts.getAccounts()) {
      OTRUI.accountsToGenKey.push({
        name: acc.normalizedName,
        prot: acc.protocol.normalizedName,
      });
    }
    ChromeUtils.idleDispatch(OTRUI.genNextMissingKey);
  },

  async init() {
    if (!OTRUI.stringsLoaded) {
      // HACK: calling initStrings may fail the first time due to synchronous
      // loading of the .ftl files. If we load the files and wait for a known
      // value asynchronously, no such failure will happen.
      //
      // If the value "start-label" is removed, this will fail.
      //
      // Also, we can't reuse this Localization object elsewhere because it
      // fails to load values synchronously (even after calling setIsSync).
      await new Localization(["messenger/otr/otrUI.ftl"]).formatValue(
        "start-label"
      );

      initStrings();
      OTRUI.stringsLoaded = true;
    }

    this.debug = Services.prefs.getBoolPref("chat.otr.trace", false);

    OTR.init({});
    if (!OTR.libLoaded) {
      return;
    }

    this.enabled = true;
    this.notificationbox = null;

    OTR.addObserver(OTRUI);
    OTR.loadFiles()
      .then(function () {
        Services.obs.addObserver(OTR, "new-ui-conversation");
        Services.obs.addObserver(OTR, "conversation-update-type");
        // Disabled until #76 is resolved.
        // Services.obs.addObserver(OTRUI, "contact-added", false);
        Services.obs.addObserver(OTRUI, "account-added");
        // Services.obs.addObserver(OTRUI, "contact-signed-off", false);
        Services.obs.addObserver(OTRUI, "conversation-loaded");
        Services.obs.addObserver(OTRUI, "conversation-closed");
        Services.obs.addObserver(OTRUI, "prpl-quit");

        for (const conv of IMServices.conversations.getConversations()) {
          OTRUI.initConv(conv);
        }
        OTRUI.addMenuObserver();

        ChromeUtils.idleDispatch(OTRUI.genMissingKeys);
      })
      .catch(function (err) {
        // console.log("===> " + err + "\n");
        throw err;
      });
  },

  disconnect(aConv) {
    if (aConv) {
      return OTR.disconnect(aConv, true);
    }
    let allGood = true;
    for (const conv of IMServices.conversations.getConversations()) {
      if (conv.isChat) {
        continue;
      }
      if (!OTR.disconnect(conv, true)) {
        allGood = false;
      }
    }
    return allGood;
  },

  openAuth(window, name, mode, uiConv, contactInfo) {
    const otrAuth = this.globalDoc.querySelector(".otr-auth");
    otrAuth.disabled = true;
    const win = window.openDialog(
      "chrome://chat/content/otr-auth.xhtml",
      "auth=" + name,
      "centerscreen,resizable=no,minimizable=no",
      mode,
      uiConv,
      contactInfo
    );
    windowRefs.set(name, win);
    window.addEventListener("beforeunload", function () {
      otrAuth.disabled = false;
      windowRefs.delete(name);
    });
  },

  closeAuth(context) {
    const win = windowRefs.get(context.username);
    if (win) {
      win.close();
    }
  },

  /**
   * Hide the encryption state container and any pending notifications.
   *
   * @param {Element} otrContainer
   * @param {Context} [context]
   */
  noOtrPossible(otrContainer, context) {
    otrContainer.hidden = true;

    if (context) {
      OTRUI.hideUserNotifications(context);
    } else {
      OTRUI.hideAllOTRNotifications();
    }
  },

  sendSystemAlert(uiConv, conv, bundleId) {
    uiConv.systemMessage(
      _strArgs(bundleId, { name: conv.normalizedName }),
      false,
      true
    );
  },

  setNotificationBox(notificationbox) {
    this.globalBox = notificationbox;
  },

  /*
   * These states are only relevant if OTR is the only encryption available for
   * the conversation. Protocol provided encryption takes priority.
   *  possible states:
   *    tab isn't a 1:1, isChat == true
   *      then OTR isn't possible, hide the button
   *    tab is a 1:1, isChat == false
   *      no conversation active, uiConv cannot be found
   *        then OTR isn't possible YET, hide the button
   *      conversation active, uiConv found
   *        disconnected?
   *          could the other side come back? should we keep the button?
   *        set the state based on the OTR library state
   */

  /**
   * Store a reference to the document, as well as the current conversation.
   *
   * @param {Element} aObject - conversation-browser instance (most importantly, has a _conv field)
   */
  addButton(aObject) {
    this.globalDoc = aObject.ownerDocument;
    const _conv = aObject._conv;
    OTRUI.visibleConv = _conv;
    if (
      _conv.encryptionState === Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED
    ) {
      OTRUI.setMsgState(_conv, null, this.globalDoc, true);
    }
  },

  /**
   * Hide the encryption state information for the current conversation.
   */
  hideOTRButton() {
    if (!OTR.libLoaded) {
      return;
    }
    if (!this.globalDoc) {
      return;
    }
    OTRUI.visibleConv = null;
    const otrContainer = this.globalDoc.querySelector(".encryption-container");
    OTRUI.noOtrPossible(otrContainer);
  },

  /**
   * Sets the visible conversation of the OTR UI state and ensures
   * the encryption state button is set up correctly.
   *
   * @param {prplIConversation} _conv
   */
  updateOTRButton(_conv) {
    if (
      _conv.encryptionState !== Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED
    ) {
      return;
    }
    if (!OTR.libLoaded) {
      return;
    }
    if (!this.globalDoc) {
      return;
    }
    OTRUI.visibleConv = _conv;
    let convBinding;
    for (const element of this.globalDoc.getElementById("conversationsBox")
      .children) {
      if (!element.hidden) {
        convBinding = element;
        break;
      }
    }
    if (convBinding && convBinding._conv && convBinding._conv.target) {
      OTRUI.setMsgState(_conv, null, this.globalDoc, false);
    } else {
      this.hideOTRButton();
    }
  },

  /**
   * Set encryption state on selector for conversation.
   *
   * @param {prplIConversation} _conv - Must match the visible conversation.
   * @param {Context} [context] - The OTR context for the conversation.
   * @param {DOMDocument} doc
   * @param {boolean} [addSystemMessage] - If a system message with the conversation security.
   */
  setMsgState(_conv, context, doc, addSystemMessage) {
    if (!this.visibleConv) {
      return;
    }
    if (_conv != null && !(_conv === this.visibleConv)) {
      return;
    }

    const otrContainer = doc.querySelector(".encryption-container");
    const otrButton = doc.querySelector(".encryption-button");
    if (_conv != null && _conv.isChat) {
      OTRUI.noOtrPossible(otrContainer, context);
      return;
    }

    if (!context && _conv != null) {
      context = OTR.getContext(_conv);
      if (!context) {
        OTRUI.noOtrPossible(otrContainer, null);
      }
    }

    try {
      const uiConv = OTR.getUIConvFromContext(context);
      if (uiConv != null && !(uiConv === this.visibleConv)) {
        return;
      }
      if (
        uiConv.encryptionState === Ci.prplIConversation.ENCRYPTION_ENABLED ||
        uiConv.encryptionState === Ci.prplIConversation.ENCRYPTION_TRUSTED
      ) {
        return;
      }

      if (uiConv.isChat) {
        OTRUI.noOtrPossible(otrContainer, context);
        return;
      }
      if (addSystemMessage) {
        const trust = OTRUI.getTrustSettings(context);
        const id = "state-" + trust.class;
        let msg;
        if (OTR.trust(context) == OTR.trustState.TRUST_NOT_PRIVATE) {
          msg = lazy.l10n.formatValueSync(id);
        } else {
          msg = lazy.l10n.formatValueSync(id, { name: context.username });
        }
        uiConv.systemMessage(msg, false, true);
      }
    } catch (e) {
      OTRUI.noOtrPossible(otrContainer, context);
      return;
    }

    otrContainer.hidden = false;
    const otrStart = doc.querySelector(".otr-start");
    const otrEnd = doc.querySelector(".otr-end");
    const otrAuth = doc.querySelector(".otr-auth");
    const trust = OTRUI.getTrustSettings(context);
    otrButton.setAttribute(
      "tooltiptext",
      _strArgs("state-" + trust.class, { name: context.username })
    );
    otrButton.setAttribute("label", _str("state-" + trust.class + "-label"));
    otrButton.className = "encryption-button encryption-" + trust.class;
    otrStart.setAttribute("label", trust.startLabel);
    otrStart.setAttribute("disabled", trust.disableStart);
    otrEnd.setAttribute("disabled", trust.disableEnd);
    otrAuth.setAttribute("label", trust.authLabel);
    otrAuth.setAttribute("disabled", trust.disableAuth);
    OTRUI.hideAllOTRNotifications();
    OTRUI.showUserNotifications(context);
  },

  alertTrust(context) {
    const uiConv = OTR.getUIConvFromContext(context);
    const trust = OTRUI.getTrustSettings(context);
    uiConv.systemMessage(
      _strArgs("afterauth-" + trust.class, { name: context.username }),
      false,
      true
    );
  },

  getTrustSettings(context) {
    const result = trustMap.get(OTR.trust(context));
    return result;
  },

  askAuth(aObject) {
    const uiConv = OTR.getUIConvFromContext(aObject.context);
    if (!uiConv) {
      return;
    }

    const name = uiConv.target.normalizedName;
    const msg = _strArgs("verify-request", { name });
    // Trigger the update of the unread message counter.
    uiConv.notifyVerifyOTR(msg);
    Services.obs.notifyObservers(uiConv, "new-otr-verification-request");

    const window = this.globalDoc.defaultView;
    const buttons = [
      {
        label: _str("finger-verify"),
        accessKey: _str("finger-verify-access-key"),
        callback() {
          OTRUI.openAuth(window, name, "ask", uiConv, aObject);
          // prevent closing of notification bar when the button is hit
          return true;
        },
      },
      {
        label: _str("finger-ignore"),
        accessKey: _str("finger-ignore-access-key"),
        callback() {
          const context = OTR.getContext(uiConv.target);
          OTR.abortSMP(context);
        },
      },
    ];

    const notification = this.globalBox.appendNotification(
      `ask-auth-${name}`,
      {
        label: msg,
        priority: this.globalBox.PRIORITY_WARNING_MEDIUM,
      },
      buttons
    );

    notification.removeAttribute("dismissable");
  },

  closeAskAuthNotification(aObject) {
    const name = aObject.context.username;
    const notification = this.globalBox.getNotificationWithValue(
      `ask-auth-${name}`
    );
    if (!notification) {
      return;
    }

    this.globalBox.removeNotification(notification);
  },

  closeUnverified(context) {
    const uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    for (const notification of this.globalBox.allNotifications) {
      if (
        context.username == notification.getAttribute("user") &&
        notification.getAttribute("value") == AUTH_STATUS_UNVERIFIED
      ) {
        notification.close();
      }
    }
  },

  hideUserNotifications(context) {
    for (const notification of this.globalBox.allNotifications) {
      if (context.username == notification.getAttribute("user")) {
        notification.close();
      }
    }
  },

  hideAllOTRNotifications() {
    for (const notification of this.globalBox.allNotifications) {
      if (notification.getAttribute("protocol") == "otr") {
        notification.setAttribute("hidden", "true");
      }
    }
  },

  showUserNotifications(context) {
    const name = context.username;
    for (const notification of this.globalBox.allNotifications) {
      if (name == notification.getAttribute("user")) {
        notification.removeAttribute("hidden");
      }
    }
  },

  notifyUnverified(context, seen) {
    const uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    const name = context.username;
    const window = this.globalDoc.defaultView;

    const buttons = [
      {
        label: _str("finger-verify"),
        accessKey: _str("finger-verify-access-key"),
        callback() {
          const name = uiConv.target.normalizedName;
          OTRUI.openAuth(window, name, "start", uiConv);
          // prevent closing of notification bar when the button is hit
          return true;
        },
      },
      {
        label: _str("finger-ignore"),
        accessKey: _str("finger-ignore-access-key"),
        callback() {
          const context = OTR.getContext(uiConv.target);
          OTR.abortSMP(context);
        },
      },
    ];

    const notification = this.globalBox.appendNotification(
      name,
      {
        label: _strArgs(`finger-${seen}`, { name }),
        priority: this.globalBox.PRIORITY_WARNING_MEDIUM,
      },
      buttons
    );

    // Set the user attribute so we can show and hide notifications based on the
    // currently viewed conversation.
    notification.setAttribute("user", name);
    // Set custom attributes for CSS styling.
    notification.setAttribute("protocol", "otr");
    notification.setAttribute("status", AUTH_STATUS_UNVERIFIED);
    // Prevent users from dismissing this notification.
    notification.removeAttribute("dismissable");

    if (!this.visibleConv) {
      return;
    }

    if (name !== this.visibleConv.normalizedName) {
      this.hideUserNotifications(context);
    }
  },

  closeVerification(context) {
    const uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    const prevNotification = OTRUI.globalBox.getNotificationWithValue(
      context.username
    );
    if (prevNotification) {
      prevNotification.close();
    }
  },

  notifyVerification(context, key, cancelable, verifiable) {
    const uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    OTRUI.closeVerification(context);

    let buttons = [];
    if (cancelable) {
      buttons = [
        {
          label: _str("auth-cancel"),
          accessKey: _str("auth-cancel-access-key"),
          callback() {
            const context = OTR.getContext(uiConv.target);
            OTR.abortSMP(context);
          },
        },
      ];
    }

    if (verifiable) {
      const window = this.globalDoc.defaultView;

      buttons = [
        {
          label: _str("finger-verify"),
          accessKey: _str("finger-verify-access-key"),
          callback() {
            const name = uiConv.target.normalizedName;
            OTRUI.openAuth(window, name, "start", uiConv);
            // prevent closing of notification bar when the button is hit
            return true;
          },
        },
        {
          label: _str("finger-ignore"),
          accessKey: _str("finger-ignore-access-key"),
          callback() {
            const context = OTR.getContext(uiConv.target);
            OTR.abortSMP(context);
          },
        },
      ];
    }

    // Change priority type based on the passed key.
    let priority = this.globalBox.PRIORITY_WARNING_HIGH;
    let dismissable = true;
    switch (key) {
      case "otr:auth-error":
      case "otr:auth-fail":
        priority = this.globalBox.PRIORITY_CRITICAL_HIGH;
        break;
      case "otr:auth-waiting":
        priority = this.globalBox.PRIORITY_INFO_MEDIUM;
        dismissable = false;
        break;

      default:
        break;
    }

    OTRUI.closeUnverified(context);
    const notification = this.globalBox.appendNotification(
      context.username,
      {
        label: authLabelMap.get(key),
        priority,
      },
      buttons
    );

    // Set the user attribute so we can show and hide notifications based on the
    // currently viewed conversation.
    notification.setAttribute("user", context.username);
    // Set custom attributes for CSS styling.
    notification.setAttribute("protocol", "otr");
    notification.setAttribute("status", key);

    // The notification API don't currently support a "success" PRIORITY flag,
    // so we need to manually set it if we need to.
    if (["otr:auth-success", "otr:auth-success-them"].includes(key)) {
      notification.setAttribute("type", "success");
    }

    if (!dismissable) {
      // Prevent users from dismissing this notification if something is in
      // progress or an action is required.
      notification.removeAttribute("dismissable");
    }
  },

  updateAuth(aObj) {
    // let uiConv = OTR.getUIConvFromContext(aObj.context);
    if (!aObj.progress) {
      OTRUI.closeAuth(aObj.context);
      OTRUI.notifyVerification(aObj.context, "otr:auth-error", false, false);
    } else if (aObj.progress === 100) {
      let key;
      let verifiable = false;
      if (aObj.success) {
        if (aObj.context.trust) {
          key = "otr:auth-success";
          OTR.notifyTrust(aObj.context);
        } else {
          key = "otr:auth-success-them";
          verifiable = true;
        }
      } else {
        key = "otr:auth-fail";
        if (!aObj.context.trust) {
          OTR.notifyTrust(aObj.context);
        }
      }
      OTRUI.notifyVerification(aObj.context, key, false, verifiable);
    } else {
      // TODO: show the aObj.progress to the user with a
      //   <progressmeter mode="determined" value="10" />
      OTRUI.notifyVerification(aObj.context, "otr:auth-waiting", true, false);
    }
    OTRUI.closeAskAuthNotification(aObj);
  },

  onAccountCreated(acc) {
    const account = acc.normalizedName;
    const protocol = acc.protocol.normalizedName;
    Promise.resolve();
    if (OTR.privateKeyFingerprint(account, protocol) === null) {
      OTR.generatePrivateKey(account, protocol).catch(
        OTRUI.reportKeyGenFailure
      );
    }
  },

  contactWrapper(contact) {
    // If the conversation already started.
    if (contact.buddy) {
      return {
        account: contact.buddy.normalizedName,
        protocol: contact.buddy.buddy.protocol.normalizedName,
        screenname: contact.buddy.userName,
      };
    }

    // For online and offline contacts without an open conversation.
    return {
      account:
        contact.preferredBuddy.preferredAccountBuddy.account.normalizedName,
      protocol: contact.preferredBuddy.protocol.normalizedName,
      screenname: contact.preferredBuddy.preferredAccountBuddy.userName,
    };
  },

  onContactAdded(contact) {
    const args = OTRUI.contactWrapper(contact);
    if (
      OTR.getFingerprintsForRecipient(
        args.account,
        args.protocol,
        args.screenname
      ).length > 0
    ) {
      return;
    }
    args.wrappedJSObject = args;
    const features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
    Services.ww.openWindow(null, OTR_ADD_FINGER_DIALOG_URL, "", features, args);
  },

  observe(aObject, aTopic, aMsg) {
    let doc;
    // console.log("====> observing topic: " + aTopic + " with msg: " + aMsg);
    // console.log(aObject);

    switch (aTopic) {
      case "nsPref:changed":
        break;
      case "conversation-loaded":
        doc = aObject.ownerDocument;
        const windowtype = doc.documentElement.getAttribute("windowtype");
        if (windowtype !== "mail:3pane") {
          return;
        }
        OTRUI.addButton(aObject);
        break;
      case "conversation-closed":
        if (aObject.isChat) {
          return;
        }
        this.globalBox.removeAllNotifications();
        OTRUI.closeAuth(OTR.getContext(aObject));
        OTRUI.disconnect(aObject);
        break;
      // case "contact-signed-off":
      //  break;
      case "prpl-quit":
        OTRUI.disconnect(null);
        break;
      case "domwindowopened":
        OTRUI.addMenus(aObject);
        break;
      case "otr:generate": {
        const result = OTR.generatePrivateKeySync(
          aObject.account,
          aObject.protocol
        );
        if (result != null) {
          OTRUI.reportKeyGenFailure(result);
        }
        break;
      }
      case "otr:disconnected":
      case "otr:msg-state":
        if (
          aTopic === "otr:disconnected" ||
          OTR.trust(aObject) !== OTR.trustState.TRUST_UNVERIFIED
        ) {
          OTRUI.closeAuth(aObject);
          OTRUI.closeUnverified(aObject);
          OTRUI.closeVerification(aObject);
        }
        OTRUI.setMsgState(null, aObject, this.globalDoc, false);
        break;
      case "otr:unverified":
        if (!this.globalDoc) {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          if (!win) {
            return;
          }
          win.focus();
          win.showChatTab();
          this.globalDoc = win.document;
        }
        OTRUI.notifyUnverified(aObject, aMsg);
        break;
      case "otr:trust-state":
        OTRUI.alertTrust(aObject);
        break;
      case "otr:log":
        OTRUI.logMsg("otr: " + aObject);
        break;
      case "account-added":
        OTRUI.onAccountCreated(aObject);
        break;
      case "contact-added":
        OTRUI.onContactAdded(aObject);
        break;
      case "otr:auth-ask":
        OTRUI.askAuth(aObject);
        break;
      case "otr:auth-update":
        OTRUI.updateAuth(aObject);
        break;
      case "otr:cancel-ask-auth":
        OTRUI.closeAskAuthNotification(aObject);
        break;
    }
  },

  initConv(binding) {
    OTR.addConversation(binding._conv);
    OTRUI.addButton(binding);
  },

  /**
   * Restore the conversation to a state before OTR knew about it.
   *
   * @param {Element} binding - conversation-browser instance.
   */
  resetConv(binding) {
    OTR.removeConversation(binding._conv);
  },

  destroy() {
    if (!OTR.libLoaded) {
      return;
    }
    OTRUI.disconnect(null);
    Services.obs.removeObserver(OTR, "new-ui-conversation");
    Services.obs.removeObserver(OTR, "conversation-update-type");
    // Services.obs.removeObserver(OTRUI, "contact-added");
    // Services.obs.removeObserver(OTRUI, "contact-signed-off");
    Services.obs.removeObserver(OTRUI, "account-added");
    Services.obs.removeObserver(OTRUI, "conversation-loaded");
    Services.obs.removeObserver(OTRUI, "conversation-closed");
    Services.obs.removeObserver(OTRUI, "prpl-quit");

    for (const conv of IMServices.conversations.getConversations()) {
      OTRUI.resetConv(conv);
    }
    OTR.removeObserver(OTRUI);
    OTR.close();
    OTRUI.removeMenuObserver();
  },
};

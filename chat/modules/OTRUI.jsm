/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["OTRUI"];

const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
const { OTR } = ChromeUtils.import("resource:///modules/OTR.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(
  this,
  "l10n",
  () => new Localization(["messenger/otr/otrUI.ftl"], true)
);

function _str(id) {
  return l10n.formatValueSync(id);
}

function _strArgs(id, args) {
  return l10n.formatValueSync(id, args);
}

const OTR_AUTH_DIALOG_URL = "chrome://chat/content/otr-auth.xhtml";
const OTR_ADD_FINGER_DIALOG_URL =
  "chrome://chat/content/otr-add-fingerprint.xhtml";

const AUTH_STATUS_UNVERIFIED = "otr-auth-unverified";
var authLabelMap;
var authTitleMap;
var trustMap;

function initStrings() {
  authLabelMap = new Map([
    ["otr:auth-error", _str("auth-error")],
    ["otr:auth-success", _str("auth-success")],
    ["otr:auth-success-them", _str("auth-success-them")],
    ["otr:auth-fail", _str("auth-fail")],
    ["otr:auth-waiting", _str("auth-waiting")],
  ]);

  authTitleMap = new Map([
    ["otr:auth-error", _str("error-title")],
    ["otr:auth-success", _str("success-title")],
    ["otr:auth-success-them", _str("success-them-title")],
    ["otr:auth-fail", _str("fail-title")],
    ["otr:auth-waiting", _str("waiting-title")],
  ]);

  let sl = _str("start-label");
  let al = _str("auth-label");
  let rfl = _str("refresh-label");
  let ral = _str("reauth-label");

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

var OTRUI = {
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
    for (let win of Services.ww.getWindowEnumerator()) {
      OTRUI.addMenus(win);
    }
    Services.obs.addObserver(OTRUI, "domwindowopened");
  },

  removeMenuObserver() {
    for (let win of Services.ww.getWindowEnumerator()) {
      OTRUI.removeMenus(win);
    }
    Services.obs.removeObserver(OTRUI, "domwindowopened");
  },

  addMenus(win) {
    let doc = win.document;
    // Account for unready windows
    if (doc.readyState !== "complete") {
      let listen = function() {
        win.removeEventListener("load", listen);
        OTRUI.addMenus(win);
      };
      win.addEventListener("load", listen);
    }
  },

  removeMenus(win) {
    let doc = win.document;
    OTRUI.removeBuddyContextMenu(doc);
  },

  addBuddyContextMenu(buddyContextMenu, doc, contact) {
    if (!buddyContextMenu || !OTR.libLoaded) {
      return; // Not the buddy list context menu
    }

    let sep = doc.createXULElement("menuseparator");
    sep.setAttribute("id", "otrsep");
    let menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", _str("buddycontextmenu-label"));
    menuitem.setAttribute("id", "otrcont");
    menuitem.addEventListener("command", () => {
      let args = OTRUI.contactWrapper(contact);
      args.wrappedJSObject = args;
      let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
      Services.ww.openWindow(
        null,
        OTR_ADD_FINGER_DIALOG_URL,
        "",
        features,
        args
      );
    });

    buddyContextMenu.addEventListener("popupshowing", e => {
      let target = e.target.triggerNode;
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
    let s = doc.getElementById("otrsep");
    if (s) {
      s.remove();
    }
    let p = doc.getElementById("otrcont");
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

    let acc = OTRUI.accountsToGenKey.pop();
    let fp = OTR.privateKeyFingerprint(acc.name, acc.prot);
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
    for (let acc of Services.accounts.getAccounts()) {
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
      .then(function() {
        Services.obs.addObserver(OTR, "new-ui-conversation");
        Services.obs.addObserver(OTR, "conversation-update-type");
        // Disabled until #76 is resolved.
        // Services.obs.addObserver(OTRUI, "contact-added", false);
        Services.obs.addObserver(OTRUI, "account-added");
        // Services.obs.addObserver(OTRUI, "contact-signed-off", false);
        Services.obs.addObserver(OTRUI, "conversation-loaded");
        Services.obs.addObserver(OTRUI, "conversation-closed");
        Services.obs.addObserver(OTRUI, "prpl-quit");

        for (let conv of Services.conversations.getConversations()) {
          OTRUI.initConv(conv);
        }
        OTRUI.addMenuObserver();

        ChromeUtils.idleDispatch(OTRUI.genMissingKeys);
      })
      .catch(function(err) {
        // console.log("===> " + err + "\n");
        throw err;
      });
  },

  disconnect(aConv) {
    if (aConv) {
      return OTR.disconnect(aConv, true);
    }
    let allGood = true;
    for (let conv of Services.conversations.getConversations()) {
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
    let otrAuth = this.globalDoc.querySelector(".otr-auth");
    otrAuth.disabled = true;
    let win = window.openDialog(
      OTR_AUTH_DIALOG_URL,
      "auth=" + name,
      "centerscreen,resizable=no,minimizable=no",
      mode,
      uiConv,
      contactInfo
    );
    windowRefs.set(name, win);
    window.addEventListener("beforeunload", function() {
      otrAuth.disabled = false;
      windowRefs.delete(name);
    });
  },

  closeAuth(context) {
    let win = windowRefs.get(context.username);
    if (win) {
      win.close();
    }
  },

  noOtrPossible(otrContainer, context) {
    otrContainer.hidden = true;

    if (context) {
      OTRUI.hideUserNotifications(context);
    } else {
      OTRUI.hideAllNotifications();
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

  addButton(aObject) {
    this.globalDoc = aObject.ownerDocument;
    let _conv = aObject._conv;
    OTRUI.visibleConv = _conv;
    OTRUI.setMsgState(_conv, null, this.globalDoc, true);
  },

  hideOTRButton() {
    if (!OTR.libLoaded) {
      return;
    }
    if (!this.globalDoc) {
      return;
    }
    OTRUI.visibleConv = null;
    let otrContainer = this.globalDoc.querySelector(".otr-container");
    OTRUI.noOtrPossible(otrContainer);
  },

  updateOTRButton(_conv) {
    if (!OTR.libLoaded) {
      return;
    }
    if (!this.globalDoc) {
      return;
    }
    OTRUI.visibleConv = _conv;
    let convBinding;
    for (let element of this.globalDoc.getElementById("conversationsBox")
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

  // set msg state on toolbar button
  setMsgState(_conv, context, doc, addSystemMessage) {
    if (!this.visibleConv) {
      return;
    }
    if (_conv != null && !(_conv === this.visibleConv)) {
      return;
    }

    let otrContainer = doc.querySelector(".otr-container");
    let otrButton = doc.querySelector(".otr-button");
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
      let uiConv = OTR.getUIConvFromContext(context);
      if (uiConv != null && !(uiConv === this.visibleConv)) {
        return;
      }

      if (uiConv.isChat) {
        OTRUI.noOtrPossible(otrContainer, context);
        return;
      }
      if (addSystemMessage) {
        let trust = OTRUI.getTrustSettings(context);
        let id = "state-" + trust.class;
        let msg;
        if (OTR.trust(context) == OTR.trustState.TRUST_NOT_PRIVATE) {
          msg = l10n.formatValueSync(id);
        } else {
          msg = l10n.formatValueSync(id, { name: context.username });
        }
        uiConv.systemMessage(msg, false, true);
      }
    } catch (e) {
      OTRUI.noOtrPossible(otrContainer, context);
      return;
    }

    otrContainer.hidden = false;
    let otrStart = doc.querySelector(".otr-start");
    let otrEnd = doc.querySelector(".otr-end");
    let otrAuth = doc.querySelector(".otr-auth");
    let trust = OTRUI.getTrustSettings(context);
    otrButton.setAttribute(
      "tooltiptext",
      _strArgs("state-" + trust.class, { name: context.username })
    );
    otrButton.setAttribute("label", _str("state-" + trust.class + "-label"));
    otrButton.className = "otr-button otr-" + trust.class;
    otrStart.setAttribute("label", trust.startLabel);
    otrStart.setAttribute("disabled", trust.disableStart);
    otrEnd.setAttribute("disabled", trust.disableEnd);
    otrAuth.setAttribute("label", trust.authLabel);
    otrAuth.setAttribute("disabled", trust.disableAuth);
    OTRUI.hideAllNotifications();
    OTRUI.showUserNotifications(context);
  },

  alertTrust(context) {
    let uiConv = OTR.getUIConvFromContext(context);
    let trust = OTRUI.getTrustSettings(context);
    uiConv.systemMessage(
      _strArgs("afterauth-" + trust.class, { name: context.username }),
      false,
      true
    );
  },

  getTrustSettings(context) {
    let result = trustMap.get(OTR.trust(context));
    return result;
  },

  askAuth(aObject) {
    let uiConv = OTR.getUIConvFromContext(aObject.context);
    if (!uiConv) {
      return;
    }

    let name = uiConv.target.normalizedName;
    let msg = _strArgs("verify-request", { name });
    // Trigger the update of the unread message counter.
    uiConv.notifyVerifyOTR(msg);
    Services.obs.notifyObservers(uiConv, "new-otr-verification-request");

    // Trigger the inline notification.
    let window = this.globalDoc.defaultView;
    let buttons = [
      {
        label: _str("finger-verify"),
        accessKey: _str("finger-verify-access-key"),
        callback() {
          OTRUI.openAuth(window, name, "ask", uiConv, aObject);
          // prevent closing of notification bar when the button is hit
          return true;
        },
      },
    ];

    let mainWindow = Services.wm.getMostRecentWindow("mail:3pane");
    this.notificationbox = mainWindow.chatHandler.msgNotificationBar;

    let priority = this.globalBox.PRIORITY_WARNING_MEDIUM;
    this.notificationbox.appendNotification(
      msg,
      name,
      null,
      priority,
      buttons,
      null
    );
  },

  closeAskAuthNotification(aObject) {
    if (!this.notificationbox) {
      return;
    }

    let name = aObject.context.username;
    let notification = this.notificationbox.getNotificationWithValue(name);
    if (!notification) {
      return;
    }

    this.notificationbox.removeNotification(notification);
  },

  closeUnverified(context) {
    let uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    let notifications = this.globalBox.allNotifications;
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (
        context.username == notifications[i].getAttribute("user") &&
        notifications[i].getAttribute("value") == AUTH_STATUS_UNVERIFIED
      ) {
        notifications[i].close();
      }
    }
  },

  hideUserNotifications(context) {
    let notifications = this.globalBox.allNotifications;
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (context.username == notifications[i].getAttribute("user")) {
        notifications[i].setAttribute("hidden", "true");
      }
    }
  },

  hideAllNotifications() {
    let notifications = this.globalBox.allNotifications;
    for (let i = notifications.length - 1; i >= 0; i--) {
      notifications[i].setAttribute("hidden", "true");
    }
  },

  showUserNotifications(context) {
    let notifications = this.globalBox.allNotifications;
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (context.username == notifications[i].getAttribute("user")) {
        notifications[i].removeAttribute("hidden");
      }
    }
  },

  notifyUnverified(context, seen) {
    let uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    let window = this.globalDoc.defaultView;

    let msg = _strArgs("finger-" + seen, { name: context.username });
    let buttons = [
      {
        label: _str("finger-verify"),
        accessKey: _str("finger-verify-access-key"),
        callback() {
          let name = uiConv.target.normalizedName;
          OTRUI.openAuth(window, name, "start", uiConv);
          // prevent closing of notification bar when the button is hit
          return true;
        },
      },
    ];

    let priority = this.globalBox.PRIORITY_WARNING_MEDIUM;
    this.globalBox.appendNotification(
      msg,
      context.username,
      null,
      priority,
      buttons,
      null
    );

    let verifyTitle = l10n.formatValueSync("verify-title");
    this.updateNotificationUI(
      context,
      verifyTitle,
      context.username,
      AUTH_STATUS_UNVERIFIED
    );

    if (!this.visibleConv) {
      return;
    }

    if (context.username !== this.visibleConv.normalizedName) {
      this.hideUserNotifications(context);
    }
  },

  updateNotificationUI(context, typeTitle, username, key) {
    let notification = this.globalBox.getNotificationWithValue(username);
    notification.setAttribute("user", context.username);
    notification.setAttribute("status", key);
    notification.setAttribute("orient", "vertical");
    notification.messageDetails.setAttribute("orient", "vertical");
    notification.messageDetails.removeAttribute("oncommand");
    notification.messageDetails.removeAttribute("align");

    let title = this.globalDoc.createXULElement("title");
    title.setAttribute("flex", "1");
    title.setAttribute("crop", "end");
    title.textContent = typeTitle;

    let close = notification.querySelector("toolbarbutton");
    close.setAttribute("oncommand", "this.parentNode.parentNode.dismiss();");

    let top = this.globalDoc.createXULElement("hbox");
    top.setAttribute("flex", "1");
    top.setAttribute("align", "center");
    top.classList.add("otr-notification-header");
    top.appendChild(notification.messageImage);
    top.appendChild(title);
    top.appendChild(close);
    notification.insertBefore(top, notification.messageDetails);

    let bottom = this.globalDoc.createXULElement("hbox");
    bottom.setAttribute("flex", "1");
    bottom.setAttribute(
      "oncommand",
      "this.parentNode._doButtonCommand(event);"
    );
    bottom.classList.add("otr-notification-footer");

    notification.querySelectorAll("button").forEach(e => {
      bottom.appendChild(e);
    });

    notification.appendChild(bottom);
  },

  closeVerification(context) {
    let uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    let prevNotification = OTRUI.globalBox.getNotificationWithValue(
      context.username
    );
    if (prevNotification) {
      prevNotification.close();
    }
  },

  notifyVerification(context, key, cancelable, verifiable) {
    let uiConv = OTR.getUIConvFromContext(context);
    if (!uiConv) {
      return;
    }

    // TODO: maybe update the .label property on the notification instead
    // of closing it ... although, buttons need to be updated too.
    OTRUI.closeVerification(context);

    let msg = authLabelMap.get(key);
    let typeTitle = authTitleMap.get(key);
    let buttons = [];
    if (cancelable) {
      buttons = [
        {
          label: _str("auth-cancel"),
          accessKey: _str("auth-cancel-access-key"),
          callback() {
            let context = OTR.getContext(uiConv.target);
            OTR.abortSMP(context);
          },
        },
      ];
    }

    if (verifiable) {
      let window = this.globalDoc.defaultView;

      buttons = [
        {
          label: _str("finger-verify"),
          accessKey: _str("finger-verify-access-key"),
          callback() {
            let name = uiConv.target.normalizedName;
            OTRUI.openAuth(window, name, "start", uiConv);
            // prevent closing of notification bar when the button is hit
            return true;
          },
        },
      ];
    }

    // higher priority to overlay the current notifyUnverified
    let priority = this.globalBox.PRIORITY_WARNING_HIGH;
    OTRUI.closeUnverified(context);
    this.globalBox.appendNotification(
      msg,
      context.username,
      null,
      priority,
      buttons,
      null
    );

    this.updateNotificationUI(context, typeTitle, context.username, key);
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
    let account = acc.normalizedName;
    let protocol = acc.protocol.normalizedName;
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
    let args = OTRUI.contactWrapper(contact);
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
    let features = "chrome,modal,centerscreen,resizable=no,minimizable=no";
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
        let windowtype = doc.documentElement.getAttribute("windowtype");
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
        let result = OTR.generatePrivateKeySync(
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
          let win = Services.wm.getMostRecentWindow("mail:3pane");
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

  resetConv(binding) {
    OTR.removeConversation(binding._conv);
    let otrButton = this.globalDoc.querySelector(".otr-button");
    if (!otrButton) {
      return;
    }
    otrButton.remove();
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

    for (let conv of Services.conversations.getConversations()) {
      OTRUI.resetConv(conv);
    }
    OTR.removeObserver(OTRUI);
    OTR.close();
    OTRUI.removeMenuObserver();
  },
};

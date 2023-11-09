/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// chat/content/imAccountOptionsHelper.js
/* globals accountOptionsHelper */

const { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);
ChromeUtils.defineESModuleGetters(this, {
  ChatEncryption: "resource:///modules/ChatEncryption.sys.mjs",
  OTR: "resource:///modules/OTR.sys.mjs",
  OTRUI: "resource:///modules/OTRUI.sys.mjs",
});

window.addEventListener("load", event => {
  parent.onPanelLoaded("am-im.xhtml");
});
window.addEventListener("beforeunload", event => {
  onBeforeUnload();
});

function onPreInit(aAccount, aAccountValue) {
  account.init(aAccount.incomingServer.wrappedJSObject.imAccount);
}

function onBeforeUnload() {
  if (account.encryptionObserver) {
    Services.obs.removeObserver(
      account.encryptionObserver,
      "account-sessions-changed"
    );
    Services.obs.removeObserver(
      account.encryptionObserver,
      "account-encryption-status-changed"
    );
  }
}

var account = {
  async init(aAccount) {
    const title = document.querySelector(".dialogheader .dialogheader-title");
    const defaultTitle = title.getAttribute("defaultTitle");
    let titleValue;

    if (aAccount.name) {
      titleValue = defaultTitle + " - <" + aAccount.name + ">";
    } else {
      titleValue = defaultTitle;
    }

    title.setAttribute("value", titleValue);
    document.title = titleValue;

    this.account = aAccount;
    this.proto = this.account.protocol;
    document.getElementById("accountName").value = this.account.name;
    document.getElementById("protocolName").value =
      this.proto.name || this.proto.id;
    document.getElementById("protocolIcon").src = ChatIcons.getProtocolIconURI(
      this.proto,
      48
    );

    const password = document.getElementById("server.password");
    const passwordBox = document.getElementById("passwordBox");
    if (this.proto.noPassword) {
      passwordBox.hidden = true;
      password.removeAttribute("wsm_persist");
    } else {
      passwordBox.hidden = false;
      try {
        // Should we force layout here to ensure password.value works?
        // Will throw if we don't have a protocol plugin for the account.
        password.value = this.account.password;
        password.setAttribute("wsm_persist", "true");
      } catch (e) {
        passwordBox.hidden = true;
        password.removeAttribute("wsm_persist");
      }
    }

    document.getElementById("server.alias").value = this.account.alias;

    if (ChatEncryption.canConfigureEncryption(this.account.protocol)) {
      document.getElementById("imTabEncryption").hidden = false;
      document.querySelector(".otr-settings").hidden = !OTRUI.enabled;
      document.getElementById("server.otrAllowMsgLog").value =
        this.account.otrAllowMsgLog;
      if (OTRUI.enabled) {
        document.getElementById("server.otrVerifyNudge").value =
          this.account.otrVerifyNudge;
        document.getElementById("server.otrRequireEncryption").value =
          this.account.otrRequireEncryption;

        const fpa = this.account.normalizedName;
        const fpp = this.account.protocol.normalizedName;
        let fp = OTR.privateKeyFingerprint(fpa, fpp);
        if (!fp) {
          fp = await document.l10n.formatValue("otr-not-yet-available");
        }
        document.getElementById("otrFingerprint").value = fp;
      }
      document.querySelector(".chat-encryption-settings").hidden =
        !this.account.protocol.canEncrypt;
      if (this.account.protocol.canEncrypt) {
        document.l10n.setAttributes(
          document.getElementById("chat-encryption-description"),
          "chat-encryption-description",
          {
            protocol: this.proto.name,
          }
        );
        this.buildEncryptionStatus();
        this.buildAccountSessionsList();
        this.encryptionObserver = {
          observe: (subject, topic) => {
            if (
              topic === "account-sessions-changed" &&
              subject.id === this.account.id
            ) {
              this.buildAccountSessionsList();
            } else if (
              topic === "account-encryption-status-changed" &&
              subject.id === this.account.id
            ) {
              this.buildEncryptionStatus();
            }
          },
          QueryInterface: ChromeUtils.generateQI([
            "nsIObserver",
            "nsISupportsWeakReference",
          ]),
        };
        Services.obs.addObserver(
          this.encryptionObserver,
          "account-sessions-changed",
          true
        );
        Services.obs.addObserver(
          this.encryptionObserver,
          "account-encryption-status-changed",
          true
        );
      }
    }

    const protoId = this.proto.id;
    const canAutoJoin =
      protoId == "prpl-irc" ||
      protoId == "prpl-jabber" ||
      protoId == "prpl-gtalk";
    document.getElementById("autojoinBox").hidden = !canAutoJoin;
    const autojoin = document.getElementById("server.autojoin");
    if (canAutoJoin) {
      autojoin.setAttribute("wsm_persist", "true");
    } else {
      autojoin.removeAttribute("wsm_persist");
    }

    this.prefs = Services.prefs.getBranch(
      "messenger.account." + this.account.id + ".options."
    );
    this.populateProtoSpecificBox();
  },

  encryptionObserver: null,
  buildEncryptionStatus() {
    const encryptionStatus = document.querySelector(".chat-encryption-status");
    if (this.account.encryptionStatus.length) {
      encryptionStatus.replaceChildren(
        ...this.account.encryptionStatus.map(status => {
          const item = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "li"
          );
          item.textContent = status;
          return item;
        })
      );
    } else {
      const placeholder = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "li"
      );
      document.l10n.setAttributes(placeholder, "chat-encryption-placeholder");
      encryptionStatus.replaceChildren(placeholder);
    }
  },
  buildAccountSessionsList() {
    const sessions = this.account.getSessions();
    document.querySelector(".chat-encryption-sessions-container").hidden =
      sessions.length === 0;
    const sessionList = document.querySelector(".chat-encryption-sessions");
    sessionList.replaceChildren(
      ...sessions.map(session => {
        const button = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "button"
        );
        document.l10n.setAttributes(
          button,
          "chat-encryption-session-" + (session.trusted ? "trusted" : "verify")
        );
        button.disabled = session.trusted;
        if (!button.disabled) {
          button.addEventListener("click", async () => {
            try {
              const sessionInfo = await session.verify();
              parent.gSubDialog.open(
                "chrome://messenger/content/chat/verify.xhtml",
                { features: "resizable=no" },
                sessionInfo
              );
            } catch (error) {
              // Verification was probably aborted by the other side.
              this.account.prplAccount.wrappedJSObject.WARN(error);
            }
          });
        }
        const sessionLabel = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "span"
        );
        sessionLabel.textContent = session.id;
        const row = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "li"
        );
        row.append(sessionLabel, button);
        row.classList.toggle("chat-current-session", session.currentSession);
        return row;
      })
    );
  },

  populateProtoSpecificBox() {
    const attributes = {};
    attributes[Ci.prplIPref.typeBool] = [
      { name: "wsm_persist", value: "true" },
      { name: "preftype", value: "bool" },
      { name: "genericattr", value: "true" },
    ];
    attributes[Ci.prplIPref.typeInt] = [
      { name: "wsm_persist", value: "true" },
      { name: "preftype", value: "int" },
      { name: "genericattr", value: "true" },
    ];
    attributes[Ci.prplIPref.typeString] = attributes[Ci.prplIPref.typeList] = [
      { name: "wsm_persist", value: "true" },
      { name: "preftype", value: "wstring" },
      { name: "genericattr", value: "true" },
    ];
    const haveOptions = accountOptionsHelper.addOptions(
      "server.",
      this.proto.getOptions(),
      attributes
    );
    const advanced = document.getElementById("advanced");
    if (advanced.hidden && haveOptions) {
      advanced.hidden = false;
      // Force textbox XBL binding attachment by forcing layout,
      // otherwise setFormElementValue from AccountManager.js sets
      // properties that don't exist when restoring values.
      document.getElementById("protoSpecific").getBoundingClientRect();
    } else if (!haveOptions) {
      advanced.hidden = true;
    }
    const inputElements = document.querySelectorAll(
      "#protoSpecific :is(checkbox, input, menulist)"
    );
    // Because the elements are added after the document loaded we have to
    // notify the parent document that there are prefs to save.
    for (const input of inputElements) {
      if (input.localName == "input" || input.localName == "textarea") {
        input.addEventListener("change", event => {
          document.dispatchEvent(new CustomEvent("prefchange"));
        });
      } else {
        input.addEventListener("command", event => {
          document.dispatchEvent(new CustomEvent("prefchange"));
        });
      }
    }
  },

  viewFingerprintKeys() {
    const otrAccount = { account: this.account };
    parent.gSubDialog.open(
      "chrome://chat/content/otr-finger.xhtml",
      undefined,
      otrAccount
    );
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// chat/content/imAccountOptionsHelper.js
/* globals accountOptionsHelper */

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "OTRUI", "resource:///modules/OTRUI.jsm");
ChromeUtils.defineModuleGetter(this, "OTR", "resource:///modules/OTR.jsm");

var autoJoinPref = "autoJoin";

function onPreInit(aAccount, aAccountValue) {
  account.init(aAccount.incomingServer.wrappedJSObject.imAccount);
}

var account = {
  async init(aAccount) {
    let title = document.querySelector(".dialogheader .dialogheader-title");
    let defaultTitle = title.getAttribute("defaultTitle");
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
    document.getElementById("protocolIcon").src =
      this.proto.iconBaseURI + "icon48.png";

    let password = document.getElementById("server.password");
    let passwordBox = document.getElementById("passwordBox");
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

    if (OTRUI.enabled) {
      document.getElementById("imTabOTR").hidden = false;
      document.getElementById(
        "server.otrAllowMsgLog"
      ).value = this.account.otrAllowMsgLog;
      document.getElementById(
        "server.otrVerifyNudge"
      ).value = this.account.otrVerifyNudge;
      document.getElementById(
        "server.otrRequireEncryption"
      ).value = this.account.otrRequireEncryption;

      let fpa = this.account.normalizedName;
      let fpp = this.account.protocol.normalizedName;
      let fp = OTR.privateKeyFingerprint(fpa, fpp);
      if (!fp) {
        fp = await document.l10n.formatValue("otr-notYetAvailable");
      }
      document.getElementById("otrFingerprint").value = fp;
    }

    let protoId = this.proto.id;
    let canAutoJoin =
      protoId == "prpl-irc" ||
      protoId == "prpl-jabber" ||
      protoId == "prpl-gtalk";
    document.getElementById("autojoinBox").hidden = !canAutoJoin;
    let autojoin = document.getElementById("server.autojoin");
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

  *getProtoOptions() {
    for (let option of this.proto.getOptions()) {
      yield option;
    }
  },

  populateProtoSpecificBox() {
    let attributes = {};
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
    let haveOptions = accountOptionsHelper.addOptions(
      "server.",
      this.getProtoOptions(),
      attributes
    );
    let advanced = document.getElementById("advanced");
    if (advanced.hidden && haveOptions) {
      advanced.hidden = false;
      // Force textbox XBL binding attachment by forcing layout,
      // otherwise setFormElementValue from AccountManager.js sets
      // properties that don't exist when restoring values.
      document.getElementById("protoSpecific").getBoundingClientRect();
    } else if (!haveOptions) {
      advanced.hidden = true;
    }
  },

  viewFingerprintKeys() {
    let otrAccount = { account: this.account };
    parent.gSubDialog.open(
      "chrome://chat/content/otr-finger.xhtml",
      undefined,
      otrAccount
    );
  },
};

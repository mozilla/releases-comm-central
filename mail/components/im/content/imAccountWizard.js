/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// chat/content/imAccountOptionsHelper.js
/* globals accountOptionsHelper */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

var PREF_EXTENSIONS_GETMOREPROTOCOLSURL = "extensions.getMoreProtocolsURL";

var accountWizard = {
  onload() {
    document
      .querySelector("wizard")
      .addEventListener("wizardfinish", this.createAccount.bind(this));
    const accountProtocolPage = document.getElementById("accountprotocol");
    accountProtocolPage.addEventListener(
      "pageadvanced",
      this.selectProtocol.bind(this)
    );
    const accountUsernamePage = document.getElementById("accountusername");
    accountUsernamePage.addEventListener(
      "pageshow",
      this.showUsernamePage.bind(this)
    );
    accountUsernamePage.addEventListener(
      "pagehide",
      this.hideUsernamePage.bind(this)
    );
    const accountAdvancedPage = document.getElementById("accountadvanced");
    accountAdvancedPage.addEventListener(
      "pageshow",
      this.showAdvanced.bind(this)
    );
    const accountSummaryPage = document.getElementById("accountsummary");
    accountSummaryPage.addEventListener(
      "pageshow",
      this.showSummary.bind(this)
    );

    // Ensure the im core is initialized before we get a list of protocols.
    IMServices.core.init();

    accountWizard.setGetMoreProtocols();

    var protoList = document.getElementById("protolist");
    var protos = IMServices.core.getProtocols();
    protos.sort((a, b) => {
      if (a.name < b.name) {
        return -1;
      }
      return a.name > b.name ? 1 : 0;
    });
    protos.forEach(function (proto) {
      const image = document.createElement("img");
      image.setAttribute("src", ChatIcons.getProtocolIconURI(proto));
      image.setAttribute("alt", "");
      image.classList.add("protoIcon");

      const label = document.createXULElement("label");
      label.setAttribute("value", proto.name);

      const item = document.createXULElement("richlistitem");
      item.setAttribute("value", proto.id);
      item.appendChild(image);
      item.appendChild(label);
      protoList.appendChild(item);
    });

    // there is a strange selection bug without this timeout
    setTimeout(function () {
      protoList.selectedIndex = 0;
    }, 0);

    Services.obs.addObserver(this, "prpl-quit");
    window.addEventListener("unload", this.unload);
  },
  unload() {
    Services.obs.removeObserver(accountWizard, "prpl-quit");
  },
  observe(aObject, aTopic) {
    if (aTopic == "prpl-quit") {
      // libpurple is being uninitialized. We can't create any new
      // account so keeping this wizard open would be pointless, close it.
      window.close();
    }
  },

  /**
   * Builds the full username from the username boxes.
   *
   * @returns {string} assembled username
   */
  getUsername() {
    let usernameBoxIndex = 0;
    if (this.proto.usernamePrefix) {
      usernameBoxIndex = 1;
    }
    // If the first username input is empty, make sure we return an empty
    // string so that it blocks the 'next' button of the wizard.
    if (!this.userNameBoxes[usernameBoxIndex].value) {
      return "";
    }

    return this.userNameBoxes.reduce((prev, elt) => prev + elt.value, "");
  },

  /**
   * Check that the username fields generate a new username, and if it is valid
   * allow advancing the wizard.
   */
  checkUsername() {
    var wizard = document.querySelector("wizard");
    var name = accountWizard.getUsername();
    var duplicateWarning = document.getElementById("duplicateAccount");
    if (!name) {
      wizard.canAdvance = false;
      duplicateWarning.hidden = true;
      return;
    }

    var exists = accountWizard.proto.accountExists(name);
    wizard.canAdvance = !exists;
    duplicateWarning.hidden = !exists;
  },

  /**
   * Takes the value of the primary username field and splits it if the value
   * matches the split field syntax.
   */
  splitUsername() {
    let usernameBoxIndex = 0;
    if (this.proto.usernamePrefix) {
      usernameBoxIndex = 1;
    }
    const username = this.userNameBoxes[usernameBoxIndex].value;
    const splitValues = this.proto.splitUsername(username);
    if (!splitValues.length) {
      return;
    }
    for (const box of this.userNameBoxes) {
      if (Element.isInstance(box)) {
        box.value = splitValues.shift();
      }
    }
    this.checkUsername();
  },

  selectProtocol() {
    var protoList = document.getElementById("protolist");
    var id = protoList.selectedItem.value;
    this.proto = IMServices.core.getProtocolById(id);
  },

  /**
   * Create a new input field for receiving a username.
   *
   * @param {string} aName - The id for the input.
   * @param {string} aLabel - The text for the username label.
   * @param {Element} grid - A container with a two column grid display to
   *   append the new elements to.
   * @param {string} [aDefaultValue] - The initial value for the username.
   *
   * @returns {HTMLInputElement} - The newly created username input.
   */
  insertUsernameField(aName, aLabel, grid, aDefaultValue) {
    var label = document.createXULElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    label.setAttribute("id", aName + "-label");
    label.classList.add("label-inline");
    grid.appendChild(label);

    var input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    input.setAttribute("id", aName);
    input.classList.add("input-inline");
    if (aDefaultValue) {
      input.setAttribute("value", aDefaultValue);
    }
    input.addEventListener("input", () => {
      this.checkUsername();
    });
    // Only add the split logic to the first input field
    if (!this.userNameBoxes) {
      input.addEventListener("blur", () => {
        this.splitUsername();
      });
    }
    grid.appendChild(input);

    return input;
  },

  /**
   * Builds the username input boxes from the username split defined by the
   * protocol.
   */
  showUsernamePage() {
    var proto = this.proto.id;
    if ("userNameBoxes" in this && this.userNameProto == proto) {
      this.checkUsername();
      return;
    }

    var bundle = document.getElementById("accountsBundle");
    var usernameInfo;
    var emptyText = this.proto.usernameEmptyText;
    if (emptyText) {
      usernameInfo = bundle.getFormattedString(
        "accountUsernameInfoWithDescription",
        [emptyText, this.proto.name]
      );
    } else {
      usernameInfo = bundle.getFormattedString("accountUsernameInfo", [
        this.proto.name,
      ]);
    }
    document.getElementById("usernameInfo").textContent = usernameInfo;

    var grid = document.getElementById("userNameBox");
    // remove anything that may be there for another protocol
    while (grid.hasChildNodes()) {
      grid.lastChild.remove();
    }
    this.userNameBoxes = undefined;

    var splits = this.proto.getUsernameSplit();

    var label = bundle.getString("accountUsername");
    this.userNameBoxes = [this.insertUsernameField("name", label, grid)];
    this.userNameBoxes[0].emptyText = emptyText;
    let usernameBoxIndex = 0;

    if (this.proto.usernamePrefix) {
      this.userNameBoxes.unshift({ value: this.proto.usernamePrefix });
      usernameBoxIndex = 1;
    }

    for (let i = 0; i < splits.length; ++i) {
      this.userNameBoxes.push({ value: splits[i].separator });
      label = bundle.getFormattedString("accountColon", [splits[i].label]);
      const defaultVal = splits[i].defaultValue;
      this.userNameBoxes.push(
        this.insertUsernameField("username-split-" + i, label, grid, defaultVal)
      );
    }
    this.userNameBoxes[usernameBoxIndex].focus();
    this.userNameProto = proto;
    this.checkUsername();
  },

  hideUsernamePage() {
    document.querySelector("wizard").canAdvance = true;
    var next = "account" + (this.proto.noPassword ? "advanced" : "password");
    document.getElementById("accountusername").next = next;
  },

  showAdvanced() {
    // ensure we don't destroy user data if it's not necessary
    var id = this.proto.id;
    if ("protoSpecOptId" in this && this.protoSpecOptId == id) {
      return;
    }
    this.protoSpecOptId = id;

    this.populateProtoSpecificBox();

    // Make sure the protocol specific options and wizard buttons are visible.
    const wizard = document.querySelector("wizard");
    if (wizard.scrollHeight > window.innerHeight) {
      window.resizeBy(0, wizard.scrollHeight - window.innerHeight);
    }

    const alias = document.getElementById("alias");
    alias.focus();
  },

  populateProtoSpecificBox() {
    const haveOptions = accountOptionsHelper.addOptions(
      this.proto.id + "-",
      this.proto.getOptions()
    );
    document.getElementById("protoSpecificGroupbox").hidden = !haveOptions;
    if (haveOptions) {
      var bundle = document.getElementById("accountsBundle");
      document.getElementById("protoSpecificCaption").textContent =
        bundle.getFormattedString("protoOptions", [this.proto.name]);
    }
  },

  /**
   * Create new summary field and value elements.
   *
   * @param {string} aLabel - The name of the field being summarised.
   * @param {string} aValue - The value of the field being summarised.
   * @param {Element} grid - A container with a two column grid display to
   *   append the new elements to.
   */
  createSummaryRow(aLabel, aValue, grid) {
    var label = document.createXULElement("label");
    label.classList.add("header", "label-inline");
    if (aLabel.length > 20) {
      aLabel = aLabel.substring(0, 20);
      aLabel += "…";
    }

    label.setAttribute("value", aLabel);
    grid.appendChild(label);

    var input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    input.setAttribute("value", aValue);
    input.classList.add("plain", "input-inline");
    input.setAttribute("readonly", true);
    grid.appendChild(input);
  },

  showSummary() {
    var rows = document.getElementById("summaryRows");
    var bundle = document.getElementById("accountsBundle");
    while (rows.hasChildNodes()) {
      rows.lastChild.remove();
    }

    var label = document.getElementById("protoLabel").value;
    this.createSummaryRow(label, this.proto.name, rows);
    this.username = this.getUsername();
    label = bundle.getString("accountUsername");
    this.createSummaryRow(label, this.username, rows);
    if (!this.proto.noPassword) {
      this.password = this.getValue("password");
      if (this.password) {
        label = document.getElementById("passwordLabel").value;
        var pass = "";
        for (let i = 0; i < this.password.length; ++i) {
          pass += "*";
        }
        this.createSummaryRow(label, pass, rows);
      }
    }
    this.alias = this.getValue("alias");
    if (this.alias) {
      label = document.getElementById("aliasLabel").value;
      this.createSummaryRow(label, this.alias, rows);
    }

    var id = this.proto.id;
    this.prefs = [];
    for (const opt of this.proto.getOptions()) {
      const name = opt.name;
      const eltName = id + "-" + name;
      const val = this.getValue(eltName);
      // The value will be undefined if the proto specific groupbox has never been opened
      if (val === undefined) {
        continue;
      }
      switch (opt.type) {
        case Ci.prplIPref.typeBool:
          if (val != opt.getBool()) {
            this.prefs.push({ opt, name, value: !!val });
          }
          break;
        case Ci.prplIPref.typeInt:
          if (val != opt.getInt()) {
            this.prefs.push({ opt, name, value: val });
          }
          break;
        case Ci.prplIPref.typeString:
          if (val != opt.getString()) {
            this.prefs.push({ opt, name, value: val });
          }
          break;
        case Ci.prplIPref.typeList:
          if (val != opt.getListDefault()) {
            this.prefs.push({ opt, name, value: val });
          }
          break;
        default:
          throw new Error("unknown preference type " + opt.type);
      }
    }

    for (const pref of this.prefs) {
      this.createSummaryRow(
        bundle.getFormattedString("accountColon", [pref.opt.label]),
        pref.value,
        rows
      );
    }
  },

  createAccount() {
    var acc = IMServices.accounts.createAccount(this.username, this.proto.id);
    if (!this.proto.noPassword && this.password) {
      acc.password = this.password;
    }
    if (this.alias) {
      acc.alias = this.alias;
    }

    for (let i = 0; i < this.prefs.length; ++i) {
      const option = this.prefs[i];
      const opt = option.opt;
      switch (opt.type) {
        case Ci.prplIPref.typeBool:
          acc.setBool(option.name, option.value);
          break;
        case Ci.prplIPref.typeInt:
          acc.setInt(option.name, option.value);
          break;
        case Ci.prplIPref.typeString:
        case Ci.prplIPref.typeList:
          acc.setString(option.name, option.value);
          break;
        default:
          throw new Error("unknown type");
      }
    }
    var autologin = this.getValue("connectNow");
    acc.autoLogin = autologin;

    acc.save();

    try {
      if (autologin) {
        acc.connect();
      }
    } catch (e) {
      // If the connection fails (for example if we are currently in
      // offline mode), we still want to close the account wizard
    }

    if (window.opener) {
      var am = window.opener.gAccountManager;
      if (am) {
        am.selectAccount(acc.id);
      }
    }

    var inServer = MailServices.accounts.createIncomingServer(
      this.username,
      this.proto.id, // hostname
      "im"
    );
    inServer.wrappedJSObject.imAccount = acc;

    var account = MailServices.accounts.createAccount();
    // Avoid new folder notifications.
    inServer.valid = false;
    account.incomingServer = inServer;
    inServer.valid = true;
    MailServices.accounts.notifyServerLoaded(inServer);

    return true;
  },

  getValue(aId) {
    var elt = document.getElementById(aId);
    if ("selectedItem" in elt) {
      return elt.selectedItem.value;
    }
    // Strangely various input types also have a "checked" property defined,
    // so we check for the expected elements explicitly.
    if (
      ((elt.localName == "input" && elt.getAttribute("type") == "checkbox") ||
        elt.localName == "checkbox") &&
      "checked" in elt
    ) {
      return elt.checked;
    }
    if ("value" in elt) {
      return elt.value;
    }
    // If the groupbox has never been opened, the binding isn't attached
    // so the attributes don't exist. The calling code in showSummary
    // has a special handling of the undefined value for this case.
    return undefined;
  },

  *getIter(aEnumerator) {
    for (const iter of aEnumerator) {
      yield iter;
    }
  },

  /* Check for correctness and set URL for the "Get more protocols..."-link
   *  Stripped down code from preferences/themes.js
   */
  setGetMoreProtocols() {
    const prefURL = PREF_EXTENSIONS_GETMOREPROTOCOLSURL;
    var getMore = document.getElementById("getMoreProtocols");
    var showGetMore = false;

    if (Services.prefs.getPrefType(prefURL) != Ci.nsIPrefBranch.PREF_INVALID) {
      try {
        var getMoreURL = Services.urlFormatter.formatURLPref(prefURL);
        getMore.setAttribute("getMoreURL", getMoreURL);
        showGetMore = getMoreURL != "about:blank";
      } catch (e) {}
    }
    getMore.hidden = !showGetMore;
  },

  openURL(aURL) {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(aURL));
  },
};

window.addEventListener("load", () => {
  accountWizard.onload();
});

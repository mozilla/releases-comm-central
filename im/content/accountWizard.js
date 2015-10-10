/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource:///modules/imServices.jsm");

var PREF_EXTENSIONS_GETMOREPROTOCOLSURL = "extensions.getMoreProtocolsURL";

var accountWizard = {
  onload: function aw_onload() {
    let topProtoList = document.getElementById("topprotolist");
    let bundle = document.getElementById("topProtocolsBundle");
    let topProtocols = bundle.getString("topProtocol.list").split(",");

    for each (let topProto in topProtocols) {
      let proto = Services.core.getProtocolById(topProto);
      if (proto == null)
        continue;

      let item = document.createElement("richlistitem");
      item.className = "top-protocol";
      topProtoList.insertBefore(item, document.getElementById("otherListItem"));
      let desc = bundle.getString("topProtocol." + proto.id + ".description");
      item.build(proto, desc);
    }

    if (topProtoList.itemCount < 2)
      document.getElementById("accountWizard").currentPage = "accountprotocol";

    topProtoList.selectedIndex = -1;

    Services.obs.addObserver(this, "prpl-quit", false);
    window.addEventListener("unload", this.unload);
  },
  unload: function aw_unload() {
    Services.obs.removeObserver(accountWizard, "prpl-quit");
  },
  observe: function am_observe(aObject, aTopic, aData) {
    if (aTopic == "prpl-quit") {
      // libpurple is being uninitialized. We can't create any new
      // account so keeping this wizard open would be pointless, close it.
      window.close();
    }
  },

  getUsername: function aw_getUsername() {
    // If the first username textbox is empty, make sure we return an empty
    // string so that it blocks the 'next' button of the wizard.
    if (!this.userNameBoxes[0].value)
      return "";

    return this.userNameBoxes.reduce((prev, elt) => prev + elt.value, "");
  },

  checkUsername: function aw_checkUsername() {
    let wizard = document.getElementById("accountWizard");
    let name = accountWizard.getUsername();
    let duplicateWarning = document.getElementById("duplicateAccount");
    if (!name) {
      wizard.canAdvance = false;
      duplicateWarning.hidden = true;
      return;
    }

    let exists = accountWizard.proto.accountExists(name);
    wizard.canAdvance = !exists;
    duplicateWarning.hidden = !exists;
  },

  selectProtocol: function aw_selectProtocol() {
    // A fix for users wanting to return to the list they previously viewed.
    let pageId = document.getElementById("accountWizard").currentPage.pageid;
    document.getElementById("accountusername").previous = pageId;

    let listId = pageId == "accounttoplist" ? "topprotolist" : "protolist";
    let protoList = document.getElementById(listId);
    this.proto = Services.core.getProtocolById(protoList.selectedItem.value);

    return true;
  },

  insertUsernameField: function aw_insertUsernameField(aName, aLabel, aParent,
                                                       aDefaultValue) {
    let hbox = document.createElement("hbox");
    hbox.setAttribute("id", aName + "-hbox");
    hbox.setAttribute("align", "baseline");
    hbox.setAttribute("equalsize", "always");

    let label = document.createElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    label.setAttribute("id", aName + "-label");
    hbox.appendChild(label);

    let textbox = document.createElement("textbox");
    textbox.setAttribute("id", aName);
    textbox.setAttribute("flex", 1);
    if (aDefaultValue)
      textbox.setAttribute("value", aDefaultValue);
    textbox.addEventListener("input", accountWizard.checkUsername);
    hbox.appendChild(textbox);

    aParent.appendChild(hbox);
    return textbox;
  },

  showUsernamePage: function aw_showUsernamePage() {
    let proto = this.proto.id;
    if ("userNameBoxes" in this && this.userNameProto == proto) {
      this.checkUsername();
      return;
    }

    let bundle = document.getElementById("accountsBundle");
    let usernameInfo;
    let emptyText = this.proto.usernameEmptyText;
    if (emptyText) {
      usernameInfo =
        bundle.getFormattedString("accountUsernameInfoWithDescription",
                                  [emptyText, this.proto.name]);
    }
    else {
      usernameInfo =
        bundle.getFormattedString("accountUsernameInfo", [this.proto.name]);
    }
    document.getElementById("usernameInfo").textContent = usernameInfo;

    let vbox = document.getElementById("userNameBox");
    // remove anything that may be there for another protocol
    let child;
    while (vbox.hasChildNodes())
      vbox.lastChild.remove();

    let splits = [];
    for (let split in this.getProtoUserSplits())
      splits.push(split);

    let label = bundle.getString("accountUsername");
    this.userNameBoxes = [this.insertUsernameField("name", label, vbox)];
    this.userNameBoxes[0].emptyText = emptyText;

    for (let i = 0; i < splits.length; ++i) {
      this.userNameBoxes.push({value: splits[i].separator});
      label = bundle.getFormattedString("accountColon", [splits[i].label]);
      let defaultVal = splits[i].defaultValue;
      this.userNameBoxes.push(this.insertUsernameField("username-split-" + i,
                                                       label, vbox,
                                                       defaultVal));
    }
    this.userNameBoxes[0].focus();
    this.userNameProto = proto;
    this.checkUsername();
  },

  hideUsernamePage: function aw_hideUsernamePage() {
    document.getElementById("accountWizard").canAdvance = true;
    let next = "account" +
      (this.proto.noPassword ? "advanced" : "password");
    document.getElementById("accountusername").next = next;
  },

  showAdvanced: function aw_showAdvanced() {
    // ensure we don't destroy user data if it's not necessary
    let id = this.proto.id;
    if ("protoSpecOptId" in this && this.protoSpecOptId == id)
      return;
    this.protoSpecOptId = id;

/* FIXME
    document.getElementById("newMailNotification").hidden =
      !this.proto.newMailNotification;
*/
    this.populateProtoSpecificBox();

    let proxyVisible = this.proto.usePurpleProxy;
    if (proxyVisible) {
      this.proxy = Components.classes["@instantbird.org/purple/proxyinfo;1"]
                             .createInstance(Ci.purpleIProxyInfo);
      this.proxy.type = Ci.purpleIProxyInfo.useGlobal;
      this.displayProxyDescription();
    }
    document.getElementById("proxyGroupbox").hidden = !proxyVisible;

    let alias = document.getElementById("alias");
    alias.focus();
  },

  displayProxyDescription: function aw_displayProxyDescription() {
    let type = this.proxy.type;
    let bundle = document.getElementById("proxiesBundle");
    let proxy;
    let result;
    if (type == Ci.purpleIProxyInfo.useGlobal) {
      proxy = Cc["@instantbird.org/libpurple/core;1"]
              .getService(Ci.purpleICoreService).globalProxy;
      type = proxy.type;
    }
    else
      proxy = this.proxy;

    if (type == Ci.purpleIProxyInfo.noProxy)
      result = bundle.getString("proxies.directConnection");

    if (type == Ci.purpleIProxyInfo.useEnvVar)
      result = bundle.getString("proxies.useEnvironment");

    if (!result) {
      // At this point, we should have either a socks or http proxy
      if (type == Ci.purpleIProxyInfo.httpProxy)
        result = bundle.getString("proxies.http");
      else if (type == Ci.purpleIProxyInfo.socks4Proxy)
        result = bundle.getString("proxies.socks4");
      else if (type == Ci.purpleIProxyInfo.socks5Proxy)
        result = bundle.getString("proxies.socks5");
      else
        throw "Unknown proxy type";

      if (result)
        result += " ";

      if (proxy.username)
        result += proxy.username + "@";

      result += proxy.host + ":" + proxy.port;
    }

    document.getElementById("proxyDescription").textContent = result;
  },

  createTextbox: function aw_createTextbox(aType, aValue, aLabel, aName) {
    let row = document.createElement("row");
    row.setAttribute("align", "center");

    let label = document.createElement("label");
    label.textContent = aLabel;
    label.setAttribute("control", aName);
    row.appendChild(label);

    let textbox = document.createElement("textbox");
    if (aType)
      textbox.setAttribute("type", aType);
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("id", aName);
    textbox.setAttribute("flex", "1");

    row.appendChild(textbox);
    return row;
  },

  createMenulist: function aw_createMenulist(aList, aLabel, aName) {
    let vbox = document.createElement("vbox");
    vbox.setAttribute("flex", "1");

    let label = document.createElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    vbox.appendChild(label);

    aList.QueryInterface(Ci.nsISimpleEnumerator);
    let menulist = document.createElement("menulist");
    menulist.setAttribute("id", aName);
    let popup = menulist.appendChild(document.createElement("menupopup"));
    while (aList.hasMoreElements()) {
      let elt = aList.getNext();
      let item = document.createElement("menuitem");
      item.setAttribute("label", elt.name);
      item.setAttribute("value", elt.value);
      popup.appendChild(item);
    }
    vbox.appendChild(menulist);
    return vbox;
  },

  populateProtoSpecificBox: function aw_populate() {
    let id = this.proto.id;
    let rows = document.getElementById("protoSpecific");
    let child;
    while (rows.hasChildNodes())
      rows.lastChild.remove();
    let visible = false;
    for (let opt in this.getProtoOptions()) {
      let text = opt.label;
      let name = id + "-" + opt.name;
      switch (opt.type) {
      case opt.typeBool:
        let chk = document.createElement("checkbox");
        chk.setAttribute("label", text);
        chk.setAttribute("id", name);
        if (opt.getBool())
          chk.setAttribute("checked", "true");
        rows.appendChild(chk);
        break;
      case opt.typeInt:
        rows.appendChild(this.createTextbox("number", opt.getInt(),
                                            text, name));
        break;
      case opt.typeString:
        rows.appendChild(this.createTextbox(null, opt.getString(), text, name));
        break;
      case opt.typeList:
        rows.appendChild(this.createMenulist(opt.getList(), text, name));
        document.getElementById(name).value = opt.getListDefault();
        break;
      default:
        throw "unknown preference type " + opt.type;
      }
      visible = true;
    }
    document.getElementById("protoSpecificGroupbox").hidden = !visible;
    if (visible) {
      let bundle = document.getElementById("accountsBundle");
      document.getElementById("protoSpecificCaption").label =
        bundle.getFormattedString("protoOptions", [this.proto.name]);
    }
  },

  createSummaryRow: function aw_createSummaryRow(aLabel, aValue) {
    let row = document.createElement("row");
    row.setAttribute("align", "baseline");

    let label = document.createElement("label");
    label.setAttribute("class", "header");
    if (aLabel.length > 20) {
      aLabel = aLabel.substring(0, 20);
      aLabel += "…";
    }
    label.setAttribute("value", aLabel);
    row.appendChild(label);

    let textbox = document.createElement("textbox");
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("class", "plain");
    textbox.setAttribute("readonly", true);
    row.appendChild(textbox);

    return row;
  },

  showSummary: function aw_showSummary() {
    let rows = document.getElementById("summaryRows");
    let bundle = document.getElementById("accountsBundle");
    let child;
    while (rows.hasChildNodes())
      rows.lastChild.remove();

    let label = bundle.getString("accountProtocol");
    rows.appendChild(this.createSummaryRow(label, this.proto.name));
    this.username = this.getUsername();
    label = bundle.getString("accountUsername");
    rows.appendChild(this.createSummaryRow(label, this.username));
    if (!this.proto.noPassword) {
      this.password = this.getValue("password");
      if (this.password) {
        label = document.getElementById("passwordLabel").value;
        let pass = "";
        for (let i = 0; i < this.password.length; ++i)
          pass += "*";
        rows.appendChild(this.createSummaryRow(label, pass));
      }
    }
    this.alias = this.getValue("alias");
    if (this.alias) {
      label = document.getElementById("aliasLabel").value;
      rows.appendChild(this.createSummaryRow(label, this.alias));
    }

/* FIXME
    if (this.proto.newMailNotification)
      rows.appendChild(this.createSummaryRow("Notify of new mails:",
                                             this.getValue("newMailNotification")));
*/

    let id = this.proto.id;
    this.prefs = [ ];
    for (let opt in this.getProtoOptions()) {
      let name = opt.name;
      let eltName = id + "-" + name;
      let val = this.getValue(eltName);
      // The value will be undefined if the proto specific groupbox has never been opened
      if (val === undefined)
        continue;
      switch (opt.type) {
      case opt.typeBool:
        if (val != opt.getBool())
          this.prefs.push({opt: opt, name: name, value: !!val});
        break;
      case opt.typeInt:
        if (val != opt.getInt())
          this.prefs.push({opt: opt, name: name, value: val});
        break;
      case opt.typeString:
        if (val != opt.getString())
          this.prefs.push({opt: opt, name: name, value: val});
        break;
      case opt.typeList:
        if (val != opt.getListDefault())
          this.prefs.push({opt: opt, name: name, value: val});
        break;
      default:
        throw "unknown preference type " + opt.type;
      }
    }

    for (let i = 0; i < this.prefs.length; ++i) {
      let opt = this.prefs[i];
      let label = bundle.getFormattedString("accountColon", [opt.opt.label]);
      rows.appendChild(this.createSummaryRow(label, opt.value));
    }
  },

  createAccount: function aw_createAccount() {
    let acc = Services.accounts.createAccount(this.username, this.proto.id);
    if (!this.proto.noPassword && this.password)
      acc.password = this.password;
    if (this.alias)
      acc.alias = this.alias;
    //FIXME: newMailNotification

    for (let i = 0; i < this.prefs.length; ++i) {
      let option = this.prefs[i];
      let opt = option.opt;
      switch(opt.type) {
      case opt.typeBool:
        acc.setBool(option.name, option.value);
        break;
      case opt.typeInt:
        acc.setInt(option.name, option.value);
        break;
      case opt.typeString:
      case opt.typeList:
        acc.setString(option.name, option.value);
        break;
      default:
        throw "unknown type";
      }
    }
    let autologin = this.getValue("connectAutomatically");
    acc.autoLogin = autologin;

    if (this.proto.usePurpleProxy)
      acc.proxyInfo = this.proxy;

    acc.save();

    try {
      if (autologin)
        acc.connect();
    } catch (e) {
      // If the connection fails (for example if we are currently in
      // offline mode), we still want to close the account wizard
    }

    if (window.opener) {
      let am = window.opener.gAccountManager;
      if (am)
        am.selectAccount(acc.id);
    }

    return true;
  },

  getValue: function aw_getValue(aId) {
    let elt = document.getElementById(aId);
    if ("selectedItem" in elt)
      return elt.selectedItem.value;
    if ("checked" in elt)
      return elt.checked;
    if ("value" in elt)
      return elt.value;
    // If the groupbox has never been opened, the binding isn't attached
    // so the attributes don't exist. The calling code in showSummary
    // has a special handling of the undefined value for this case.
    return undefined;
  },

  getIter: function(aEnumerator) {
    while (aEnumerator.hasMoreElements())
      yield aEnumerator.getNext();
  },
  getProtocols: function aw_getProtocols() {
    return this.getIter(Services.core.getProtocols());
  },
  getProtoOptions: function aw_getProtoOptions() {
    return this.getIter(this.proto.getOptions());
  },
  getProtoUserSplits: function aw_getProtoUserSplits() {
    return this.getIter(this.proto.getUsernameSplit());
  },

  onGroupboxKeypress: function aw_onGroupboxKeypress(aEvent) {
    let target = aEvent.target;
    let code = aEvent.charCode || aEvent.keyCode;
    if (code == KeyEvent.DOM_VK_SPACE ||
        (code == KeyEvent.DOM_VK_LEFT && !target.hasAttribute("closed")) ||
        (code == KeyEvent.DOM_VK_RIGHT && target.hasAttribute("closed")))
        this.toggleGroupbox(target.id);
  },

  toggleGroupbox: function aw_toggleGroupbox(id) {
    let elt = document.getElementById(id);
    if (elt.hasAttribute("closed")) {
      elt.removeAttribute("closed");
      if (elt.flexWhenOpened)
        elt.flex = elt.flexWhenOpened;
    }
    else {
      elt.setAttribute("closed", "true");
      if (elt.flex) {
        elt.flexWhenOpened = elt.flex;
        elt.flex = 0;
      }
    }
  },

  openProxySettings: function aw_openProxySettings() {
    window.openDialog("chrome://instantbird/content/proxies.xul", "",
                      "chrome,modal,titlebar,centerscreen",
                      this);
    this.displayProxyDescription();
  },

  /* Check for correctness and set URL for the "Get more protocols..."-link
   *  Stripped down code from preferences/themes.js
   */
  setGetMoreProtocols: function (){
    let prefURL = PREF_EXTENSIONS_GETMOREPROTOCOLSURL;
    let getMore = document.getElementById("getMoreProtocols");
    let showGetMore = false;
    const nsIPrefBranch2 = Components.interfaces.nsIPrefBranch2;

    if (Services.prefs.getPrefType(prefURL) != nsIPrefBranch2.PREF_INVALID) {
      try {
        let getMoreURL = Components.classes["@mozilla.org/toolkit/URLFormatterService;1"]
                                   .getService(Components.interfaces.nsIURLFormatter)
                                   .formatURLPref(prefURL);
        getMore.setAttribute("getMoreURL", getMoreURL);
        showGetMore = getMoreURL != "about:blank";
      }
      catch (e) { }
    }
    getMore.hidden = !showGetMore;
  },

  openURL: function (aURL) {
    Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
              .getService(Components.interfaces.nsIExternalProtocolService)
              .loadUrl(Services.io.newURI(aURL, null, null));
  },

  advanceTopProtocolPage: function() {
    let selectedProtocol = document.getElementById("topprotolist").selectedItem;
    if (!selectedProtocol || selectedProtocol.id == "otherListItem")
      return true;
    accountWizard.selectProtocol();
    document.getElementById("accountWizard").goTo("accountusername");
    return false;
  },

  rewindFromUsernamePage: function() {
    let wizard = document.getElementById("accountWizard");
    let previousPage = wizard.getPageById("accountusername").previous;
    if (previousPage == "accountprotocol")
      return true;
    wizard.goTo(previousPage);
    return false;
  },

  showProtocolPage: function() {
    let protoList = document.getElementById("protolist");
    if (protoList.itemCount > 0)
      return;

    accountWizard.setGetMoreProtocols();
    let protos = [];
    for (let proto in accountWizard.getProtocols())
      protos.push(proto);
    protos.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

    protos.forEach(function(proto) {
      let item = protoList.appendItem(proto.name, proto.id);
      item.setAttribute("image", proto.iconBaseURI + "icon.png");
      item.setAttribute("class", "listitem-iconic");
    });

    protoList.selectedIndex = 0;
  },

  topProtocolListKeypress: function() {
    // Override the listbox behavior that sets a negative currentIndex to 0.
    let topProtoList = document.getElementById("topprotolist");
    if (topProtoList.selectedIndex < 0)
      topProtoList.currentIndex = topProtoList.selectedIndex;
  }
};

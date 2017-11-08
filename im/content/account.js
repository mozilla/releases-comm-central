/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var autoJoinPref = "autoJoin";

var account = {
  onload: function account_onload() {
    this.account = window.arguments[0];
    this.proto = this.account.protocol;
    document.getElementById("accountName").value = this.account.name;
    document.getElementById("protocolName").value = this.proto.name || this.proto.id;
    document.getElementById("protocolIcon").src =
      this.proto.iconBaseURI + "icon48.png";

    let passwordBox = document.getElementById("passwordBox");
    if (this.proto.noPassword)
      passwordBox.hidden = true;
    else {
      try {
        // Will throw if we don't have a protocol plugin for the account.
        document.getElementById("password").value = this.account.password;
      } catch (e) {
        passwordBox.hidden = true;
      }
    }

    document.getElementById("alias").value = this.account.alias;

    let protoId = this.proto.id;
    if (protoId == "prpl-irc" || protoId == "prpl-jabber" ||
        protoId == "prpl-gtalk") {
      document.getElementById("optionalSeparator").hidden = false;
      document.getElementById("autojoinBox").hidden = false;
      var branch = Services.prefs.getBranch("messenger.account." +
                                            this.account.id + ".");
      if (branch.prefHasUserValue(autoJoinPref)) {
        document.getElementById("autojoin").value =
          branch.getComplexValue(autoJoinPref, Ci.nsISupportsString).data;
      }
    }

/* FIXME
    document.getElementById("newMailNotification").hidden =
      !this.proto.newMailNotification;
*/

    this.prefs = Services.prefs.getBranch("messenger.account." +
                                          this.account.id + ".options.");
    this.populateProtoSpecificBox();

    let proxyVisible = this.proto.usePurpleProxy;
    if (proxyVisible) {
      this.proxy = this.account.proxyInfo;
      this.displayProxyDescription();
    }
    document.getElementById("proxyBox").hidden = !proxyVisible;
    document.getElementById("proxySeparator").hidden = !proxyVisible;

    Services.obs.addObserver(this, "prpl-quit", false);
    window.addEventListener("unload", this.unload);
  },
  unload: function account_unload() {
    Services.obs.removeObserver(account, "prpl-quit");
  },
  observe: function account_observe(aObject, aTopic, aData) {
    if (aTopic == "prpl-quit") {
      // libpurple is being uninitialized. Close this dialog.
      window.close();
    }
  },

  displayProxyDescription: function account_displayProxyDescription() {
    var type = this.proxy.type;
    var bundle = document.getElementById("proxiesBundle");
    var proxy;
    var result;
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

  getBool: function account_getBool(aOpt) {
    if (this.prefs.prefHasUserValue(aOpt.name))
      return this.prefs.getBoolPref(aOpt.name);

    return aOpt.getBool();
  },

  getInt: function account_getInt(aOpt) {
    if (this.prefs.prefHasUserValue(aOpt.name))
      return this.prefs.getIntPref(aOpt.name);

    return aOpt.getInt();
  },

  getString: function account_getString(aOpt) {
    if (this.prefs.prefHasUserValue(aOpt.name))
      return this.prefs.getComplexValue(aOpt.name, Ci.nsISupportsString).data;

    return aOpt.getString();
  },

  getListValue: function account_getListValue(aOpt) {
    if (this.prefs.prefHasUserValue(aOpt.name))
      return this.prefs.getCharPref(aOpt.name);

    return aOpt.getListDefault();
  },

  populateProtoSpecificBox: function account_populate() {
    let haveOptions =
      accountOptionsHelper.addOptions(this.proto.id + "-",
                                      this.getProtoOptions(), null);
    document.getElementById("advancedTab").hidden = !haveOptions;
  },

  getValue: function account_getValue(aId) {
    var elt = document.getElementById(aId);
    if ("checked" in elt)
      return elt.checked;
    return elt.value;
  },

  save: function account_save() {
    if (!this.proto.noPassword &&
        !document.getElementById("passwordBox").hidden) {
      var password = this.getValue("password");
      if (password != this.account.password)
        this.account.password = password;
    }

    var alias = this.getValue("alias");
    if (alias != this.account.alias)
      this.account.alias = alias;

    let protoId = this.proto.id;
    if (protoId == "prpl-irc" || protoId == "prpl-jabber" ||
        protoId == "prpl-gtalk") {
      var branch = Services.prefs.getBranch("messenger.account." +
                                            this.account.id + ".");
      var autojoin = this.getValue("autojoin");
      if (autojoin || branch.prefHasUserValue(autoJoinPref)) {
        let str = Cc["@mozilla.org/supports-string;1"]
                    .createInstance(Ci.nsISupportsString);
        str.data = autojoin;
        branch.setComplexValue(autoJoinPref, Ci.nsISupportsString, str);
      }
    }

    if (this.proto.usePurpleProxy &&
        this.account.proxyInfo.key != this.proxy.key)
      this.account.proxyInfo = this.proxy;

    for (let opt of this.getProtoOptions()) {
      var name = this.proto.id + "-" + opt.name;
      var val = this.getValue(name);
      switch (opt.type) {
      case Ci.prplIPref.typeBool:
        if (val != opt.getBool())
          this.account.setBool(opt.name, val);
        break;
      case Ci.prplIPref.typeInt:
        if (val != opt.getInt())
          this.account.setInt(opt.name, val);
        break;
      case Ci.prplIPref.typeString:
        if (val != opt.getString())
          this.account.setString(opt.name, val);
        break;
      case Ci.prplIPref.typeList:
        if (val != opt.getListDefault())
          this.account.setString(opt.name, val);
        break;
      default:
        throw "unknown preference type " + opt.type;
      }
    }
  },

  getProtoOptions: function* account_getProtoOptions() {
    let options = this.proto.getOptions();
    while (options.hasMoreElements()) {
      let opt = options.getNext();
      let returnOpt = {
        get name() { return opt.name; },
        get label() { return opt.label; },
        get type() { return opt.type; },
        get masked() { return opt.masked; },

        // Override these to use user's preference values instead of
        // the default value where available.
        getBool: () => this.getBool(opt),
        getInt: () => this.getInt(opt),
        getString: () => this.getString(opt),
        getListDefault: () => this.getListValue(opt),

        getList: () => opt.getList()
      };
      yield returnOpt;
    }
  },

  openProxySettings: function account_openProxySettings() {
    window.openDialog("chrome://instantbird/content/proxies.xul", "",
                      "chrome,modal,titlebar,centerscreen",
                      this);
    this.displayProxyDescription();
  }
};

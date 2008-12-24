/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const autoJoinPref = "autoJoin";

const events = [
  "purple-quit"
];

var account = {
  onload: function account_onload() {
    this.account = window.arguments[0];
    this.proto = this.account.protocol;
    document.getElementById("accountName").value = this.account.name;
    document.getElementById("protocolName").value = this.proto.name;
    document.getElementById("protocolIcon").src =
      "chrome://instantbird/skin/prpl/" + this.proto.id + "-48.png"

    if (this.proto.noPassword)
      document.getElementById("passwordBox").hidden = true;
    else
      document.getElementById("password").value = this.account.password;

    document.getElementById("alias").value = this.account.alias;

    this.prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                 .getService(Ci.nsIPrefService);
    if (this.proto.id == "prpl-irc") {
      document.getElementById("optionalSeparator").hidden = false;
      document.getElementById("autojoinBox").hidden = false;
      var branch = this.prefService.getBranch("messenger.account." +
                                              this.account.id + ".");
      if (branch.prefHasUserValue(autoJoinPref)) {
        document.getElementById("autojoin").value =
          branch.getCharPref(autoJoinPref);
      }
    }

/* FIXME
    document.getElementById("newMailNotification").hidden =
      !this.proto.newMailNotification;
*/

    this.prefs = this.prefService.getBranch("messenger.account." +
                                            this.account.id + ".options.");
    this.populateProtoSpecificBox();

    this.proxy = this.account.proxyInfo;
    this.displayProxyDescription();

    addObservers(this, events);
    window.addEventListener("unload", this.unload, false);
  },
  unload: function account_unload() {
    removeObservers(account, events);
  },
  observe: function account_observe(aObject, aTopic, aData) {
    if (aTopic == "purple-quit") {
      // libpurple is being uninitialized. Close this dialog.
      window.close();
    }
  },

  displayProxyDescription: function aw_displayProxyDescription() {
    var type = this.proxy.type;
    var bundle = document.getElementById("proxiesBundle");
    var proxy;
    var result;
    if (type == Ci.purpleIProxyInfo.useGlobal) {
      proxy = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService)
                        .globalProxy;
      type = proxy.type;
    }
    else
      proxy = this.proxy;

    if (type == Ci.purpleIProxyInfo.noProxy)
      result = bundle.getString("proxies.directConnexion");

    if (type == Ci.purpleIProxyInfo.useEnvVar)
      result = bundle.getString("proxies.useEnvironemental");

    if (!result) {
      // At this point, we should have either a socks or http proxy
      proxy.QueryInterface(Ci.purpleIProxy);
      var result;
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

  createTextbox: function account_createTextbox(aType, aValue, aLabel, aName) {
    var box = document.createElement("vbox");

    var label = document.createElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    box.appendChild(label);

    var textbox = document.createElement("textbox");
    if (aType)
      textbox.setAttribute("type", aType);
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("id", aName);

    box.appendChild(textbox);
    return box;
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
      return this.prefs.getCharPref(aOpt.name);

    return aOpt.getString();
  },

  populateProtoSpecificBox: function account_populate() {
    var gbox = document.getElementById("protoSpecific");
    var id = this.proto.id;
    for (let opt in this.getProtoOptions()) {
      var text = opt.label;
      var name = id + "-" + opt.name;
      switch (opt.type) {
      case opt.typeBool:
        var chk = document.createElement("checkbox");
        if (this.getBool(opt))
          chk.setAttribute("checked", "true");
        chk.setAttribute("label", text);
        chk.setAttribute("id", name);
        gbox.appendChild(chk);
        break;
      case opt.typeInt:
        gbox.appendChild(this.createTextbox("number", this.getInt(opt),
                                            text, name));
        break;
      case opt.typeString:
        gbox.appendChild(this.createTextbox(null, this.getString(opt),
                                            text, name));
        break;
      default:
        throw "unknown preference type " + opt.type;
      }
    }
  },

  getValue: function account_getValue(aId) {
    var elt = document.getElementById(aId);
    if ("checked" in elt)
      return elt.checked;
    return elt.value;
  },

  save: function account_create() {
    var password = this.getValue("password");
    if (password != this.account.password)
      this.account.password = password;

    //acc.rememberPassword = this.getValue("rememberPassword");

    var alias = this.getValue("alias");
    if (alias != this.account.alias)
      this.account.alias = alias;

    if (this.proto.id == "prpl-irc") {
      var branch = this.prefService.getBranch("messenger.account." +
                                              this.account.id + ".");
      var autojoin = this.getValue("autojoin");
      if (autojoin || branch.prefHasUserValue(autoJoinPref))
        branch.setCharPref(autoJoinPref, autojoin);
    }

    this.account.proxyInfo = this.proxy;

    for (let opt in this.getProtoOptions()) {
      var name = this.proto.id + "-" + opt.name;
      var val = this.getValue(name);
      switch (opt.type) {
      case opt.typeBool:
        if (val != this.getBool(opt))
          this.account.setBool(opt.name, val);
        break;
      case opt.typeInt:
        if (val != this.getInt(opt))
          this.account.setInt(opt.name, val);
        break;
      case opt.typeString:
        if (val != this.getString(opt))
          this.account.setString(opt.name, val);
        break;
      default:
        throw "unknown preference type " + opt.type;
      }
    }
  },

  getProtoOptions: function account_getProtoOptions() {
    return getIter(this.proto.getOptions, Ci.purpleIPref);
  },

  openProxySettings: function aw_openProxySettings() {
    window.openDialog("chrome://instantbird/content/proxies.xul", "",
                      "chrome,modal,titlebar,centerscreen",
                      this);
    this.displayProxyDescription();
  }
};

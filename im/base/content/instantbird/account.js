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

/* FIXME
    document.getElementById("newMailNotification").hidden =
      !this.proto.newMailNotification;
*/

    this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
                           .getService(Ci.nsIPrefService)
                           .getBranch("messenger.account." + this.account.id + ".options.");
    this.populateProtoSpecificBox();
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
    var bundle = document.getElementById("prplbundle");
    var id = this.proto.id;
    for (let opt in this.getProtoOptions()) {
      var text = bundle.getString(id + "." + opt.name);
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

  create: function account_create() {
    var password = this.getValue("password");
    if (password != this.account.password)
      this.account.password = password;

    //acc.rememberPassword = this.getValue("rememberPassword");

    var alias = this.getValue("alias");
    if (alias != this.account.alias)
      this.account.alias = alias;

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

  getProtocols: function account_getProtocols() {
    return getIter(this.pcs.getProtocols, Ci.purpleIProtocol);
  },
  getProtoOptions: function account_getProtoOptions() {
    return getIter(this.proto.getOptions, Ci.purpleIPref);
  }
};

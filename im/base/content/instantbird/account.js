
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

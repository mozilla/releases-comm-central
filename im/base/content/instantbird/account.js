const Ci = Components.interfaces;

var account = {
  onload: function account_onload() {
    var protoList = document.getElementById("protolist");
    this.pcs = Components.classes["@instantbird.org/purple/core;1"]
                         .getService(Ci.purpleICoreService);
    var protocols = this.pcs.getProtocols();
    while (protocols.hasMoreElements()) {
      var proto = protocols.getNext().QueryInterface(Ci.purpleIProtocol);
      var id = proto.id;
      var item = protoList.appendItem(proto.name, id, id);
      item.setAttribute("image", "chrome://instantbird/skin/prpl/" + id + ".png");
      item.setAttribute("class", "menuitem-iconic");
    }
    protoList.selectedIndex = 0;
  },

  select: function account_select() {
    var protoList = document.getElementById("protolist");
    var id = protoList.selectedItem.value;
    var proto  = this.pcs.getProtocolById(id);
    document.getElementById("passwordBox").hidden = proto.noPassword;
    document.getElementById("newMailNotification").hidden = !proto.newMailNotification;

    this.populateProtoSpecificBox(proto);
  },

  createTextbox: function account_createTextbox(aType, aValue, aLabel) {
    var box = document.createElement("vbox");

    var label = document.createElement("label");
    label.setAttribute("value", aLabel);
    box.appendChild(label);

    var textbox = document.createElement("textbox");
    if (aType)
      textbox.setAttribute("type", aType);
    textbox.setAttribute("value", aValue);

    box.appendChild(textbox);
    return box;
  },

  populateProtoSpecificBox: function account_populate(aProto) {
    var gbox = document.getElementById("protoSpecific");
    var bundle = document.getElementById("prplbundle");
    var id = aProto.id;
    var child;
    while (child = gbox.firstChild)
      gbox.removeChild(child);
    var opts = aProto.getOptions();
    while (opts.hasMoreElements()) {
      var opt = opts.getNext()
                    .QueryInterface(Ci.purpleIPref);
      var text = bundle.getString(id + "." + opt.name);
      switch (opt.type) {
      case opt.typeBool:
	var chk = document.createElement("checkbox");
	chk.check = opt.getBool();
	chk.setAttribute("label", text);
	gbox.appendChild(chk);
	break;
      case opt.typeInt:
	gbox.appendChild(this.createTextbox("number", opt.getInt(), text));
	break;
      case opt.typeString:
	var str = "";
	try {
	  str = opt.getString();
	} catch(e) { }
	gbox.appendChild(this.createTextbox(null, str, text));
	break;
      default:
	throw "unknown preference type " + opt.type;
      }
    }
  }
};

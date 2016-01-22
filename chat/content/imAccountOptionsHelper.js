/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

var accountOptionsHelper = {
  createTextbox: function(aType, aValue, aLabel, aName) {
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

  createMenulist: function(aList, aLabel, aName) {
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

  // Adds options with specific prefix for ids to UI according to their types
  // with optional attributes for each type and returns true if at least one
  // option has been added to UI, otherwise returns false.
  addOptions: function(aIdPrefix, aOptions, aAttributes) {
    let rows = document.getElementById("protoSpecific");
    let child;
    while (rows.hasChildNodes())
      rows.lastChild.remove();
    let haveOptions = false;
    for (let opt in aOptions) {
      let text = opt.label;
      let name = aIdPrefix + opt.name;
      let element;
      switch (opt.type) {
        case opt.typeBool:
          element = document.createElement("checkbox");
          element.setAttribute("label", text);
          element.setAttribute("id", name);
          if (opt.getBool())
            element.setAttribute("checked", "true");
          rows.appendChild(element);
          break;
        case opt.typeInt:
          element = this.createTextbox("number", opt.getInt(), text, name);
          rows.appendChild(element);
          break;
        case opt.typeString:
          element = this.createTextbox(null, opt.getString(), text, name);
          rows.appendChild(element);
          break;
        case opt.typeList:
          rows.appendChild(this.createMenulist(opt.getList(), text, name));
          element = document.getElementById(name);
          element.value = opt.getListDefault();
          break;
        default:
          throw "unknown preference type " + opt.type;
      }
      if (aAttributes && aAttributes[opt.type]) {
        for (let attr of aAttributes[opt.type])
          element.setAttribute(attr.name, attr.value);
      }
      haveOptions = true;
    }
    return haveOptions;
  }
};

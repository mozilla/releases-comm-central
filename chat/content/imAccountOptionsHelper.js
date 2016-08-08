/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

var accountOptionsHelper = {
  createTextbox: function(aType, aValue, aLabel, aName, aContainerType) {
    let container = document.createElement(aContainerType);
    if (aContainerType == "row")
      container.setAttribute("align", "center");

    let label = document.createElement("label");
    label.textContent = aLabel;
    label.setAttribute("control", aName);
    container.appendChild(label);

    let textbox = document.createElement("textbox");
    if (aType)
      textbox.setAttribute("type", aType);
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("id", aName);
    textbox.setAttribute("flex", "1");

    container.appendChild(textbox);
    return container;
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
    while (rows.hasChildNodes())
      rows.lastChild.remove();

    let containerType = "row";

    // TB's account options dialog doesn't use a grid element.
    if (rows.localName != "rows")
      containerType = "vbox";

    let haveOptions = false;
    for (let opt of aOptions) {
      let text = opt.label;
      let name = aIdPrefix + opt.name;
      switch (opt.type) {
        case Ci.prplIPref.typeBool:
          let chk = document.createElement("checkbox");
          chk.setAttribute("label", text);
          chk.setAttribute("id", name);
          if (opt.getBool())
            chk.setAttribute("checked", "true");
          rows.appendChild(chk);
          break;
        case Ci.prplIPref.typeInt:
          rows.appendChild(this.createTextbox("number", opt.getInt(), text,
                                              name, containerType));
          break;
        case Ci.prplIPref.typeString:
          rows.appendChild(this.createTextbox(null, opt.getString(), text, name,
                                              containerType));
          break;
        case Ci.prplIPref.typeList:
          rows.appendChild(this.createMenulist(opt.getList(), text, name));
          document.getElementById(name).value = opt.getListDefault();
          break;
        default:
          throw "unknown preference type " + opt.type;
      }
      if (aAttributes && aAttributes[opt.type]) {
        let element = document.getElementById(name);
        for (let attr of aAttributes[opt.type])
          element.setAttribute(attr.name, attr.value);
      }
      haveOptions = true;
    }
    return haveOptions;
  }
};

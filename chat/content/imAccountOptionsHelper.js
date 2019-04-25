/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var accountOptionsHelper = {
  createTextbox(aType, aValue, aLabel, aName) {
    let container = document.createElement("hbox");
    container.setAttribute("align", "baseline");
    container.setAttribute("equalsize", "always");

    let label = document.createElement("label");
    label.textContent = aLabel;
    label.setAttribute("control", aName);
    label.setAttribute("flex", "1");
    container.appendChild(label);

    let hbox = document.createElement("hbox");
    let textbox = document.createElement("textbox");
    if (aType) {
      textbox.setAttribute("type", aType);
    }
    textbox.setAttribute("value", aValue);
    textbox.setAttribute("id", aName);
    textbox.setAttribute("flex", "1");
    hbox.setAttribute("flex", "1");
    hbox.setAttribute("align", "start");
    hbox.appendChild(textbox);

    container.appendChild(hbox);
    return container;
  },

  createMenulist(aList, aLabel, aName) {
    let vbox = document.createElement("vbox");
    let hbox = document.createElement("hbox");

    let label = document.createElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    hbox.appendChild(label);
    vbox.appendChild(hbox);

    aList.QueryInterface(Ci.nsISimpleEnumerator);
    let menulist = document.createElement("menulist");
    menulist.setAttribute("id", aName);
    menulist.setAttribute("flex", "1");
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
  addOptions(aIdPrefix, aOptions, aAttributes) {
    let vbox = document.getElementById("protoSpecific");
    while (vbox.hasChildNodes()) {
      vbox.lastChild.remove();
    }

    let haveOptions = false;
    for (let opt of aOptions) {
      let text = opt.label;
      let name = aIdPrefix + opt.name;
      switch (opt.type) {
        case Ci.prplIPref.typeBool:
          let chk = document.createElement("checkbox");
          let hbox = document.createElement("hbox");
          hbox.setAttribute("flex", "1");
          chk.setAttribute("label", text);
          chk.setAttribute("id", name);
          if (opt.getBool()) {
            chk.setAttribute("checked", "true");
          }
          hbox.appendChild(chk);
          vbox.appendChild(hbox);
          break;
        case Ci.prplIPref.typeInt:
          vbox.appendChild(this.createTextbox("number", opt.getInt(), text, name));
          break;
        case Ci.prplIPref.typeString:
          vbox.appendChild(this.createTextbox(null, opt.getString(), text, name));
          break;
        case Ci.prplIPref.typeList:
          vbox.appendChild(this.createMenulist(opt.getList(), text, name));
          document.getElementById(name).value = opt.getListDefault();
          break;
        default:
          throw new Error("unknown preference type " + opt.type);
      }
      if (aAttributes && aAttributes[opt.type]) {
        let element = document.getElementById(name);
        for (let attr of aAttributes[opt.type])
          element.setAttribute(attr.name, attr.value);
      }
      haveOptions = true;
    }
    return haveOptions;
  },
};

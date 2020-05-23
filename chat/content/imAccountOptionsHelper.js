/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var accountOptionsHelper = {
  createTextbox(aType, aValue, aLabel, aName) {
    let container = document.createXULElement("hbox");
    container.setAttribute("align", "baseline");
    container.setAttribute("equalsize", "always");
    container.classList.add("input-container");

    let label = document.createXULElement("label");
    label.textContent = aLabel;
    label.setAttribute("control", aName);
    label.classList.add("label-inline");
    container.appendChild(label);

    let input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    if (aType == "number") {
      input.classList.add("input-number-inline");
    } else {
      input.classList.add("input-inline");
    }
    if (aType) {
      input.setAttribute("type", aType);
    }
    input.setAttribute("value", aValue);
    input.setAttribute("id", aName);

    container.appendChild(input);
    return container;
  },

  createMenulist(aList, aLabel, aName) {
    let hbox = document.createXULElement("hbox");
    hbox.setAttribute("align", "baseline");
    hbox.setAttribute("equalsize", "always");
    hbox.classList.add("input-container");

    let label = document.createXULElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    label.classList.add("label-inline");
    hbox.appendChild(label);

    let menulist = document.createXULElement("menulist");
    menulist.setAttribute("id", aName);
    menulist.setAttribute("flex", "1");
    menulist.classList.add("input-inline");
    let popup = menulist.appendChild(document.createXULElement("menupopup"));
    for (let elt of aList) {
      let item = document.createXULElement("menuitem");
      item.setAttribute("label", elt.name);
      item.setAttribute("value", elt.value);
      popup.appendChild(item);
    }
    hbox.appendChild(menulist);
    return hbox;
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
          let chk = document.createXULElement("checkbox");
          let hbox = document.createXULElement("hbox");
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
          vbox.appendChild(
            this.createTextbox("number", opt.getInt(), text, name)
          );
          break;
        case Ci.prplIPref.typeString:
          vbox.appendChild(
            this.createTextbox("text", opt.getString(), text, name)
          );
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
        for (let attr of aAttributes[opt.type]) {
          element.setAttribute(attr.name, attr.value);
        }
      }
      haveOptions = true;
    }
    return haveOptions;
  },
};

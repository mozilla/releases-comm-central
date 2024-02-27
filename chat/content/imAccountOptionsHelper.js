/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var accountOptionsHelper = {
  /**
   * Create a new label and a corresponding input.
   *
   * @param {string} aType - The input type ("number" or "text").
   * @param {string} aValue - The initial value for the input.
   * @param {string} aLabel - The text for the label.
   * @param {string} aName - The id for the input.
   * @param {Element} grid - A container with a two column grid display to
   *   append the new elements to.
   */
  createTextbox(aType, aValue, aLabel, aName, grid) {
    const label = document.createXULElement("label");
    label.textContent = aLabel;
    label.setAttribute("control", aName);
    label.classList.add("label-inline");
    grid.appendChild(label);

    const input = document.createElementNS(
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

    grid.appendChild(input);
  },

  /**
   * Create a new label and a corresponding menulist.
   *
   * @param {object[]} aList - The list of items to fill the menulist with.
   * @param {string} aList[].label - The label for the menuitem.
   * @param {string} aList[].value - The value for the menuitem.
   * @param {string} aLabel - The text for the label.
   * @param {string} aName - The id for the menulist.
   * @param {Element} grid - A container with a two column grid display to
   *   append the new elements to.
   */
  createMenulist(aList, aLabel, aName, grid) {
    const label = document.createXULElement("label");
    label.setAttribute("value", aLabel);
    label.setAttribute("control", aName);
    label.classList.add("label-inline");
    grid.appendChild(label);

    const menulist = document.createXULElement("menulist");
    menulist.setAttribute("id", aName);
    menulist.setAttribute("flex", "1");
    menulist.classList.add("input-inline");
    const popup = menulist.appendChild(document.createXULElement("menupopup"));
    for (const elt of aList) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", elt.name);
      item.setAttribute("value", elt.value);
      popup.appendChild(item);
    }
    grid.appendChild(menulist);
  },

  // Adds options with specific prefix for ids to UI according to their types
  // with optional attributes for each type and returns true if at least one
  // option has been added to UI, otherwise returns false.
  addOptions(aIdPrefix, aOptions, aAttributes) {
    const grid = document.getElementById("protoSpecific");
    while (grid.hasChildNodes()) {
      grid.lastChild.remove();
    }

    let haveOptions = false;
    for (const opt of aOptions) {
      const text = opt.label;
      const name = aIdPrefix + opt.name;
      switch (opt.type) {
        case Ci.prplIPref.typeBool: {
          const chk = document.createXULElement("checkbox");
          chk.setAttribute("label", text);
          chk.setAttribute("id", name);
          if (opt.getBool()) {
            chk.setAttribute("checked", "true");
          }
          // Span two columns.
          chk.classList.add("grid-item-span-row");
          grid.appendChild(chk);
          break;
        }
        case Ci.prplIPref.typeInt:
          this.createTextbox("number", opt.getInt(), text, name, grid);
          break;
        case Ci.prplIPref.typeString:
          this.createTextbox("text", opt.getString(), text, name, grid);
          break;
        case Ci.prplIPref.typeList:
          this.createMenulist(opt.getList(), text, name, grid);
          document.getElementById(name).value = opt.getListDefault();
          break;
        default:
          throw new Error("unknown preference type " + opt.type);
      }
      if (aAttributes && aAttributes[opt.type]) {
        const element = document.getElementById(name);
        for (const attr of aAttributes[opt.type]) {
          element.setAttribute(attr.name, attr.value);
        }
      }
      haveOptions = true;
    }
    return haveOptions;
  },
};

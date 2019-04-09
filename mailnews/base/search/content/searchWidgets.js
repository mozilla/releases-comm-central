/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement, gFilter, gFilterList */

var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");

const updateParentNode = (parentNode) => {
  if (parentNode.hasAttribute("initialActionIndex")) {
    let actionIndex = parentNode.getAttribute("initialActionIndex");
    let filterAction = gFilter.getActionAt(actionIndex);
    parentNode.initWithAction(filterAction);
  }
  parentNode.updateRemoveButton();
};

class MozRuleactiontargetTag extends MozXULElement {
  connectedCallback() {
    const menulist = document.createElement("menulist");
    const menuPopup = document.createElement("menupopup");

    menulist.classList.add("ruleactionitem");
    menulist.setAttribute("flex", "1");
    menulist.appendChild(menuPopup);

    for (let taginfo of MailServices.tags.getAllTags({})) {
      const newMenuItem = document.createElement("menuitem");
      newMenuItem.setAttribute("label", taginfo.tag);
      newMenuItem.setAttribute("value", taginfo.key);
      menuPopup.appendChild(newMenuItem);
    }

    this.appendChild(menulist);

    updateParentNode(this.closest(".ruleaction"));
  }
}

class MozRuleactiontargetPriority extends MozXULElement {
  connectedCallback() {
    this.appendChild(MozXULElement.parseXULToFragment(`
      <menulist class="ruleactionitem" flex="1">
        <menupopup>
          <menuitem value="6" label="&highestPriorityCmd.label;"></menuitem>
          <menuitem value="5" label="&highPriorityCmd.label;"></menuitem>
          <menuitem value="4" label="&normalPriorityCmd.label;"></menuitem>
          <menuitem value="3" label="&lowPriorityCmd.label;"></menuitem>
          <menuitem value="2" label="&lowestPriorityCmd.label;"></menuitem>
        </menupopup>
      </menulist>
      `, [
        "chrome://messenger/locale/FilterEditor.dtd",
      ]));

    updateParentNode(this.closest(".ruleaction"));
  }
}

class MozRuleactiontargetJunkscore extends MozXULElement {
  connectedCallback() {
    this.appendChild(MozXULElement.parseXULToFragment(`
      <menulist class="ruleactionitem" flex="1">
        <menupopup>
          <menuitem value="100" label="&junk.label;"/>
          <menuitem value="0" label="&notJunk.label;"/>
        </menupopup>
      </menulist>
      `, [
        "chrome://messenger/locale/FilterEditor.dtd",
      ]));

    updateParentNode(this.closest(".ruleaction"));
  }
}

class MozRuleactiontargetReplyto extends MozXULElement {
  connectedCallback() {
    const menulist = document.createElement("menulist");
    const menuPopup = document.createElement("menupopup");

    menulist.classList.add("ruleactionitem");
    menulist.setAttribute("flex", "1");
    menulist.appendChild(menuPopup);

    this.appendChild(menulist);

    document.getAnonymousElementByAttribute(this.closest(".ruleaction"), "class", "ruleactiontype")
            .getTemplates(true, menulist);

    updateParentNode(this.closest(".ruleaction"));
  }
}


class MozRuleactiontargetForwardto extends MozXULElement {
  connectedCallback() {
    const textbox = document.createElement("textbox");

    textbox.classList.add("ruleactionitem");
    textbox.setAttribute("flex", "1");

    this.appendChild(textbox);

    updateParentNode(this.closest(".ruleaction"));
  }
}

class MozRuleactiontargetFolder extends MozXULElement {
  connectedCallback() {
    this.appendChild(MozXULElement.parseXULToFragment(`
      <menulist class="ruleactionitem
                folderMenuItem"
                flex="1"
                displayformat="verbose">
        <menupopup type="folder"
                   mode="filing"
                   class="menulist-menupopup"
                   showRecent="true"
                   recentLabel="&recentFolders.label;"
                   showFileHereLabel="true">
        </menupopup>
      </menulist>
      `, [
        "chrome://messenger/locale/messenger.dtd",
      ]));

    this.menulist = this.querySelector("menulist");

    this.menulist.addEventListener("command", (event) => {
      this.setPicker(event);
    });

    updateParentNode(this.closest(".ruleaction"));

    let folder = this.menulist.value ?
      MailUtils.getOrCreateFolder(this.menulist.value) :
      gFilterList.folder;

    // An account folder is not a move/copy target; show "Choose Folder".
    folder = folder.isServer ? null : folder;

    this.menulist.menupopup.selectFolder(folder);
  }

  setPicker(event) {
    this.menulist.menupopup.selectFolder(event.target._folder);
  }
}

class MozRuleactiontargetWrapper extends MozXULElement {
  static get observedAttributes() {
    return ["type"];
  }

  get ruleactiontargetElement() {
    return this.node;
  }

  connectedCallback() {
    this._updateAttributes();
  }

  attributeChangedCallback() {
    this._updateAttributes();
  }

  _getChildNode(type) {
    const elementMapping = {
      "movemessage": "ruleactiontarget-folder",
      "copymessage": "ruleactiontarget-folder",
      "setpriorityto": "ruleactiontarget-priority",
      "setjunkscore": "ruleactiontarget-junkscore",
      "forwardmessage": "ruleactiontarget-forwardto",
      "replytomessage": "ruleactiontarget-replyto",
      "addtagtomessage": "ruleactiontarget-tag",
    };
    const elementName = elementMapping[type];

    return elementName ? document.createElement(elementName) : null;
  }

  _updateAttributes() {
    if (!this.hasAttribute("type")) {
      return;
    }

    const type = this.getAttribute("type");

    while (this.firstChild) {
      this.firstChild.remove();
    }

    if (type == null) {
      return;
    }

    this.node = this._getChildNode(type);

    if (this.node) {
      this.node.setAttribute("flex", "1");
      this.appendChild(this.node);
    } else {
      updateParentNode(this.closest(".ruleaction"));
    }
  }
}

customElements.define("ruleactiontarget-tag", MozRuleactiontargetTag);
customElements.define("ruleactiontarget-priority", MozRuleactiontargetPriority);
customElements.define("ruleactiontarget-junkscore", MozRuleactiontargetJunkscore);
customElements.define("ruleactiontarget-replyto", MozRuleactiontargetReplyto);
customElements.define("ruleactiontarget-forwardto", MozRuleactiontargetForwardto);
customElements.define("ruleactiontarget-folder", MozRuleactiontargetFolder);
customElements.define("ruleactiontarget-wrapper", MozRuleactiontargetWrapper);

/**
 * This is an abstract class for search menulist general functionality.
 *
 * @abstract
 * @extends MozXULElement
 */
class MozSearchMenulistAbstract extends MozXULElement {
  static get observedAttributes() {
    return ["flex", "disabled"];
  }

  constructor() {
    super();
    this.internalScope = null;
    this.internalValue = -1;
    this.validityManager = Cc["@mozilla.org/mail/search/validityManager;1"]
      .getService(Ci.nsIMsgSearchValidityManager);
  }

  connectedCallback() {
    if (!this.hasChildNodes()) {
      this.menulist = document.createElement("menulist");
      this.menulist.classList.add("search-menulist");
      this.menulist.addEventListener("command", this.onSelect.bind(this));
      this.menupopup = document.createElement("menupopup");
      this.menupopup.classList.add("search-menulist-popup");
      this.menulist.appendChild(this.menupopup);
      this.appendChild(this.menulist);
    }
    this._updateAttributes();
  }

  attributeChangedCallback() {
    this._updateAttributes();
  }

  _updateAttributes() {
    if (!this.menulist) {
      return;
    }
    if (this.hasAttribute("flex")) {
      this.menulist.setAttribute("flex", this.getAttribute("flex"));
    } else {
      this.menulist.removeAttribute("flex");
    }
    if (this.hasAttribute("disabled")) {
      this.menulist.setAttribute("disabled", this.getAttribute("disabled"));
    } else {
      this.menulist.removeAttribute("disabled");
    }
  }

  set searchScope(val) {
    // if scope isn't changing this is a noop
    if (this.internalScope == val) {
      return val;
    }
    this.internalScope = val;
    this.refreshList();
    if (this.targets) {
      this.targets.forEach(target => {
        customElements.upgrade(target);
        target.searchScope = val;
      });
    }
    return val;
  }

  get searchScope() {
    return this.internalScope;
  }

  get validityTable() {
    return this.validityManager.getTable(this.searchScope);
  }

  get targets() {
    const forAttrs = this.getAttribute("for");
    if (!forAttrs) {
      return null;
    }
    const targetIds = forAttrs.split(",");
    if (targetIds.length == 0) {
      return null;
    }

    return targetIds.map(id => document.getElementById(id)).filter(e => e != null);
  }

  get optargets() {
    const forAttrs = this.getAttribute("opfor");
    if (!forAttrs) {
      return null;
    }
    const optargetIds = forAttrs.split(",");
    if (optargetIds.length == 0) {
      return null;
    }

    return optargetIds.map(id => document.getElementById(id)).filter(e => e != null);
  }

  set value(val) {
    if (this.internalValue == val) {
      return val;
    }
    this.internalValue = val;
    this.menulist.selectedItem = this.validMenuitem;
    // now notify targets of new parent's value
    if (this.targets) {
      this.targets.forEach(target => {
        customElements.upgrade(target);
        target.parentValue = val;
      });
    }
    // now notify optargets of new op parent's value
    if (this.optargets) {
      this.optargets.forEach(optarget => {
        customElements.upgrade(optarget);
        optarget.opParentValue = val;
      });
    }
    return val;
  }

  get value() {
    return this.internalValue;
  }

  /**
   * Gets the label of the menulist's selected item.
   */
  get label() {
    return this.menulist.selectedItem.getAttribute("label");
  }

  get validMenuitem() {
    if (this.value == -1) { // -1 means not initialized
      return null;
    }
    let isCustom = isNaN(this.value);
    let typedValue = isCustom ? this.value : parseInt(this.value);
    // custom attribute to style the unavailable menulist item
    this.menulist.setAttribute("unavailable",
      (!this.valueIds.includes(typedValue)) ? "true" : null);
    // add a hidden menulist item if value is missing
    let menuitem = this.menulist.querySelector(`[value="${this.value}"]`);
    if (!menuitem) { // need to add a hidden menuitem
      menuitem = this.menulist.appendItem(this.valueLabel, this.value);
      menuitem.hidden = true;
    }
    return menuitem;
  }

  refreshList(dontRestore) {
    const menuItemIds = this.valueIds;
    const menuItemStrings = this.valueStrings;
    const popup = this.menupopup;
    // save our old "value" so we can restore it later
    let oldData;
    if (!dontRestore) {
      oldData = this.menulist.value;
    }
    // remove the old popup children
    while (popup.hasChildNodes()) {
      popup.lastChild.remove();
    }
    let newSelection;
    let customizePos = -1;
    for (let i = 0; i < menuItemIds.length; i++) {
      // create the menuitem
      if (Ci.nsMsgSearchAttrib.OtherHeader == menuItemIds[i].toString()) {
        customizePos = i;
      } else {
        const menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label", menuItemStrings[i]);
        menuitem.setAttribute("value", menuItemIds[i]);
        popup.appendChild(menuitem);
        // try to restore the selection
        if (!newSelection || oldData == menuItemIds[i].toString()) {
          newSelection = menuitem;
        }
      }
    }
    if (customizePos != -1) {
      const separator = document.createElement("menuseparator");
      popup.appendChild(separator);
      const menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", menuItemStrings[customizePos]);
      menuitem.setAttribute("value", menuItemIds[customizePos]);
      popup.appendChild(menuitem);
    }

    // If we are either uninitialized, or if we are called because
    // of a change in our parent, update the value to the
    // default stored in newSelection.
    if ((this.value == -1 || dontRestore) && newSelection) {
      this.value = newSelection.getAttribute("value");
    }
    this.menulist.selectedItem = this.validMenuitem;
  }

  onSelect(event) {
    if (this.menulist.value == Ci.nsMsgSearchAttrib.OtherHeader) {
      // Customize menuitem selected.
      let args = {};
      window.openDialog(
        "chrome://messenger/content/CustomHeaders.xul",
        "",
        "modal,centerscreen,resizable,titlebar,chrome",
        args
      );
      // User may have removed the custom header currently selected
      // in the menulist so temporarily set the selection to a safe value.
      this.value = Ci.nsMsgSearchAttrib.OtherHeader;
      // rebuild the menulist
      UpdateAfterCustomHeaderChange();
      // Find the created or chosen custom header and select it.
      if (args.selectedVal) {
        let menuitem = this.menulist.querySelector(`[label="${args.selectedVal}"]`);
        this.value = menuitem.value;
      } else {
        // Nothing was picked in the custom headers editor so just pick something
        // instead of the current "Customize" menuitem.
        this.value = this.menulist.getItemAtIndex(0).value;
      }
    } else {
      this.value = this.menulist.value;
    }
  }
}

/**
 * The MozSearchAttribute widget is typically used in the search and filter dialogs to show a list
 * of possible message headers.
 *
 * @extends MozSearchMenulistAbstract
 */
class MozSearchAttribute extends MozSearchMenulistAbstract {
  constructor() {
    super();

    this.stringBundle =
      Services.strings.createBundle("chrome://messenger/locale/search-attributes.properties");
  }

  connectedCallback() {
    super.connectedCallback();

    initializeTermFromId(this.id);
  }

  get valueLabel() {
    if (isNaN(this.value)) { // is this a custom term?
      let customTerm = MailServices.filters.getCustomTerm(this.value);
      if (customTerm) {
        return customTerm.name;
      }
      // The custom term may be missing after the extension that added it
      // was disabled or removed. We need to notify the user.
      let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
      scriptError.init(
        "Missing custom search term " + this.value, null, null, 0, 0, Ci.nsIScriptError.errorFlag,
        "component javascript"
      );
      Services.console.logMessage(scriptError);
      return this.stringBundle.GetStringFromName("MissingCustomTerm");
    }
    return this.stringBundle.GetStringFromName(
      this.validityManager.getAttributeProperty(parseInt(this.value)));
  }

  get valueIds() {
    let result = this.validityTable.getAvailableAttributes({});
    // add any available custom search terms
    for (let customTerm of MailServices.filters.getCustomTerms()) {
      customTerm = customTerm.QueryInterface(Ci.nsIMsgSearchCustomTerm);
      // For custom terms, the array element is a string with the custom id
      // instead of the integer attribute
      if (customTerm.getAvailable(this.searchScope, null)) {
        result.push(customTerm.id);
      }
    }
    return result;
  }

  get valueStrings() {
    let strings = [];
    let ids = this.valueIds;
    let hdrsArray = null;
    try {
      let hdrs = Services.prefs.getCharPref("mailnews.customHeaders");
      hdrs = hdrs.replace(/\s+/g, ""); // remove white spaces before splitting
      hdrsArray = hdrs.match(/[^:]+/g);
    } catch (ex) { }
    let j = 0;
    for (let i = 0; i < ids.length; i++) {
      if (isNaN(ids[i])) { // Is this a custom search term?
        let customTerm = MailServices.filters.getCustomTerm(ids[i]);
        if (customTerm) {
          strings[i] = customTerm.name;
        } else {
          strings[i] = "";
        }
      } else if (ids[i] > Ci.nsMsgSearchAttrib.OtherHeader && hdrsArray) {
        strings[i] = hdrsArray[j++];
      } else {
        strings[i] = this.stringBundle.GetStringFromName(
          this.validityManager.getAttributeProperty(ids[i]));
      }
    }
    return strings;
  }
}
customElements.define("search-attribute", MozSearchAttribute);

/**
 * MozSearchOperator contains a list of operators that can be applied on search-attribute and
 * search-value value.
 *
 * @extends MozSearchMenulistAbstract
 */
class MozSearchOperator extends MozSearchMenulistAbstract {
  constructor() {
    super();

    this.stringBundle =
      Services.strings.createBundle("chrome://messenger/locale/search-operators.properties");
  }

  connectedCallback() {
    super.connectedCallback();

    this.searchAttribute = Ci.nsMsgSearchAttrib.Default;
  }

  get valueLabel() {
    return this.stringBundle.GetStringFromName(this.value);
  }

  get valueIds() {
    const length = {};
    let isCustom = isNaN(this.searchAttribute);
    if (isCustom) {
      let customTerm = MailServices.filters.getCustomTerm(this.searchAttribute);
      if (customTerm) {
        return customTerm.getAvailableOperators(this.searchScope, length);
      }
      return [Ci.nsMsgSearchOp.Contains];
    }
    return this.validityTable.getAvailableOperators(this.searchAttribute, length);
  }

  get valueStrings() {
    let strings = [];
    let ids = this.valueIds;
    for (let i = 0; i < ids.length; i++) {
      strings[i] = this.stringBundle.GetStringFromID(ids[i]);
    }
    return strings;
  }

  set parentValue(val) {
    if (this.searchAttribute == val && val != Ci.nsMsgSearchAttrib.OtherHeader) {
      return val;
    }
    this.searchAttribute = val;
    this.refreshList(true); // don't restore the selection, since searchvalue nulls it
    if (val == Ci.nsMsgSearchAttrib.AgeInDays) {
      // We want "Age in Days" to default to "is less than".
      this.value = Ci.nsMsgSearchOp.IsLessThan;
    }
    return val;
  }

  get parentValue() {
    return this.searchAttribute;
  }
}
customElements.define("search-operator", MozSearchOperator);

/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */

/* import-globals-from FilterEditor.js */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );
  const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

  const updateParentNode = parentNode => {
    if (parentNode.hasAttribute("initialActionIndex")) {
      let actionIndex = parentNode.getAttribute("initialActionIndex");
      let filterAction = gFilter.getActionAt(actionIndex);
      parentNode.initWithAction(filterAction);
    }
    parentNode.updateRemoveButton();
  };

  class MozRuleactiontargetTag extends MozXULElement {
    connectedCallback() {
      const menulist = document.createXULElement("menulist");
      const menuPopup = document.createXULElement("menupopup");

      menulist.classList.add("ruleactionitem");
      menulist.setAttribute("flex", "1");
      menulist.appendChild(menuPopup);

      for (let taginfo of MailServices.tags.getAllTags()) {
        const newMenuItem = document.createXULElement("menuitem");
        newMenuItem.setAttribute("label", taginfo.tag);
        newMenuItem.setAttribute("value", taginfo.key);
        if (taginfo.color) {
          newMenuItem.setAttribute("style", `color: ${taginfo.color};`);
        }
        menuPopup.appendChild(newMenuItem);
      }

      this.appendChild(menulist);

      updateParentNode(this.closest(".ruleaction"));
    }
  }

  class MozRuleactiontargetPriority extends MozXULElement {
    connectedCallback() {
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menulist class="ruleactionitem" flex="1">
            <menupopup>
              <menuitem value="6" label="&highestPriorityCmd.label;"></menuitem>
              <menuitem value="5" label="&highPriorityCmd.label;"></menuitem>
              <menuitem value="4" label="&normalPriorityCmd.label;"></menuitem>
              <menuitem value="3" label="&lowPriorityCmd.label;"></menuitem>
              <menuitem value="2" label="&lowestPriorityCmd.label;"></menuitem>
            </menupopup>
          </menulist>
          `,
          ["chrome://messenger/locale/FilterEditor.dtd"]
        )
      );

      updateParentNode(this.closest(".ruleaction"));
    }
  }

  class MozRuleactiontargetJunkscore extends MozXULElement {
    connectedCallback() {
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menulist class="ruleactionitem" flex="1">
            <menupopup>
              <menuitem value="100" label="&junk.label;"/>
              <menuitem value="0" label="&notJunk.label;"/>
            </menupopup>
          </menulist>
          `,
          ["chrome://messenger/locale/FilterEditor.dtd"]
        )
      );

      updateParentNode(this.closest(".ruleaction"));
    }
  }

  class MozRuleactiontargetReplyto extends MozXULElement {
    connectedCallback() {
      const menulist = document.createXULElement("menulist");
      const menuPopup = document.createXULElement("menupopup");

      menulist.classList.add("ruleactionitem");
      menulist.setAttribute("flex", "1");
      menulist.appendChild(menuPopup);

      this.appendChild(menulist);

      let ruleaction = this.closest(".ruleaction");
      let raMenulist = ruleaction.querySelector(
        '[is="ruleactiontype-menulist"]'
      );
      for (let { label, value } of raMenulist.findTemplates()) {
        menulist.appendItem(label, value);
      }
      updateParentNode(ruleaction);
    }
  }

  class MozRuleactiontargetForwardto extends MozXULElement {
    connectedCallback() {
      const input = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "input"
      );
      input.classList.add("ruleactionitem", "input-inline");

      this.classList.add("input-container");
      this.appendChild(input);

      updateParentNode(this.closest(".ruleaction"));
    }
  }

  class MozRuleactiontargetFolder extends MozXULElement {
    connectedCallback() {
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menulist class="ruleactionitem
                    folderMenuItem"
                    flex="1"
                    displayformat="verbose">
            <menupopup is="folder-menupopup"
                       mode="filing"
                       class="menulist-menupopup"
                       showRecent="true"
                       recentLabel="&recentFolders.label;"
                       showFileHereLabel="true">
            </menupopup>
          </menulist>
          `,
          ["chrome://messenger/locale/messenger.dtd"]
        )
      );

      this.menulist = this.querySelector("menulist");

      this.menulist.addEventListener("command", event => {
        this.setPicker(event);
      });

      updateParentNode(this.closest(".ruleaction"));

      let folder = this.menulist.value
        ? MailUtils.getOrCreateFolder(this.menulist.value)
        : gFilterList.folder;

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
        movemessage: "ruleactiontarget-folder",
        copymessage: "ruleactiontarget-folder",
        setpriorityto: "ruleactiontarget-priority",
        setjunkscore: "ruleactiontarget-junkscore",
        forwardmessage: "ruleactiontarget-forwardto",
        replytomessage: "ruleactiontarget-replyto",
        addtagtomessage: "ruleactiontarget-tag",
      };
      const elementName = elementMapping[type];

      return elementName ? document.createXULElement(elementName) : null;
    }

    _updateAttributes() {
      if (!this.hasAttribute("type")) {
        return;
      }

      const type = this.getAttribute("type");

      while (this.lastChild) {
        this.lastChild.remove();
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
  customElements.define(
    "ruleactiontarget-priority",
    MozRuleactiontargetPriority
  );
  customElements.define(
    "ruleactiontarget-junkscore",
    MozRuleactiontargetJunkscore
  );
  customElements.define("ruleactiontarget-replyto", MozRuleactiontargetReplyto);
  customElements.define(
    "ruleactiontarget-forwardto",
    MozRuleactiontargetForwardto
  );
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
      this.validityManager = Cc[
        "@mozilla.org/mail/search/validityManager;1"
      ].getService(Ci.nsIMsgSearchValidityManager);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.menulist = document.createXULElement("menulist");
      this.menulist.classList.add("search-menulist");
      this.menulist.addEventListener("command", this.onSelect.bind(this));
      this.menupopup = document.createXULElement("menupopup");
      this.menupopup.classList.add("search-menulist-popup");
      this.menulist.appendChild(this.menupopup);
      this.appendChild(this.menulist);
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
        return;
      }
      this.internalScope = val;
      this.refreshList();
      if (this.targets) {
        this.targets.forEach(target => {
          customElements.upgrade(target);
          target.searchScope = val;
        });
      }
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

      return targetIds
        .map(id => document.getElementById(id))
        .filter(e => e != null);
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

      return optargetIds
        .map(id => document.getElementById(id))
        .filter(e => e != null);
    }

    set value(val) {
      if (this.internalValue == val) {
        return;
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
      if (this.value == -1) {
        // -1 means not initialized
        return null;
      }
      let isCustom = isNaN(this.value);
      let typedValue = isCustom ? this.value : parseInt(this.value);
      // custom attribute to style the unavailable menulist item
      this.menulist.setAttribute(
        "unavailable",
        !this.valueIds.includes(typedValue) ? "true" : null
      );
      // add a hidden menulist item if value is missing
      let menuitem = this.menulist.querySelector(`[value="${this.value}"]`);
      if (!menuitem) {
        // need to add a hidden menuitem
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
          const menuitem = document.createXULElement("menuitem");
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
        const separator = document.createXULElement("menuseparator");
        popup.appendChild(separator);
        const menuitem = document.createXULElement("menuitem");
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
          "chrome://messenger/content/CustomHeaders.xhtml",
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
        let menuitem = null;
        if (args.selectedVal) {
          menuitem = this.menulist.querySelector(
            `[label="${args.selectedVal}"]`
          );
        }
        if (menuitem) {
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

      this.stringBundle = Services.strings.createBundle(
        "chrome://messenger/locale/search-attributes.properties"
      );
    }

    connectedCallback() {
      super.connectedCallback();

      initializeTermFromId(this.id);
    }

    get valueLabel() {
      if (isNaN(this.value)) {
        // is this a custom term?
        let customTerm = MailServices.filters.getCustomTerm(this.value);
        if (customTerm) {
          return customTerm.name;
        }
        // The custom term may be missing after the extension that added it
        // was disabled or removed. We need to notify the user.
        let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
          Ci.nsIScriptError
        );
        scriptError.init(
          "Missing custom search term " + this.value,
          null,
          null,
          0,
          0,
          Ci.nsIScriptError.errorFlag,
          "component javascript"
        );
        Services.console.logMessage(scriptError);
        return this.stringBundle.GetStringFromName("MissingCustomTerm");
      }
      return this.stringBundle.GetStringFromName(
        this.validityManager.getAttributeProperty(parseInt(this.value))
      );
    }

    get valueIds() {
      let result = this.validityTable.getAvailableAttributes();
      // add any available custom search terms
      for (let customTerm of MailServices.filters.getCustomTerms()) {
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
      } catch (ex) {}
      let j = 0;
      for (let i = 0; i < ids.length; i++) {
        if (isNaN(ids[i])) {
          // Is this a custom search term?
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
            this.validityManager.getAttributeProperty(ids[i])
          );
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

      this.stringBundle = Services.strings.createBundle(
        "chrome://messenger/locale/search-operators.properties"
      );
    }

    connectedCallback() {
      super.connectedCallback();

      this.searchAttribute = Ci.nsMsgSearchAttrib.Default;
    }

    get valueLabel() {
      return this.stringBundle.GetStringFromName(this.value);
    }

    get valueIds() {
      let isCustom = isNaN(this.searchAttribute);
      if (isCustom) {
        let customTerm = MailServices.filters.getCustomTerm(
          this.searchAttribute
        );
        if (customTerm) {
          return customTerm.getAvailableOperators(this.searchScope);
        }
        return [Ci.nsMsgSearchOp.Contains];
      }
      return this.validityTable.getAvailableOperators(this.searchAttribute);
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
      if (
        this.searchAttribute == val &&
        val != Ci.nsMsgSearchAttrib.OtherHeader
      ) {
        return;
      }
      this.searchAttribute = val;
      this.refreshList(true); // don't restore the selection, since searchvalue nulls it
      if (val == Ci.nsMsgSearchAttrib.AgeInDays) {
        // We want "Age in Days" to default to "is less than".
        this.value = Ci.nsMsgSearchOp.IsLessThan;
      }
    }

    get parentValue() {
      return this.searchAttribute;
    }
  }
  customElements.define("search-operator", MozSearchOperator);

  /**
   * MozSearchValue is a widget that allows selecting the value to search or filter on. It can be a
   * text entry, priority, status, junk status, tags, hasAttachment status, and addressbook etc.
   *
   * @extends MozXULElement
   */
  class MozSearchValue extends MozXULElement {
    static get observedAttributes() {
      return ["disabled"];
    }

    constructor() {
      super();

      this.addEventListener("keypress", event => {
        if (event.keyCode != KeyEvent.DOM_VK_RETURN) {
          return;
        }
        onEnterInSearchTerm(event);
      });

      this.internalOperator = null;
      this.internalAttribute = null;
      this.internalValue = null;
    }

    /**
     * Show the child matching the given index.
     *
     * @param {integer} index - Child index. Use -1 to not show any child.
     */
    showChildAt(index) {
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].hidden = i != index;
      }
    }

    /**
     * Find the child that is currently shown.
     *
     * @return {Node} the currently shown child node.
     */
    findActiveItem() {
      for (let i = 0; i < this.children.length; i++) {
        if (!this.children[i].hidden) {
          return this.children[i];
        }
      }
      return null;
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.classList.add("input-container");

      // Append all the possible widgets. These will then be shown and
      // hidden based on child index.
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <html:input class="input-inline search-value-textbox"
                      inherits="disabled" />
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup">
              <menuitem value="6"
                        stringTag="priorityHighest"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="5"
                        stringTag="priorityHigh"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="4"
                        stringTag="priorityNormal"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="3"
                        stringTag="priorityLow"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="2"
                        stringTag="priorityLowest"
                        class="search-value-menuitem"></menuitem>
            </menupopup>
          </menulist>
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup">
              <menuitem value="2"
                        stringTag="replied"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="1"
                        stringTag="read"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="65536"
                        stringTag="new"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="4096"
                        stringTag="forwarded"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="4"
                        stringTag="flagged"
                        class="search-value-menuitem"></menuitem>
            </menupopup>
          </menulist>
          <html:input class="input-inline search-value-textbox"
                      inherits="disabled" />
          <menulist is="menulist-addrbooks"
                    class="search-value-menulist"
                    inherits="disabled"
                    localonly="true"/>
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup"></menupopup>
          </menulist>
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup">
              <menuitem value="2"
                        stringTag="junk"
                        class="search-value-menuitem"></menuitem>
            </menupopup>
          </menulist>
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup">
              <menuitem value="0"
                        stringTag="hasAttachments"
                        class="search-value-menuitem"></menuitem>
            </menupopup>
          </menulist>
          <menulist class="search-value-menulist"
                    inherits="disabled">
            <menupopup class="search-value-popup">
              <menuitem value="plugin"
                        stringTag="junkScoreOriginPlugin"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="user"
                        stringTag="junkScoreOriginUser"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="filter"
                        stringTag="junkScoreOriginFilter"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="whitelist"
                        stringTag="junkScoreOriginWhitelist"
                        class="search-value-menuitem"></menuitem>
              <menuitem value="imapflag"
                        stringTag="junkScoreOriginImapFlag"
                        class="search-value-menuitem"></menuitem>
            </menupopup>
          </menulist>
          <html:input type="number"
                      class="input-inline search-value-textbox"
                      inherits="disabled" />
          <hbox flex="1"
                class="search-value-custom"
                inherits="disabled"></hbox>
        `)
      );
      this.showChildAt(-1);

      // Initialize strings.
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );

      // Initialize the priority picker.
      this.fillStringsForChildren(
        this.children[1].querySelector("menupopup"),
        bundle
      );

      // Initialize the status picker.
      this.fillStringsForChildren(
        this.children[2].querySelector("menupopup"),
        bundle
      );

      // initialize the address book picker
      this.fillStringsForChildren(
        this.children[4].querySelector("menupopup"),
        bundle
      );

      // initialize the junk status picker
      this.fillStringsForChildren(
        this.children[6].querySelector("menupopup"),
        bundle
      );

      // initialize the has attachment status picker
      this.fillStringsForChildren(
        this.children[7].querySelector("menupopup"),
        bundle
      );

      // initialize the junk score origin picker
      this.fillStringsForChildren(
        this.children[8].querySelector("menupopup"),
        bundle
      );

      // Initialize the date picker.
      const datePicker = this.children[3];
      const searchAttribute = this.searchAttribute;
      const time =
        searchAttribute == Ci.nsMsgSearchAttrib.Date
          ? datePicker.value
          : new Date();

      // The search-value widget has two textboxes one for text, one as a placeholder for a
      // date/calendar widget.
      datePicker.setAttribute("value", convertDateToString(time));

      // initialize the tag list
      this.fillInTags();

      this._updateAttributes();
    }

    attributeChangedCallback() {
      if (!this.isConnectedAndReady) {
        return;
      }

      this._updateAttributes();
    }

    _updateAttributes() {
      this.querySelectorAll("[inherits='disabled']").forEach(elem => {
        if (this.hasAttribute("disabled")) {
          elem.setAttribute("disabled", this.getAttribute("disabled"));
        } else {
          elem.removeAttribute("disabled");
        }
      });
    }

    set opParentValue(val) {
      // Noop if we're not changing it.
      if (this.internalOperator == val) {
        return;
      }

      // Keywords has the null field IsEmpty.
      if (this.searchAttribute == Ci.nsMsgSearchAttrib.Keywords) {
        if (
          val == Ci.nsMsgSearchOp.IsEmpty ||
          val == Ci.nsMsgSearchOp.IsntEmpty
        ) {
          this.showChildAt(-1);
        } else {
          this.showChildAt(5);
        }
      }

      // JunkStatus has the null field IsEmpty.
      if (this.searchAttribute == Ci.nsMsgSearchAttrib.JunkStatus) {
        if (
          val == Ci.nsMsgSearchOp.IsEmpty ||
          val == Ci.nsMsgSearchOp.IsntEmpty
        ) {
          this.showChildAt(-1);
        } else {
          this.showChildAt(6);
        }
      }

      // If it's not sender, to, cc, alladdresses, or to or cc, we don't care.
      if (
        this.searchAttribute != Ci.nsMsgSearchAttrib.Sender &&
        this.searchAttribute != Ci.nsMsgSearchAttrib.To &&
        this.searchAttribute != Ci.nsMsgSearchAttrib.ToOrCC &&
        this.searchAttribute != Ci.nsMsgSearchAttrib.AllAddresses &&
        this.searchAttribute != Ci.nsMsgSearchAttrib.CC
      ) {
        this.internalOperator = val;
        return;
      }

      const children = this.children;
      if (val == Ci.nsMsgSearchOp.IsntInAB || val == Ci.nsMsgSearchOp.IsInAB) {
        // If the old internalOperator was IsntInAB or IsInAB, and the new internalOperator is
        // IsntInAB or IsInAB, noop because the search value was an ab type, and it still is.
        // Otherwise, switch to the ab picker and select the PAB.
        if (
          this.internalOperator != Ci.nsMsgSearchOp.IsntInAB &&
          this.internalOperator != Ci.nsMsgSearchOp.IsInAB
        ) {
          const abs = children[4].querySelector(
            `[value="moz-abmdbdirectory://abook.mab"], [value="jsaddrbook://abook.sqlite"]`
          );
          if (abs) {
            children[4].selectedItem = abs;
          }
          this.showChildAt(4);
        }
      } else if (
        this.internalOperator == Ci.nsMsgSearchOp.IsntInAB ||
        this.internalOperator == Ci.nsMsgSearchOp.IsInAB
      ) {
        // If the old internalOperator wasn't IsntInAB or IsInAB, and the new internalOperator isn't
        // IsntInAB or IsInAB, noop because the search value wasn't an ab type, and it still isn't.
        // Otherwise, switch to the textbox and clear it
        children[0].value = "";
        this.showChildAt(0);
      }

      this.internalOperator = val;
    }

    get opParentValue() {
      return this.internalOperator;
    }

    set parentValue(val) {
      this.searchAttribute = val;
    }

    get parentValue() {
      return this.searchAttribute;
    }

    set searchAttribute(val) {
      // noop if we're not changing it.
      if (this.internalAttribute == val) {
        return;
      }
      this.internalAttribute = val;

      // If the searchAttribute changing, null out the internalOperator.
      this.internalOperator = null;

      // Use the index to hide/show the appropriate child.
      if (isNaN(val)) {
        // Is this a custom attribute?
        this.showChildAt(10);
        let customHbox = this.children[10];
        if (this.internalValue) {
          customHbox.setAttribute("value", this.internalValue.str);
        }
        // the searchAttribute attribute is intended as a selector in
        // CSS for custom search terms to bind a custom value
        customHbox.setAttribute("searchAttribute", val);
      } else if (val == Ci.nsMsgSearchAttrib.Priority) {
        this.showChildAt(1);
      } else if (val == Ci.nsMsgSearchAttrib.MsgStatus) {
        this.showChildAt(2);
      } else if (val == Ci.nsMsgSearchAttrib.Date) {
        this.showChildAt(3);
      } else if (val == Ci.nsMsgSearchAttrib.Sender) {
        // Since the internalOperator is null, this is the same as the initial state.
        // The initial state for Sender isn't an ab type search, it's a text search,
        // so show the textbox.
        this.showChildAt(0);
      } else if (val == Ci.nsMsgSearchAttrib.Keywords) {
        this.showChildAt(5);
      } else if (val == Ci.nsMsgSearchAttrib.JunkStatus) {
        this.showChildAt(6);
      } else if (val == Ci.nsMsgSearchAttrib.HasAttachmentStatus) {
        this.showChildAt(7);
      } else if (val == Ci.nsMsgSearchAttrib.JunkScoreOrigin) {
        this.showChildAt(8);
      } else if (val == Ci.nsMsgSearchAttrib.AgeInDays) {
        let valueBox = this.children[9];
        valueBox.min = -40000; // ~-100 years
        valueBox.max = 40000; // ~100 years
        this.showChildAt(9);
      } else if (val == Ci.nsMsgSearchAttrib.Size) {
        let valueBox = this.children[9];
        valueBox.min = 0;
        valueBox.max = 1000000000;
        this.showChildAt(9);
      } else if (val == Ci.nsMsgSearchAttrib.JunkPercent) {
        let valueBox = this.children[9];
        valueBox.min = 0;
        valueBox.max = 100;
        this.showChildAt(9);
      } else {
        // a normal text field
        this.showChildAt(0);
      }
    }

    get searchAttribute() {
      return this.internalAttribute;
    }

    set value(val) {
      // val is a nsIMsgSearchValue object
      this.internalValue = val;
      const attrib = this.internalAttribute;
      const children = this.children;
      this.searchAttribute = attrib;
      if (isNaN(attrib)) {
        // a custom term
        let customHbox = this.children[10];
        customHbox.setAttribute("value", val.str);
        return;
      }
      if (attrib == Ci.nsMsgSearchAttrib.Priority) {
        const matchingPriority = children[1].querySelector(
          `[value="${val.priority}"]`
        );
        if (matchingPriority) {
          children[1].selectedItem = matchingPriority;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.MsgStatus) {
        const matchingStatus = children[2].querySelector(
          `[value="${val.status}"]`
        );
        if (matchingStatus) {
          children[2].selectedItem = matchingStatus;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.AgeInDays) {
        children[9].value = val.age;
      } else if (attrib == Ci.nsMsgSearchAttrib.Date) {
        children[3].value = convertPRTimeToString(val.date);
      } else if (
        attrib == Ci.nsMsgSearchAttrib.Sender ||
        attrib == Ci.nsMsgSearchAttrib.To ||
        attrib == Ci.nsMsgSearchAttrib.CC ||
        attrib == Ci.nsMsgSearchAttrib.AllAddresses ||
        attrib == Ci.nsMsgSearchAttrib.ToOrCC
      ) {
        if (
          this.internalOperator == Ci.nsMsgSearchOp.IsntInAB ||
          this.internalOperator == Ci.nsMsgSearchOp.IsInAB
        ) {
          const abs = children[4].querySelector(`[value="${val.str}"]`);
          if (abs) {
            children[4].selectedItem = abs;
          }
        } else {
          children[0].value = val.str;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.Keywords) {
        const keywordVal = children[5].querySelector(`[value="${val.str}"]`);
        if (keywordVal) {
          children[5].value = val.str;
          children[5].selectedItem = keywordVal;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.JunkStatus) {
        const junkStatus = children[6].querySelector(
          `[value="${val.junkStatus}"]`
        );
        if (junkStatus) {
          children[6].selectedItem = junkStatus;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.HasAttachmentStatus) {
        const hasAttachmentStatus = children[7].querySelector(
          `[value="${val.hasAttachmentStatus}"]`
        );
        if (hasAttachmentStatus) {
          children[7].selectedItem = hasAttachmentStatus;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.JunkScoreOrigin) {
        const junkScoreOrigin = children[8].querySelector(
          `[value="${val.str}"]`
        );
        if (junkScoreOrigin) {
          children[8].selectedItem = junkScoreOrigin;
        }
      } else if (attrib == Ci.nsMsgSearchAttrib.JunkPercent) {
        children[9].value = val.junkPercent;
      } else if (attrib == Ci.nsMsgSearchAttrib.Size) {
        children[9].value = val.size;
      } else {
        children[0].value = val.str;
      }
    }

    get value() {
      return this.internalValue;
    }

    save() {
      const searchValue = this.value;
      const searchAttribute = this.searchAttribute;
      const children = this.children;

      searchValue.attrib = searchAttribute;
      if (searchAttribute == Ci.nsMsgSearchAttrib.Priority) {
        searchValue.priority = children[1].selectedItem.value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.MsgStatus) {
        searchValue.status = children[2].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.AgeInDays) {
        searchValue.age = children[9].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.Date) {
        searchValue.date = convertStringToPRTime(children[3].value);
      } else if (
        searchAttribute == Ci.nsMsgSearchAttrib.Sender ||
        searchAttribute == Ci.nsMsgSearchAttrib.To ||
        searchAttribute == Ci.nsMsgSearchAttrib.CC ||
        searchAttribute == Ci.nsMsgSearchAttrib.AllAddresses ||
        searchAttribute == Ci.nsMsgSearchAttrib.ToOrCC
      ) {
        if (
          this.internalOperator == Ci.nsMsgSearchOp.IsntInAB ||
          this.internalOperator == Ci.nsMsgSearchOp.IsInAB
        ) {
          searchValue.str = children[4].selectedItem.value;
        } else {
          searchValue.str = children[0].value;
        }
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.Keywords) {
        searchValue.str = children[5].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.JunkStatus) {
        searchValue.junkStatus = children[6].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.JunkPercent) {
        searchValue.junkPercent = children[9].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.Size) {
        searchValue.size = children[9].value;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.HasAttachmentStatus) {
        searchValue.status = Ci.nsMsgMessageFlags.Attachment;
      } else if (searchAttribute == Ci.nsMsgSearchAttrib.JunkScoreOrigin) {
        searchValue.str = children[8].value;
      } else if (isNaN(searchAttribute)) {
        // a custom term
        searchValue.attrib = Ci.nsMsgSearchAttrib.Custom;
        searchValue.str = children[10].getAttribute("value");
      } else {
        searchValue.str = children[0].value;
      }
    }

    saveTo(searchValue) {
      this.internalValue = searchValue;
      this.save();
    }

    fillInTags() {
      let menulist = this.children[5];
      // Force initialization of the menulist custom element first.
      customElements.upgrade(menulist);
      let tagArray = MailServices.tags.getAllTags();
      for (let i = 0; i < tagArray.length; i++) {
        const taginfo = tagArray[i];
        const newMenuItem = menulist.appendItem(taginfo.tag, taginfo.key);
        if (i == 0) {
          menulist.selectedItem = newMenuItem;
        }
      }
    }

    fillStringsForChildren(parentNode, bundle) {
      for (let node of parentNode.children) {
        const stringTag = node.getAttribute("stringTag");
        if (stringTag) {
          const attr = node.tagName == "label" ? "value" : "label";
          node.setAttribute(attr, bundle.GetStringFromName(stringTag));
        }
      }

      // Force initialization of the menulist custom element.
      customElements.upgrade(parentNode);
    }
  }
  customElements.define("search-value", MozSearchValue);

  // The menulist CE is defined lazily. Create one now to get menulist defined,
  // allowing us to inherit from it.
  if (!customElements.get("menulist")) {
    delete document.createXULElement("menulist");
  }
  {
    /**
     * The MozRuleactiontypeMenulist is a widget that allows selecting the actions from the given menulist for
     * the selected folder. It gets displayed in the message filter dialog box.
     *
     * @extends {MozMenuList}
     */
    class MozRuleactiontypeMenulist extends customElements.get("menulist") {
      connectedCallback() {
        super.connectedCallback();
        if (this.delayConnectedCallback() || this.hasConnected) {
          return;
        }
        this.hasConnected = true;

        this.setAttribute("is", "ruleactiontype-menulist");
        this.addEventListener("command", event => {
          this.parentNode.setAttribute("value", this.value);
          checkActionsReorder();
        });

        this.addEventListener("popupshowing", event => {
          let unavailableActions = this.usedActionsList();
          for (let index = 0; index < this.menuitems.length; index++) {
            let menu = this.menuitems[index];
            menu.setAttribute("disabled", menu.value in unavailableActions);
          }
        });

        this.menuitems = this.getElementsByTagNameNS(
          this.namespaceURI,
          "menuitem"
        );

        // Force initialization of the menulist custom element first.
        customElements.upgrade(this);
        this.addCustomActions();
        this.hideInvalidActions();
        // Differentiate between creating a new, next available action,
        // and creating a row which will be initialized with an action.
        if (!this.parentNode.hasAttribute("initialActionIndex")) {
          let unavailableActions = this.usedActionsList();
          // Select the first one that's not in the list.
          for (let index = 0; index < this.menuitems.length; index++) {
            let menu = this.menuitems[index];
            if (!(menu.value in unavailableActions) && !menu.hidden) {
              this.value = menu.value;
              this.parentNode.setAttribute("value", menu.value);
              break;
            }
          }
        } else {
          this.parentNode.mActionTypeInitialized = true;
          this.parentNode.clearInitialActionIndex();
        }
      }

      hideInvalidActions() {
        let menupopup = this.menupopup;
        let scope = getScopeFromFilterList(gFilterList);

        // Walk through the list of filter actions and hide any actions which aren't valid
        // for our given scope (news, imap, pop, etc) and context.
        let elements;

        // Disable / enable all elements in the "filteractionlist"
        // based on the scope and the "enablefornews" attribute.
        elements = menupopup.getElementsByAttribute("enablefornews", "true");
        for (let i = 0; i < elements.length; i++) {
          elements[i].hidden = scope != Ci.nsMsgSearchScope.newsFilter;
        }

        elements = menupopup.getElementsByAttribute("enablefornews", "false");
        for (let i = 0; i < elements.length; i++) {
          elements[i].hidden = scope == Ci.nsMsgSearchScope.newsFilter;
        }

        elements = menupopup.getElementsByAttribute("enableforpop3", "true");
        for (let i = 0; i < elements.length; i++) {
          elements[i].hidden = !(
            gFilterList.folder.server.type == "pop3" ||
            gFilterList.folder.server.type == "none"
          );
        }

        elements = menupopup.getElementsByAttribute("isCustom", "true");
        // Note there might be an additional element here as a placeholder
        // for a missing action, so we iterate over the known actions
        // instead of the elements.
        for (let i = 0; i < gCustomActions.length; i++) {
          elements[i].hidden = !gCustomActions[i].isValidForType(
            gFilterType,
            scope
          );
        }

        // Disable "Reply with Template" if there are no templates.
        if (this.findTemplates().length == 0) {
          elements = menupopup.getElementsByAttribute(
            "value",
            "replytomessage"
          );
          if (elements.length == 1) {
            elements[0].hidden = true;
          }
        }
      }

      addCustomActions() {
        let menupopup = this.menupopup;
        for (let i = 0; i < gCustomActions.length; i++) {
          let customAction = gCustomActions[i];
          let menuitem = document.createXULElement("menuitem");
          menuitem.setAttribute("label", customAction.name);
          menuitem.setAttribute("value", customAction.id);
          menuitem.setAttribute("isCustom", "true");
          menupopup.appendChild(menuitem);
        }
      }

      /**
       * Returns a hash containing all of the filter actions which are currently
       * being used by other filteractionrows.
       *
       * @return {Object} - a hash containing all of the filter actions which are
       *                    currently being used by other filteractionrows.
       */
      usedActionsList() {
        let usedActions = {};
        let currentFilterActionRow = this.parentNode;
        let listBox = currentFilterActionRow.parentNode; // need to account for the list item.
        // Now iterate over each list item in the list box.
        for (let index = 0; index < listBox.getRowCount(); index++) {
          let filterActionRow = listBox.getItemAtIndex(index);
          if (filterActionRow != currentFilterActionRow) {
            let actionValue = filterActionRow.getAttribute("value");

            // Let custom actions decide if dups are allowed.
            let isCustom = false;
            for (let i = 0; i < gCustomActions.length; i++) {
              if (gCustomActions[i].id == actionValue) {
                isCustom = true;
                if (!gCustomActions[i].allowDuplicates) {
                  usedActions[actionValue] = true;
                }
                break;
              }
            }

            if (!isCustom) {
              // The following actions can appear more than once in a single filter
              // so do not set them as already used.
              if (
                actionValue != "addtagtomessage" &&
                actionValue != "forwardmessage" &&
                actionValue != "copymessage"
              ) {
                usedActions[actionValue] = true;
              }
              // If either Delete message or Move message exists, disable the other one.
              // It does not make sense to apply both to the same message.
              if (actionValue == "deletemessage") {
                usedActions.movemessage = true;
              } else if (actionValue == "movemessage") {
                usedActions.deletemessage = true;
              } else if (actionValue == "markasread") {
                // The same with Mark as read/Mark as Unread.
                usedActions.markasunread = true;
              } else if (actionValue == "markasunread") {
                usedActions.markasread = true;
              }
            }
          }
        }
        return usedActions;
      }

      /**
       * Check if there exist any templates in this account.
       * @return {Object[]} - An array of template headers: each has a label and
       *                      a value.
       */
      findTemplates() {
        let identities = MailServices.accounts.getIdentitiesForServer(
          gFilterList.folder.server
        );
        // Typically if this is Local Folders.
        if (identities.length == 0) {
          if (MailServices.accounts.defaultAccount) {
            identities.push(
              MailServices.accounts.defaultAccount.defaultIdentity
            );
          }
        }

        let templates = [];
        let foldersScanned = [];

        for (let identity of identities) {
          let enumerator = null;
          let msgFolder = MailUtils.getExistingFolder(
            identity.stationeryFolder
          );
          // If we already processed this folder, do not set enumerator
          // so that we skip this identity.
          if (msgFolder && !foldersScanned.includes(msgFolder)) {
            foldersScanned.push(msgFolder);
            enumerator = msgFolder.msgDatabase.EnumerateMessages();
          }

          if (!enumerator) {
            continue;
          }

          for (let header of enumerator) {
            let uri =
              msgFolder.URI +
              "?messageId=" +
              header.messageId +
              "&subject=" +
              header.mime2DecodedSubject;
            templates.push({ label: header.mime2DecodedSubject, value: uri });
          }
        }
        return templates;
      }
    }

    customElements.define(
      "ruleactiontype-menulist",
      MozRuleactiontypeMenulist,
      { extends: "menulist" }
    );
  }

  /**
   * The MozRuleactionRichlistitem is a widget which gives the options to filter
   * the messages with following elements: ruleactiontype-menulist, ruleactiontarget-wrapper
   * and button to add or remove the MozRuleactionRichlistitem. It gets added in the
   * filterActionList richlistbox in the Filter Editor dialog.
   *
   * @extends {MozElements.MozRichlistitem}
   */
  class MozRuleactionRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return { ".ruleactiontarget": "type=value" };
    }

    constructor() {
      super();

      this.mActionTypeInitialized = false;
      this.mRuleActionTargetInitialized = false;
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.setAttribute("is", "ruleaction-richlistitem");
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menulist is="ruleactiontype-menulist" flex="&filterActionTypeFlexValue;">
            <menupopup>
              <menuitem label="&moveMessage.label;"
                        value="movemessage"
                        enablefornews="false"></menuitem>
              <menuitem label="&copyMessage.label;"
                        value="copymessage"></menuitem>
              <menuseparator enablefornews="false"></menuseparator>
              <menuitem label="&forwardTo.label;"
                        value="forwardmessage"
                        enablefornews="false"></menuitem>
              <menuitem label="&replyWithTemplate.label;"
                        value="replytomessage"
                        enablefornews="false"></menuitem>
              <menuseparator></menuseparator>
              <menuitem label="&markMessageRead.label;"
                        value="markasread"></menuitem>
              <menuitem label="&markMessageUnread.label;"
                        value="markasunread"></menuitem>
              <menuitem label="&markMessageStarred.label;"
                        value="markasflagged"></menuitem>
              <menuitem label="&setPriority.label;"
                        value="setpriorityto"></menuitem>
              <menuitem label="&addTag.label;"
                        value="addtagtomessage"></menuitem>
              <menuitem label="&setJunkScore.label;"
                        value="setjunkscore"
                        enablefornews="false"></menuitem>
              <menuseparator enableforpop3="true"></menuseparator>
              <menuitem label="&deleteMessage.label;"
                        value="deletemessage"></menuitem>
              <menuitem label="&deleteFromPOP.label;"
                        value="deletefrompopserver"
                        enableforpop3="true"></menuitem>
              <menuitem label="&fetchFromPOP.label;"
                        value="fetchfrompopserver"
                        enableforpop3="true"></menuitem>
              <menuseparator></menuseparator>
              <menuitem label="&ignoreThread.label;"
                        value="ignorethread"></menuitem>
              <menuitem label="&ignoreSubthread.label;"
                        value="ignoresubthread"></menuitem>
              <menuitem label="&watchThread.label;"
                        value="watchthread"></menuitem>
              <menuseparator></menuseparator>
              <menuitem label="&stopExecution.label;"
                        value="stopexecution"></menuitem>
            </menupopup>
          </menulist>
          <ruleactiontarget-wrapper class="ruleactiontarget"
                                    flex="&filterActionTargetFlexValue;"></ruleactiontarget-wrapper>
          <hbox>
            <button class="small-button"
                    label="+"
                    tooltiptext="&addAction.tooltip;"
                    oncommand="this.parentNode.parentNode.addRow();"></button>
            <button class="small-button remove-small-button"
                    label="−"
                    tooltiptext="&removeAction.tooltip;"
                    oncommand="this.parentNode.parentNode.removeRow();"></button>
          </hbox>
          `,
          [
            "chrome://messenger/locale/messenger.dtd",
            "chrome://messenger/locale/FilterEditor.dtd",
          ]
        )
      );

      this.mRuleActionType = this.querySelector("menulist");
      this.mRemoveButton = this.querySelector(".remove-small-button");
      this.mListBox = this.parentNode;
      this.initializeAttributeInheritance();
    }

    set selected(val) {
      // This provides a dummy selected property that the richlistbox expects to
      // be able to call. See bug 202036.
    }

    get selected() {
      return false;
    }

    _fireEvent(aName) {
      // This provides a dummy _fireEvent function that the richlistbox expects to
      // be able to call. See bug 202036.
    }

    /**
     * We should only remove the initialActionIndex after we have been told that
     * both the rule action type and the rule action target have both been built
     * since they both need this piece of information. This complication arises
     * because both of these child elements are getting bound asynchronously
     * after the search row has been constructed.
     */
    clearInitialActionIndex() {
      if (this.mActionTypeInitialized && this.mRuleActionTargetInitialized) {
        this.removeAttribute("initialActionIndex");
      }
    }

    initWithAction(aFilterAction) {
      let filterActionStr;
      let actionTarget = this.children[1];
      let actionItem = actionTarget.ruleactiontargetElement;
      let nsMsgFilterAction = Ci.nsMsgFilterAction;
      switch (aFilterAction.type) {
        case nsMsgFilterAction.Custom:
          filterActionStr = aFilterAction.customId;
          if (actionItem) {
            actionItem.children[0].value = aFilterAction.strValue;
          }

          // Make sure the custom action has been added. If not, it
          // probably was from an extension that has been removed. We'll
          // show a dummy menuitem to warn the user.
          let needCustomLabel = true;
          for (let i = 0; i < gCustomActions.length; i++) {
            if (gCustomActions[i].id == filterActionStr) {
              needCustomLabel = false;
              break;
            }
          }
          if (needCustomLabel) {
            let menuitem = document.createXULElement("menuitem");
            menuitem.setAttribute(
              "label",
              gFilterBundle.getString("filterMissingCustomAction")
            );
            menuitem.setAttribute("value", filterActionStr);
            menuitem.disabled = true;
            this.mRuleActionType.menupopup.appendChild(menuitem);
            let scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
              Ci.nsIScriptError
            );
            scriptError.init(
              "Missing custom action " + filterActionStr,
              null,
              null,
              0,
              0,
              Ci.nsIScriptError.errorFlag,
              "component javascript"
            );
            Services.console.logMessage(scriptError);
          }
          break;
        case nsMsgFilterAction.MoveToFolder:
        case nsMsgFilterAction.CopyToFolder:
          actionItem.children[0].value = aFilterAction.targetFolderUri;
          break;
        case nsMsgFilterAction.Reply:
        case nsMsgFilterAction.Forward:
          actionItem.children[0].value = aFilterAction.strValue;
          break;
        case nsMsgFilterAction.Label:
          actionItem.children[0].value = aFilterAction.label;
          break;
        case nsMsgFilterAction.ChangePriority:
          actionItem.children[0].value = aFilterAction.priority;
          break;
        case nsMsgFilterAction.JunkScore:
          actionItem.children[0].value = aFilterAction.junkScore;
          break;
        case nsMsgFilterAction.AddTag:
          actionItem.children[0].value = aFilterAction.strValue;
          break;
        default:
          break;
      }
      if (aFilterAction.type != nsMsgFilterAction.Custom) {
        filterActionStr = gFilterActionStrings[aFilterAction.type];
      }
      this.mRuleActionType.value = filterActionStr;
      this.mRuleActionTargetInitialized = true;
      this.clearInitialActionIndex();
      checkActionsReorder();
    }

    /**
     * Function is used to check if the filter is valid or not. This routine
     * also prompts the user.
     *
     * @return {boolean} - true if this row represents a valid filter action.
     */
    validateAction() {
      let filterActionString = this.getAttribute("value");
      let actionTarget = this.children[1];
      let actionTargetLabel =
        actionTarget.ruleactiontargetElement &&
        actionTarget.ruleactiontargetElement.children[0].value;
      let errorString, customError;

      switch (filterActionString) {
        case "movemessage":
        case "copymessage":
          let msgFolder = actionTargetLabel
            ? MailUtils.getOrCreateFolder(actionTargetLabel)
            : null;
          if (!msgFolder || !msgFolder.canFileMessages) {
            errorString = "mustSelectFolder";
          }
          break;
        case "forwardmessage":
          if (
            actionTargetLabel.length < 3 ||
            actionTargetLabel.indexOf("@") < 1
          ) {
            errorString = "enterValidEmailAddress";
          }
          break;
        case "replytomessage":
          if (!actionTarget.ruleactiontargetElement.children[0].selectedItem) {
            errorString = "pickTemplateToReplyWith";
          }
          break;
        default:
          // Locate the correct custom action, and check validity.
          for (let i = 0; i < gCustomActions.length; i++) {
            if (gCustomActions[i].id == filterActionString) {
              customError = gCustomActions[i].validateActionValue(
                actionTargetLabel,
                gFilterList.folder,
                gFilterType
              );
              break;
            }
          }
          break;
      }

      errorString = errorString
        ? gFilterBundle.getString(errorString)
        : customError;
      if (errorString) {
        Services.prompt.alert(window, null, errorString);
      }

      return !errorString;
    }

    /**
     * Create a new filter action, fill it in, and then append it to the filter.
     *
     * @param {Object} aFilter - filter object to save.
     */
    saveToFilter(aFilter) {
      let filterAction = aFilter.createAction();
      let filterActionString = this.getAttribute("value");
      filterAction.type = gFilterActionStrings.indexOf(filterActionString);
      let actionTarget = this.children[1];
      let actionItem = actionTarget.ruleactiontargetElement;
      let nsMsgFilterAction = Ci.nsMsgFilterAction;
      switch (filterAction.type) {
        case nsMsgFilterAction.Label:
          filterAction.label = actionItem.children[0].getAttribute("value");
          break;
        case nsMsgFilterAction.ChangePriority:
          filterAction.priority = actionItem.children[0].getAttribute("value");
          break;
        case nsMsgFilterAction.MoveToFolder:
        case nsMsgFilterAction.CopyToFolder:
          filterAction.targetFolderUri = actionItem.children[0].value;
          break;
        case nsMsgFilterAction.JunkScore:
          filterAction.junkScore = actionItem.children[0].value;
          break;
        case nsMsgFilterAction.Custom:
          filterAction.customId = filterActionString;
        // Fall through to set the value.
        default:
          if (actionItem && actionItem.children.length > 0) {
            filterAction.strValue = actionItem.children[0].value;
          }
          break;
      }
      aFilter.appendAction(filterAction);
    }

    /**
     * If we only have one row of actions, then disable the remove button for that row.
     */
    updateRemoveButton() {
      this.mListBox.getItemAtIndex(0).mRemoveButton.disabled =
        this.mListBox.getRowCount() == 1;
    }

    addRow() {
      let listItem = document.createXULElement("richlistitem", {
        is: "ruleaction-richlistitem",
      });
      listItem.classList.add("ruleaction");
      listItem.setAttribute("onfocus", "this.storeFocus();");
      this.mListBox.insertBefore(listItem, this.nextElementSibling);
      this.mListBox.ensureElementIsVisible(listItem);

      // Make sure the first remove button is enabled.
      this.updateRemoveButton();
      checkActionsReorder();
    }

    removeRow() {
      // this.mListBox will fail after the row is removed, so save a reference.
      let listBox = this.mListBox;
      if (listBox.getRowCount() > 1) {
        this.remove();
      }
      // Can't use 'this' as it is destroyed now.
      listBox.getItemAtIndex(0).updateRemoveButton();
      checkActionsReorder();
    }

    /**
     * When this action row is focused, store its index in the parent richlistbox.
     */
    storeFocus() {
      this.mListBox.setAttribute(
        "focusedAction",
        this.mListBox.getIndexOfItem(this)
      );
    }
  }

  customElements.define("ruleaction-richlistitem", MozRuleactionRichlistitem, {
    extends: "richlistitem",
  });
}

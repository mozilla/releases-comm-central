/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global MozElements MozXULElement */

/* import-globals-from ../../base/content/dateFormat.js */

// Satisfy ESLint by referencing FilterEditor.js as a representative source
// for shared globals (gFilter, gFilterList, etc.) defined by the hosting
// window.
/* import-globals-from FilterEditor.js */

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );
  const { MailUtils } = ChromeUtils.importESModule(
    "resource:///modules/MailUtils.sys.mjs"
  );

  ChromeUtils.defineLazyGetter(
    this,
    "searchWidgetsL10n",
    () =>
      new Localization(
        ["messenger/searchWidgets.ftl", "messenger/filterEditor.ftl"],
        true
      )
  );

  const updateParentNode = parentNode => {
    if (parentNode.hasAttribute("initialActionIndex")) {
      const actionIndex = parentNode.getAttribute("initialActionIndex");
      const filterAction = gFilter.getActionAt(actionIndex);
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

      for (const taginfo of MailServices.tags.getAllTags()) {
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
            <menupopup native="false">
              <menuitem value="6" data-l10n-id="rule-priority-highest"></menuitem>
              <menuitem value="5" data-l10n-id="rule-priority-high"></menuitem>
              <menuitem value="4" data-l10n-id="rule-priority-normal"></menuitem>
              <menuitem value="3" data-l10n-id="rule-priority-low"></menuitem>
              <menuitem value="2" data-l10n-id="rule-priority-lowest"></menuitem>
            </menupopup>
          </menulist>
          `
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
            <menupopup native="false">
              <menuitem value="100" data-l10n-id="rule-menuitem-spam"/>
              <menuitem value="0" data-l10n-id="rule-menuitem-not-spam"/>
            </menupopup>
          </menulist>
          `
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

      const ruleaction = this.closest(".ruleaction");
      const raMenulist = ruleaction.querySelector(
        '[is="ruleactiontype-menulist"]'
      );
      for (const { label, value } of raMenulist.findTemplates()) {
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
      // For the 'Recent Destinations' label.
      document.l10n.addResourceIds(["messenger/messenger.ftl"]);
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
                       showFileHereLabel="true"
                       native="false">
            </menupopup>
          </menulist>
          `
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
   * @augments MozXULElement
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
      this.menulist.toggleAttribute("disabled", this.hasAttribute("disabled"));
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
      const isCustom = isNaN(this.value);
      const typedValue = isCustom ? this.value : parseInt(this.value);
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

    async onSelect() {
      if (this.menulist.value == Ci.nsMsgSearchAttrib.OtherHeader) {
        // Wait for the menupopup to finish closing to have the pointer capture
        // released before opening the modal dialog.
        if (this.menupopup.state != "closed") {
          await new Promise(resolve => {
            this.menupopup.addEventListener("popuphidden", resolve, {
              once: true,
            });
          });
        }

        // Customize menuitem selected.
        const args = {};
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
   * @augments MozSearchMenulistAbstract
   */
  class MozSearchAttribute extends MozSearchMenulistAbstract {
    constructor() {
      super();
    }

    connectedCallback() {
      super.connectedCallback();

      initializeTermFromId(this.id);
    }

    get valueLabel() {
      if (isNaN(this.value)) {
        // is this a custom term?
        const customTerm = MailServices.filters.getCustomTerm(this.value);
        if (customTerm) {
          return customTerm.name;
        }
        // The custom term may be missing after the extension that added it
        // was disabled or removed. We need to notify the user.
        const scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
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
        return searchWidgetsL10n.formatValueSync(
          "search-attrib-missing-custom-term"
        );
      }
      return searchWidgetsL10n.formatValueSync(
        this.validityManager.getAttributeL10nID(parseInt(this.value))
      );
    }

    get valueIds() {
      const result = this.validityTable.getAvailableAttributes();
      // add any available custom search terms
      for (const customTerm of MailServices.filters.getCustomTerms()) {
        // For custom terms, the array element is a string with the custom id
        // instead of the integer attribute
        if (customTerm.getAvailable(this.searchScope, null)) {
          result.push(customTerm.id);
        }
      }
      return result;
    }

    get valueStrings() {
      const strings = [];
      const ids = this.valueIds;
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
          const customTerm = MailServices.filters.getCustomTerm(ids[i]);
          if (customTerm) {
            strings[i] = customTerm.name;
          } else {
            strings[i] = "";
          }
        } else if (ids[i] > Ci.nsMsgSearchAttrib.OtherHeader && hdrsArray) {
          strings[i] = hdrsArray[j++];
        } else {
          strings[i] = searchWidgetsL10n.formatValueSync(
            this.validityManager.getAttributeL10nID(ids[i])
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
   * @augments MozSearchMenulistAbstract
   */
  class MozSearchOperator extends MozSearchMenulistAbstract {
    constructor() {
      super();
    }

    connectedCallback() {
      super.connectedCallback();

      this.searchAttribute = Ci.nsMsgSearchAttrib.Default;
    }

    get valueLabel() {
      return searchWidgetsL10n.formatValueSync(
        this.validityManager.getOperatorL10nID(this.value)
      );
    }

    get valueIds() {
      const isCustom = isNaN(this.searchAttribute);
      if (isCustom) {
        const customTerm = MailServices.filters.getCustomTerm(
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
      const strings = [];
      const ids = this.valueIds;
      for (let i = 0; i < ids.length; i++) {
        strings[i] = searchWidgetsL10n.formatValueSync(
          this.validityManager.getOperatorL10nID(ids[i])
        );
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
   * @augments MozXULElement
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

      this.inputType = "none";
    }

    connectedCallback() {
      this.classList.add("input-container");
      MozXULElement.insertFTLIfNeeded("messenger/searchWidgets.ftl");
    }

    /**
     * Create a menulist to be used as the input.
     *
     * @param {object[]} itemDataList - An ordered list of items to add to the
     *   menulist. Each entry must have a 'value' property to be used as the
     *   item value. If the entry has a 'label' property, it will be used
     *   directly as the item label, otherwise it must identify an ftl string
     *   using the 'l10nID' property.
     *
     * @returns {MozMenuList} - The newly created menulist.
     */
    static _createMenulist(itemDataList) {
      const menulist = document.createXULElement("menulist");
      menulist.classList.add("search-value-menulist");
      const menupopup = document.createXULElement("menupopup");
      menupopup.classList.add("search-value-popup");

      for (const itemData of itemDataList) {
        const item = document.createXULElement("menuitem");
        item.classList.add("search-value-menuitem");
        if (itemData.l10nID) {
          document.l10n.setAttributes(item, itemData.l10nID);
        } else {
          item.label = itemData.label;
        }
        item.value = itemData.value;
        menupopup.appendChild(item);
      }
      menulist.appendChild(menupopup);
      return menulist;
    }

    /**
     * Set the child input. The input will only be changed if the type changes.
     *
     * @param {string} type - The type of input to use.
     * @param {string|number|undefined} value - A value to set on the input, or
     *   leave undefined to not change the value. See setInputValue.
     */
    setInput(type, value) {
      if (type != this.inputType) {
        this.inputType = type;
        this.input?.remove();
        let input;
        switch (type) {
          case "text":
            input = document.createElement("input");
            input.type = "text";
            input.classList.add("input-inline", "search-value-input");
            break;
          case "date":
            input = document.createElement("input");
            input.type = "text";
            input.classList.add("input-inline", "search-value-input");
            if (!value) {
              // Newly created date input shows today's date.
              // value is expected in microseconds since epoch.
              value = Date.now() * 1000;
            }
            break;
          case "size":
            input = document.createElement("input");
            input.type = "number";
            input.min = 0;
            input.max = 1000000000;
            input.classList.add("input-inline", "search-value-input");
            break;
          case "age":
            input = document.createElement("input");
            input.type = "number";
            input.min = -40000; // ~100 years.
            input.max = 40000;
            input.classList.add("input-inline", "search-value-input");
            break;
          case "percent":
            input = document.createElement("input");
            input.type = "number";
            input.min = 0;
            input.max = 100;
            input.classList.add("input-inline", "search-value-input");
            break;
          case "priority":
            input = this.constructor._createMenulist([
              {
                l10nID: "search-val-priority-highest",
                value: Ci.nsMsgPriority.highest,
              },
              {
                l10nID: "search-val-priority-high",
                value: Ci.nsMsgPriority.high,
              },
              {
                l10nID: "search-val-priority-normal",
                value: Ci.nsMsgPriority.normal,
              },
              {
                l10nID: "search-val-priority-low",
                value: Ci.nsMsgPriority.low,
              },
              {
                l10nID: "search-val-priority-lowest",
                value: Ci.nsMsgPriority.lowest,
              },
            ]);
            break;
          case "status":
            input = this.constructor._createMenulist([
              {
                l10nID: "search-val-flag-replied",
                value: Ci.nsMsgMessageFlags.Replied,
              },
              {
                l10nID: "search-val-flag-read",
                value: Ci.nsMsgMessageFlags.Read,
              },
              {
                l10nID: "search-val-flag-new",
                value: Ci.nsMsgMessageFlags.New,
              },
              {
                l10nID: "search-val-flag-forwarded",
                value: Ci.nsMsgMessageFlags.Forwarded,
              },
              {
                l10nID: "search-val-flag-starred",
                value: Ci.nsMsgMessageFlags.Marked,
              },
            ]);
            break;
          case "addressbook":
            input = document.createXULElement("menulist", {
              is: "menulist-addrbooks",
            });
            input.setAttribute("localonly", "true");
            input.classList.add("search-value-menulist");
            if (!value) {
              // Select the personal addressbook by default.
              value = "jsaddrbook://abook.sqlite";
            }
            break;
          case "tags":
            input = this.constructor._createMenulist(
              MailServices.tags.getAllTags().map(taginfo => {
                return { label: taginfo.tag, value: taginfo.key };
              })
            );
            break;
          case "junk-status":
            // "Junk Status is/isn't/is empty/isn't empty 'Junk'".
            input = this.constructor._createMenulist([
              {
                l10nID: "search-val-spam",
                value: Ci.nsIJunkMailPlugin.JUNK,
              },
            ]);
            break;
          case "attachment-status":
            // "Attachment Status is/isn't 'Has Attachments'".
            input = this.constructor._createMenulist([
              {
                l10nID: "search-val-has-attachments",
                value: "0",
              },
            ]);
            break;
          case "junk-origin":
            input = this.constructor._createMenulist([
              {
                l10nID: "search-val-spam-score-origin-plugin",
                value: "plugin",
              },
              {
                l10nID: "search-val-spam-score-origin-user",
                value: "user",
              },
              {
                l10nID: "search-val-spam-score-origin-filter",
                value: "filter",
              },
              {
                l10nID: "search-val-spam-score-origin-allowlist",
                value: "allowlist",
              },
              {
                l10nID: "search-val-spam-score-origin-imap-flag",
                value: "imapflag",
              },
            ]);
            break;
          case "none":
            input = null;
            break;
          case "custom":
            // Used by extensions.
            // FIXME: We need a better way for extensions to set a custom input.
            input = document.createXULElement("hbox");
            input.setAttribute("flex", "1");
            input.classList.add("search-value-custom");
            break;
          default:
            throw new Error(`Unrecognised input type "${type}"`);
        }

        this.input = input;
        if (input) {
          this.appendChild(input);
        }

        this._updateAttributes();
      }

      this.setInputValue(value);
    }

    /**
     * Set the child input to the given value.
     *
     * @param {string|number} value - The value to set on the input. For "date"
     *   inputs, this should be a number of microseconds since the epoch.
     */
    setInputValue(value) {
      if (value === undefined) {
        return;
      }
      switch (this.inputType) {
        case "text":
        case "size":
        case "age":
        case "percent":
          this.input.value = value;
          break;
        case "date":
          this.input.value = convertPRTimeToString(value);
          break;
        case "priority":
        case "status":
        case "addressbook":
        case "tags":
        case "junk-status":
        case "attachment-status":
        case "junk-origin": {
          const item = this.input.querySelector(`menuitem[value="${value}"]`);
          if (item) {
            this.input.selectedItem = item;
          }
          break;
        }
        case "none":
          // Silently ignore the value.
          break;
        case "custom":
          this.input.setAttribute("value", value);
          break;
        default:
          throw new Error(`Unhandled input type "${this.inputType}"`);
      }
    }

    /**
     * Get the child input's value.
     *
     * @returns {string|number} - The value set in the input. For "date"
     *   inputs, this is the number of microseconds since the epoch.
     */
    getInputValue() {
      switch (this.inputType) {
        case "text":
        case "size":
        case "age":
        case "percent":
          return this.input.value;
        case "date":
          return convertStringToPRTime(this.input.value);
        case "priority":
        case "status":
        case "addressbook":
        case "tags":
        case "junk-status":
        case "attachment-status":
        case "junk-origin":
          return this.input.selectedItem.value;
        case "none":
          return "";
        case "custom":
          return this.input.getAttribute("value");
        default:
          throw new Error(`Unhandled input type "${this.inputType}"`);
      }
    }

    /**
     * Get the element's displayed value.
     *
     * @returns {string} - The value seen by the user.
     */
    getReadableValue() {
      switch (this.inputType) {
        case "text":
        case "size":
        case "age":
        case "percent":
        case "date":
          return this.input.value;
        case "priority":
        case "status":
        case "addressbook":
        case "tags":
        case "junk-status":
        case "attachment-status":
        case "junk-origin":
          return this.input.selectedItem.label;
        case "none":
          return "";
        case "custom":
          return this.input.getAttribute("value");
        default:
          throw new Error(`Unhandled input type "${this.inputType}"`);
      }
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    _updateAttributes() {
      if (!this.input) {
        return;
      }
      this.input.toggleAttribute("disabled", this.hasAttribute("disabled"));
    }

    /**
     * Update the displayed input according to the selected sibling attributes
     * and operators.
     *
     * @param {nsIMsgSearchValue} [value] - A value to display in the input. Or
     *   leave unset to not change the value.
     */
    updateDisplay(value) {
      const operator = Number(this.internalOperator);
      switch (Number(this.internalAttribute)) {
        // Use the index to hide/show the appropriate child.
        case Ci.nsMsgSearchAttrib.Priority:
          this.setInput("priority", value?.priority);
          break;
        case Ci.nsMsgSearchAttrib.MsgStatus:
          this.setInput("status", value?.status);
          break;
        case Ci.nsMsgSearchAttrib.Date:
          this.setInput("date", value?.date);
          break;
        case Ci.nsMsgSearchAttrib.Sender:
        case Ci.nsMsgSearchAttrib.To:
        case Ci.nsMsgSearchAttrib.ToOrCC:
        case Ci.nsMsgSearchAttrib.AllAddresses:
        case Ci.nsMsgSearchAttrib.CC:
          if (
            operator == Ci.nsMsgSearchOp.IsntInAB ||
            operator == Ci.nsMsgSearchOp.IsInAB
          ) {
            this.setInput("addressbook", value?.str);
          } else {
            this.setInput("text", value?.str);
          }
          break;
        case Ci.nsMsgSearchAttrib.Keywords:
          this.setInput(
            operator == Ci.nsMsgSearchOp.IsEmpty ||
              operator == Ci.nsMsgSearchOp.IsntEmpty
              ? "none"
              : "tags",
            value?.str
          );
          break;
        case Ci.nsMsgSearchAttrib.JunkStatus:
          this.setInput(
            operator == Ci.nsMsgSearchOp.IsEmpty ||
              operator == Ci.nsMsgSearchOp.IsntEmpty
              ? "none"
              : "junk-status",
            value?.junkStatus
          );
          break;
        case Ci.nsMsgSearchAttrib.HasAttachmentStatus:
          this.setInput("attachment-status", value?.hasAttachmentStatus);
          break;
        case Ci.nsMsgSearchAttrib.JunkScoreOrigin:
          this.setInput("junk-origin", value?.str);
          break;
        case Ci.nsMsgSearchAttrib.AgeInDays:
          this.setInput("age", value?.age);
          break;
        case Ci.nsMsgSearchAttrib.Size:
          this.setInput("size", value?.size);
          break;
        case Ci.nsMsgSearchAttrib.JunkPercent:
          this.setInput("percent", value?.junkPercent);
          break;
        default:
          if (isNaN(this.internalAttribute)) {
            // Custom attribute, the internalAttribute is a string.
            // FIXME: We need a better way for extensions to set a custom input.
            this.setInput("custom", value?.str);
            this.input.setAttribute("searchAttribute", this.internalAttribute);
          } else {
            this.setInput("text", value?.str);
          }
          break;
      }
    }

    /**
     * The sibling operator type.
     *
     * @type {nsMsgSearchOpValue}
     */
    set opParentValue(val) {
      if (this.internalOperator == val) {
        return;
      }
      this.internalOperator = val;
      this.updateDisplay();
    }

    get opParentValue() {
      return this.internalOperator;
    }

    /**
     * A duplicate of the searchAttribute property.
     *
     * @type {nsMsgSearchAttribValue}
     */
    set parentValue(val) {
      this.searchAttribute = val;
    }

    get parentValue() {
      return this.searchAttribute;
    }

    /**
     * The sibling attribute type.
     *
     * @type {nsMsgSearchAttribValue}
     */
    set searchAttribute(val) {
      if (this.internalAttribute == val) {
        return;
      }
      this.internalAttribute = val;
      this.updateDisplay();
    }

    get searchAttribute() {
      return this.internalAttribute;
    }

    /**
     * The stored value for this element.
     *
     * Note that the input value is *derived* from this object when it is set.
     * But changes to the input value using the UI will not change the stored
     * value until the save method is called.
     *
     * @type {nsIMsgSearchValue}
     */
    set value(val) {
      // val is a nsIMsgSearchValue object
      this.internalValue = val;
      this.updateDisplay(val);
    }

    get value() {
      return this.internalValue;
    }

    /**
     * Updates the stored value for this element to reflect its current input
     * value.
     */
    save() {
      const searchValue = this.value;
      const searchAttribute = this.searchAttribute;

      searchValue.attrib = isNaN(searchAttribute)
        ? Ci.nsMsgSearchAttrib.Custom
        : searchAttribute;
      switch (Number(searchAttribute)) {
        case Ci.nsMsgSearchAttrib.Priority:
          searchValue.priority = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.MsgStatus:
          searchValue.status = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.AgeInDays:
          searchValue.age = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.Date:
          searchValue.date = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.JunkStatus:
          searchValue.junkStatus = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.HasAttachmentStatus:
          searchValue.status = Ci.nsMsgMessageFlags.Attachment;
          break;
        case Ci.nsMsgSearchAttrib.JunkPercent:
          searchValue.junkPercent = this.getInputValue();
          break;
        case Ci.nsMsgSearchAttrib.Size:
          searchValue.size = this.getInputValue();
          break;
        default:
          searchValue.str = this.getInputValue();
          break;
      }
    }

    /**
     * Stores the displayed value for this element in the given object.
     *
     * Note that after this call, the stored value will remain pointing to the
     * given searchValue object.
     *
     * @param {nsIMsgSearchValue} searchValue - The object to store the
     *   displayed value in.
     */
    saveTo(searchValue) {
      this.internalValue = searchValue;
      this.save();
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
     * @augments {MozMenuList}
     */
    class MozRuleactiontypeMenulist extends customElements.get("menulist") {
      connectedCallback() {
        super.connectedCallback();
        if (this.delayConnectedCallback() || this.hasConnected) {
          return;
        }
        this.hasConnected = true;

        this.setAttribute("is", "ruleactiontype-menulist");
        this.addEventListener("command", () => {
          this.parentNode.setAttribute("value", this.value);
          checkActionsReorder();
        });

        this.addEventListener("popupshowing", () => {
          const unavailableActions = this.usedActionsList();
          for (let index = 0; index < this.menuitems.length; index++) {
            const menu = this.menuitems[index];
            menu.toggleAttribute("disabled", menu.value in unavailableActions);
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
          const unavailableActions = this.usedActionsList();
          // Select the first one that's not in the list.
          for (let index = 0; index < this.menuitems.length; index++) {
            const menu = this.menuitems[index];
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
        const menupopup = this.menupopup;
        const scope = getScopeFromFilterList(gFilterList);

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

        // Disable "Copy Message to" filter action for "Getting New Mail" with
        // "Filter before Junk Classification" in newsgroups, enable otherwise.
        if (scope == Ci.nsMsgSearchScope.newsFilter) {
          const filterBeforeJunkClassification =
            gFilterType & Ci.nsMsgFilterType.NewsRule &&
            !(gFilterType & Ci.nsMsgFilterType.PostPlugin);
          const [actionItem] = menupopup.getElementsByAttribute(
            "value",
            "copymessage"
          );
          if (actionItem) {
            actionItem.hidden = filterBeforeJunkClassification;
            if (actionItem.selected) {
              this.disabled = filterBeforeJunkClassification;
              const [actionTargetItem] =
                this.parentElement.getElementsByClassName("ruleactionitem");
              if (actionTargetItem) {
                actionTargetItem.disabled = filterBeforeJunkClassification;
              }
            }
          }
        }
      }

      addCustomActions() {
        const menupopup = this.menupopup;
        for (let i = 0; i < gCustomActions.length; i++) {
          const customAction = gCustomActions[i];
          const menuitem = document.createXULElement("menuitem");
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
       * @returns {object} - a hash containing all of the filter actions which are
       *                    currently being used by other filteractionrows.
       */
      usedActionsList() {
        const usedActions = {};
        const currentFilterActionRow = this.parentNode;
        const listBox = currentFilterActionRow.parentNode; // need to account for the list item.
        // Now iterate over each list item in the list box.
        for (let index = 0; index < listBox.getRowCount(); index++) {
          const filterActionRow = listBox.getItemAtIndex(index);
          if (filterActionRow != currentFilterActionRow) {
            const actionValue = filterActionRow.getAttribute("value");

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
       *
       * @returns {object[]} - An array of template headers: each has a label and
       *                      a value.
       */
      findTemplates() {
        const identities = MailServices.accounts.getIdentitiesForServer(
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

        const templates = [];
        const foldersScanned = [];

        for (const identity of identities) {
          let enumerator = null;
          const msgFolder = MailUtils.getExistingFolder(
            identity.templatesFolderURI
          );
          // If we already processed this folder, do not set enumerator
          // so that we skip this identity.
          if (msgFolder && !foldersScanned.includes(msgFolder)) {
            foldersScanned.push(msgFolder);
            enumerator = msgFolder.msgDatabase.enumerateMessages();
          }

          if (!enumerator) {
            continue;
          }

          for (const header of enumerator) {
            const uri =
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
   * @augments {MozElements.MozRichlistitem}
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
          <menulist is="ruleactiontype-menulist" style="flex: 1;">
            <menupopup native="false">
              <menuitem data-l10n-id="rule-action-move"
                        value="movemessage"
                        enablefornews="false"></menuitem>
              <menuitem data-l10n-id="rule-action-copy"
                        value="copymessage"></menuitem>
              <menuseparator enablefornews="false"></menuseparator>
              <menuitem data-l10n-id="rule-action-forward"
                        value="forwardmessage"
                        enablefornews="false"></menuitem>
              <menuitem data-l10n-id="rule-action-reply"
                        value="replytomessage"
                        enablefornews="false"></menuitem>
              <menuseparator></menuseparator>
              <menuitem data-l10n-id="rule-action-read"
                        value="markasread"></menuitem>
              <menuitem data-l10n-id="rule-action-unread"
                        value="markasunread"></menuitem>
              <menuitem data-l10n-id="rule-action-star"
                        value="markasflagged"></menuitem>
              <menuitem data-l10n-id="rule-action-priority"
                        value="setpriorityto"></menuitem>
              <menuitem data-l10n-id="rule-action-tag"
                        value="addtagtomessage"></menuitem>
              <menuitem data-l10n-id="rule-action-set-spam-status"
                        value="setjunkscore"
                        enablefornews="false"></menuitem>
              <menuseparator enableforpop3="true"></menuseparator>
              <menuitem data-l10n-id="rule-action-delete"
                        value="deletemessage"></menuitem>
              <menuitem data-l10n-id="rule-action-delete-pop"
                        value="deletefrompopserver"
                        enableforpop3="true"></menuitem>
              <menuitem data-l10n-id="rule-action-fetch-pop"
                        value="fetchfrompopserver"
                        enableforpop3="true"></menuitem>
              <menuseparator></menuseparator>
              <menuitem data-l10n-id="rule-action-ignore-thread"
                        value="ignorethread"></menuitem>
              <menuitem data-l10n-id="rule-action-ignore-subthread"
                        value="ignoresubthread"></menuitem>
              <menuitem data-l10n-id="rule-action-watch-thread"
                        value="watchthread"></menuitem>
              <menuseparator></menuseparator>
              <menuitem data-l10n-id="rule-action-stop"
                        value="stopexecution"></menuitem>
            </menupopup>
          </menulist>
          <ruleactiontarget-wrapper class="ruleactiontarget" style="flex: 4;">
          </ruleactiontarget-wrapper>
          <hbox>
            <button class="small-button"
                    data-l10n-id="rule-add-action-button"
                    oncommand="this.parentNode.parentNode.addRow();"></button>
            <button class="small-button remove-small-button"
                    data-l10n-id="rule-remove-action-button"
                    oncommand="this.parentNode.parentNode.removeRow();"></button>
          </hbox>
          `
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

    _fireEvent() {
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
      const actionTarget = this.children[1];
      const actionItem = actionTarget.ruleactiontargetElement;
      switch (aFilterAction.type) {
        case Ci.nsMsgFilterAction.Custom: {
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
            const menuitem = document.createXULElement("menuitem");
            document.l10n.setAttributes(
              menuitem,
              "filter-missing-custom-action"
            );
            menuitem.setAttribute("value", filterActionStr);
            menuitem.disabled = true;
            this.mRuleActionType.menupopup.appendChild(menuitem);
            const scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
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
        }
        case Ci.nsMsgFilterAction.MoveToFolder:
        case Ci.nsMsgFilterAction.CopyToFolder:
          actionItem.children[0].value = aFilterAction.targetFolderUri;
          break;
        case Ci.nsMsgFilterAction.Reply:
        case Ci.nsMsgFilterAction.Forward:
          actionItem.children[0].value = aFilterAction.strValue;
          break;
        case Ci.nsMsgFilterAction.ChangePriority:
          actionItem.children[0].value = aFilterAction.priority;
          break;
        case Ci.nsMsgFilterAction.JunkScore:
          actionItem.children[0].value = aFilterAction.junkScore;
          break;
        case Ci.nsMsgFilterAction.AddTag:
          actionItem.children[0].value = aFilterAction.strValue;
          break;
        default:
          break;
      }
      if (aFilterAction.type != Ci.nsMsgFilterAction.Custom) {
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
     * @returns {boolean} - true if this row represents a valid filter action.
     */
    validateAction() {
      const filterActionString = this.getAttribute("value");
      const actionTarget = this.children[1];
      const actionTargetLabel =
        actionTarget.ruleactiontargetElement &&
        actionTarget.ruleactiontargetElement.children[0].value;
      let errorString, customError;

      switch (filterActionString) {
        case "movemessage":
        case "copymessage": {
          // "Copy Message to" filter action for "Getting New Mail" with
          // "Filter before Junk Classification" is not supported for
          // newsgroups.
          if (
            gFilterType & Ci.nsMsgFilterType.NewsRule &&
            !(gFilterType & Ci.nsMsgFilterType.PostPlugin)
          ) {
            // TODO: This could be replaced by a more concise error message.
            errorString = "filter-failure-action";
            break;
          }
          const msgFolder = actionTargetLabel
            ? MailUtils.getOrCreateFolder(actionTargetLabel)
            : null;
          if (!msgFolder || !msgFolder.canFileMessages) {
            errorString = "filter-editor-must-select-target-folder";
          }
          break;
        }
        case "forwardmessage":
          if (
            actionTargetLabel.length < 3 ||
            actionTargetLabel.indexOf("@") < 1
          ) {
            errorString = "filter-editor-enter-valid-email-forward";
          }
          break;
        case "replytomessage":
          if (!actionTarget.ruleactiontargetElement.children[0].selectedItem) {
            errorString = "filter-editor-pick-template-reply";
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
        ? searchWidgetsL10n.formatValueSync(errorString)
        : customError;
      if (errorString) {
        Services.prompt.alert(window, null, errorString);
      }

      return !errorString;
    }

    /**
     * Create a new filter action, fill it in, and then append it to the filter.
     *
     * @param {object} aFilter - filter object to save.
     */
    saveToFilter(aFilter) {
      const filterAction = aFilter.createAction();
      const filterActionString = this.getAttribute("value");
      filterAction.type = gFilterActionStrings.indexOf(filterActionString);
      const actionTarget = this.children[1];
      const actionItem = actionTarget.ruleactiontargetElement;
      switch (filterAction.type) {
        case Ci.nsMsgFilterAction.ChangePriority:
          filterAction.priority = actionItem.children[0].getAttribute("value");
          break;
        case Ci.nsMsgFilterAction.MoveToFolder:
        case Ci.nsMsgFilterAction.CopyToFolder:
          filterAction.targetFolderUri = actionItem.children[0].value;
          break;
        case Ci.nsMsgFilterAction.JunkScore:
          filterAction.junkScore = actionItem.children[0].value;
          break;
        case Ci.nsMsgFilterAction.Custom:
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
      const listItem = document.createXULElement("richlistitem", {
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
      const listBox = this.mListBox;
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

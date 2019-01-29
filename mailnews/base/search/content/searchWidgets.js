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
    if(!this.hasAttribute("type")) {
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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global MozElements */
/* global MozXULElement */

// The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createXULElement("menulist");
}
/**
 * MozMenulistEditable is a menulist widget that can be made editable by setting editable="true".
 * With an additional type="description" the list also contains an additional label that can hold
 * for instance, a description of a menu item.
 * It is typically used e.g. for the "Custom From Address..." feature to let the user chose and
 * edit the address to send from.
 *
 * @augments {MozMenuList}
 */
class MozMenulistEditable extends customElements.get("menulist") {
  static get markup() {
    // Accessibility information of these nodes will be
    // presented on XULComboboxAccessible generated from <menulist>;
    // hide these nodes from the accessibility tree.
    return `
        <html:link rel="stylesheet" href="chrome://global/skin/menulist.css"/>
        <html:input part="text-input" type="text" allowevents="true"/>
        <hbox id="label-box" part="label-box" flex="1" role="none">
          <label id="label" part="label" crop="end" flex="1" role="none"/>
          <label id="highlightable-label" part="label" crop="end" flex="1" role="none"/>
        </hbox>
        <dropmarker part="dropmarker" exportparts="icon: dropmarker-icon" type="menu" role="none"/>
        <html:slot/>
      `;
  }

  connectedCallback() {
    if (this.delayConnectedCallback()) {
      return;
    }

    this.shadowRoot.appendChild(this.constructor.fragment);
    this._inputField = this.shadowRoot.querySelector("input");
    this._labelBox = this.shadowRoot.getElementById("label-box");
    this._dropmarker = this.shadowRoot.querySelector("dropmarker");

    if (this.getAttribute("type") == "description") {
      this._description = document.createXULElement("label");
      this._description.id = this._description.part = "description";
      this._description.setAttribute("crop", "end");
      this._description.setAttribute("role", "none");
      this.shadowRoot.getElementById("label").after(this._description);
    }

    this.initializeAttributeInheritance();

    this.mSelectedInternal = null;
    this.setInitialSelection();

    this._handleMutation = () => {
      this.editable = this.getAttribute("editable") == "true";
    };
    this.mAttributeObserver = new MutationObserver(this._handleMutation);
    this.mAttributeObserver.observe(this, {
      attributes: true,
      attributeFilter: ["editable"],
    });

    this._keypress = event => {
      if (event.key == "ArrowDown") {
        this.open = true;
      }
    };
    this._inputField.addEventListener("keypress", this._keypress);
    this._change = event => {
      event.stopPropagation();
      this.selectedItem = null;
      this.setAttribute("value", this._inputField.value);
      // Start the event again, but this time with the menulist as target.
      this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    };
    this._inputField.addEventListener("change", this._change);

    this._popupHiding = event => {
      // layerX is 0 if the user clicked outside the popup.
      if (this.editable && event.layerX > 0) {
        this._inputField.select();
      }
    };
    if (!this.menupopup) {
      this.appendChild(
        MozXULElement.parseXULToFragment(`<menupopup native="false"/>`)
      );
    }
    this.menupopup.addEventListener("popuphiding", this._popupHiding);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.mAttributeObserver.disconnect();
    this._inputField.removeEventListener("keypress", this._keypress);
    this._inputField.removeEventListener("change", this._change);
    this.menupopup.removeEventListener("popuphiding", this._popupHiding);

    for (const prop of [
      "_inputField",
      "_labelBox",
      "_dropmarker",
      "_description",
    ]) {
      if (this[prop]) {
        this[prop].remove();
        this[prop] = null;
      }
    }
  }

  static get inheritedAttributes() {
    const attrs = super.inheritedAttributes;
    attrs.input = "value,disabled";
    attrs["#description"] = "value=description";
    return attrs;
  }

  set editable(val) {
    if (val == this.editable) {
      return;
    }

    if (!val) {
      // If we were focused and transition from editable to not editable,
      // focus the parent menulist so that the focus does not get stuck.
      if (this._inputField == document.activeElement) {
        window.setTimeout(() => this.focus(), 0);
      }
    }

    this.setAttribute("editable", val);
  }

  get editable() {
    return this.getAttribute("editable") == "true";
  }

  set value(val) {
    this._inputField.value = val;
    this.setAttribute("value", val);
    this.setAttribute("label", val);
  }

  get value() {
    if (this.editable) {
      return this._inputField.value;
    }
    return super.value;
  }

  get label() {
    if (this.editable) {
      return this._inputField.value;
    }
    return super.label;
  }

  set placeholder(val) {
    this._inputField.placeholder = val;
  }

  get placeholder() {
    return this._inputField.placeholder;
  }

  set selectedItem(val) {
    if (val) {
      this._inputField.value = val.getAttribute("value");
    }
    super.selectedItem = val;
  }

  get selectedItem() {
    return super.selectedItem;
  }

  focus() {
    if (this.editable) {
      this._inputField.focus();
    } else {
      super.focus();
    }
  }

  select() {
    if (this.editable) {
      this._inputField.select();
    }
  }
}

const MenuBaseControl = MozElements.BaseControlMixin(
  MozElements.MozElementMixin(XULMenuElement)
);
MenuBaseControl.implementCustomInterface(MozMenulistEditable, [
  Ci.nsIDOMXULMenuListElement,
  Ci.nsIDOMXULSelectControlElement,
]);

customElements.define("menulist-editable", MozMenulistEditable, {
  extends: "menulist",
});

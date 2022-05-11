/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardNComponent */

ChromeUtils.defineModuleGetter(
  this,
  "VCardProperties",
  "resource:///modules/VCardUtils.jsm"
);

class VCardEdit extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    document.l10n.connectRoot(this.shadowRoot);
    let template = document.getElementById("template-addr-book-edit");
    let clonedTemplate = template.content.cloneNode(true);
    this.shadowRoot.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.updateView();
    }
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
    this.replaceChildren();
  }

  get vCardString() {
    return this._vCardProperties.toVCard();
  }

  set vCardString(value) {
    if (value) {
      this.vCardProperties = VCardProperties.fromVCard(value);
    } else {
      this.vCardProperties = new VCardProperties();
    }
  }

  get vCardProperties() {
    return this._vCardProperties;
  }

  set vCardProperties(value) {
    this._vCardProperties = value;
    // If no n property is present set one.
    if (!this._vCardProperties.getFirstEntry("n")) {
      this._vCardProperties.addEntry(VCardNComponent.newVCardPropertyEntry());
    }
    this.updateView();
  }

  updateView() {
    let vCardPropertyEls = [];
    if (this.vCardProperties) {
      vCardPropertyEls = this.vCardProperties.entries.map(entry => {
        return VCardEdit.createVCardElement(entry);
      });
      // Get rid of non truthy values.
      vCardPropertyEls = vCardPropertyEls.filter(el => !!el);
    }
    this.replaceChildren(...vCardPropertyEls);
  }

  /**
   * Creates a custom element for an {VCardPropertyEntry}
   *
   *  - Assigns rich data (not bind to a html attribute) and therefore
   *    the reference.
   *  - Sets the slot attribute for the VCardPropertyEntryView element
   *    accordingly.
   *
   * @param {VCardPropertyEntry} entry
   * @returns {VCardPropertyEntryView | undefined}
   */
  static createVCardElement(entry) {
    switch (entry.name) {
      case "n":
        let n = new VCardNComponent();
        n.vCardPropertyEntry = entry;
        n.slot = "v-n";
        return n;
      default:
        return undefined;
    }
  }

  /**
   * Creates a VCardPropertyEntry with a matching
   * name to the vCard spec.
   *
   * @param {string} name A name which should be a vCard spec property.
   * @returns {VCardPropertyEntry | undefined}
   */
  static createVCardProperty(name) {
    switch (name) {
      case "n":
        return VCardNComponent.newVCardPropertyEntry();
      default:
        return undefined;
    }
  }

  /**
   * Mutates the referenced vCardPropertyEntry(s).
   * If the value of a VCardPropertyEntry is empty, then the entry gets
   * removed from the vCardProperty.
   */
  saveVCard() {
    this.childNodes.forEach(node => {
      if (typeof node.fromUIToVCardPropertyEntry === "function") {
        node.fromUIToVCardPropertyEntry();
      }

      // Filter out empty fields.
      if (typeof node.valueIsEmpty === "function" && node.valueIsEmpty()) {
        this.vCardProperties.removeEntry(node.vCardPropertyEntry);
      }
    });
  }

  /**
   * Assigns focus to an element.
   * The element should always be present and be one of the most important
   * contact identifiers.
   */
  setFocus() {
    document.getElementById("vcard-n-firstname").focus();
  }
}

customElements.define("vcard-edit", VCardEdit);

/**
 * Interface for vCard Fields in the edit view.
 *
 * @interface VCardPropertyEntryView
 */

/**
 * Getter/Setter for rich data do not use HTMLAttributes for this.
 *  Keep the reference intact through vCardProperties for proper saving.
 * @property
 * @name VCardPropertyEntryView#vCardPropertyEntry
 */

/**
 * fromUIToVCardPropertyEntry should directly change data with the reference
 *  through vCardPropertyEntry.
 * It's there for an action to read the user input values into the
 *  vCardPropertyEntry.
 * @function
 * @name VCardPropertyEntryView#fromUIToVCardPropertyEntry
 * @returns {void}
 */

/**
 * Updates the UI accordingly to the vCardPropertyEntry.
 *
 * @function
 * @name VCardPropertyEntryView#fromVCardPropertyEntryToUI
 * @returns {void}
 */

/**
 * Checks if the value of VCardPropertyEntry is empty.
 * @function
 * @name VCardPropertyEntryView#valueIsEmpty
 * @returns {boolean}
 */

/**
 * Creates a new VCardPropertyEntry for usage in the a new Field.
 * @function
 * @name VCardPropertyEntryView#newVCardPropertyEntry
 * @static
 * @returns {VCardPropertyEntry}
 */

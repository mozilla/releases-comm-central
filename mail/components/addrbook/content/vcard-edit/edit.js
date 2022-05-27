/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardAdrComponent, VCardEmailComponent, VCardIMPPComponent,
           VCardNComponent, VCardNoteComponent, VCardSpecialDateComponent,
           VCardTelComponent, VCardTZComponent, VCardURLComponent */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(
  this,
  "VCardProperties",
  "resource:///modules/VCardUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
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

    this.displayName = document.getElementById("displayName");
    this.displayName.addEventListener("input", () => {
      this.displayName._dirty = !!this.displayName.value;
    });
  }

  connectedCallback() {
    if (this.isConnected) {
      this.registerEmailFieldsetHandling();

      let addURL = this.shadowRoot.getElementById("vcard-add-url");
      this.registerAddButton(addURL, "url");

      let addTel = this.shadowRoot.getElementById("vcard-add-tel");
      this.registerAddButton(addTel, "tel");

      let addTZ = this.shadowRoot.getElementById("vcard-add-tz");
      this.registerAddButton(addTZ, "tz", () => {
        addTZ.hidden = true;
      });

      let addIMPP = this.shadowRoot.getElementById("vcard-add-impp");
      this.registerAddButton(addIMPP, "impp");

      this.registerSpecialDateFieldsetHandling();

      let addAddress = this.shadowRoot.getElementById("vcard-add-adr");
      this.registerAddButton(addAddress, "adr");

      let addNote = this.shadowRoot.getElementById("vcard-add-note");
      this.registerAddButton(addNote, "note", () => {
        addNote.hidden = true;
      });

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
      try {
        this.vCardProperties = VCardProperties.fromVCard(value);
        return;
      } catch (ex) {
        Cu.reportError(ex);
      }
    }
    this.vCardProperties = new VCardProperties();
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
    // If no email property is present set one.
    if (!this._vCardProperties.getFirstEntry("email")) {
      this._vCardProperties.addEntry(
        VCardEmailComponent.newVCardPropertyEntry()
      );
    }
    this.updateView();
  }

  updateView() {
    if (!this.vCardProperties) {
      this.replaceChildren();
      return;
    }

    let vCardPropertyEls = this.vCardProperties.entries
      .map(entry => {
        return VCardEdit.createVCardElement(entry);
      })
      .filter(el => !!el);

    this.replaceChildren(...vCardPropertyEls);

    this.shadowRoot.getElementById("vcard-add-tz").hidden = this.querySelector(
      "vcard-tz"
    );
    this.shadowRoot.getElementById(
      "vcard-add-note"
    ).hidden = this.querySelector("vcard-note");

    this.displayName.value = this.vCardProperties.getFirstValue("fn");
    this.displayName._dirty = !!this.displayName.value;

    let nameEl = this.querySelector("vcard-n");
    this.firstName = nameEl.firstNameEl.querySelector("input");
    this.firstName.addEventListener("input", () => this.generateDisplayName());
    this.lastName = nameEl.lastNameEl.querySelector("input");
    this.lastName.addEventListener("input", () => this.generateDisplayName());

    if (this.vCardProperties) {
      this.checkForBdayOccurences();
    }
  }

  /**
   * If the display name field is empty, generate a name from the first and
   * last name fields.
   */
  async generateDisplayName() {
    if (
      !Services.prefs.getBoolPref("mail.addr_book.displayName.autoGeneration")
    ) {
      // Do nothing if generation is disabled.
      return;
    }

    if (this.displayName._dirty) {
      // Don't modify the field if it already has a value, unless the value
      // was set by this function.
      return;
    }

    if (!this.firstName.value || !this.lastName.value) {
      // If there's 0 or 1 values, use them.
      this.displayName.value = this.firstName.value || this.lastName.value;
      return;
    }

    let lastNameFirst = false;

    // This used to be a L10n-controlled (string) preference, but the default
    // has been removed. If there is a value (string or boolean), respect it.
    let prefName = "mail.addr_book.displayName.lastnamefirst";
    let prefType = Services.prefs.getPrefType(prefName);
    if (prefType == Services.prefs.PREF_STRING) {
      lastNameFirst = Services.prefs.getStringPref(prefName) === "true";
    } else if (prefType == Services.prefs.PREF_BOOL) {
      lastNameFirst = Services.prefs.getBoolPref(prefName);
    }

    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    if (lastNameFirst) {
      this.displayName.value = bundle.formatStringFromName("lastFirstFormat", [
        this.lastName.value,
        this.firstName.value,
      ]);
    } else {
      this.displayName.value = bundle.formatStringFromName("firstLastFormat", [
        this.firstName.value,
        this.lastName.value,
      ]);
    }
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
      case "email":
        let email = document.createElement("tr", { is: "vcard-email" });
        email.vCardPropertyEntry = entry;
        email.slot = "v-email";
        return email;
      case "url":
        let url = new VCardURLComponent();
        url.vCardPropertyEntry = entry;
        url.slot = "v-url";
        return url;
      case "tel":
        let tel = new VCardTelComponent();
        tel.vCardPropertyEntry = entry;
        tel.slot = "v-tel";
        return tel;
      case "tz":
        let tz = new VCardTZComponent();
        tz.vCardPropertyEntry = entry;
        tz.slot = "v-tz";
        return tz;
      case "impp":
        let impp = new VCardIMPPComponent();
        impp.vCardPropertyEntry = entry;
        impp.slot = "v-impp";
        return impp;
      case "anniversary":
        let anniversary = new VCardSpecialDateComponent();
        anniversary.vCardPropertyEntry = entry;
        anniversary.slot = "v-anniversary";
        return anniversary;
      case "bday":
        let bday = new VCardSpecialDateComponent();
        bday.vCardPropertyEntry = entry;
        bday.slot = "v-bday";
        return bday;
      case "adr":
        let address = new VCardAdrComponent();
        address.vCardPropertyEntry = entry;
        address.slot = "v-adr";
        return address;
      case "note":
        let note = new VCardNoteComponent();
        note.vCardPropertyEntry = entry;
        note.slot = "v-note";
        return note;
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
      case "email":
        return VCardEmailComponent.newVCardPropertyEntry();
      case "url":
        return VCardURLComponent.newVCardPropertyEntry();
      case "tel":
        return VCardTelComponent.newVCardPropertyEntry();
      case "tz":
        return VCardTZComponent.newVCardPropertyEntry();
      case "impp":
        return VCardIMPPComponent.newVCardPropertyEntry();
      case "bday":
        return VCardSpecialDateComponent.newBdayVCardPropertyEntry();
      case "anniversary":
        return VCardSpecialDateComponent.newAnniversaryVCardPropertyEntry();
      case "adr":
        return VCardAdrComponent.newVCardPropertyEntry();
      case "note":
        return VCardNoteComponent.newVCardPropertyEntry();
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
    let displayNameEntry = this.vCardProperties.getFirstEntry("fn");
    if (displayNameEntry) {
      displayNameEntry.value = this.displayName.value;
    } else {
      displayNameEntry = new VCardPropertyEntry(
        "fn",
        {},
        "text",
        this.displayName.value
      );
      this.vCardProperties.addEntry(displayNameEntry);
    }

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

  registerEmailFieldsetHandling() {
    // Add slot listener for enabling to choose the primary email.
    let slot = this.shadowRoot.querySelector('slot[name="v-email"]');
    let emailFieldset = this.shadowRoot.querySelector("#addr-book-edit-email");
    slot.addEventListener("slotchange", event => {
      let withPrimaryEmailChooser = slot.assignedElements().length > 1;
      emailFieldset.querySelectorAll("th")[2].hidden = !withPrimaryEmailChooser;
      // Set primary eMail chooser.
      this.querySelectorAll("vcard-email").forEach(vCardEmailComponent => {
        vCardEmailComponent.setPrimaryEmailChooser(!withPrimaryEmailChooser);
      });
    });

    // Add email button.
    let addEmail = this.shadowRoot.getElementById("vcard-add-email");
    this.registerAddButton(addEmail, "email");

    // Add listener to be sure that only one checkbox from the emails is ticked.
    this.addEventListener("vcard-email-primary-checkbox", event => {
      this.querySelectorAll('tr[slot="v-email"]').forEach(element => {
        if (event.target !== element) {
          element.querySelector('input[type="checkbox"]').checked = false;
        }
      });
    });
  }

  registerSpecialDateFieldsetHandling() {
    // Handling the VCardPropertyEntry change with the select.
    let specialDatesFieldset = this.shadowRoot.getElementById(
      "addr-book-edit-bday-anniversary"
    );
    specialDatesFieldset.addEventListener(
      "vcard-bday-anniversary-change",
      event => {
        let newVCardPropertyEntry = new VCardPropertyEntry(
          event.detail.name,
          event.target.vCardPropertyEntry.params,
          event.target.vCardPropertyEntry.type,
          event.target.vCardPropertyEntry.value
        );
        this.vCardProperties.removeEntry(event.target.vCardPropertyEntry);
        event.target.vCardPropertyEntry = newVCardPropertyEntry;
        this.vCardProperties.addEntry(newVCardPropertyEntry);
        this.checkForBdayOccurences();
      }
    );

    // Add special date button.
    let addSpecialDate = this.shadowRoot.getElementById(
      "vcard-add-bday-anniversary"
    );
    addSpecialDate.addEventListener("click", e => {
      let newVCardProperty;
      if (!this.vCardProperties.getFirstEntry("bday")) {
        newVCardProperty = VCardEdit.createVCardProperty("bday");
      } else {
        newVCardProperty = VCardEdit.createVCardProperty("anniversary");
      }
      let el = VCardEdit.createVCardElement(newVCardProperty);
      // Add the new entry to our vCardProperties object.
      this.vCardProperties.addEntry(el.vCardPropertyEntry);
      this.append(el);
      this.checkForBdayOccurences();
      el.querySelector("input").focus();
    });
  }

  /**
   * Registers a click event for addButton which creates a new vCardProperty.
   *
   * @param {HTMLButtonElement} addButton
   * @param {string} VCardPropertyName RFC6350 vCard property name.
   * @param {(vCardElement) => {}} payload For further refinement.
   * Like different focus instead of an input field.
   */
  registerAddButton(addButton, VCardPropertyName, payload) {
    addButton.addEventListener("click", event => {
      let newVCardProperty = VCardEdit.createVCardProperty(VCardPropertyName);
      let el = VCardEdit.createVCardElement(newVCardProperty);
      // Add the new entry to our vCardProperties object.
      this.vCardProperties.addEntry(el.vCardPropertyEntry);
      this.append(el);
      el.querySelector("input")?.focus();
      if (payload) {
        payload(el);
      }
    });
  }

  /**
   * If one BDAY vCardPropertyEntry is present disable
   * the option to change an Anniversary to a BDAY.
   * @see VCardSpecialDateComponent
   */
  checkForBdayOccurences() {
    let bdayOccurence = this.vCardProperties.getFirstEntry("bday");
    this.querySelectorAll("vcard-special-date").forEach(specialDate => {
      specialDate.birthdayAvailabilty({ hasBday: !!bdayOccurence });
    });
  }
}

customElements.define("vcard-edit", VCardEdit);

function* vCardHtmlIdGen() {
  let internalId = 0;
  while (true) {
    yield `vcard-id-${internalId++}`;
  }
}

let vCardIdGen = vCardHtmlIdGen();

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

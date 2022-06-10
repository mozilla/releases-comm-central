/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardAdrComponent, VCardEmailComponent, VCardIMPPComponent,
           VCardNComponent, VCardFNComponent, VCardNickNameComponent,
           VCardNoteComponent, VCardOrgComponent, VCardRoleComponent,
           VCardSpecialDateComponent, VCardTelComponent, VCardTitleComponent,
           VCardTZComponent, VCardURLComponent */

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

    this.contactName = document.getElementById("viewContactName");
    this.contactNickName = document.getElementById("viewContactNickName");
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

      this.registerOrgFieldsetHandling();

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
    this.vCardProperties = new VCardProperties("4.0");
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
    // If no fn property is present set one.
    if (!this._vCardProperties.getFirstEntry("fn")) {
      this._vCardProperties.addEntry(VCardFNComponent.newVCardPropertyEntry());
    }
    // If no nickname property is present set one.
    if (!this._vCardProperties.getFirstEntry("nickname")) {
      this._vCardProperties.addEntry(
        VCardNickNameComponent.newVCardPropertyEntry()
      );
    }
    // If no email property is present set one.
    if (!this._vCardProperties.getFirstEntry("email")) {
      this._vCardProperties.addEntry(
        VCardEmailComponent.newVCardPropertyEntry()
      );
    }
    // If or more of the organizational properties is present,
    // make sure they all are.
    let title = this._vCardProperties.getFirstEntry("title");
    let role = this._vCardProperties.getFirstEntry("role");
    let org = this._vCardProperties.getFirstEntry("org");
    if (title || role || org) {
      if (!title) {
        this._vCardProperties.addEntry(
          VCardTitleComponent.newVCardPropertyEntry()
        );
      }
      if (!role) {
        this._vCardProperties.addEntry(
          VCardRoleComponent.newVCardPropertyEntry()
        );
      }
      if (!org) {
        this._vCardProperties.addEntry(
          VCardOrgComponent.newVCardPropertyEntry()
        );
      }
    }
    this.updateView();
  }

  updateView() {
    if (!this.vCardProperties) {
      this.replaceChildren();
      return;
    }

    this._orgComponent = null;
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
    this.shadowRoot.getElementById("vcard-add-org").hidden = this.querySelector(
      "vcard-org"
    );

    let nameEl = this.querySelector("vcard-n");
    this.firstName = nameEl.firstNameEl.querySelector("input");
    this.lastName = nameEl.lastNameEl.querySelector("input");
    this.prefixName = nameEl.prefixEl.querySelector("input");
    this.middleName = nameEl.middleNameEl.querySelector("input");
    this.suffixName = nameEl.suffixEl.querySelector("input");
    this.displayName = this.querySelector("vcard-fn").displayEl;

    [
      this.firstName,
      this.lastName,
      this.prefixName,
      this.middleName,
      this.suffixName,
      this.displayName,
    ].forEach(element => {
      element.addEventListener("input", event =>
        this.generateContactName(event)
      );
    });

    // Only set the strings and define this selector if we're inside the
    // address book edit panel.
    if (document.getElementById("detailsPane")) {
      this.preferDisplayName = this.querySelector("vcard-fn").preferDisplayEl;
      document.l10n.setAttributes(
        this.preferDisplayName.closest(".vcard-checkbox").querySelector("span"),
        "about-addressbook-prefer-display-name"
      );
    }

    this.nickName = this.querySelector("vcard-nickname").nickNameEl;
    this.nickName.addEventListener("input", () => this.updateNickName());

    if (this.vCardProperties) {
      this.toggleDefaultEmailView();
      this.checkForBdayOccurences();
    }

    this.generateContactName();
  }

  /**
   * Update the contact name to reflect the users' choice.
   *
   * @param {?Event} event - The DOM event if we have one.
   */
  async generateContactName(event = null) {
    // Don't generate any preview if the contact name element is not available,
    // which it might happen since this component is used in other areas outside
    // the address book UI.
    if (!this.contactName) {
      return;
    }

    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    let result = "";
    let pref = Services.prefs.getIntPref("mail.addr_book.lastnamefirst");
    switch (pref) {
      case Ci.nsIAbCard.GENERATE_DISPLAY_NAME:
        result = this.buildDefaultName();
        break;

      case Ci.nsIAbCard.GENERATE_LAST_FIRST_ORDER:
        if (this.lastName.value) {
          result = bundle.formatStringFromName("lastFirstFormat", [
            this.lastName.value,
            [
              this.prefixName.value,
              this.firstName.value,
              this.middleName.value,
              this.suffixName.value,
            ]
              .filter(Boolean)
              .join(" "),
          ]);
        } else {
          // Get the generic name if we don't have a last name.
          result = this.buildDefaultName();
        }
        break;

      default:
        result = bundle.formatStringFromName("firstLastFormat", [
          [this.prefixName.value, this.firstName.value, this.middleName.value]
            .filter(Boolean)
            .join(" "),
          [this.lastName.value, this.suffixName.value]
            .filter(Boolean)
            .join(" "),
        ]);
        break;
    }

    if (result == "" || result == ", ") {
      // We don't have anything to show as a contact name, so let's find the
      // primary email and show that, if we have it, otherwise pass an empty
      // string to remove any leftover data.
      let email = this.getPrimaryEmail();
      result = email ? email.split("@", 1)[0] : "";
    }

    this.contactName.textContent = result;
    this.fillDisplayName(event);
  }

  /**
   * Returns the name to show for this contact if the display name is available
   * or it generates one from the available N data.
   *
   * @returns {string} - The name to show for this contact.
   */
  buildDefaultName() {
    return this.displayName.isDirty
      ? this.displayName.value
      : [
          this.prefixName.value,
          this.firstName.value,
          this.middleName.value,
          this.lastName.value,
          this.suffixName.value,
        ]
          .filter(Boolean)
          .join(" ");
  }

  /**
   * Update the nickname value of the contact header when in edit mode.
   */
  updateNickName() {
    // Don't generate any preview if the contact nickname element is not
    // available, which it might happen since this component is used in other
    // areas outside the address book UI.
    if (!this.contactNickName) {
      return;
    }

    let value = this.nickName.value.trim();
    this.contactNickName.hidden = !value;
    this.contactNickName.textContent = value;
  }

  /**
   * Find the primary email used for this contact.
   *
   * @returns {VCardEmailComponent}
   */
  getPrimaryEmail() {
    let emails = this.querySelectorAll(`tr[slot="v-email"]`);
    if (emails.length == 1) {
      return emails[0].emailEl.value;
    }

    let slot = [...emails].find(
      el => el.vCardPropertyEntry.params.pref === "1"
    );
    return slot.emailEl.value;
  }

  /**
   * Auto fill the display name only if the pref is set, the user is not
   * editing the display name field, and the field was never edited.
   *
   * @param {?Event} event - The DOM event if we have one.
   */
  fillDisplayName(event = null) {
    if (
      Services.prefs.getBoolPref("mail.addr_book.displayName.autoGeneration") &&
      event?.originalTarget.id != "vCardDisplayName" &&
      !this.displayName.isDirty
    ) {
      this.displayName.value = this.contactName.textContent;
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
      case "fn":
        let fn = new VCardFNComponent();
        fn.vCardPropertyEntry = entry;
        fn.slot = "v-fn";
        return fn;
      case "nickname":
        let nickname = new VCardNickNameComponent();
        nickname.vCardPropertyEntry = entry;
        nickname.slot = "v-nickname";
        return nickname;
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
      case "title":
        let title = new VCardTitleComponent();
        title.vCardPropertyEntry = entry;
        title.slot = "v-title";
        return title;
      case "role":
        let role = new VCardRoleComponent();
        role.vCardPropertyEntry = entry;
        role.slot = "v-role";
        return role;
      case "org":
        let org = new VCardOrgComponent();
        org.vCardPropertyEntry = entry;
        org.slot = "v-org";
        return org;
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
      case "fn":
        return VCardFNComponent.newVCardPropertyEntry();
      case "nickname":
        return VCardNickNameComponent.newVCardPropertyEntry();
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
      case "title":
        return VCardTitleComponent.newVCardPropertyEntry();
      case "role":
        return VCardRoleComponent.newVCardPropertyEntry();
      case "org":
        return VCardOrgComponent.newVCardPropertyEntry();
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

  registerEmailFieldsetHandling() {
    // Add slot listener for enabling to choose the primary email.
    let slot = this.shadowRoot.querySelector('slot[name="v-email"]');
    let emailFieldset = this.shadowRoot.querySelector("#addr-book-edit-email");
    slot.addEventListener("slotchange", event => {
      let withPrimaryEmailChooser = slot.assignedElements().length > 1;
      emailFieldset.querySelectorAll("th")[2].hidden = !withPrimaryEmailChooser;
      // Set primary email chooser.
      this.querySelectorAll(`tr[slot="v-email"]`).forEach(
        vCardEmailComponent => {
          vCardEmailComponent.setPrimaryEmailChooser(!withPrimaryEmailChooser);
        }
      );
    });

    // Add email button.
    let addEmail = this.shadowRoot.getElementById("vcard-add-email");
    this.registerAddButton(addEmail, "email", () => {
      this.toggleDefaultEmailView();
    });

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

  registerOrgFieldsetHandling() {
    let addOrg = this.shadowRoot.getElementById("vcard-add-org");
    addOrg.addEventListener("click", event => {
      let title = VCardEdit.createVCardProperty("title");
      let role = VCardEdit.createVCardProperty("role");
      let org = VCardEdit.createVCardProperty("org");

      let titleEl = VCardEdit.createVCardElement(title);
      let roleEl = VCardEdit.createVCardElement(role);
      let orgEl = VCardEdit.createVCardElement(org);

      this.vCardProperties.addEntry(titleEl.vCardPropertyEntry);
      this.vCardProperties.addEntry(roleEl.vCardPropertyEntry);
      this.vCardProperties.addEntry(orgEl.vCardPropertyEntry);

      this.append(titleEl);
      this.append(roleEl);
      this.append(orgEl);

      titleEl.querySelector("input").focus();
      addOrg.hidden = true;
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

  /**
   * Hide the default checkbox if we only have one email slot.
   */
  toggleDefaultEmailView() {
    this.querySelector(`.default-column input[type="checkbox"]`).hidden =
      this.querySelectorAll(`tr[slot="v-email"]`).length <= 1;
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

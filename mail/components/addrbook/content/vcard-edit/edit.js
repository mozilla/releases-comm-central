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

class VCardEdit extends HTMLElement {
  constructor() {
    super();

    this.contactNameHeading = document.getElementById("editContactHeadingName");
    this.contactNickNameHeading = document.getElementById(
      "editContactHeadingNickName"
    );
    this.contactEmailHeading = document.getElementById(
      "editContactHeadingEmail"
    );
  }

  connectedCallback() {
    if (this.isConnected) {
      this.updateView();
    }
  }

  disconnectedCallback() {
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
      let emailEntry = VCardEmailComponent.newVCardPropertyEntry();
      emailEntry.params.pref = "1"; // Set as default email.
      this._vCardProperties.addEntry(emailEntry);
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
    // Create new DOM and replacing other vCardProperties.
    let template = document.getElementById("template-addr-book-edit");
    let clonedTemplate = template.content.cloneNode(true);
    // Making the next two calls in one go causes a console error to be logged.
    this.replaceChildren();
    this.append(clonedTemplate);

    if (!this.vCardProperties) {
      return;
    }

    this.addFieldsetActions();

    this._orgComponent = null;

    // Insert the vCard property entries.
    for (let vCardPropertyEntry of this.vCardProperties.entries) {
      this.insertVCardElement(vCardPropertyEntry, false);
    }

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
      this.checkForBdayOccurrences();
    }

    this.updateNickName();
    this.updateEmailHeading();
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
    if (!this.contactNameHeading) {
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
      // default email and show that, if we have it, otherwise pass an empty
      // string to remove any leftover data.
      let email = this.getDefaultEmail();
      result = email ? email.split("@", 1)[0] : "";
    }

    this.contactNameHeading.textContent = result;
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
   * Update the nickname value of the contact header.
   */
  updateNickName() {
    // Don't generate any preview if the contact nickname element is not
    // available, which it might happen since this component is used in other
    // areas outside the address book UI.
    if (!this.contactNickNameHeading) {
      return;
    }

    let value = this.nickName.value.trim();
    this.contactNickNameHeading.hidden = !value;
    this.contactNickNameHeading.textContent = value;
  }

  /**
   * Update the email value of the contact header.
   *
   * @param {?string} email - The email value the user is currently typing.
   */
  updateEmailHeading(email = null) {
    // Don't generate any preview if the contact nickname email is not
    // available, which it might happen since this component is used in other
    // areas outside the address book UI.
    if (!this.contactEmailHeading) {
      return;
    }

    // If no email string was passed, it means this method was called when the
    // view or edit pane refreshes, therefore we need to fetch the correct
    // default email address.
    let value = email ?? this.getDefaultEmail();
    this.contactEmailHeading.hidden = !value;
    this.contactEmailHeading.textContent = value;
  }

  /**
   * Find the default email used for this contact.
   *
   * @returns {VCardEmailComponent}
   */
  getDefaultEmail() {
    let emails = document.getElementById("vcard-email").children;
    if (emails.length == 1) {
      return emails[0].emailEl.value;
    }

    let defaultEmail = [...emails].find(
      el => el.vCardPropertyEntry.params.pref === "1"
    );

    // If no email is marked as preferred, use the first one.
    if (!defaultEmail) {
      defaultEmail = emails[0];
    }

    return defaultEmail.emailEl.value;
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
      this.displayName.value = this.contactNameHeading.textContent;
    }
  }

  /**
   * Inserts a custom element for a {VCardPropertyEntry}
   *
   *  - Assigns rich data (not bind to a html attribute) and therefore
   *    the reference.
   *  - Inserts the element in the form at the correct position.
   *
   * @param {VCardPropertyEntry} entry
   * @param {boolean} addEntry Adds the entry to the vCardProperties.
   * @returns {VCardPropertyEntryView | undefined}
   */
  insertVCardElement(entry, addEntry) {
    // Add the entry to the vCardProperty data.
    if (addEntry) {
      this.vCardProperties.addEntry(entry);
    }

    let fieldset;
    let addButton;
    switch (entry.name) {
      case "n":
        let n = new VCardNComponent();
        n.vCardPropertyEntry = entry;
        fieldset = document.getElementById("addr-book-edit-n");
        let displayNicknameContainer = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(n, displayNicknameContainer);
        return n;
      case "fn":
        let fn = new VCardFNComponent();
        fn.vCardPropertyEntry = entry;
        fieldset = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(fn, fieldset.firstElementChild);
        return fn;
      case "nickname":
        let nickname = new VCardNickNameComponent();
        nickname.vCardPropertyEntry = entry;
        fieldset = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(
          nickname,
          fieldset.firstElementChild.nextElementSibling
        );
        return nickname;
      case "email":
        let email = document.createElement("tr", { is: "vcard-email" });
        email.vCardPropertyEntry = entry;
        document.getElementById("vcard-email").appendChild(email);
        return email;
      case "url":
        let url = new VCardURLComponent();
        url.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-url");
        addButton = document.getElementById("vcard-add-url");
        fieldset.insertBefore(url, addButton);
        return url;
      case "tel":
        let tel = new VCardTelComponent();
        tel.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-tel");
        addButton = document.getElementById("vcard-add-tel");
        fieldset.insertBefore(tel, addButton);
        return tel;
      case "tz":
        let tz = new VCardTZComponent();
        tz.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-tz");
        addButton = document.getElementById("vcard-add-tz");
        fieldset.insertBefore(tz, addButton);
        addButton.hidden = true;
        return tz;
      case "impp":
        let impp = new VCardIMPPComponent();
        impp.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-impp");
        addButton = document.getElementById("vcard-add-impp");
        fieldset.insertBefore(impp, addButton);
        return impp;
      case "anniversary":
        let anniversary = new VCardSpecialDateComponent();
        anniversary.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-bday-anniversary");
        addButton = document.getElementById("vcard-add-bday-anniversary");
        fieldset.insertBefore(anniversary, addButton);
        return anniversary;
      case "bday":
        let bday = new VCardSpecialDateComponent();
        bday.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-bday-anniversary");
        addButton = document.getElementById("vcard-add-bday-anniversary");
        fieldset.insertBefore(bday, addButton);
        return bday;
      case "adr":
        let address = new VCardAdrComponent();
        address.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-address");
        addButton = document.getElementById("vcard-add-adr");
        fieldset.insertBefore(address, addButton);
        return address;
      case "note":
        let note = new VCardNoteComponent();
        note.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-note");
        addButton = document.getElementById("vcard-add-note");
        fieldset.insertBefore(note, addButton);
        // Only one note is allowed via UI.
        addButton.hidden = true;
        return note;
      case "title":
        let title = new VCardTitleComponent();
        title.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(title, addButton);
        // Only one title is allowed via UI.
        addButton.hidden = true;
        return title;
      case "role":
        let role = new VCardRoleComponent();
        role.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(role, addButton);
        // Only one role is allowed via UI.
        addButton.hidden = true;
        return role;
      case "org":
        let org = new VCardOrgComponent();
        org.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(org, addButton);
        // Only one org is allowed via UI.
        addButton.hidden = true;
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
   * If the value of a VCardPropertyEntry is empty, the entry gets
   * removed from the vCardProperty.
   */
  saveVCard() {
    for (let node of [
      ...this.querySelectorAll("vcard-adr"),
      ...document.getElementById("vcard-email").children,
      ...this.querySelectorAll("vcard-fn"),
      ...this.querySelectorAll("vcard-impp"),
      ...this.querySelectorAll("vcard-n"),
      ...this.querySelectorAll("vcard-nickname"),
      ...this.querySelectorAll("vcard-note"),
      ...this.querySelectorAll("vcard-org"),
      ...this.querySelectorAll("vcard-role"),
      ...this.querySelectorAll("vcard-title"),
      ...this.querySelectorAll("vcard-special-date"),
      ...this.querySelectorAll("vcard-tel"),
      ...this.querySelectorAll("vcard-tz"),
      ...this.querySelectorAll("vcard-url"),
    ]) {
      if (typeof node.fromUIToVCardPropertyEntry === "function") {
        node.fromUIToVCardPropertyEntry();
      }

      // Filter out empty fields.
      if (typeof node.valueIsEmpty === "function" && node.valueIsEmpty()) {
        this.vCardProperties.removeEntry(node.vCardPropertyEntry);
      }
    }

    // If no email has a pref value of 1, set it to the first email.
    let emailEntries = this.vCardProperties.getAllEntries("email");
    if (
      emailEntries.length >= 1 &&
      emailEntries.every(entry => entry.params.pref !== "1")
    ) {
      emailEntries[0].params.pref = "1";
    }
  }

  /**
   * Move focus into the form.
   */
  setFocus() {
    this.querySelector("vcard-n input:not([hidden])").focus();
  }

  /**
   * Move focus to the first visible form element below the given element.
   *
   * @param {Element} element - The element to move focus into.
   */
  moveFocusIntoElement(element) {
    for (let child of element.querySelectorAll(
      "select,input,textarea,button"
    )) {
      // Make sure it is visible.
      if (child.clientWidth != 0 && child.clientHeight != 0) {
        child.focus();
        return;
      }
    }
  }

  /**
   * Add buttons and further actions of the groupings for vCard property
   * entries.
   */
  addFieldsetActions() {
    // Add email button.
    let addEmail = document.getElementById("vcard-add-email");
    this.registerAddButton(addEmail, "email", () => {
      this.toggleDefaultEmailView();
    });

    // Add listener to update the email written in the contact header.
    this.addEventListener("vcard-email-default-changed", event => {
      this.updateEmailHeading(
        event.target.querySelector('input[type="email"]').value
      );
    });

    // Add listener to be sure that only one checkbox from the emails is ticked.
    this.addEventListener("vcard-email-default-checkbox", event => {
      // Show the newly selected default email in the contact header.
      this.updateEmailHeading(
        event.target.querySelector('input[type="email"]').value
      );
      for (let vCardEmailComponent of document.getElementById("vcard-email")
        .children) {
        if (event.target !== vCardEmailComponent) {
          vCardEmailComponent.checkboxEl.checked = false;
        }
      }
    });

    // Handling the VCardPropertyEntry change with the select.
    let specialDatesFieldset = document.getElementById(
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
        this.checkForBdayOccurrences();
      }
    );

    specialDatesFieldset.addEventListener(
      "vcard-special-date-remove",
      event => {
        this.vCardProperties.removeEntry(
          event.detail.element.vCardPropertyEntry
        );
      }
    );

    // Add special date button.
    let addSpecialDate = document.getElementById("vcard-add-bday-anniversary");
    addSpecialDate.addEventListener("click", e => {
      let newVCardProperty;
      if (!this.vCardProperties.getFirstEntry("bday")) {
        newVCardProperty = VCardEdit.createVCardProperty("bday");
      } else {
        newVCardProperty = VCardEdit.createVCardProperty("anniversary");
      }
      let el = this.insertVCardElement(newVCardProperty, true);
      this.checkForBdayOccurrences();
      this.moveFocusIntoElement(el);
    });

    // Organizational Properties.
    let addOrg = document.getElementById("vcard-add-org");
    addOrg.addEventListener("click", event => {
      let title = VCardEdit.createVCardProperty("title");
      let role = VCardEdit.createVCardProperty("role");
      let org = VCardEdit.createVCardProperty("org");

      let titleEl = this.insertVCardElement(title, true);
      this.insertVCardElement(role, true);
      this.insertVCardElement(org, true);

      this.moveFocusIntoElement(titleEl);
      addOrg.hidden = true;
    });

    let addAddress = document.getElementById("vcard-add-adr");
    this.registerAddButton(addAddress, "adr");

    let addURL = document.getElementById("vcard-add-url");
    this.registerAddButton(addURL, "url");

    let addTel = document.getElementById("vcard-add-tel");
    this.registerAddButton(addTel, "tel");

    let addTZ = document.getElementById("vcard-add-tz");
    this.registerAddButton(addTZ, "tz", () => {
      addTZ.hidden = true;
    });

    let addIMPP = document.getElementById("vcard-add-impp");
    this.registerAddButton(addIMPP, "impp");

    let addNote = document.getElementById("vcard-add-note");
    this.registerAddButton(addNote, "note", () => {
      addNote.hidden = true;
    });
  }

  /**
   * Registers a click event for addButton which creates a new vCardProperty
   * and inserts it.
   *
   * @param {HTMLButtonElement} addButton
   * @param {string} VCardPropertyName RFC6350 vCard property name.
   * @param {(vCardElement) => {}} callback For further refinement.
   * Like different focus instead of an input field.
   */
  registerAddButton(addButton, VCardPropertyName, callback) {
    addButton.addEventListener("click", event => {
      let newVCardProperty = VCardEdit.createVCardProperty(VCardPropertyName);
      let el = this.insertVCardElement(newVCardProperty, true);

      this.moveFocusIntoElement(el);
      if (callback) {
        callback(el);
      }
    });
  }

  /**
   * If one BDAY vCardPropertyEntry is present disable
   * the option to change an Anniversary to a BDAY.
   * @see VCardSpecialDateComponent
   */
  checkForBdayOccurrences() {
    let bdayOccurrence = this.vCardProperties.getFirstEntry("bday");
    this.querySelectorAll("vcard-special-date").forEach(specialDate => {
      specialDate.birthdayAvailability({ hasBday: !!bdayOccurrence });
    });
  }

  /**
   * Hide the default checkbox if we only have one email field.
   */
  toggleDefaultEmailView() {
    let showDefault =
      document.getElementById("vcard-email").children.length <= 1;
    this.querySelector(".default-column").hidden = showDefault;
    document.getElementById(
      "addr-book-edit-email-default"
    ).hidden = showDefault;

    // Add class to position legend absolute.
    document
      .getElementById("addr-book-edit-email")
      .classList.toggle("default-table-header", !showDefault);
  }

  /**
   * Validate the form with the minimum required data to save or update a
   * contact. We can't use the built-in checkValidity() since our fields
   * are not handled properly by the form element.
   *
   * @returns {boolean} - If the form is valid or not.
   */
  checkMinimumRequirements() {
    let hasEmail = [...document.getElementById("vcard-email").children].find(
      s => {
        let field = s.querySelector(`input[type="email"]`);
        return field.value.trim() && field.checkValidity();
      }
    );

    return (
      this.firstName.value.trim() ||
      this.lastName.value.trim() ||
      this.displayName.value.trim() ||
      hasEmail
    );
  }

  /**
   * Validate the special date fields making sure that at least the year is
   * correctly specified, since month and day are optional.
   *
   * @returns {boolean} - If all created date fields are valid or not.
   */
  validateDates() {
    let hasInvalidDate = [
      ...document.querySelectorAll("vcard-special-date"),
    ].find(s => {
      let field = s.querySelector(`input[type="number"]`);
      return !field.value.trim() || !field.checkValidity();
    });

    if (hasInvalidDate) {
      let input = hasInvalidDate.querySelector(`input[type="number"]`);
      input.required = true;
      input.focus();
    }

    // If we have invalid dates, return FALSE so the validation fails.
    return !hasInvalidDate;
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

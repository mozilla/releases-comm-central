/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { vCardIdGen } from "./id-gen.mjs";
import { VCardAdrComponent } from "./adr.mjs";
import { VCardCustomComponent } from "./custom.mjs";
import { VCardEmailComponent } from "./email.mjs";
import { VCardIMPPComponent } from "./impp.mjs";
import { VCardNComponent } from "./n.mjs";
import { VCardFNComponent } from "./fn.mjs";
import { VCardNickNameComponent } from "./nickname.mjs";
import { VCardNoteComponent } from "./note.mjs";
import {
  VCardOrgComponent,
  VCardRoleComponent,
  VCardTitleComponent,
} from "./org.mjs";
import { VCardSpecialDateComponent } from "./special-date.mjs";
import { VCardTelComponent } from "./tel.mjs";
import { VCardTZComponent } from "./tz.mjs";
import { VCardURLComponent } from "./url.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  VCardProperties: "resource:///modules/VCardUtils.sys.mjs",
  VCardPropertyEntry: "resource:///modules/VCardUtils.sys.mjs",
});

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

      this.addEventListener("vcard-remove-property", e => {
        if (e.target.vCardPropertyEntries) {
          for (const entry of e.target.vCardPropertyEntries) {
            this.vCardProperties.removeEntry(entry);
          }
        } else {
          this.vCardProperties.removeEntry(e.target.vCardPropertyEntry);
        }

        // Move the focus to the first available valid element of the fieldset.
        const sibling =
          e.target.nextElementSibling || e.target.previousElementSibling;
        // If we got a button, focus it since it's the "add row" button.
        if (sibling?.type == "button") {
          sibling.focus();
          return;
        }

        // Otherwise we have a row field, so try to find a focusable element.
        if (sibling && this.moveFocusIntoElement(sibling)) {
          return;
        }

        // If we reach this point, the markup was unpredictable and we should
        // move the focus to a valid element to avoid focus lost.
        e.target
          .closest("fieldset")
          .querySelector(".add-property-button")
          .focus();
      });
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
        this.vCardProperties = lazy.VCardProperties.fromVCard(value);
        return;
      } catch (ex) {
        console.error(ex);
      }
    }
    this.vCardProperties = new lazy.VCardProperties("4.0");
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
      const emailEntry = VCardEmailComponent.newVCardPropertyEntry();
      emailEntry.params.pref = "1"; // Set as default email.
      this._vCardProperties.addEntry(emailEntry);
    }
    // If one of the organizational properties is present,
    // make sure they all are.
    const title = this._vCardProperties.getFirstEntry("title");
    const role = this._vCardProperties.getFirstEntry("role");
    const org = this._vCardProperties.getFirstEntry("org");
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

    for (let i = 1; i <= 4; i++) {
      if (!this._vCardProperties.getFirstEntry(`x-custom${i}`)) {
        this._vCardProperties.addEntry(
          new lazy.VCardPropertyEntry(`x-custom${i}`, {}, "text", "")
        );
      }
    }

    this.updateView();
  }

  updateView() {
    // Create new DOM and replacing other vCardProperties.
    const template = document.getElementById("template-addr-book-edit");
    const clonedTemplate = template.content.cloneNode(true);
    // Making the next two calls in one go causes a console error to be logged.
    this.replaceChildren();
    this.append(clonedTemplate);

    if (!this.vCardProperties) {
      return;
    }

    this.addFieldsetActions();

    // Insert the vCard property entries.
    for (const vCardPropertyEntry of this.vCardProperties.entries) {
      this.insertVCardElement(vCardPropertyEntry, false);
    }

    const customProperties = [
      "x-custom1",
      "x-custom2",
      "x-custom3",
      "x-custom4",
    ];
    if (customProperties.some(key => this.vCardProperties.getFirstValue(key))) {
      // If one of these properties has a value, display all of them.
      const customFieldset = this.querySelector("#addr-book-edit-custom");
      const customEl =
        customFieldset.querySelector("vcard-custom") ||
        new VCardCustomComponent();
      customEl.vCardPropertyEntries = customProperties.map(key =>
        this._vCardProperties.getFirstEntry(key)
      );
      const addCustom = document.getElementById("vcard-add-custom");
      customFieldset.insertBefore(customEl, addCustom);
      addCustom.hidden = true;
    }

    const nameEl = this.querySelector("vcard-n");
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

    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    let result = "";
    const pref = Services.prefs.getIntPref("mail.addr_book.lastnamefirst");
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
      const email = this.getDefaultEmail();
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

    const value = this.nickName.value.trim();
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
    const value = email ?? this.getDefaultEmail();
    this.contactEmailHeading.hidden = !value;
    this.contactEmailHeading.textContent = value;
  }

  /**
   * Find the default email used for this contact.
   *
   * @returns {VCardEmailComponent}
   */
  getDefaultEmail() {
    const emails = document.getElementById("vcard-email").children;
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
   * The intention is to prefill while entering a new contact. Don't fill
   * if we don't have a proper default name to show, but only a placeholder.
   *
   * @param {?Event} event - The DOM event if we have one.
   */
  fillDisplayName(event = null) {
    if (
      Services.prefs.getBoolPref("mail.addr_book.displayName.autoGeneration") &&
      event?.originalTarget.id != "vCardDisplayName" &&
      !this.displayName.isDirty &&
      this.buildDefaultName()
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
      case "n": {
        const n = new VCardNComponent();
        n.vCardPropertyEntry = entry;
        fieldset = document.getElementById("addr-book-edit-n");
        const displayNicknameContainer = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(n, displayNicknameContainer);
        return n;
      }
      case "fn": {
        const fn = new VCardFNComponent();
        fn.vCardPropertyEntry = entry;
        fieldset = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(fn, fieldset.firstElementChild);
        return fn;
      }
      case "nickname": {
        const nickname = new VCardNickNameComponent();
        nickname.vCardPropertyEntry = entry;
        fieldset = this.querySelector(
          "#addr-book-edit-n .addr-book-edit-display-nickname"
        );
        fieldset.insertBefore(
          nickname,
          fieldset.firstElementChild?.nextElementSibling
        );
        return nickname;
      }
      case "email": {
        const email = document.createElement("tr", { is: "vcard-email" });
        email.vCardPropertyEntry = entry;
        document.getElementById("vcard-email").appendChild(email);
        return email;
      }
      case "url": {
        const url = new VCardURLComponent();
        url.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-url");
        addButton = document.getElementById("vcard-add-url");
        fieldset.insertBefore(url, addButton);
        return url;
      }
      case "tel": {
        const tel = new VCardTelComponent();
        tel.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-tel");
        addButton = document.getElementById("vcard-add-tel");
        fieldset.insertBefore(tel, addButton);
        return tel;
      }
      case "tz": {
        const tz = new VCardTZComponent();
        tz.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-tz");
        addButton = document.getElementById("vcard-add-tz");
        fieldset.insertBefore(tz, addButton);
        addButton.hidden = true;
        return tz;
      }
      case "impp": {
        const impp = new VCardIMPPComponent();
        impp.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-impp");
        addButton = document.getElementById("vcard-add-impp");
        fieldset.insertBefore(impp, addButton);
        return impp;
      }
      case "anniversary": {
        const anniversary = new VCardSpecialDateComponent();
        anniversary.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-bday-anniversary");
        addButton = document.getElementById("vcard-add-bday-anniversary");
        fieldset.insertBefore(anniversary, addButton);
        return anniversary;
      }
      case "bday": {
        const bday = new VCardSpecialDateComponent();
        bday.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-bday-anniversary");
        addButton = document.getElementById("vcard-add-bday-anniversary");
        fieldset.insertBefore(bday, addButton);
        return bday;
      }
      case "adr": {
        const address = new VCardAdrComponent();
        address.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-address");
        addButton = document.getElementById("vcard-add-adr");
        fieldset.insertBefore(address, addButton);
        return address;
      }
      case "note": {
        const note = new VCardNoteComponent();
        note.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-note");
        addButton = document.getElementById("vcard-add-note");
        fieldset.insertBefore(note, addButton);
        // Only one note is allowed via UI.
        addButton.hidden = true;
        return note;
      }
      case "title": {
        const title = new VCardTitleComponent();
        title.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(
          title,
          fieldset.querySelector("vcard-role, vcard-org, #vcard-add-org")
        );
        this.querySelector(
          "#addr-book-edit-org .remove-property-button"
        ).hidden = false;
        // Only one title is allowed via UI.
        addButton.hidden = true;
        return title;
      }
      case "role": {
        const role = new VCardRoleComponent();
        role.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(
          role,
          fieldset.querySelector("vcard-org, #vcard-add-org")
        );
        this.querySelector(
          "#addr-book-edit-org .remove-property-button"
        ).hidden = false;
        // Only one role is allowed via UI.
        addButton.hidden = true;
        return role;
      }
      case "org": {
        const org = new VCardOrgComponent();
        org.vCardPropertyEntry = entry;
        fieldset = this.querySelector("#addr-book-edit-org");
        addButton = document.getElementById("vcard-add-org");
        fieldset.insertBefore(org, addButton);
        this.querySelector(
          "#addr-book-edit-org .remove-property-button"
        ).hidden = false;
        // Only one org is allowed via UI.
        addButton.hidden = true;
        return org;
      }
      default: {
        return undefined;
      }
    }
  }

  /**
   * Creates a VCardPropertyEntry with a matching
   * name to the vCard spec.
   *
   * @param {string} entryName - A name which should be a vCard spec property.
   * @returns {VCardPropertyEntry | undefined}
   */
  static createVCardProperty(entryName) {
    switch (entryName) {
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
    for (const node of [
      ...this.querySelectorAll("vcard-adr"),
      ...this.querySelectorAll("vcard-custom"),
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
    const emailEntries = this.vCardProperties.getAllEntries("email");
    if (
      emailEntries.length >= 1 &&
      emailEntries.every(entry => entry.params.pref !== "1")
    ) {
      emailEntries[0].params.pref = "1";
    }

    for (let i = 1; i <= 4; i++) {
      const entry = this._vCardProperties.getFirstEntry(`x-custom${i}`);
      if (entry && !entry.value) {
        this._vCardProperties.removeEntry(entry);
      }
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
   * @returns {boolean} - If the focus was moved into the element.
   */
  moveFocusIntoElement(element) {
    for (const child of element.querySelectorAll(
      "select,input,textarea,button"
    )) {
      // Make sure it is visible.
      if (child.clientWidth != 0 && child.clientHeight != 0) {
        child.focus();
        return true;
      }
    }
    return false;
  }

  /**
   * Add buttons and further actions of the groupings for vCard property
   * entries.
   */
  addFieldsetActions() {
    // Add email button.
    const addEmail = document.getElementById("vcard-add-email");
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
      for (const vCardEmailComponent of document.getElementById("vcard-email")
        .children) {
        if (event.target !== vCardEmailComponent) {
          vCardEmailComponent.checkboxEl.checked = false;
        }
      }
    });

    // Handling the VCardPropertyEntry change with the select.
    const specialDatesFieldset = document.getElementById(
      "addr-book-edit-bday-anniversary"
    );
    specialDatesFieldset.addEventListener(
      "vcard-bday-anniversary-change",
      event => {
        const newVCardPropertyEntry = new lazy.VCardPropertyEntry(
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

    // Add special date button.
    const addSpecialDate = document.getElementById(
      "vcard-add-bday-anniversary"
    );
    addSpecialDate.addEventListener("click", () => {
      let newVCardProperty;
      if (!this.vCardProperties.getFirstEntry("bday")) {
        newVCardProperty = VCardEdit.createVCardProperty("bday");
      } else {
        newVCardProperty = VCardEdit.createVCardProperty("anniversary");
      }
      const el = this.insertVCardElement(newVCardProperty, true);
      this.checkForBdayOccurrences();
      this.moveFocusIntoElement(el);
    });

    // Organizational Properties.
    const addOrg = document.getElementById("vcard-add-org");
    addOrg.addEventListener("click", () => {
      const title = VCardEdit.createVCardProperty("title");
      const role = VCardEdit.createVCardProperty("role");
      const org = VCardEdit.createVCardProperty("org");

      const titleEl = this.insertVCardElement(title, true);
      this.insertVCardElement(role, true);
      this.insertVCardElement(org, true);

      this.moveFocusIntoElement(titleEl);
      addOrg.hidden = true;
    });

    const addAddress = document.getElementById("vcard-add-adr");
    this.registerAddButton(addAddress, "adr");

    const addURL = document.getElementById("vcard-add-url");
    this.registerAddButton(addURL, "url");

    const addTel = document.getElementById("vcard-add-tel");
    this.registerAddButton(addTel, "tel");

    const addTZ = document.getElementById("vcard-add-tz");
    this.registerAddButton(addTZ, "tz", () => {
      addTZ.hidden = true;
    });

    const addIMPP = document.getElementById("vcard-add-impp");
    this.registerAddButton(addIMPP, "impp");

    const addNote = document.getElementById("vcard-add-note");
    this.registerAddButton(addNote, "note", () => {
      addNote.hidden = true;
    });

    const addCustom = document.getElementById("vcard-add-custom");
    addCustom.addEventListener("click", () => {
      const el = new VCardCustomComponent();

      // When the custom properties are deleted and added again ensure that
      // the properties are set.
      for (let i = 1; i <= 4; i++) {
        if (!this._vCardProperties.getFirstEntry(`x-custom${i}`)) {
          this._vCardProperties.addEntry(
            new lazy.VCardPropertyEntry(`x-custom${i}`, {}, "text", "")
          );
        }
      }

      el.vCardPropertyEntries = [
        this._vCardProperties.getFirstEntry("x-custom1"),
        this._vCardProperties.getFirstEntry("x-custom2"),
        this._vCardProperties.getFirstEntry("x-custom3"),
        this._vCardProperties.getFirstEntry("x-custom4"),
      ];
      addCustom.parentNode.insertBefore(el, addCustom);

      this.moveFocusIntoElement(el);
      addCustom.hidden = true;
    });

    // Delete button for Organization Properties. This property has multiple
    // fields, so we should dispatch the remove event only once after everything
    // has been removed.
    this.querySelector(
      "#addr-book-edit-org .remove-property-button"
    ).addEventListener("click", event => {
      this.querySelector("vcard-title").remove();
      this.querySelector("vcard-role").remove();
      const org = this.querySelector("vcard-org");
      // Reveal the "Add" button so we can focus it.
      document.getElementById("vcard-add-org").hidden = false;
      // Dispatch the event before removing the element so we can handle focus.
      org.dispatchEvent(
        new CustomEvent("vcard-remove-property", { bubbles: true })
      );
      org.remove();
      event.target.hidden = true;
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
    addButton.addEventListener("click", () => {
      const newVCardProperty = VCardEdit.createVCardProperty(VCardPropertyName);
      const el = this.insertVCardElement(newVCardProperty, true);

      this.moveFocusIntoElement(el);
      if (callback) {
        callback(el);
      }
    });
  }

  /**
   * If one BDAY vCardPropertyEntry is present disable
   * the option to change an Anniversary to a BDAY.
   *
   * @see VCardSpecialDateComponent
   */
  checkForBdayOccurrences() {
    const bdayOccurrence = this.vCardProperties.getFirstEntry("bday");
    this.querySelectorAll("vcard-special-date").forEach(specialDate => {
      specialDate.birthdayAvailability({ hasBday: !!bdayOccurrence });
    });
  }

  /**
   * Hide the default checkbox if we only have one email field.
   */
  toggleDefaultEmailView() {
    const hideDefault =
      document.getElementById("vcard-email").children.length <= 1;
    const defaultColumn = this.querySelector(".default-column");
    if (defaultColumn) {
      defaultColumn.hidden = hideDefault;
    }
    document.getElementById("addr-book-edit-email-default").hidden =
      hideDefault;

    // Add class to position legend absolute.
    document
      .getElementById("addr-book-edit-email")
      .classList.toggle("default-table-header", !hideDefault);
  }

  /**
   * Validate the form with the minimum required data to save or update a
   * contact. We can't use the built-in checkValidity() since our fields
   * are not handled properly by the form element.
   *
   * @returns {boolean} - If the form is valid or not.
   */
  checkMinimumRequirements() {
    const hasEmail = [...document.getElementById("vcard-email").children].find(
      s => {
        const field = s.querySelector(`input[type="email"]`);
        return field.value.trim() && field.checkValidity();
      }
    );
    const hasOrg = [...this.querySelectorAll("vcard-org")].find(n =>
      n.orgEl.value.trim()
    );

    return (
      this.firstName.value.trim() ||
      this.lastName.value.trim() ||
      this.displayName.value.trim() ||
      hasEmail ||
      hasOrg
    );
  }

  /**
   * Validate the special date fields making sure that we have a valid
   * DATE-AND-OR-TIME. See date, date-noreduc.
   * That is, valid if any of the fields are valid, but the combination of
   * only year and day is not valid.
   *
   * @returns {boolean} - True all created special date fields are valid.
   * @see https://datatracker.ietf.org/doc/html/rfc6350#section-4.3.4
   */
  validateDates() {
    for (const field of document.querySelectorAll("vcard-special-date")) {
      const y = field.querySelector(`input[type="number"][name="year"]`);
      const m = field.querySelector(`select[name="month"]`);
      const d = field.querySelector(`select[name="day"]`);
      if (!y.checkValidity()) {
        y.focus();
        return false;
      }
      if (y.value && d.value && !m.value) {
        m.required = true;
        m.focus();
        return false;
      }
    }
    return true;
  }
}
customElements.define("vcard-edit", VCardEdit);

/**
 * Responsible for the type selection of a vCard property.
 *
 * Couples the given vCardPropertyEntry with a <select> element.
 * This is safe because contact editing always creates a new contact, even
 * when an existing contact is selected for editing.
 *
 * @see RFC6350 TYPE
 */
class VCardTypeSelectionComponent extends HTMLElement {
  /**
   * The select element created by this custom element.
   *
   * @type {HTMLSelectElement}
   */
  selectEl;

  /**
   * Initializes the type selector elements to control the given
   * vCardPropertyEntry.
   *
   * @param {VCardPropertyEntry} vCardPropertyEntry - The VCardPropertyEntry
   *   this element should control.
   * @param {boolean} [options.createLabel] - Whether a Type label should be
   *   created for the selectEl element. If this is not `true`, then the label
   *   for the selectEl should be provided through some other means, such as the
   *   labelledBy property.
   * @param {string} [options.labelledBy] - Optional `id` of the element that
   *   should label the selectEl element (through aria-labelledby).
   * @param {string} [options.propertyType] - Specifies the set of types that
   *   should be available and shown for the corresponding property. Set as
   *   "tel" to use the set of telephone types. Otherwise defaults to only using
   *   the `home`, `work` and `(None)` types. Also used to set the telemetry
   *   identifier.
   */
  createTypeSelection(vCardPropertyEntry, options) {
    let template;
    let types;
    switch (options.propertyType) {
      case "tel":
        types = ["work", "home", "cell", "fax", "pager"];
        template = document.getElementById("template-vcard-edit-type-tel");
        break;
      default:
        types = ["work", "home"];
        template = document.getElementById("template-vcard-edit-type");
        break;
    }

    const clonedTemplate = template.content.cloneNode(true);
    this.replaceChildren(clonedTemplate);

    this.selectEl = this.querySelector("select");
    const selectId = vCardIdGen.next().value;
    this.selectEl.id = selectId;
    this.selectEl.dataset.telemetryId = `vcard-type-selection-${options.propertyType}`;

    // Just abandon any values we don't have UI for. We don't have any way to
    // know whether to keep them or not, and they're very rarely used.
    const paramsType = vCardPropertyEntry.params.type;
    // toLowerCase is called because other vCard sources are saving the type
    // in upper case. E.g. from Google.
    if (Array.isArray(paramsType)) {
      const lowerCaseTypes = paramsType.map(type => type.toLowerCase());
      this.selectEl.value = lowerCaseTypes.find(t => types.includes(t)) || "";
    } else if (paramsType && types.includes(paramsType.toLowerCase())) {
      this.selectEl.value = paramsType.toLowerCase();
    }

    // Change the value on the vCardPropertyEntry.
    this.selectEl.addEventListener("change", () => {
      if (this.selectEl.value) {
        vCardPropertyEntry.params.type = this.selectEl.value;
      } else {
        delete vCardPropertyEntry.params.type;
      }
    });

    // Set an aria-labelledyby on the select.
    if (options.labelledBy) {
      if (!document.getElementById(options.labelledBy)) {
        throw new Error(`No such label element with id ${options.labelledBy}`);
      }
      this.querySelector("select").setAttribute(
        "aria-labelledby",
        options.labelledBy
      );
    }

    // Create a label element for the select.
    if (options.createLabel) {
      const labelEl = document.createElement("label");
      labelEl.htmlFor = selectId;
      labelEl.setAttribute("data-l10n-id", "vcard-entry-type-label");
      labelEl.classList.add("screen-reader-only");
      this.insertBefore(labelEl, this.selectEl);
    }
  }
}

customElements.define("vcard-type", VCardTypeSelectionComponent);

/**
 * Interface for vCard Fields in the edit view.
 *
 * @interface VCardPropertyEntryView
 */

/**
 * Getter/Setter for rich data do not use HTMLAttributes for this.
 *  Keep the reference intact through vCardProperties for proper saving.
 *
 * @property
 * @name VCardPropertyEntryView#vCardPropertyEntry
 */

/**
 * fromUIToVCardPropertyEntry should directly change data with the reference
 *  through vCardPropertyEntry.
 * It's there for an action to read the user input values into the
 *  vCardPropertyEntry.
 *
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
 *
 * @function
 * @name VCardPropertyEntryView#valueIsEmpty
 * @returns {boolean}
 */

/**
 * Creates a new VCardPropertyEntry for usage in the a new Field.
 *
 * @function
 * @name VCardPropertyEntryView#newVCardPropertyEntry
 * @static
 * @returns {VCardPropertyEntry}
 */

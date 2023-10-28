/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gMessageHeader, gShowCondensedEmailAddresses, openUILink */

{
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );

  const lazy = {};
  ChromeUtils.defineModuleGetter(
    lazy,
    "DisplayNameUtils",
    "resource:///modules/DisplayNameUtils.jsm"
  );
  ChromeUtils.defineModuleGetter(
    lazy,
    "TagUtils",
    "resource:///modules/TagUtils.jsm"
  );

  class MultiRecipientRow extends HTMLDivElement {
    /**
     * The number of lines of recipients to display before adding a <more>
     * indicator to the widget. This can be increased using the preference
     * mailnews.headers.show_n_lines_before_more.
     *
     * @type {integer}
     */
    #maxLinesBeforeMore = 1;

    /**
     * The array of all the recipients that need to be shown in this widget.
     *
     * @type {Array<object>}
     */
    #recipients = [];

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "multi-recipient-row");
      this.classList.add("multi-recipient-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      this.heading.classList.add("row-heading");
      // message-header-to-list-name
      // message-header-from-list-name
      // message-header-cc-list-name
      // message-header-bcc-list-name
      // message-header-sender-list-name
      // message-header-reply-to-list-name
      document.l10n.setAttributes(
        this.heading,
        `message-header-${this.dataset.headerName}-list-name`
      );
      this.appendChild(this.heading);

      this.recipientsList = document.createElement("ol");
      this.recipientsList.classList.add("recipients-list");
      this.recipientsList.setAttribute("aria-labelledby", this.heading.id);
      this.appendChild(this.recipientsList);

      this.moreButton = document.createElement("button");
      this.moreButton.setAttribute("type", "button");
      this.moreButton.classList.add("show-more-recipients", "plain");
      this.moreButton.addEventListener(
        "mousedown",
        // Prevent focus being transferred to the button before it is removed.
        event => event.preventDefault()
      );
      this.moreButton.addEventListener("click", () => this.showAllRecipients());

      document.l10n.setAttributes(
        this.moreButton,
        "message-header-field-show-more"
      );

      // @implements {nsIObserver}
      this.ABObserver = {
        /**
         * Array list of all observable notifications.
         *
         * @type {Array<string>}
         */
        _notifications: [
          "addrbook-directory-created",
          "addrbook-directory-deleted",
          "addrbook-contact-created",
          "addrbook-contact-updated",
          "addrbook-contact-deleted",
        ],

        addObservers() {
          for (const topic of this._notifications) {
            Services.obs.addObserver(this, topic);
          }
          this._added = true;
          window.addEventListener("unload", this);
        },

        removeObservers() {
          if (!this._added) {
            return;
          }
          for (const topic of this._notifications) {
            Services.obs.removeObserver(this, topic);
          }
          this._added = false;
          window.removeEventListener("unload", this);
        },

        handleEvent() {
          this.removeObservers();
        },

        observe: (subject, topic, data) => {
          switch (topic) {
            case "addrbook-directory-created":
            case "addrbook-directory-deleted":
              subject.QueryInterface(Ci.nsIAbDirectory);
              this.directoryChanged(subject);
              break;
            case "addrbook-contact-created":
            case "addrbook-contact-updated":
            case "addrbook-contact-deleted":
              subject.QueryInterface(Ci.nsIAbCard);
              this.contactUpdated(subject);
              break;
          }
        },
      };

      this.ABObserver.addObservers();
    }

    /**
     * Clear things out when the element is removed from the DOM.
     */
    disconnectedCallback() {
      this.ABObserver.removeObservers();
    }

    /**
     * Loop through all available recipients and check if any of those belonged
     * to the created or removed address book.
     *
     * @param {nsIAbDirectory} subject - The created or removed Address Book.
     */
    directoryChanged(subject) {
      if (!(subject instanceof Ci.nsIAbDirectory)) {
        return;
      }

      for (const recipient of [...this.recipientsList.childNodes].filter(
        r => r.cardDetails?.book?.dirPrefId == subject.dirPrefId
      )) {
        recipient.updateRecipient();
      }
    }

    /**
     * Loop through all available recipients and update the UI to reflect if
     * they were saved, updated, or removed as contacts in an address book.
     *
     * @param {nsIAbCard} subject - The changed contact card.
     */
    contactUpdated(subject) {
      if (!(subject instanceof Ci.nsIAbCard)) {
        // Bail out if this is not a valid Address Book Card object.
        return;
      }

      if (!subject.isMailList && !subject.emailAddresses.length) {
        // Bail out if we don't have any addresses to match against.
        return;
      }

      const addresses = subject.emailAddresses;
      for (const recipient of [...this.recipientsList.childNodes].filter(
        r => r.emailAddress && addresses.includes(r.emailAddress)
      )) {
        recipient.updateRecipient();
      }
    }

    /**
     * Add a recipient to be shown in this widget. The recipient won't be shown
     * until the row view is built.
     *
     * @param {object} recipient - The recipient element.
     * @param {string} recipient.displayName - The recipient display name.
     * @param {string} [recipient.emailAddress] - The recipient email address.
     * @param {string} [recipient.fullAddress] - The recipient full address.
     */
    addRecipient(recipient) {
      this.#recipients.push(recipient);
    }

    buildView() {
      this.#maxLinesBeforeMore = Services.prefs.getIntPref(
        "mailnews.headers.show_n_lines_before_more"
      );
      const showAllHeaders =
        this.#maxLinesBeforeMore < 1 ||
        Services.prefs.getIntPref("mail.show_headers") ==
          Ci.nsMimeHeaderDisplayTypes.AllHeaders ||
        this.dataset.showAll == "true";
      this.buildRecipients(showAllHeaders);
    }

    buildRecipients(showAllHeaders) {
      // Determine focus before clearing the children.
      const focusIndex = [...this.recipientsList.childNodes].findIndex(node =>
        node.contains(document.activeElement)
      );
      this.recipientsList.replaceChildren();
      gMessageHeader.toggleScrollableHeader(showAllHeaders);

      // Store the available width of the entire row.
      // FIXME! The size of the rows can variate depending on when adjacent
      // elements are generated (e.g.: TO row + date row), therefore this size
      // is not always accurate when viewing the first email. We should defer
      // the generation of the multi recipient rows only after all the other
      // headers have been populated.
      const availableWidth = !showAllHeaders
        ? this.recipientsList.getBoundingClientRect().width
        : 0;

      // Track the space occupied by recipients per row. Every time we exceed
      // the available space of a single row, we reset this value.
      let currentRowWidth = 0;
      // Track how many rows are being populated by recipients.
      let rows = 1;
      for (let [count, recipient] of this.#recipients.entries()) {
        const li = document.createElement("li", { is: "header-recipient" });
        // Set an id before connected callback is called on the element.
        li.id = `${this.dataset.headerName}Recipient${count}`;
        // Append the element to the DOM to trigger the connectedCallback.
        this.recipientsList.appendChild(li);
        li.dataset.headerName = this.dataset.headerName;
        li.recipient = recipient;

        // Bail out if we need to show all elements.
        if (showAllHeaders) {
          continue;
        }

        // Keep track of how much space our recipients are occupying.
        let width = li.getBoundingClientRect().width;
        // FIXME! If we have more than one recipient, we add a comma as pseudo
        // element after the previous element. Account for that by adding an
        // arbitrary 30px size to simulate extra characters space. This is a bit
        // of an extreme sizing as it's almost as large as the more button, but
        // it's necessary to make sure we never encounter that scenario.
        if (count > 0) {
          width += 30;
        }
        currentRowWidth += width;

        if (currentRowWidth <= availableWidth) {
          continue;
        }

        // If the recipients available in the current row exceed the
        // available space, increase the row count and set the value of the
        // last added list item to the next row width counter.
        if (rows < this.#maxLinesBeforeMore) {
          rows++;
          currentRowWidth = width;
          continue;
        }

        // Append the "more" button inside a list item to be properly handled
        // as an inline element of the recipients list UI.
        const buttonLi = document.createElement("li");
        buttonLi.appendChild(this.moreButton);
        this.recipientsList.appendChild(buttonLi);
        currentRowWidth += buttonLi.getBoundingClientRect().width;

        // Reverse loop through the added list item and remove them until
        // they all fit in the current row alongside the "more" button.
        for (; count && currentRowWidth > availableWidth; count--) {
          const toRemove = this.recipientsList.childNodes[count];
          currentRowWidth -= toRemove.getBoundingClientRect().width;
          toRemove.remove();
        }

        // Skip the "more" button, which is present if we reached this stage.
        const lastRecipientIndex = this.recipientsList.childNodes.length - 2;
        // Add a unique class to the last visible recipient to remove the
        // comma separator added via pseudo element.
        this.recipientsList.childNodes[lastRecipientIndex].classList.add(
          "last-before-button"
        );

        break;
      }

      if (focusIndex >= 0) {
        // If we had focus before, restore focus to the same index, or the last node.
        const focusNode =
          this.recipientsList.childNodes[
            Math.min(focusIndex, this.recipientsList.childNodes.length - 1)
          ];
        if (focusNode.contains(this.moreButton)) {
          // The button is focusable.
          this.moreButton.focus();
        } else {
          // The item is focusable.
          focusNode.focus();
        }
      }
    }

    /**
     * Show all recipients available in this widget.
     */
    showAllRecipients() {
      this.buildRecipients(true);
    }

    /**
     * Empty the widget.
     */
    clear() {
      this.#recipients = [];
      this.recipientsList.replaceChildren();
    }
  }
  customElements.define("multi-recipient-row", MultiRecipientRow, {
    extends: "div",
  });

  class HeaderRecipient extends HTMLLIElement {
    /**
     * The object holding the recipient information.
     *
     * @type {object}
     * @property {string} displayName - The recipient display name.
     * @property {string} [emailAddress] - The recipient email address.
     * @property {string} [fullAddress] - The recipient full address.
     */
    #recipient = {};

    /**
     * The Card object if the recipients is saved in the address book.
     *
     * @type {object}
     * @property {?object} book - The address book in which the contact is
     *   saved, if we have a card.
     * @property {?object} card - The saved contact card, if present.
     */
    cardDetails = {};

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "header-recipient");
      this.classList.add("header-recipient");
      this.tabIndex = 0;

      this.avatar = document.createElement("div");
      this.avatar.classList.add("recipient-avatar");
      this.appendChild(this.avatar);

      this.email = document.createElement("span");
      this.email.classList.add("recipient-single-line");
      this.email.id = `${this.id}Display`;
      this.appendChild(this.email);

      this.multiLine = document.createElement("span");
      this.multiLine.classList.add("recipient-multi-line");

      this.nameLine = document.createElement("span");
      this.nameLine.classList.add("recipient-multi-line-name");
      this.multiLine.appendChild(this.nameLine);

      this.addressLine = document.createElement("span");
      this.addressLine.classList.add("recipient-multi-line-address");
      this.multiLine.appendChild(this.addressLine);

      this.appendChild(this.multiLine);

      this.abIndicator = document.createElement("button");
      this.abIndicator.classList.add(
        "recipient-address-book-button",
        "plain-button"
      );
      // We make the button non-focusable since its functionality is equivalent
      // to the first item in the popup menu, so we can save a tab-stop.
      this.abIndicator.tabIndex = -1;
      this.abIndicator.addEventListener("click", event => {
        event.stopPropagation();
        if (this.cardDetails.card) {
          gMessageHeader.editContact(this);
          return;
        }

        this.addToAddressBook();
      });

      const img = document.createElement("img");
      img.id = `${this.id}AbIcon`;
      img.src = "chrome://messenger/skin/icons/new/address-book-indicator.svg";
      document.l10n.setAttributes(
        img,
        "message-header-address-not-in-address-book-icon2"
      );

      this.abIndicator.appendChild(img);
      this.appendChild(this.abIndicator);

      // Use the email and icon as the accessible name. We do this to stop the
      // button title from contributing to the accessible name.
      // TODO: If the button or its title is removed, or the title replaces the
      // image alt text, then remove this aria-labelledby attribute. The id's
      // will no longer be necessary either.
      this.setAttribute("aria-labelledby", `${this.email.id} ${img.id}`);

      this.addEventListener("contextmenu", event => {
        gMessageHeader.openEmailAddressPopup(event, this);
      });
      this.addEventListener("click", event => {
        gMessageHeader.openEmailAddressPopup(event, this);
      });
      this.addEventListener("keypress", event => {
        if (event.key == "Enter") {
          gMessageHeader.openEmailAddressPopup(event, this);
        }
      });
    }

    set recipient(recipient) {
      this.#recipient = recipient;
      this.updateRecipient();
    }

    get displayName() {
      return this.#recipient.displayName;
    }

    get emailAddress() {
      return this.#recipient.emailAddress;
    }

    get fullAddress() {
      return this.#recipient.fullAddress;
    }

    updateRecipient() {
      if (!this.emailAddress) {
        this.abIndicator.hidden = true;
        this.email.textContent = this.displayName;
        if (this.dataset.headerName == "from") {
          this.nameLine.textContent = this.displayName;
          this.addressLine.textContent = "";
          this.avatar.replaceChildren();
          this.avatar.classList.remove("has-avatar");
        }
        this.cardDetails = {};
        return;
      }

      this.abIndicator.hidden = false;
      const card = MailServices.ab.cardForEmailAddress(
        this.#recipient.emailAddress
      );
      this.cardDetails = {
        card,
        book: card
          ? MailServices.ab.getDirectoryFromUID(card.directoryUID)
          : null,
      };

      const displayName = lazy.DisplayNameUtils.formatDisplayName(
        this.emailAddress,
        this.displayName,
        this.dataset.headerName,
        this.cardDetails.card
      );

      // Show only the display name if we have a valid card and the user wants
      // to show a condensed header (without the full email address) for saved
      // contacts.
      if (gShowCondensedEmailAddresses && displayName) {
        this.email.textContent = displayName;
        this.email.setAttribute("title", this.#recipient.fullAddress);
      } else {
        this.email.textContent = this.#recipient.fullAddress;
        this.email.removeAttribute("title");
      }

      if (this.dataset.headerName == "from") {
        if (gShowCondensedEmailAddresses) {
          this.nameLine.textContent =
            displayName || this.displayName || this.fullAddress;
        } else {
          this.nameLine.textContent = this.fullAddress;
        }
        this.addressLine.textContent = this.emailAddress;
      }

      const hasCard = this.cardDetails.card;
      // Update the style of the indicator button.
      this.abIndicator.classList.toggle("in-address-book", hasCard);
      document.l10n.setAttributes(
        this.abIndicator,
        hasCard
          ? "message-header-address-in-address-book-button"
          : "message-header-address-not-in-address-book-button"
      );
      document.l10n.setAttributes(
        this.abIndicator.querySelector("img"),
        hasCard
          ? "message-header-address-in-address-book-icon2"
          : "message-header-address-not-in-address-book-icon2"
      );

      if (this.dataset.headerName == "from") {
        this._updateAvatar();
      }
    }

    _updateAvatar() {
      this.avatar.replaceChildren();

      if (!this.cardDetails.card) {
        this._createAvatarPlaceholder();
        return;
      }

      // We have a card, so let's try to fetch the image.
      const card = this.cardDetails.card;
      const photoURL = card.photoURL;
      if (photoURL) {
        const img = document.createElement("img");
        document.l10n.setAttributes(img, "message-header-recipient-avatar", {
          address: this.emailAddress,
        });
        // TODO: We should fetch a dynamically generated smaller version of the
        // uploaded picture to avoid loading large images that will only be used
        // in smaller format.
        img.src = photoURL;
        this.avatar.appendChild(img);
        this.avatar.classList.add("has-avatar");
      } else {
        this._createAvatarPlaceholder();
      }
    }

    _createAvatarPlaceholder() {
      const letter = document.createElement("span");
      letter.textContent = Array.from(
        this.nameLine.textContent || this.displayName || this.fullAddress
      )[0]?.toUpperCase();
      letter.setAttribute("aria-hidden", "true");
      this.avatar.appendChild(letter);
      this.avatar.classList.remove("has-avatar");
    }

    addToAddressBook() {
      const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
        Ci.nsIAbCard
      );
      card.displayName = this.#recipient.displayName;
      card.primaryEmail = this.#recipient.emailAddress;

      const addressBook = MailServices.ab.getDirectory(
        "jsaddrbook://abook.sqlite"
      );
      addressBook.addCard(card);
    }
  }
  customElements.define("header-recipient", HeaderRecipient, {
    extends: "li",
  });

  class SimpleHeaderRow extends HTMLDivElement {
    constructor() {
      super();

      this.addEventListener("contextmenu", event => {
        gMessageHeader.openCopyPopup(event, this);
      });
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "simple-header-row");
      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      this.heading.classList.add("row-heading");
      const sep = document.createElement("span");
      sep.classList.add("screen-reader-only");
      sep.setAttribute("data-l10n-name", "field-separator");
      this.heading.appendChild(sep);

      if (
        ["organization", "subject", "date", "user-agent"].includes(
          this.dataset.headerName
        )
      ) {
        // message-header-organization-field
        // message-header-subject-field
        // message-header-date-field
        // message-header-user-agent-field
        document.l10n.setAttributes(
          this.heading,
          `message-header-${this.dataset.headerName}-field`
        );
      } else {
        // If this simple row is used by an autogenerated custom header,
        // use directly that header value as label.
        document.l10n.setAttributes(
          this.heading,
          "message-header-custom-field",
          {
            fieldName: this.dataset.prettyHeaderName,
          }
        );
      }
      this.appendChild(this.heading);

      this.classList.add("header-row");
      this.tabIndex = 0;

      this.value = document.createElement("span");
      this.appendChild(this.value);
    }

    /**
     * Set the text content for this row.
     *
     * @param {string} val - The content string to be added to this row.
     */
    set headerValue(val) {
      this.value.textContent = val;
      // NOTE: In principle, we could use aria-labelledby and point to the
      // heading and value elements. However, for some reason the expected
      // accessible name is not read out when focused whilst using Orca screen
      // reader. Instead, only the content of the value element is read out.
      // This may be because this element has no proper ARIA role since we are
      // extending a div, which is not a best approach, so we can't expect
      // proper support.
      // TODO: This area needs some proper semantics to associate the fieldname
      // with the field value, whilst being focusable to allow the user to open
      // a context menu on the row.
      this.setAttribute(
        "aria-label",
        `${this.heading.textContent} ${this.value.textContent}`
      );
    }
  }
  customElements.define("simple-header-row", SimpleHeaderRow, {
    extends: "div",
  });

  class UrlHeaderRow extends SimpleHeaderRow {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      super.connectedCallback();

      this.setAttribute("is", "url-header-row");
      document.l10n.setAttributes(this.heading, "message-header-website-field");

      this.value.classList.add("text-link");
      this.addEventListener("click", event => {
        if (event.button != 2) {
          openUILink(encodeURI(this.value.textContent), event);
        }
      });
      this.addEventListener("keydown", event => {
        if (event.key == "Enter") {
          openUILink(encodeURI(this.value.textContent), event);
        }
      });
    }
  }
  customElements.define("url-header-row", UrlHeaderRow, {
    extends: "div",
  });

  class HeaderNewsgroupsRow extends HTMLDivElement {
    /**
     * The array of all the newsgroups that need to be shown in this row.
     *
     * @type {Array<object>}
     */
    #newsgroups = [];

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "header-newsgroups-row");
      this.classList.add("header-newsgroups-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      this.heading.classList.add("row-heading");
      // message-header-newsgroups-list-name
      // message-header-followup-to-list-name
      document.l10n.setAttributes(
        this.heading,
        `message-header-${this.dataset.headerName}-list-name`
      );
      this.appendChild(this.heading);

      this.newsgroupsList = document.createElement("ol");
      this.newsgroupsList.classList.add("newsgroups-list");
      this.newsgroupsList.setAttribute("aria-labelledby", this.heading.id);
      this.appendChild(this.newsgroupsList);
    }

    addNewsgroup(newsgroup) {
      this.#newsgroups.push(newsgroup);
    }

    buildView() {
      this.newsgroupsList.replaceChildren();
      for (const newsgroup of this.#newsgroups) {
        const li = document.createElement("li", { is: "header-newsgroup" });
        this.newsgroupsList.appendChild(li);
        li.textContent = newsgroup;
      }
    }

    clear() {
      this.#newsgroups = [];
      this.newsgroupsList.replaceChildren();
    }
  }
  customElements.define("header-newsgroups-row", HeaderNewsgroupsRow, {
    extends: "div",
  });

  class HeaderNewsgroup extends HTMLLIElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "header-newsgroup");
      this.classList.add("header-newsgroup");
      this.tabIndex = 0;

      this.addEventListener("contextmenu", event => {
        gMessageHeader.openNewsgroupPopup(event, this);
      });
      this.addEventListener("click", event => {
        gMessageHeader.openNewsgroupPopup(event, this);
      });
      this.addEventListener("keypress", event => {
        if (event.key == "Enter") {
          gMessageHeader.openNewsgroupPopup(event, this);
        }
      });
    }
  }
  customElements.define("header-newsgroup", HeaderNewsgroup, {
    extends: "li",
  });

  class HeaderTagsRow extends HTMLDivElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "header-tags-row");
      this.classList.add("header-tags-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      this.heading.classList.add("row-heading");
      document.l10n.setAttributes(
        this.heading,
        "message-header-tags-list-name"
      );
      this.appendChild(this.heading);

      this.tagsList = document.createElement("ol");
      this.tagsList.classList.add("tags-list");
      this.tagsList.setAttribute("aria-labelledby", this.heading.id);
      this.appendChild(this.tagsList);
    }

    buildTags(tags) {
      // Clear old tags.
      this.tagsList.replaceChildren();

      for (const tag of tags) {
        // For each tag, create a label, give it the font color that corresponds to the
        // color of the tag and append it.
        let tagName;
        try {
          // if we got a bad tag name, getTagForKey will throw an exception, skip it
          // and go to the next one.
          tagName = MailServices.tags.getTagForKey(tag);
        } catch (ex) {
          continue;
        }

        // Create a label for the tag name and set the color.
        const li = document.createElement("li");
        li.tabIndex = 0;
        li.classList.add("tag");
        li.textContent = tagName;

        const color = MailServices.tags.getColorForKey(tag);
        if (color) {
          const textColor = !lazy.TagUtils.isColorContrastEnough(color)
            ? "white"
            : "black";
          li.setAttribute(
            "style",
            `color: ${textColor}; background-color: ${color};`
          );
        }

        this.tagsList.appendChild(li);
      }
    }

    clear() {
      this.tagsList.replaceChildren();
    }
  }
  customElements.define("header-tags-row", HeaderTagsRow, {
    extends: "div",
  });

  class MultiMessageIdsRow extends HTMLDivElement {
    /**
     * The array of all the IDs that need to be shown in this row.
     *
     * @type {Array<object>}
     */
    #ids = [];

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "multi-message-ids-row");
      this.classList.add("multi-message-ids-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      this.heading.classList.add("row-heading");
      const sep = document.createElement("span");
      sep.classList.add("screen-reader-only");
      sep.setAttribute("data-l10n-name", "field-separator");
      this.heading.appendChild(sep);

      // message-header-references-field
      // message-header-message-id-field
      // message-header-in-reply-to-field
      document.l10n.setAttributes(
        this.heading,
        `message-header-${this.dataset.headerName}-field`
      );
      this.appendChild(this.heading);

      this.idsList = document.createElement("ol");
      this.idsList.classList.add("ids-list");
      this.appendChild(this.idsList);

      this.toggleButton = document.createElement("button");
      this.toggleButton.setAttribute("type", "button");
      this.toggleButton.classList.add("show-more-ids", "plain");
      this.toggleButton.addEventListener(
        "mousedown",
        // Prevent focus being transferred to the button before it is removed.
        event => event.preventDefault()
      );
      this.toggleButton.addEventListener("click", () => this.buildView(true));

      document.l10n.setAttributes(
        this.toggleButton,
        "message-ids-field-show-all"
      );
    }

    addId(id) {
      this.#ids.push(id);
    }

    buildView(showAll = false) {
      this.idsList.replaceChildren();
      for (const [count, id] of this.#ids.entries()) {
        const li = document.createElement("li", { is: "header-message-id" });
        li.id = id;
        this.idsList.appendChild(li);
        if (!showAll && count < this.#ids.length - 1 && this.#ids.length > 1) {
          li.messageId.textContent = count + 1;
          li.messageId.title = id;
        } else {
          li.messageId.textContent = id;
        }
      }

      if (!showAll && this.#ids.length > 1) {
        this.idsList.lastElementChild.classList.add("last-before-button");
        const liButton = document.createElement("li");
        liButton.appendChild(this.toggleButton);
        this.idsList.appendChild(liButton);
      }
    }

    clear() {
      this.#ids = [];
      this.idsList.replaceChildren();
    }
  }
  customElements.define("multi-message-ids-row", MultiMessageIdsRow, {
    extends: "div",
  });

  class HeaderMessageId extends HTMLLIElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "header-message-id");
      this.classList.add("header-message-id");

      this.messageId = document.createElement("span");
      this.messageId.classList.add("text-link");
      this.messageId.tabIndex = 0;
      this.appendChild(this.messageId);

      this.messageId.addEventListener("contextmenu", event => {
        gMessageHeader.openMessageIdPopup(event, this);
      });
      this.messageId.addEventListener("click", event => {
        gMessageHeader.onMessageIdClick(event);
      });
      this.messageId.addEventListener("keypress", event => {
        if (event.key == "Enter") {
          gMessageHeader.onMessageIdClick(event);
        }
      });
    }
  }
  customElements.define("header-message-id", HeaderMessageId, {
    extends: "li",
  });
}

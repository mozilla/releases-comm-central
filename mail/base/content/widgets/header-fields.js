/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global gMessageHeader, gShowCondensedEmailAddresses */

{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { DisplayNameUtils } = ChromeUtils.import(
    "resource:///modules/DisplayNameUtils.jsm"
  );
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
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
     * @type {Array<Object>}
     */
    #recipients = [];

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.classList.add("multi-recipient-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      let sep = document.createElement("span");
      sep.classList.add("screen-reader-only");
      sep.setAttribute("data-l10n-name", "field-separator");
      this.heading.appendChild(sep);
      this.heading.hidden = true;
      // message-header-to-field
      // message-header-from-field
      // message-header-cc-field
      // message-header-bcc-field
      // message-header-sender-field
      // message-header-reply-to-field
      document.l10n.setAttributes(
        this.heading,
        `message-header-${this.dataset.headerName}-field`
      );
      this.appendChild(this.heading);

      this.recipientsList = document.createElement("ol");
      this.recipientsList.classList.add("recipients-list");
      this.appendChild(this.recipientsList);

      this.moreButton = document.createElement("button");
      this.moreButton.setAttribute("type", "button");
      this.moreButton.classList.add("show-more-recipients", "plain");
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
          for (let topic of this._notifications) {
            Services.obs.addObserver(this, topic);
          }
          this._added = true;
          window.addEventListener("unload", this);
        },

        removeObservers() {
          if (!this._added) {
            return;
          }
          for (let topic of this._notifications) {
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

      for (let recipient of [...this.recipientsList.childNodes].filter(
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

      let addresses = subject.emailAddresses;
      for (let recipient of [...this.recipientsList.childNodes].filter(
        r => r.emailAddress && addresses.includes(r.emailAddress)
      )) {
        recipient.updateRecipient();
      }
    }

    /**
     * Add a recipient to be shown in this widget. The recipient won't be shown
     * until the row view is built.
     *
     * @param {Object} recipient - The recipient element.
     * @param {String} recipient.displayName - The recipient display name.
     * @param {String} [recipient.emailAddress] - The recipient email address.
     * @param {String} [recipient.fullAddress] - The recipient full address.
     */
    addRecipient(recipient) {
      this.#recipients.push(recipient);
    }

    buildView() {
      this.#maxLinesBeforeMore = Services.prefs.getIntPref(
        "mailnews.headers.show_n_lines_before_more"
      );
      let showAllHeaders =
        this.#maxLinesBeforeMore < 1 ||
        Services.prefs.getIntPref("mail.show_headers") ==
          Ci.nsMimeHeaderDisplayTypes.AllHeaders ||
        this.dataset.showAll == "true";
      this.buildRecipients(showAllHeaders);
    }

    buildRecipients(showAllHeaders) {
      this.recipientsList.replaceChildren();
      gMessageHeader.toggleScrollableHeader(showAllHeaders);

      // Store the available width of the entire row.
      // FIXME! The size of the rows can variate depending on when adjacent
      // elements are generated (e.g.: TO row + date row), therefore this size
      // is not always accurate when viewing the first email. We should defer
      // the generation of the multi recipient rows only after all the other
      // headers have been populated.
      let availableWidth = !showAllHeaders
        ? this.recipientsList.getBoundingClientRect().width
        : 0;

      // Track the space occupied by recipients per row. Every time we exceed
      // the available space of a single row, we reset this value.
      let currentRowWidth = 0;
      // Track how many rows are being populated by recipients.
      let rows = 1;
      for (let [count, recipient] of this.#recipients.entries()) {
        let li = document.createElement("li", { is: "header-recipient" });
        // Append the element to the DOM to trigger the connectedCallback.
        this.recipientsList.appendChild(li);
        li.dataset.headerName = this.dataset.headerName;
        li.recipient = recipient;
        // Set a proper accessible label by combining the row label and the
        // full address of the recipient.
        li.setAttribute(
          "aria-label",
          `${this.heading.textContent} ${li.fullAddress}`
        );

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
        let buttonLi = document.createElement("li");
        buttonLi.appendChild(this.moreButton);
        this.recipientsList.appendChild(buttonLi);
        currentRowWidth += buttonLi.getBoundingClientRect().width;

        // Reverse loop through the added list item and remove them until
        // they all fit in the current row alongside the "more" button.
        for (; count && currentRowWidth > availableWidth; count--) {
          let toRemove = this.recipientsList.childNodes[count];
          currentRowWidth -= toRemove.getBoundingClientRect().width;
          toRemove.remove();
        }

        // Skip the "more" button, which is present if we reached this stage.
        let lastRecipientIndex = this.recipientsList.childNodes.length - 2;
        // Add a unique class to the last visible recipient to remove the
        // comma separator added via pseudo element.
        this.recipientsList.childNodes[lastRecipientIndex].classList.add(
          "last-before-button"
        );

        break;
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
     * @type {Object}
     * @property {String} displayName - The recipient display name.
     * @property {String} [emailAddress] - The recipient email address.
     * @property {String} [fullAddress] - The recipient full address.
     */
    #recipient = {};

    /**
     * The Card object if the recipients is saved in the address book.
     *
     * @type {Object}
     * @property {?Object} book - The address book in which the contact is
     *   saved, if we have a card.
     * @property {?Object} card - The saved contact card, if present.
     */
    cardDetails = {};

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.classList.add("header-recipient");
      this.tabIndex = 0;

      this.email = document.createElement("span");
      this.appendChild(this.email);

      this.abIndicator = document.createElement("button");
      this.abIndicator.classList.add(
        "recipient-address-book-button",
        "plain-button"
      );
      this.abIndicator.tabIndex = -1;
      this.abIndicator.addEventListener("click", event => {
        event.stopPropagation();
        if (this.cardDetails.card) {
          gMessageHeader.editContact(this);
          return;
        }

        this.addToAddressBook();
      });

      let img = document.createElement("img");
      img.src = "chrome://messenger/skin/icons/new/not-in-address-book.svg";
      document.l10n.setAttributes(
        img,
        "message-header-address-not-in-address-book-icon2"
      );

      this.abIndicator.appendChild(img);
      this.appendChild(this.abIndicator);

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
        this.cardDetails = {};
        return;
      }

      this.abIndicator.hidden = false;
      this.cardDetails = DisplayNameUtils.getCardForEmail(
        this.#recipient.emailAddress
      );

      let displayName = DisplayNameUtils.formatDisplayName(
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
      } else {
        this.email.textContent =
          this.#recipient.fullAddress || this.#recipient.displayName;
      }

      let hasCard = this.cardDetails.card;
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
    }

    addToAddressBook() {
      let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
        Ci.nsIAbCard
      );
      card.displayName = this.#recipient.displayName;
      card.primaryEmail = this.#recipient.emailAddress;

      let addressBook = MailServices.ab.getDirectory(
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

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      let sep = document.createElement("span");
      sep.classList.add("screen-reader-only");
      sep.setAttribute("data-l10n-name", "field-separator");
      this.heading.appendChild(sep);
      this.heading.hidden = true;

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
        this.heading.textContent = this.dataset.headerName;
      }
      this.appendChild(this.heading);

      this.classList.add("header-row");
      this.tabIndex = 0;

      this.value = document.createElement("span");
      this.value.id = `${this.dataset.headerName}Value`;
      this.appendChild(this.value);

      this.setAttribute(
        "aria-labelledby",
        `${this.heading.id} ${this.value.id}`
      );
    }

    /**
     * Set the text content for this row.
     *
     * @param {string} val - The content string to be added to this row.
     */
    set headerValue(val) {
      this.value.textContent = val;
    }
  }
  customElements.define("simple-header-row", SimpleHeaderRow, {
    extends: "div",
  });

  class HeaderNewsgroupsRow extends HTMLDivElement {
    /**
     * The array of all the newsgroups that need to be shown in this row.
     *
     * @type {Array<Object>}
     */
    #newsgroups = [];

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.classList.add("header-newsgroups-row");

      this.heading = document.createElement("span");
      this.heading.id = `${this.dataset.headerName}Heading`;
      let sep = document.createElement("span");
      sep.classList.add("screen-reader-only");
      sep.setAttribute("data-l10n-name", "field-separator");
      this.heading.appendChild(sep);
      this.heading.hidden = true;
      document.l10n.setAttributes(
        this.heading,
        "message-header-newsgroups-field"
      );
      this.appendChild(this.heading);

      this.newsgroupsList = document.createElement("ol");
      this.newsgroupsList.classList.add("newsgroups-list");
      this.appendChild(this.newsgroupsList);
    }

    addNewsgroup(newsgroup) {
      this.#newsgroups.push(newsgroup);
    }

    buildView() {
      this.newsgroupsList.replaceChildren();
      for (let newsgroup of this.#newsgroups) {
        let li = document.createElement("li", { is: "header-newsgroup" });
        this.newsgroupsList.appendChild(li);
        li.textContent = newsgroup;
        // Set a proper accessible label by combining the row label and the
        // newsgroup name.
        li.setAttribute(
          "aria-label",
          `${this.heading.textContent} ${li.textContent}`
        );
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
}

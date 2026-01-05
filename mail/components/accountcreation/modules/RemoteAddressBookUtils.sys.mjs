/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CardDAVUtils: "resource:///modules/CardDAVUtils.sys.mjs",
  MailServices: "resource:///modules/MailServices.sys.mjs",
  OAuth2Providers: "resource:///modules/OAuth2Providers.sys.mjs",
});

/**
 * Maintains a list of CardDAV address book URIs. Lazily initialized and
 * updated.
 */
const existingCardDAVBooks = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),
  /**
   * The list of URIs of the CardDAV books.
   *
   * @type {?Set<string>}
   */
  _list: null,
  /**
   * If this has observers for address books being created and deleted.
   *
   * @type {boolean}
   */
  _isObserving: false,
  /**
   * Update the list of URLs in _list from the current address books.
   */
  updateExistingAddressBooks() {
    this._list = new Set(
      lazy.MailServices.ab.directories
        .map(directory => directory.getStringValue("carddav.url", ""))
        .filter(Boolean)
    );
  },
  /**
   * Make sure _list is set and this is subscribed to address book observer
   * notifications.
   */
  ensureInitialized() {
    if (!this._list) {
      this.updateExistingAddressBooks();
    }
    if (this._isObserving) {
      return;
    }
    Services.obs.addObserver(this, "addrbook-directory-created");
    Services.obs.addObserver(this, "addrbook-directory-deleted");
    this._isObserving = true;
  },
  /**
   * Handling the address book observer notifications by resetting the cached
   * list of URLs.
   *
   * @param {*} subject
   * @param {string} topic
   */
  observe(subject, topic) {
    if (
      topic != "addrbook-directory-created" &&
      topic != "addrbook-directory-deleted"
    ) {
      return;
    }
    this._list = null;
  },
  /**
   * Getter that lazily initializes the list of CardDAV address book URLs. The
   * part of this that other things should interact with.
   */
  get list() {
    this.ensureInitialized();
    return this._list;
  },
};

/**
 * @typedef {object} AccountAddressBooks
 * @property {nsIMsgAccount} account - A user account.
 * @property {foundBook} addressBooks - An address book linked to the user account.
 * @property {number} existingAddressBookCount - Already synced address books
 *  count.
 */

/**
 * @typedef {object} foundBook
 * @property {URL} url - The address for this address book.
 * @property {string} name - The name of this address book on the server.
 * @property {Function} create - A callback to add this address book locally.
 * @property {boolean} existing - Address book has already been synced.
 */

export const RemoteAddressBookUtils = {
  /**
   * Find remote address books for all existing accounts.
   *
   * @returns {AccountAddressBooks[]} An array of accounts with found remote
   *  address books.
   */
  async getAddressBooksForExistingAccounts() {
    const accounts = lazy.MailServices.accounts.accounts;
    const results = await Promise.allSettled(
      accounts.map(async account => {
        // Skip non-mail account types.
        if (
          ["none", "rss", "nntp", "im"].includes(account.incomingServer.type)
        ) {
          return null;
        }
        // If auth method is OAuth, and CardDAV scope wasn't granted, bail out.
        if (account.incomingServer.authMethod === Ci.nsMsgAuthMethod.OAuth2) {
          if (
            !lazy.OAuth2Providers.getHostnameDetails(
              account.incomingServer.hostName,
              "carddav"
            )
          ) {
            return null;
          }
        } else if (account.incomingServer.passwordPromptRequired) {
          // Can't retrieve the password for this account without a password
          // prompt, so skip it here.
          return null;
        }
        let hostname = account.incomingServer.username.split("@", 2)[1];
        // Try the hostname from the default identity's email if the username
        // has no hostname.
        if (!hostname) {
          hostname = account.defaultIdentity.email?.split("@", 2)[1];
        }
        // If we still have no hostname, give up.
        if (!hostname) {
          return null;
        }
        // Tell discovery code to store the password, since we retrieved it
        // from storage anyway.
        const addressBooks =
          await RemoteAddressBookUtils.getAddressBooksForAccount(
            account.incomingServer.username,
            account.incomingServer.password,
            `https://${hostname}`,
            true
          );
        // If we found no address books, handle it the same as if we couldn't
        // check for address books for this account.
        if (!addressBooks?.length) {
          return null;
        }
        return {
          account,
          addressBooks,
          existingAddressBookCount: addressBooks.reduce(
            (count, book) => count + (book.existing ? 1 : 0),
            0
          ),
        };
      })
    );
    return results
      .filter(result => {
        if (result.status == "rejected") {
          console.warn(result.reason);
        }
        return result.status == "fulfilled" && result.value;
      })
      .map(result => result.value);
  },

  /**
   * Find CardDAV address books for a given account config. Existing address
   * books are marked as such.
   *
   * @param {string} username - Username for the CardDAV endpoint.
   * @param {string} password - Password for the CardDAV endpoint.
   * @param {string} server - URL to search the CardDAV endpoint on.
   * @param {boolean} [storePassword = false] - If the password should be stored
   *   if necessary.
   * @returns {AccountAddressBooks} Address books found for the given account.
   */
  async getAddressBooksForAccount(
    username,
    password,
    server,
    storePassword = false
  ) {
    const foundBooks = await lazy.CardDAVUtils.detectAddressBooks(
      username,
      password,
      server,
      false,
      storePassword
    );
    return this.markExistingAddressBooks(foundBooks);
  },

  /**
   * Mark address books that already exist in a list of address books.
   *
   * @param {foundBook[]} addressBooks - Address books found by CardDAV utils.
   * @returns {foundBook[]} The address books, with an updated value for their
   *  existing property.
   */
  markExistingAddressBooks(addressBooks) {
    return addressBooks.map(addressBook => {
      if (existingCardDAVBooks.list.has(addressBook.url.href)) {
        addressBook.existing = true;
      }
      return addressBook;
    });
  },
};

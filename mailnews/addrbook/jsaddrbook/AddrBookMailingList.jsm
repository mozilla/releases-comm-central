/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookMailingList"];

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "SimpleEnumerator",
  "resource:///modules/AddrBookUtils.jsm"
);

/* Prototype for mailing lists. A mailing list can appear as nsIAbDirectory
 * or as nsIAbCard. Here we keep all relevant information in the class itself
 * and fulfill each interface on demand. This will make more sense and be
 * a lot neater once we stop using two XPCOM interfaces for one job. */

function AddrBookMailingList(
  uid,
  parent,
  localId,
  name,
  nickName,
  description
) {
  this._uid = uid;
  this._parent = parent;
  this._localId = localId;
  this._name = name;
  this._nickName = nickName;
  this._description = description;
}
AddrBookMailingList.prototype = {
  get asDirectory() {
    let self = this;
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIAbDirectory"]),
      classID: Components.ID("{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"),

      get propertiesChromeURI() {
        return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
      },
      get UID() {
        return self._uid;
      },
      get URI() {
        return `${self._parent.URI}/MailList${self._localId}`;
      },
      get uuid() {
        return `&${self._name}`;
      },
      get dirName() {
        return self._name;
      },
      set dirName(value) {
        self._name = value;
      },
      get listNickName() {
        return self._nickName;
      },
      set listNickName(value) {
        self._nickName = value;
      },
      get description() {
        return self._description;
      },
      set description(value) {
        self._description = value;
      },
      get isMailList() {
        return true;
      },
      get childNodes() {
        return new SimpleEnumerator([]);
      },
      get childCards() {
        let selectStatement = self._parent._dbConnection.createStatement(
          "SELECT card FROM list_cards WHERE list = :list ORDER BY oid"
        );
        selectStatement.params.list = self._uid;
        let results = [];
        while (selectStatement.executeStep()) {
          results.push(
            self._parent._getCard(selectStatement.row.card)
          );
        }
        selectStatement.finalize();
        return new SimpleEnumerator(results);
      },
      get supportsMailingLists() {
        return false;
      },

      addCard(card) {
        if (!card.primaryEmail) {
          return card;
        }
        if (!self._parent.hasCard(card)) {
          self._parent.addCard(card);
        }
        let insertStatement = self._parent._dbConnection.createStatement(
          "REPLACE INTO list_cards (list, card) VALUES (:list, :card)"
        );
        insertStatement.params.list = self._uid;
        insertStatement.params.card = card.UID;
        insertStatement.execute();
        Services.obs.notifyObservers(
          card,
          "addrbook-list-member-added",
          self._uid
        );
        insertStatement.finalize();
        return card;
      },
      deleteCards(cards) {
        let deleteCardStatement = self._parent._dbConnection.createStatement(
          "DELETE FROM list_cards WHERE list = :list AND card = :card"
        );
        for (let card of cards) {
          deleteCardStatement.params.list = self._uid;
          deleteCardStatement.params.card = card.UID;
          deleteCardStatement.execute();
          if (self._parent._dbConnection.affectedRows) {
            Services.obs.notifyObservers(
              card,
              "addrbook-list-member-removed",
              self._uid
            );
          }
          deleteCardStatement.reset();
        }
        deleteCardStatement.finalize();
      },
      dropCard(card, needToCopyCard) {
        if (needToCopyCard) {
          card = this._parent.dropCard(card, true);
        }
        this.addCard(card);
        Services.obs.notifyObservers(
          card,
          "addrbook-list-member-added",
          self._uid
        );
      },
      editMailListToDatabase(listCard) {
        // Check if the new name is empty.
        if (!self._name) {
          throw new Components.Exception(
            "Invalid mailing list name",
            Cr.NS_ERROR_ILLEGAL_VALUE
          );
        }

        // Check if the new name contains 2 spaces.
        if (self._name.match("  ")) {
          throw new Components.Exception(
            "Invalid mailing list name",
            Cr.NS_ERROR_ILLEGAL_VALUE
          );
        }

        // Check if the new name contains the following special characters.
        for (let char of ',;"<>') {
          if (self._name.includes(char)) {
            throw new Components.Exception(
              "Invalid mailing list name",
              Cr.NS_ERROR_ILLEGAL_VALUE
            );
          }
        }

        self._parent._saveList(self);
        Services.obs.notifyObservers(
          this,
          "addrbook-list-updated",
          self._parent.UID
        );
      },
    };
  },
  get asCard() {
    let self = this;
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIAbCard"]),
      classID: Components.ID("{1143991d-31cd-4ea6-9c97-c587d990d724}"),

      get UID() {
        return self._uid;
      },
      get isMailList() {
        return true;
      },
      get mailListURI() {
        return `${self._parent.URI}/MailList${self._localId}`;
      },

      get directoryId() {
        return self._parent.uuid;
      },
      get firstName() {
        return "";
      },
      get lastName() {
        return self._name;
      },
      get displayName() {
        return self._name;
      },
      set displayName(value) {
        self._name = value;
      },
      get primaryEmail() {
        return "";
      },

      generateName(generateFormat) {
        return self._name;
      },
      getProperty(name, defaultValue) {
        switch (name) {
          case "NickName":
            return self._nickName;
          case "Notes":
            return self._description;
        }
        return defaultValue;
      },
      setProperty(name, value) {
        switch (name) {
          case "NickName":
            self._nickName = value;
            break;
          case "Notes":
            self._description = value;
            break;
        }
      },
      equals(card) {
        return self._uid == card.UID;
      },
    };
  },
};

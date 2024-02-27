/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookMailingList"];

/* Prototype for mailing lists. A mailing list can appear as nsIAbDirectory
 * or as nsIAbCard. Here we keep all relevant information in the class itself
 * and fulfill each interface on demand. This will make more sense and be
 * a lot neater once we stop using two XPCOM interfaces for one job. */

function AddrBookMailingList(uid, parent, name, nickName, description) {
  this._uid = uid;
  this._parent = parent;
  this._name = name;
  this._nickName = nickName;
  this._description = description;
}
AddrBookMailingList.prototype = {
  get asDirectory() {
    const self = this;
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIAbDirectory"]),
      classID: Components.ID("{e96ee804-0bd3-472f-81a6-8a9d65277ad3}"),

      get readOnly() {
        return self._parent._readOnly;
      },
      get isRemote() {
        return self._parent.isRemote;
      },
      get isSecure() {
        return self._parent.isSecure;
      },
      get propertiesChromeURI() {
        return "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml";
      },
      get UID() {
        return self._uid;
      },
      get URI() {
        return `${self._parent.URI}/${self._uid}`;
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
        return [];
      },
      get childCards() {
        const selectStatement = self._parent._dbConnection.createStatement(
          "SELECT card FROM list_cards WHERE list = :list ORDER BY oid"
        );
        selectStatement.params.list = self._uid;
        const results = [];
        while (selectStatement.executeStep()) {
          results.push(self._parent.getCard(selectStatement.row.card));
        }
        selectStatement.finalize();
        return results;
      },
      get supportsMailingLists() {
        return false;
      },

      search(query, string, listener) {
        if (!listener) {
          return;
        }
        if (!query) {
          listener.onSearchFinished(Cr.NS_ERROR_FAILURE, true, null, "");
          return;
        }
        if (query[0] == "?") {
          query = query.substring(1);
        }

        let results = this.childCards;

        // Process the query string into a tree of conditions to match.
        const lispRegexp = /^\((and|or|not|([^\)]*)(\)+))/;
        let index = 0;
        const rootQuery = { children: [], op: "or" };
        let currentQuery = rootQuery;

        // @see https://github.com/eslint/eslint/issues/17807
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const match = lispRegexp.exec(query.substring(index));
          if (!match) {
            break;
          }
          index += match[0].length;

          if (["and", "or", "not"].includes(match[1])) {
            // For the opening bracket, step down a level.
            const child = {
              parent: currentQuery,
              children: [],
              op: match[1],
            };
            currentQuery.children.push(child);
            currentQuery = child;
          } else {
            const [name, condition, value] = match[2].split(",");
            currentQuery.children.push({
              name,
              condition,
              value: decodeURIComponent(value).toLowerCase(),
            });

            // For each closing bracket except the first, step up a level.
            for (let i = match[3].length - 1; i > 0; i--) {
              currentQuery = currentQuery.parent;
            }
          }
        }

        results = results.filter(card => {
          const properties = card._properties;
          const matches = b => {
            if ("condition" in b) {
              const { name, condition, value } = b;
              if (name == "IsMailList" && condition == "=") {
                return value == "true";
              }

              if (!properties.has(name)) {
                return condition == "!ex";
              }
              if (condition == "ex") {
                return true;
              }

              const cardValue = properties.get(name).toLowerCase();
              switch (condition) {
                case "=":
                  return cardValue == value;
                case "!=":
                  return cardValue != value;
                case "lt":
                  return cardValue < value;
                case "gt":
                  return cardValue > value;
                case "bw":
                  return cardValue.startsWith(value);
                case "ew":
                  return cardValue.endsWith(value);
                case "c":
                  return cardValue.includes(value);
                case "!c":
                  return !cardValue.includes(value);
                case "~=":
                case "regex":
                default:
                  return false;
              }
            }
            if (b.op == "or") {
              return b.children.some(bb => matches(bb));
            }
            if (b.op == "and") {
              return b.children.every(bb => matches(bb));
            }
            if (b.op == "not") {
              return !matches(b.children[0]);
            }
            return false;
          };

          return matches(rootQuery);
        }, this);

        for (const card of results) {
          listener.onSearchFoundCard(card);
        }
        listener.onSearchFinished(Cr.NS_OK, true, null, "");
      },
      addCard(card) {
        if (this.readOnly) {
          throw new Components.Exception(
            "Directory is read-only",
            Cr.NS_ERROR_FAILURE
          );
        }

        if (!card.primaryEmail) {
          return card;
        }
        if (!self._parent.hasCard(card)) {
          card = self._parent.addCard(card);
        }
        const insertStatement = self._parent._dbConnection.createStatement(
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
        if (this.readOnly) {
          throw new Components.Exception(
            "Directory is read-only",
            Cr.NS_ERROR_FAILURE
          );
        }

        const deleteCardStatement = self._parent._dbConnection.createStatement(
          "DELETE FROM list_cards WHERE list = :list AND card = :card"
        );
        for (const card of cards) {
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
        if (this.readOnly) {
          throw new Components.Exception(
            "Directory is read-only",
            Cr.NS_ERROR_FAILURE
          );
        }

        if (needToCopyCard) {
          card = self._parent.dropCard(card, true);
        }
        this.addCard(card);
        Services.obs.notifyObservers(
          card,
          "addrbook-list-member-added",
          self._uid
        );
      },
      editMailListToDatabase(listCard) {
        if (this.readOnly) {
          throw new Components.Exception(
            "Directory is read-only",
            Cr.NS_ERROR_FAILURE
          );
        }

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
        for (const char of ',;"<>') {
          if (self._name.includes(char)) {
            throw new Components.Exception(
              "Invalid mailing list name",
              Cr.NS_ERROR_ILLEGAL_VALUE
            );
          }
        }

        self._parent.saveList(self);
        Services.obs.notifyObservers(
          this,
          "addrbook-list-updated",
          self._parent.UID
        );
      },
      hasMailListWithName(name) {
        return false;
      },
      getMailListFromName(name) {
        return null;
      },
    };
  },
  get asCard() {
    const self = this;
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
        return `${self._parent.URI}/${self._uid}`;
      },

      get directoryUID() {
        return self._parent.UID;
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
      get emailAddresses() {
        // NOT the members of this list.
        return [];
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
      hasEmailAddress(emailAddress) {
        return false;
      },
      get properties() {
        const entries = [
          ["DisplayName", this.displayName],
          ["NickName", this.getProperty("NickName", "")],
          ["Notes", this.getProperty("Notes", "")],
        ];
        const props = [];
        for (const [name, value] of entries) {
          props.push({
            get name() {
              return name;
            },
            get value() {
              return value;
            },
            QueryInterface: ChromeUtils.generateQI(["nsIProperty"]),
          });
        }
        return props;
      },
      get supportsVCard() {
        return false;
      },
      get vCardProperties() {
        return null;
      },
      translateTo(type) {
        // Get nsAbCardProperty to do the work, the code is in C++ anyway.
        const cardCopy = Cc[
          "@mozilla.org/addressbook/cardproperty;1"
        ].createInstance(Ci.nsIAbCard);
        cardCopy.UID = this.UID;
        cardCopy.copy(this);
        return cardCopy.translateTo(type);
      },
    };
  },
};

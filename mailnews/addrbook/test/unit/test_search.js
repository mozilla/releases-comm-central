/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getModelQuery, generateQueryURI } = ChromeUtils.importESModule(
  "resource:///modules/ABQueryUtils.sys.mjs"
);

const jsonFile = do_get_file("data/ldap_contacts.json");

add_task(async () => {
  const contacts = await IOUtils.readJSON(jsonFile.path);

  const dirPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  const book = MailServices.ab.getDirectoryFromId(dirPrefId);

  for (const [name, { attributes }] of Object.entries(contacts)) {
    const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = attributes.cn;
    card.firstName = attributes.givenName;
    card.lastName = attributes.sn;
    card.primaryEmail = attributes.mail;
    contacts[name] = book.addCard(card);
  }

  const doSearch = async function (searchString, ...expectedContacts) {
    const foundCards = await new Promise(resolve => {
      const listener = {
        cards: [],
        onSearchFoundCard(card) {
          this.cards.push(card);
        },
        onSearchFinished() {
          resolve(this.cards);
        },
      };
      book.search(searchString, "", listener);
    });

    Assert.equal(foundCards.length, expectedContacts.length);
    for (const name of expectedContacts) {
      Assert.ok(foundCards.find(c => c.equals(contacts[name])));
    }
  };

  await doSearch("(DisplayName,c,watson)", "john", "mary");

  const modelQuery = getModelQuery("mail.addr_book.autocompletequery.format");
  await doSearch(
    generateQueryURI(modelQuery, ["holmes"]),
    "eurus",
    "mycroft",
    "sherlock"
  );
  await doSearch(generateQueryURI(modelQuery, ["adler"]), "irene");
  await doSearch(generateQueryURI(modelQuery, ["redbeard"]));
});

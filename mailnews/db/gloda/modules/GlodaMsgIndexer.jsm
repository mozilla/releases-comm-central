/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GlodaABIndexer", "GlodaABAttrs"];

const { GlodaCollectionManager } = ChromeUtils.import(
  "resource:///modules/gloda/Collection.jsm"
);
const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
const { GlodaConstants } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaConstants.jsm"
);
const { GlodaIndexer, IndexingJob } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
const { FreeTagNoun } = ChromeUtils.import(
  "resource:///modules/gloda/NounFreetag.jsm"
);

var GlodaABIndexer = {
  _log: null,
  _notifications: [
    "addrbook-contact-created",
    "addrbook-contact-updated",
    "addrbook-contact-deleted",
  ],

  name: "index_ab",
  enable() {
    if (this._log == null) {
      this._log = console.createInstance({
        prefix: "gloda.index_ab",
        maxLogLevel: "Warn",
        maxLogLevelPref: "gloda.loglevel",
      });
    }

    for (const topic of this._notifications) {
      Services.obs.addObserver(this, topic);
    }
  },

  disable() {
    for (const topic of this._notifications) {
      Services.obs.removeObserver(this, topic);
    }
  },

  // it's a getter so we can reference 'this'
  get workers() {
    return [
      [
        "ab-card",
        {
          worker: this._worker_index_card,
        },
      ],
    ];
  },

  *_worker_index_card(aJob, aCallbackHandle) {
    const card = aJob.id;

    if (card.primaryEmail) {
      // load the identity
      const query = Gloda.newQuery(GlodaConstants.NOUN_IDENTITY);
      query.kind("email");
      // we currently normalize all e-mail addresses to be lowercase
      query.value(card.primaryEmail.toLowerCase());
      const identityCollection = query.getCollection(aCallbackHandle);
      yield GlodaConstants.kWorkAsync;

      if (identityCollection.items.length) {
        const identity = identityCollection.items[0];
        // force the identity to know it has an associated ab card.
        identity._hasAddressBookCard = true;

        this._log.debug("Found identity, processing card.");
        yield aCallbackHandle.pushAndGo(
          Gloda.grokNounItem(
            identity.contact,
            { card },
            false,
            false,
            aCallbackHandle
          )
        );
        this._log.debug("Done processing card.");
      }
    }

    yield GlodaConstants.kWorkDone;
  },

  initialSweep() {},

  observe(subject, topic, data) {
    subject.QueryInterface(Ci.nsIAbCard);

    switch (topic) {
      case "addrbook-contact-created": {
        // When an address book card is added, update the cached GlodaIdentity
        // object's cached idea of whether the identity has an ab card.
        this._log.debug("Received Card Add Notification");

        const identity = GlodaCollectionManager.cacheLookupOneByUniqueValue(
          GlodaConstants.NOUN_IDENTITY,
          "email@" + subject.primaryEmail.toLowerCase()
        );
        if (identity) {
          identity._hasAddressBookCard = true;
        }
        break;
      }
      case "addrbook-contact-updated": {
        this._log.debug("Received Card Change Notification");

        const job = new IndexingJob("ab-card", subject);
        GlodaIndexer.indexJob(job);
        break;
      }
      case "addrbook-contact-deleted": {
        // When an address book card is added, update the cached GlodaIdentity
        // object's cached idea of whether the identity has an ab card.
        this._log.debug("Received Card Removal Notification");

        const identity = GlodaCollectionManager.cacheLookupOneByUniqueValue(
          GlodaConstants.NOUN_IDENTITY,
          "email@" + subject.primaryEmail.toLowerCase()
        );
        if (identity) {
          identity._hasAddressBookCard = false;
        }
        break;
      }
    }
  },
};
GlodaIndexer.registerIndexer(GlodaABIndexer);

var GlodaABAttrs = {
  providerName: "gloda.ab_attr",
  _log: null,

  init() {
    this._log = console.createInstance({
      prefix: "gloda.abattrs",
      maxLogLevel: "Warn",
      maxLogLevelPref: "gloda.loglevel",
    });

    try {
      this.defineAttributes();
    } catch (ex) {
      this._log.error("Error in init: " + ex);
      throw ex;
    }
  },

  defineAttributes() {
    /* ***** Contacts ***** */
    this._attrIdentityContact = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "identities",
      singular: false,
      special: GlodaConstants.kSpecialColumnChildren,
      // specialColumnName: "contactID",
      storageAttributeName: "_identities",
      subjectNouns: [GlodaConstants.NOUN_CONTACT],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // tested-by: test_attributes_fundamental
    this._attrContactName = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "name",
      singular: true,
      special: GlodaConstants.kSpecialString,
      specialColumnName: "name",
      subjectNouns: [GlodaConstants.NOUN_CONTACT],
      objectNoun: GlodaConstants.NOUN_STRING,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental
    this._attrContactPopularity = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "popularity",
      singular: true,
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "popularity",
      subjectNouns: [GlodaConstants.NOUN_CONTACT],
      objectNoun: GlodaConstants.NOUN_NUMBER,
      canQuery: true,
    }); // not-tested
    this._attrContactFrecency = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "frecency",
      singular: true,
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "frecency",
      subjectNouns: [GlodaConstants.NOUN_CONTACT],
      objectNoun: GlodaConstants.NOUN_NUMBER,
      canQuery: true,
    }); // not-tested

    /* ***** Identities ***** */
    this._attrIdentityContact = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "contact",
      singular: true,
      special: GlodaConstants.kSpecialColumnParent,
      specialColumnName: "contactID", // the column in the db
      idStorageAttributeName: "_contactID",
      valueStorageAttributeName: "_contact",
      subjectNouns: [GlodaConstants.NOUN_IDENTITY],
      objectNoun: GlodaConstants.NOUN_CONTACT,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental
    this._attrIdentityKind = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "kind",
      singular: true,
      special: GlodaConstants.kSpecialString,
      specialColumnName: "kind",
      subjectNouns: [GlodaConstants.NOUN_IDENTITY],
      objectNoun: GlodaConstants.NOUN_STRING,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental
    this._attrIdentityValue = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "value",
      singular: true,
      special: GlodaConstants.kSpecialString,
      specialColumnName: "value",
      subjectNouns: [GlodaConstants.NOUN_IDENTITY],
      objectNoun: GlodaConstants.NOUN_STRING,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental

    /* ***** Contact Meta ***** */
    // Freeform tags; not explicit like thunderbird's fundamental tags.
    //  we differentiate for now because of fundamental implementation
    //  differences.
    this._attrFreeTag = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "freetag",
      bind: true,
      bindName: "freeTags",
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_CONTACT],
      objectNoun: Gloda.lookupNoun("freetag"),
      parameterNoun: null,
      canQuery: true,
    }); // not-tested
    // we need to find any existing bound freetag attributes, and use them to
    //  populate to FreeTagNoun's understanding
    if ("parameterBindings" in this._attrFreeTag) {
      for (const freeTagName in this._attrFreeTag.parameterBindings) {
        this._log.debug("Telling FreeTagNoun about: " + freeTagName);
        FreeTagNoun.getFreeTag(freeTagName);
      }
    }
  },

  *process(aContact, aRawReps, aIsNew, aCallbackHandle) {
    const card = aRawReps.card;
    if (aContact.NOUN_ID != GlodaConstants.NOUN_CONTACT) {
      this._log.warn("Somehow got a non-contact: " + aContact);
      return; // this will produce an exception; we like.
    }

    // update the name
    if (card.displayName && card.displayName != aContact.name) {
      aContact.name = card.displayName;
    }

    aContact.freeTags = [];

    let tags = null;
    try {
      tags = card.getProperty("Categories", null);
    } catch (ex) {
      this._log.error("Problem accessing property: " + ex);
    }
    if (tags) {
      for (let tagName of tags.split(",")) {
        tagName = tagName.trim();
        if (tagName) {
          aContact.freeTags.push(FreeTagNoun.getFreeTag(tagName));
        }
      }
    }

    yield GlodaConstants.kWorkDone;
  },
};

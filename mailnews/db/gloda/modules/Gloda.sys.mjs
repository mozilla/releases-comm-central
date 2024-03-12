/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GlodaDatastore } from "resource:///modules/gloda/GlodaDatastore.sys.mjs";

import {
  GlodaAttributeDBDef,
  GlodaAccount,
  GlodaConversation,
  GlodaFolder,
  GlodaMessage,
  GlodaContact,
  GlodaIdentity,
  GlodaAttachment,
} from "resource:///modules/gloda/GlodaDataModel.sys.mjs";

import {
  GlodaCollection,
  GlodaCollectionManager,
} from "resource:///modules/gloda/Collection.sys.mjs";
import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";
import {
  whittlerRegistry,
  mimeMsgToContentAndMeta,
} from "resource:///modules/gloda/GlodaContent.sys.mjs";
import { GlodaQueryClassFactory } from "resource:///modules/gloda/GlodaQueryClassFactory.sys.mjs";
import { GlodaUtils } from "resource:///modules/gloda/GlodaUtils.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * @see |Gloda.BadItemContentsError|
 */
function BadItemContentsError(aMessage) {
  this.message = aMessage;
}
BadItemContentsError.prototype = {
  toString() {
    return this.message;
  },
};

/**
 * Provides the user-visible (and extension visible) global database
 *  functionality.  There is currently a dependency/ordering
 *  problem in that the concept of 'gloda' also includes some logic that is
 *  contributed by built-in extensions, if you will.  Those built-in extensions
 *  (fundattr.js, GlodaExplicitAttr.jsm) also import this file.  To avoid a circular
 *  dependency, those built-in extensions are loaded by Everybody.jsm.  The
 *  simplest/best solution is probably to move Everybody.jsm to be Gloda.jsm and
 *  have it re-export only 'Gloda'.  Gloda.jsm (this file) can then move to be
 *  gloda_int.js (or whatever our eventual naming scheme is), which built-in
 *  extensions can explicitly rely upon.
 *
 * === Concepts
 *
 * == Nouns
 *
 * Inspired by reasonable uses of triple-stores, I have tried to leverage
 *  existing model and terminology rather than rolling out own for everything.
 *  The idea with triple-stores is that you have a subject, a predicate, and an
 *  object.  For example, if we are talking about a message, that is the
 *  subject, the predicate could roughly be sent-by, and the object a person.
 *  We can generalize this idea to say that the subject and objects are nouns.
 * Since we want to be more flexible than only dealing with messages, we
 *  therefore introduce the concept of nouns as an organizing principle.
 *
 * == Attributes
 *
 * Our attributes definitions are basically our predicates.  When we define
 *  an attribute, it's a label with a bunch of meta-data.  Our attribute
 *  instances are basically a 'triple' in a triple-store.  The attributes
 *  are stored in database rows that imply a specific noun-type (ex: the
 *  messageAttributes table), with an ID identifying the message which is our
 *  subject, an attribute ID which identifies the attribute definition in use
 *  (and therefore the predicate), plus an object ID (given context aka the
 *  noun type by the attribute's meta-data) which identifies the 'object'.
 *
 * == But...
 *
 * Things aren't entirely as clear as they could be right now, terminology/
 *  concept/implementation-wise.  Some work is probably still in order.
 *
 * === Implementation
 *
 * == Nouns
 *
 * So, we go and define the nouns that are roughly the classes in our data
 *  model.  Every 'class' we define in GlodaDataModel.jsm is a noun that gets defined
 *  here in the Gloda core.  We provide sufficient meta-data about the noun to
 *  serialize/deserialize its representation from our database representation.
 *  Nouns do not have to be defined in this class, but can also be contributed
 *  by external code.
 * We have a concept of 'first class' nouns versus non-first class nouns.  The
 *  distinction is meant to be whether we can store meta-information about those
 *  nouns using attributes.  Right now, only message are real first-class nouns,
 *  but we want to expand that to include contacts and eventually events and
 *  tasks as lightning-integration occurs.  In practice, we are stretching the
 *  definition of first-class nouns slightly to include things we can't store
 *  meta-data about, but want to be able to query about.  We do want to resolve
 *  this.
 *
 * == Attributes
 *
 * Attributes are defined by "attribute providers" who are responsible for
 *  taking an instance of a first-class noun (for which they are registered)
 *  plus perhaps some other meta-data, and returning a list of attributes
 *  extracted from that noun.  For now, this means messages.  Attribute
 *  providers may create new data records as a side-effect of the indexing
 *  process, although we have not yet fully dealt with the problem of deleting
 *  these records should they become orphaned in the database due to the
 *  purging of a message and its attributes.
 * All of the 'core' gloda attributes are provided by the GlodaFundAttr.jsm and
 *  GlodaExplicitAttr.jsm providers.
 *
 * === (Notable) Future Work
 *
 * == Attributes
 *
 * Attribute mechanisms currently lack any support for 'overriding' attributes
 *  provided by other attribute providers.  For example, the fundattr provider
 *  tells us who a message is 'from' based on the e-mail address present.
 *  However, other plugins may actually know better.  For example, the bugzilla
 *  daemon e-mails based on bug activity although the daemon gets the credit
 *  as the official sender.  A bugzilla plugin can easily extract the actual
 *  person/e-mail addressed who did something on the bug to cause the
 *  notification to be sent.  In practice, we would like that person to be
 *  the 'sender' of the bugmail.  But we can't really do that right, yet.
 *
 * @namespace
 */
export var Gloda = {
  /**
   * Initialize logging, the datastore (SQLite database), the core nouns and
   *  attributes, and the contact and identities that belong to the presumed
   *  current user (based on accounts).
   *
   * Additional nouns and the core attribute providers are initialized by the
   *  Everybody.jsm module which ensures all of those dependencies are loaded
   *  (and initialized).
   */
  _init() {
    this._initLogging();
    GlodaDatastore._init(this._nounIDToDef);
    this._initAttributes();
    this._initMyIdentities();
  },

  _log: null,
  /**
   * Initialize logging; the error console window gets Warning/Error, and stdout
   *  (via dump) gets everything.
   */
  _initLogging() {
    this._log = console.createInstance({
      prefix: "gloda",
      maxLogLevel: "Warn",
      maxLogLevelPref: "gloda.loglevel",
    });
    this._log.info("Logging Initialized");
  },

  /**
   * Callers should access the unique ID for the GlodaDatastore
   * with this getter. If the GlodaDatastore has not been
   * initialized, this value is null.
   *
   * @returns a UUID as a string, ex: "c4dd0159-9287-480f-a648-a4613e147fdb"
   */
  get datastoreID() {
    return GlodaDatastore._datastoreID;
  },

  /**
   * Lookup a gloda message from an nsIMsgDBHdr, with the result returned as a
   *  collection.  Keep in mind that the message may not be indexed, so you
   *  may end up with an empty collection.  (Also keep in mind that this query
   *  is asynchronous, so you will want your action-taking logic to be found
   *  in your listener's onQueryCompleted method; the result will not be in
   *  the collection when this method returns.)
   *
   * @param aMsgHdr The header of the message you want the gloda message for.
   * @param aListener The listener that should be registered with the collection
   * @param aData The (optional) value to set as the data attribute on the
   *     collection.
   *
   * @returns The collection that will receive the results.
   *
   * @testpoint gloda.ns.getMessageCollectionForHeader()
   */
  getMessageCollectionForHeader(aMsgHdr, aListener, aData) {
    const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
    query.folder(aMsgHdr.folder).messageKey(aMsgHdr.messageKey);
    return query.getCollection(aListener, aData);
  },

  /**
   * Given a list of message headers, return a collection containing the gloda
   *  messages that correspond to those headers.  Keep in mind that gloda may
   *  not have indexed all the messages, so the returned collection may not have
   *  a message for each header you provide. (Also keep in mind that this query
   *  is asynchronous, so you will want your action-taking logic to be found
   *  in your listener's onQueryCompleted method; no results will be present in
   *  the collection when this method returns.)
   *
   * @param aHeaders An array of headers
   * @param aListener The listener that should be registered with the collection
   * @param aData The (optional) value to set as the data attribute on the
   *     collection.
   *
   * @returns The collection that will receive the results.
   *
   * @testpoint gloda.ns.getMessageCollectionForHeaders()
   */
  getMessageCollectionForHeaders(aHeaders, aListener, aData) {
    // group the headers by the folder they are found in
    const headersByFolder = {};
    for (const header of aHeaders) {
      const folderURI = header.folder.URI;
      const headersForFolder = headersByFolder[folderURI];
      if (headersForFolder === undefined) {
        headersByFolder[folderURI] = [header];
      } else {
        headersForFolder.push(header);
      }
    }

    const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
    let clause;
    // build a query, using a separate union clause for each folder.
    for (const folderURI in headersByFolder) {
      const headersForFolder = headersByFolder[folderURI];
      const folder = this.getFolderForFolder(headersForFolder[0].folder);
      // if this is the first or clause, just use the query itself
      if (!clause) {
        clause = query;
      } else {
        // Create a new query clause via the 'or' command.
        clause = query.or();
      }

      clause.folder(folder);
      const messageKeys = headersForFolder.map(hdr => hdr.messageKey);
      clause.messageKey.apply(clause, messageKeys);
    }

    return query.getCollection(aListener, aData);
  },

  /**
   * @testpoint gloda.ns.getMessageContent
   */
  getMessageContent(aGlodaMessage, aMimeMsg) {
    return mimeMsgToContentAndMeta(
      aMimeMsg,
      aGlodaMessage.folderMessage.folder
    )[0];
  },

  getFolderForFolder(aMsgFolder) {
    return GlodaDatastore._mapFolder(aMsgFolder);
  },

  /**
   * Takes one or more strings containing lists of comma-delimited e-mail
   *  addresses with optional display names, and returns a list of sub-lists of
   *  identities, where each sub-list corresponds to each of the strings passed
   *  as arguments.  These identities are loaded from the database if they
   *  already exist, or created if they do not yet exist.
   * If the identities need to be created, they will also result in the
   *  creation of a gloda contact.  If a display name was provided with the
   *  e-mail address, it will become the name of the gloda contact.  If a
   *  display name was not provided, the e-mail address will also serve as the
   *  contact name.
   * This method uses the indexer's callback handle mechanism, and does not
   *  obey traditional return semantics.
   *
   * We normalize all e-mail addresses to be lowercase as a normative measure.
   *
   * @param aCallbackHandle The GlodaIndexer callback handle (or equivalent)
   *   that you are operating under.
   * @param aAddrGroups... One or more strings.  Each string can contain zero or more
   *   e-mail addresses with display name.  If more than one address is given,
   *   they should be comma-delimited.  For example
   *   '"Bob Smith" <bob@example.com>' is an address with display name.  Mime
   *   header decoding is performed, but is ignorant of any folder-level
   *   character set overrides.
   * @returns via the callback handle mechanism, a list containing one sub-list
   *   for each string argument passed.  Each sub-list contains zero or more
   *   GlodaIdentity instances corresponding to the addresses provided.
   */
  *getOrCreateMailIdentities(aCallbackHandle, ...aAddrGroups) {
    const addresses = {};
    const resultLists = [];

    // parse the strings
    for (const aMailAddresses of aAddrGroups) {
      const parsed = GlodaUtils.parseMailAddresses(aMailAddresses);

      const resultList = [];
      resultLists.push(resultList);

      for (let iAddress = 0; iAddress < parsed.count; iAddress++) {
        const address = parsed.addresses[iAddress].toLowerCase();
        if (address in addresses) {
          addresses[address].push(resultList);
        } else {
          addresses[address] = [parsed.names[iAddress], resultList];
        }
      }
    }

    const addressList = Object.keys(addresses);
    if (addressList.length == 0) {
      yield aCallbackHandle.doneWithResult(resultLists);
      // we should be stopped before we reach this point, but safety first.
      return;
    }

    const query = this.newQuery(GlodaConstants.NOUN_IDENTITY);
    query.kind("email");
    query.value.apply(query, addressList);
    const collection = query.getCollection(aCallbackHandle);
    yield GlodaConstants.kWorkAsync;

    // put the identities in the appropriate result lists
    for (const identity of collection.items) {
      const nameAndResultLists = addresses[identity.value];
      this._log.debug(
        " found identity for '" +
          nameAndResultLists[0] +
          "' (" +
          identity.value +
          ")"
      );
      // index 0 is the name, skip it
      for (let iResList = 1; iResList < nameAndResultLists.length; iResList++) {
        nameAndResultLists[iResList].push(identity);
      }
      delete addresses[identity.value];
    }

    // create the identities that did not exist yet
    for (const address in addresses) {
      const nameAndResultLists = addresses[address];
      let name = nameAndResultLists[0];

      this._log.debug(" creating contact for '" + name + "' (" + address + ")");

      // try and find an existing address book contact.
      const card = MailServices.ab.cardForEmailAddress(address);
      // XXX when we have the address book GUID stuff, we need to use that to
      //  find existing contacts... (this will introduce a new query phase
      //  where we batch all the GUIDs for an async query)
      // XXX when the address book supports multiple e-mail addresses, we
      //  should also just create identities for any that don't yet exist

      // if there is no name, just use the e-mail (the ab indexer actually
      //  processes the card's displayName for synchronization, so we don't
      //  need to do that.)
      if (!name) {
        name = address;
      }

      const contact = GlodaDatastore.createContact(null, null, name, 0, 0);

      // we must create the identity.  use a blank description because there's
      //  nothing to differentiate it from other identities, as this contact
      //  only has one initially (us).
      // XXX when we have multiple e-mails and there is a meaning associated
      //  with each e-mail, try and use that to populate the description.
      // XXX we are creating the identity here before we insert the contact.
      //  conceptually it is good for us to be creating the identity before
      //  exposing it to the address-book indexer, but we could get our id's
      //  in a bad way from not deferring the identity insertion until after
      //  the contact insertion.
      const identity = GlodaDatastore.createIdentity(
        contact.id,
        contact,
        "email",
        address,
        /* description */ "",
        /* relay? */ false
      );
      contact._identities = [identity];

      // give the address book indexer a chance if we have a card.
      // (it will fix-up the name based on the card as appropriate)
      if (card) {
        yield aCallbackHandle.pushAndGo(
          Gloda.grokNounItem(contact, { card }, true, true, aCallbackHandle)
        );
      } else {
        // grokNounItem will issue the insert for us...
        GlodaDatastore.insertContact(contact);
      }

      for (let iResList = 1; iResList < nameAndResultLists.length; iResList++) {
        nameAndResultLists[iResList].push(identity);
      }
    }

    yield aCallbackHandle.doneWithResult(resultLists);
  },

  /**
   * Dictionary of the user's known identities; key is the identity id, value
   *  is the actual identity.  This is populated by _initMyIdentities based on
   *  the accounts defined.
   */
  myIdentities: {},
  /**
   * The contact corresponding to the current user.  We are assuming that only
   *  a single user/human being uses the current profile.  This is known to be
   *  a flawed assumption, but is the best first approximation available.
   * The contact is based on the default account's default identity. The user
   *  can change both, if desired, in Account Settings.
   *
   * @TODO attempt to deal with multiple people using the same profile
   */
  myContact: null,
  /**
   * Populate myIdentities with all of our identities.  Currently we do this
   *  by assuming that there is one human/user per profile, and that all of the
   *  accounts defined in the profile belong to them.  The single contact is
   *  stored on myContact.
   *
   * @TODO deal with account addition/modification/removal
   * @TODO attempt to deal with multiple people using the same profile
   */
  _initMyIdentities() {
    let myContact = null;
    const myIdentities = {};
    // Process each email at most once; stored here.
    const myEmailAddresses = new Set();

    let fullName, fallbackName;
    const existingIdentities = [];
    const identitiesToCreate = [];

    const allIdentities = MailServices.accounts.allIdentities;
    const defaultMsgIdentity = MailServices.accounts.defaultAccount
      ? MailServices.accounts.defaultAccount.defaultIdentity
      : null;
    const defaultMsgIdentityKey = defaultMsgIdentity
      ? defaultMsgIdentity.key
      : null;
    let defaultIdentity;

    // Nothing to do if there are no accounts/identities.
    if (allIdentities.length == 0) {
      return;
    }

    for (const msgIdentity of allIdentities) {
      const emailAddress = msgIdentity.email;
      const replyTo = msgIdentity.replyTo;
      const msgIdentityDescription = msgIdentity.fullName || msgIdentity.email;
      const isDefaultMsgIdentity = msgIdentity.key == defaultMsgIdentityKey;

      if (!fullName || isDefaultMsgIdentity) {
        fullName = msgIdentity.fullName;
      }
      if (!fallbackName || isDefaultMsgIdentity) {
        fallbackName = msgIdentity.email;
      }

      // Find the identities if they exist, flag to create them if they don't.
      for (const address of [emailAddress, replyTo]) {
        if (!address) {
          continue;
        }
        const parsed = GlodaUtils.parseMailAddresses(address);
        if (myEmailAddresses.has(parsed.addresses[0])) {
          continue;
        }
        const identity = GlodaDatastore.getIdentity(
          "email",
          parsed.addresses[0]
        );
        if (identity) {
          if (identity.description != msgIdentityDescription) {
            // If the user changed the identity name, update the db.
            identity._description = msgIdentityDescription;
            GlodaDatastore.updateIdentity(identity);
          }
          existingIdentities.push(identity);
          if (isDefaultMsgIdentity) {
            defaultIdentity = identity;
          }
        } else {
          identitiesToCreate.push([
            parsed.addresses[0],
            msgIdentityDescription,
          ]);
        }
        myEmailAddresses.add(parsed.addresses[0]);
      }
    }
    // We need to establish the identity.contact portions of the relationship.
    for (const identity of existingIdentities) {
      identity._contact = GlodaDatastore.getContactByID(identity.contactID);
      if (defaultIdentity && defaultIdentity.id == identity.id) {
        if (identity.contact.name != (fullName || fallbackName)) {
          // If the user changed the default identity, update the db.
          identity.contact.name = fullName || fallbackName;
          GlodaDatastore.updateContact(identity.contact);
        }
        defaultIdentity._contact = identity.contact;
      }
    }

    if (defaultIdentity) {
      // The contact is based on the default account's default identity.
      myContact = defaultIdentity.contact;
    } else if (existingIdentities.length) {
      // Just use the first guy's contact.
      myContact = existingIdentities[0].contact;
    } else {
      // Create a new contact.
      myContact = GlodaDatastore.createContact(
        null,
        null,
        fullName || fallbackName,
        0,
        0
      );
      GlodaDatastore.insertContact(myContact);
    }

    for (const emailAndDescription of identitiesToCreate) {
      // XXX This won't always be of type "email" as we add new account types.
      const identity = GlodaDatastore.createIdentity(
        myContact.id,
        myContact,
        "email",
        emailAndDescription[0],
        emailAndDescription[1],
        false
      );
      existingIdentities.push(identity);
    }

    for (const identity of existingIdentities) {
      myIdentities[identity.id] = identity;
    }

    this.myContact = myContact;
    this.myIdentities = myIdentities;
    myContact._identities = Object.keys(myIdentities).map(
      id => myIdentities[id]
    );

    // We need contacts to make these objects reachable via the collection
    //  manager.
    this._myContactCollection = this.explicitCollection(
      GlodaConstants.NOUN_CONTACT,
      [this.myContact]
    );
    this._myIdentitiesCollection = this.explicitCollection(
      GlodaConstants.NOUN_IDENTITY,
      this.myContact._identities
    );
  },

  /** Next Noun ID to hand out, these don't need to be persisted (for now). */
  _nextNounID: 1000,

  /**
   * Maps noun names to noun IDs.
   */
  _nounNameToNounID: {},
  /**
   * Maps noun IDs to noun definition dictionaries.  (Noun definition
   *  dictionaries provided to us at the time a noun was defined, plus some
   *  additional stuff we put in there.)
   */
  _nounIDToDef: {},

  _managedToJSON(aItem) {
    return aItem.id;
  },

  /**
   * Define a noun.  Takes a dictionary with the following keys/values:
   *
   * @param aNounDef.name The name of the noun.  This is not a display name
   *     (anything being displayed needs to be localized, after all), but simply
   *     the canonical name for debugging purposes and for people to pass to
   *     lookupNoun.  The suggested convention is lower-case-dash-delimited,
   *     with names being singular (since it's a single noun we are referring
   *     to.)
   * @param aNounDef.class The 'class' to which an instance of the noun will
   *     belong (aka will pass an instanceof test).  You may also provide this
   *     as 'clazz' if the keyword makes your IDE angry.
   * @param aNounDef.allowsArbitraryAttrs Is this a 'first class noun'/can it be
   *     a subject, AKA can this noun have attributes stored on it that relate
   *     it to other things?  For example, a message is first-class; we store
   *     attributes of messages.  A date is not first-class now, nor is it
   *     likely to be; we will not store attributes about a date, although dates
   *     will be the objects of other subjects.  (For example: we might
   *     associate a date with a calendar event, but the date is an attribute of
   *     the calendar event and not vice versa.)
   * @param aNounDef.usesParameter A boolean indicating whether this noun
   *     requires use of the 'parameter' BLOB storage field on the attribute
   *     bindings in the database to persist itself.  Use of parameters should
   *     be limited to a reasonable number of values (16-32 is okay, more than
   *     that is pushing it and 256 should be considered an absolute upper
   *     bound) because of the database organization.  When false, your
   *     toParamAndValue function is expected to return null for the parameter
   *     and likewise your fromParamAndValue should expect ignore and generally
   *     ignore the argument.
   * @param aNounDef.toParamAndValue A function that takes an instantiated noun
   *     instance and returns a 2-element list of [parameter, value] where
   *     parameter may only be non-null if you passed a usesParameter of true.
   *     Parameter may be of any type (BLOB), and value must be numeric (pass
   *     0 if you don't need the value).
   *
   * @param aNounDef.isPrimitive True when the noun instance is a raw numeric
   *     value/string/boolean.  False when the instance is an object.  When
   *     false, it is assumed the attribute that serves as a unique identifier
   *     for the value is "id" unless 'idAttr' is provided.
   * @param [aNounDef.idAttr="id"] For non-primitive nouns, this is the
   *     attribute on the object that uniquely identifies it.
   *
   * @param aNounDef.schema Unsupported mechanism by which you can define a
   *     table that corresponds to this noun.  The table will be created if it
   *     does not exist.
   *     - name The table name; don't conflict with other things!
   *     - columns A list of [column name, sqlite type] tuples.  You should
   *       always include a definition like ["id", "INTEGER PRIMARY KEY"] for
   *       now (and it should be the first column name too.)  If you care about
   *       how the attributes are poked into your object (for example, you want
   *       underscores used for some of them because the attributes should be
   *       immutable), then you can include a third string that is the name of
   *       the attribute to use.
   *     - indices A dictionary of lists of column names, where the key name
   *       becomes the index name.  Ex: {foo: ["bar"]} results in an index on
   *       the column "bar" where the index is named "foo".
   */
  defineNoun(aNounDef, aNounID) {
    this._log.info("Defining noun: " + aNounDef.name);
    if (aNounID === undefined) {
      aNounID = this._nextNounID++;
    }
    aNounDef.id = aNounID;

    // Let people whose editors get angry about illegal attribute names use
    //  clazz instead of class.
    if (aNounDef.clazz) {
      aNounDef.class = aNounDef.clazz;
    }

    if (!("idAttr" in aNounDef)) {
      aNounDef.idAttr = "id";
    }
    if (!("comparator" in aNounDef)) {
      aNounDef.comparator = function () {
        throw new Error(
          "Noun type '" + aNounDef.name + "' lacks a real comparator."
        );
      };
    }

    // We allow nouns to have data tables associated with them where we do all
    //  the legwork.  The schema attribute is the gateway to this magical world
    //  of functionality.  Said door is officially unsupported.
    if (aNounDef.schema) {
      if (!aNounDef.tableName) {
        if (aNounDef.schema.name) {
          aNounDef.tableName = "ext_" + aNounDef.schema.name;
        } else {
          aNounDef.tableName = "ext_" + aNounDef.name;
        }
      }
      // this creates the data table and binder and hooks everything up
      GlodaDatastore.createNounTable(aNounDef);

      if (!aNounDef.toParamAndValue) {
        aNounDef.toParamAndValue = function (aThing) {
          if (aThing instanceof aNounDef.class) {
            return [null, aThing.id];
          }
          // assume they're just passing the id directly
          return [null, aThing];
        };
      }
    }

    // if it has a table, you can query on it.  seems straight-forward.
    if (aNounDef.tableName) {
      [
        aNounDef.queryClass,
        aNounDef.nullQueryClass,
        aNounDef.explicitQueryClass,
        aNounDef.wildcardQueryClass,
      ] = GlodaQueryClassFactory(aNounDef);
      aNounDef._dbMeta = {};
      aNounDef.class.prototype.NOUN_ID = aNounDef.id;
      aNounDef.class.prototype.NOUN_DEF = aNounDef;
      aNounDef.toJSON = this._managedToJSON;

      aNounDef.specialLoadAttribs = [];

      // - define the 'id' constrainer
      const idConstrainer = function (...aArgs) {
        const constraint = [GlodaConstants.kConstraintIdIn, null, ...aArgs];
        this._constraints.push(constraint);
        return this;
      };
      aNounDef.queryClass.prototype.id = idConstrainer;
    }
    if (aNounDef.cache) {
      const cacheCost = aNounDef.cacheCost || 1024;
      const cacheBudget = aNounDef.cacheBudget || 128 * 1024;
      const cacheSize = Math.floor(cacheBudget / cacheCost);
      if (cacheSize) {
        GlodaCollectionManager.defineCache(aNounDef, cacheSize);
      }
    }
    aNounDef.attribsByBoundName = {};
    aNounDef.domExposeAttribsByBoundName = {};

    aNounDef.objectNounOfAttributes = [];

    this._nounNameToNounID[aNounDef.name] = aNounID;
    this._nounIDToDef[aNounID] = aNounDef;
    aNounDef.actions = [];

    this._attrProviderOrderByNoun[aNounDef.id] = [];
    this._attrOptimizerOrderByNoun[aNounDef.id] = [];
    this._attrProvidersByNoun[aNounDef.id] = {};

    return aNounDef;
  },

  /**
   * Lookup a noun (ID) suitable for passing to defineAttribute's various
   *  noun arguments.  Throws an exception if the noun with the given name
   *  cannot be found; the assumption is that you can't live without the noun.
   */
  lookupNoun(aNounName) {
    if (aNounName in this._nounNameToNounID) {
      return this._nounNameToNounID[aNounName];
    }

    throw Error(
      "Unable to locate noun with name '" +
        aNounName +
        "', but I " +
        "do know about: " +
        Object.keys(this._nounNameToNounID).join(", ")
    );
  },

  /**
   * Lookup a noun def given a name.
   */
  lookupNounDef(aNounName) {
    return this._nounIDToDef[this.lookupNoun(aNounName)];
  },

  /**
   * Define an action on a noun.  During the prototype stage, this was conceived
   *  of as a way to expose all the constraints possible given a noun.  For
   *  example, if you have an identity or a contact, you could use this to
   *  see all the messages sent from/to a given contact.  It was likewise
   *  thought potentially usable for future expansion.  For example, you could
   *  also decide to send an e-mail to a contact when you have the contact
   *  instance available.
   * Outside of the 'expmess' checkbox-happy prototype, this functionality is
   *  not used.  As such, this functionality should be considered in flux and
   *  subject to changes.  Also, very open to specific suggestsions motivated
   *  by use cases.
   * One conceptual issue raised by this mechanism is the interaction of actions
   *  with facts like "this message is read".  We currently implement the 'fact'
   *  by defining an attribute with a 'boolean' noun type.  To deal with this,
   *  in various places we pass-in the attribute as well as the noun value.
   *  Since the relationships for booleans and integers in these cases is
   *  standard and well-defined, this works out pretty well, but suggests we
   *  need to think things through.
   *
   * @param aNounID The ID of the noun you want to define an action on.
   * @param aActionMeta The dictionary describing the noun.  The dictionary
   *     should have the following fields:
   * - actionType: a string indicating the type of action.  Currently, only
   *   "filter" is a legal value.
   * - actionTarget: the noun ID of the noun type on which this action is
   *   applicable.  For example,
   *
   * The following should be present for actionType=="filter";
   * - shortName: The name that should be used to display this constraint.  For
   *   example, a checkbox-heavy UI might display a checkbox for each constraint
   *   using shortName as the label.
   * - makeConstraint: A function that takes the attribute that is the source
   *   of the noun and the noun instance as arguments, and returns APV-style
   *   constraints.  Since the APV-style query mechanism is now deprecated,
   *   this signature is deprecated.  Probably the way to update this would be
   *   to pass in the query instance that constraints should be contributed to.
   */
  defineNounAction(aNounID, aActionMeta) {
    const nounDef = this._nounIDToDef[aNounID];
    nounDef.actions.push(aActionMeta);
  },

  /**
   * Retrieve all of the actions (as defined using defineNounAction) for the
   *  given noun type (via noun ID) with the given action type (ex: filter).
   */
  getNounActions(aNounID, aActionType) {
    const nounDef = this._nounIDToDef[aNounID];
    if (!nounDef) {
      return [];
    }
    return nounDef.actions.filter(
      action => !aActionType || action.actionType == aActionType
    );
  },

  /** Attribute providers in the sequence to process them. */
  _attrProviderOrderByNoun: {},
  /** Attribute providers that provide optimizers, in the sequence to proc. */
  _attrOptimizerOrderByNoun: {},
  /** Maps attribute providers to the list of attributes they provide */
  _attrProviders: {},
  /**
   * Maps nouns to their attribute providers to a list of the attributes they
   *  provide for the noun.
   */
  _attrProvidersByNoun: {},

  /**
   * Define the core nouns (that are not defined elsewhere) and a few noun
   *  actions.  Core nouns could be defined in other files, assuming dependency
   *  issues are resolved via the Everybody.jsm mechanism or something else.
   *  Right now, noun_tag defines the tag noun.  If we broke more of these out,
   *  we would probably want to move the 'class' code from GlodaDataModel.jsm, the
   *  SQL table def and helper code from GlodaDatastore.jsm (and this code) to their
   *  own noun_*.js files.  There are some trade-offs to be made, and I think
   *  we can deal with those once we start to integrate lightning/calendar and
   *  our noun space gets large and more heterogeneous.
   */
  _initAttributes() {
    this.defineNoun(
      {
        name: "bool",
        clazz: Boolean,
        allowsArbitraryAttrs: false,
        isPrimitive: true,
        // favor true before false
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return b - a;
        },
        toParamAndValue(aBool) {
          return [null, aBool ? 1 : 0];
        },
      },
      GlodaConstants.NOUN_BOOLEAN
    );
    this.defineNoun(
      {
        name: "number",
        clazz: Number,
        allowsArbitraryAttrs: false,
        continuous: true,
        isPrimitive: true,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a - b;
        },
        toParamAndValue(aNum) {
          return [null, aNum];
        },
      },
      GlodaConstants.NOUN_NUMBER
    );
    this.defineNoun(
      {
        name: "string",
        clazz: String,
        allowsArbitraryAttrs: false,
        isPrimitive: true,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.localeCompare(b);
        },
        toParamAndValue(aString) {
          return [null, aString];
        },
      },
      GlodaConstants.NOUN_STRING
    );
    this.defineNoun(
      {
        name: "date",
        clazz: Date,
        allowsArbitraryAttrs: false,
        continuous: true,
        isPrimitive: true,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a - b;
        },
        toParamAndValue(aDate) {
          return [null, aDate.valueOf() * 1000];
        },
      },
      GlodaConstants.NOUN_DATE
    );
    this.defineNoun(
      {
        name: "fulltext",
        clazz: String,
        allowsArbitraryAttrs: false,
        continuous: false,
        isPrimitive: true,
        comparator(a, b) {
          throw new Error("Fulltext nouns are not comparable!");
        },
        // as noted on NOUN_FULLTEXT, we just pass the string around.  it never
        //  hits the database, so it's okay.
        toParamAndValue(aString) {
          return [null, aString];
        },
      },
      GlodaConstants.NOUN_FULLTEXT
    );

    this.defineNoun(
      {
        name: "folder",
        clazz: GlodaFolder,
        allowsArbitraryAttrs: false,
        isPrimitive: false,
        queryHelpers: {
          /**
           * Query for accounts based on the account associated with folders.  We
           *  walk all of the folders associated with an account and put them in
           *  the list of folders that match if gloda would index them.  This is
           *  unsuitable for producing a persistable constraint since it does not
           *  adapt for added/deleted folders.  However, it is sufficient for
           *  faceting.  Also, we don't persist constraints yet.
           *
           * @TODO The long-term solution is to move towards using arithmetic
           *     encoding on folder-id's like we use for MIME types and friends.
           */
          Account(aAttrDef, aArguments) {
            const folderValues = [];
            const seenRootFolders = {};
            for (let iArg = 0; iArg < aArguments.length; iArg++) {
              const givenFolder = aArguments[iArg];
              const givenMsgFolder = givenFolder.getXPCOMFolder(
                givenFolder.kActivityFolderOnlyNoData
              );
              const rootFolder = givenMsgFolder.rootFolder;

              // skip processing this folder if we have already processed its
              //  root folder.
              if (rootFolder.URI in seenRootFolders) {
                continue;
              }
              seenRootFolders[rootFolder.URI] = true;

              for (const folder of rootFolder.descendants) {
                const folderFlags = folder.flags;

                // Ignore virtual folders, non-mail folders.
                // XXX this is derived from GlodaIndexer's shouldIndexFolder.
                //  This should probably just use centralized code or the like.
                if (
                  !(folderFlags & Ci.nsMsgFolderFlags.Mail) ||
                  folderFlags & Ci.nsMsgFolderFlags.Virtual
                ) {
                  continue;
                }
                // we only index local or IMAP folders
                if (
                  !(folder instanceof Ci.nsIMsgLocalMailFolder) &&
                  !(folder instanceof Ci.nsIMsgImapMailFolder)
                ) {
                  continue;
                }

                const glodaFolder = Gloda.getFolderForFolder(folder);
                folderValues.push(glodaFolder);
              }
            }
            return this._inConstraintHelper(aAttrDef, folderValues);
          },
        },
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.name.localeCompare(b.name);
        },
        toParamAndValue(aFolderOrGlodaFolder) {
          if (aFolderOrGlodaFolder instanceof GlodaFolder) {
            return [null, aFolderOrGlodaFolder.id];
          }
          return [null, GlodaDatastore._mapFolder(aFolderOrGlodaFolder).id];
        },
      },
      GlodaConstants.NOUN_FOLDER
    );
    this.defineNoun(
      {
        name: "account",
        clazz: GlodaAccount,
        allowsArbitraryAttrs: false,
        isPrimitive: false,
        equals(a, b) {
          if ((a && !b) || (!a && b)) {
            return false;
          }
          if (!a && !b) {
            return true;
          }
          return a.id == b.id;
        },
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.name.localeCompare(b.name);
        },
      },
      GlodaConstants.NOUN_ACCOUNT
    );
    this.defineNoun(
      {
        name: "conversation",
        clazz: GlodaConversation,
        allowsArbitraryAttrs: false,
        isPrimitive: false,
        cache: true,
        cacheCost: 512,
        tableName: "conversations",
        attrTableName: "messageAttributes",
        attrIDColumnName: "conversationID",
        datastore: GlodaDatastore,
        objFromRow: GlodaDatastore._conversationFromRow,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.subject.localeCompare(b.subject);
        },
        toParamAndValue(aConversation) {
          if (aConversation instanceof GlodaConversation) {
            return [null, aConversation.id];
          }
          // assume they're just passing the id directly
          return [null, aConversation];
        },
      },
      GlodaConstants.NOUN_CONVERSATION
    );
    this.defineNoun(
      {
        name: "message",
        clazz: GlodaMessage,
        allowsArbitraryAttrs: true,
        isPrimitive: false,
        cache: true,
        cacheCost: 2048,
        tableName: "messages",
        // we will always have a fulltext row, even for messages where we don't
        //  have the body available.  this is because we want the subject indexed.
        dbQueryJoinMagic:
          " INNER JOIN messagesText ON messages.id = messagesText.rowid",
        attrTableName: "messageAttributes",
        attrIDColumnName: "messageID",
        datastore: GlodaDatastore,
        objFromRow: GlodaDatastore._messageFromRow,
        dbAttribAdjuster: GlodaDatastore.adjustMessageAttributes,
        dbQueryValidityConstraintSuffix:
          " AND +deleted = 0 AND +folderID IS NOT NULL AND +messageKey IS NOT NULL",
        // This is what's used when we have no validity constraints, i.e. we allow
        // for ghost messages, which do not have a row in the messagesText table.
        dbQueryJoinMagicWithNoValidityConstraints:
          " LEFT JOIN messagesText ON messages.id = messagesText.rowid",
        objInsert: GlodaDatastore.insertMessage,
        objUpdate: GlodaDatastore.updateMessage,
        toParamAndValue(aMessage) {
          if (aMessage instanceof GlodaMessage) {
            return [null, aMessage.id];
          }
          // assume they're just passing the id directly
          return [null, aMessage];
        },
      },
      GlodaConstants.NOUN_MESSAGE
    );
    this.defineNoun(
      {
        name: "contact",
        clazz: GlodaContact,
        allowsArbitraryAttrs: true,
        isPrimitive: false,
        cache: true,
        cacheCost: 128,
        tableName: "contacts",
        attrTableName: "contactAttributes",
        attrIDColumnName: "contactID",
        datastore: GlodaDatastore,
        objFromRow: GlodaDatastore._contactFromRow,
        dbAttribAdjuster: GlodaDatastore.adjustAttributes,
        objInsert: GlodaDatastore.insertContact,
        objUpdate: GlodaDatastore.updateContact,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.name.localeCompare(b.name);
        },
        toParamAndValue(aContact) {
          if (aContact instanceof GlodaContact) {
            return [null, aContact.id];
          }
          // assume they're just passing the id directly
          return [null, aContact];
        },
      },
      GlodaConstants.NOUN_CONTACT
    );
    this.defineNoun(
      {
        name: "identity",
        clazz: GlodaIdentity,
        allowsArbitraryAttrs: false,
        isPrimitive: false,
        cache: true,
        cacheCost: 128,
        usesUniqueValue: true,
        tableName: "identities",
        datastore: GlodaDatastore,
        objFromRow: GlodaDatastore._identityFromRow,
        /**
         * Short string is the contact name, long string includes the identity
         *  value too, delimited by a colon.  Not tremendously localizable.
         */
        userVisibleString(aIdentity, aLong) {
          if (!aLong) {
            return aIdentity.contact.name;
          }
          if (aIdentity.contact.name == aIdentity.value) {
            return aIdentity.value;
          }
          return aIdentity.contact.name + " (" + aIdentity.value + ")";
        },
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          return a.contact.name.localeCompare(b.contact.name);
        },
        toParamAndValue(aIdentity) {
          if (aIdentity instanceof GlodaIdentity) {
            return [null, aIdentity.id];
          }
          // assume they're just passing the id directly
          return [null, aIdentity];
        },
      },
      GlodaConstants.NOUN_IDENTITY
    );
    this.defineNoun(
      {
        name: "attachment-infos",
        clazz: GlodaAttachment,
        allowsArbitraryAttrs: false,
        isPrimitive: false,
        toJSON(x) {
          return [
            x._name,
            x._contentType,
            x._size,
            x._part,
            x._externalUrl,
            x._isExternal,
          ];
        },
        fromJSON(x, aGlodaMessage) {
          const [name, contentType, size, _part, _externalUrl, isExternal] = x;
          return new GlodaAttachment(
            aGlodaMessage,
            name,
            contentType,
            size,
            _part,
            _externalUrl,
            isExternal
          );
        },
      },
      GlodaConstants.NOUN_ATTACHMENT
    );

    // parameterized identity is just two identities; we store the first one
    //  (whose value set must be very constrainted, like the 'me' identities)
    //  as the parameter, the second (which does not need to be constrained)
    //  as the value.
    this.defineNoun(
      {
        name: "parameterized-identity",
        clazz: null,
        allowsArbitraryAttrs: false,
        comparator(a, b) {
          if (a == null) {
            if (b == null) {
              return 0;
            }
            return 1;
          } else if (b == null) {
            return -1;
          }
          // First sort by the first identity in the tuple
          // Since our general use-case is for the first guy to be "me", we only
          //  compare the identity value, not the name.
          const fic = a[0].value.localeCompare(b[0].value);
          if (fic) {
            return fic;
          }
          // Next compare the second identity in the tuple, but use the contact
          //  this time to be consistent with our identity comparator.
          return a[1].contact.name.localeCompare(b[1].contact.name);
        },
        computeDelta(aCurValues, aOldValues) {
          const oldMap = {};
          for (const tupe of aOldValues) {
            const [originIdentity, targetIdentity] = tupe;
            let targets = oldMap[originIdentity];
            if (targets === undefined) {
              targets = oldMap[originIdentity] = {};
            }
            targets[targetIdentity] = true;
          }

          const added = [],
            removed = [];
          for (const tupe of aCurValues) {
            const [originIdentity, targetIdentity] = tupe;
            const targets = oldMap[originIdentity];
            if (targets === undefined || !(targetIdentity in targets)) {
              added.push(tupe);
            } else {
              delete targets[targetIdentity];
            }
          }

          for (const originIdentity in oldMap) {
            const targets = oldMap[originIdentity];
            for (const targetIdentity in targets) {
              removed.push([originIdentity, targetIdentity]);
            }
          }

          return [added, removed];
        },
        contributeObjDependencies(
          aJsonValues,
          aReferencesByNounID,
          aInverseReferencesByNounID
        ) {
          // nothing to do with a zero-length list
          if (aJsonValues.length == 0) {
            return false;
          }

          const nounIdentityDef =
            Gloda._nounIDToDef[GlodaConstants.NOUN_IDENTITY];
          let references = aReferencesByNounID[nounIdentityDef.id];
          if (references === undefined) {
            references = aReferencesByNounID[nounIdentityDef.id] = {};
          }

          for (const tupe of aJsonValues) {
            const [originIdentityID, targetIdentityID] = tupe;
            if (!(originIdentityID in references)) {
              references[originIdentityID] = null;
            }
            if (!(targetIdentityID in references)) {
              references[targetIdentityID] = null;
            }
          }

          return true;
        },
        resolveObjDependencies(
          aJsonValues,
          aReferencesByNounID,
          aInverseReferencesByNounID
        ) {
          const references = aReferencesByNounID[GlodaConstants.NOUN_IDENTITY];

          const results = [];
          for (const tupe of aJsonValues) {
            const [originIdentityID, targetIdentityID] = tupe;
            results.push([
              references[originIdentityID],
              references[targetIdentityID],
            ]);
          }

          return results;
        },
        toJSON(aIdentityTuple) {
          return [aIdentityTuple[0].id, aIdentityTuple[1].id];
        },
        toParamAndValue(aIdentityTuple) {
          return [aIdentityTuple[0].id, aIdentityTuple[1].id];
        },
      },
      GlodaConstants.NOUN_PARAM_IDENTITY
    );

    GlodaDatastore.getAllAttributes();
  },

  /**
   * Create accessor functions to 'bind' an attribute to underlying normalized
   *  attribute storage, as well as creating the appropriate query object
   *  constraint helper functions.  This name is somewhat of a misnomer because
   *  special attributes are not 'bound' (because specific/non-generic per-class
   *  code provides the properties) but still depend on this method to
   *  establish their constraint helper methods.
   *
   * @XXX potentially rename to not suggest binding is required.
   */
  _bindAttribute(aAttrDef, aSubjectNounDef) {
    const objectNounDef = aAttrDef.objectNounDef;

    // -- the query constraint helpers
    if (aSubjectNounDef.queryClass !== undefined) {
      let constrainer;
      let canQuery = true;
      if (
        "special" in aAttrDef &&
        aAttrDef.special == GlodaConstants.kSpecialFulltext
      ) {
        constrainer = function (...aArgs) {
          const constraint = [
            GlodaConstants.kConstraintFulltext,
            aAttrDef,
            ...aArgs,
          ];
          this._constraints.push(constraint);
          return this;
        };
      } else if (aAttrDef.canQuery || aAttrDef.attributeName.startsWith("_")) {
        constrainer = function (...aArgs) {
          const constraint = [GlodaConstants.kConstraintIn, aAttrDef, ...aArgs];
          this._constraints.push(constraint);
          return this;
        };
      } else {
        constrainer = function () {
          throw new Error(
            "Cannot query on attribute " +
              aAttrDef.attributeName +
              " because its canQuery parameter hasn't been set to true." +
              " Reading the comments about Gloda.defineAttribute may be a" +
              " sensible thing to do now."
          );
        };
        canQuery = false;
      }

      aSubjectNounDef.queryClass.prototype[aAttrDef.boundName] = constrainer;

      // Don't bind extra query-able attributes if we're unable to perform a
      // search on the attribute.
      if (!canQuery) {
        return;
      }

      // - ranged value helper: fooRange
      if (objectNounDef.continuous) {
        // takes one or more tuples of [lower bound, upper bound]
        const rangedConstrainer = function (...aArgs) {
          const constraint = [
            GlodaConstants.kConstraintRanges,
            aAttrDef,
            ...aArgs,
          ];
          this._constraints.push(constraint);
          return this;
        };

        aSubjectNounDef.queryClass.prototype[aAttrDef.boundName + "Range"] =
          rangedConstrainer;
      }

      // - string LIKE helper for special on-row attributes: fooLike
      // (it is impossible to store a string as an indexed attribute, which is
      //  why we do this for on-row only.)
      if (
        "special" in aAttrDef &&
        aAttrDef.special == GlodaConstants.kSpecialString
      ) {
        const likeConstrainer = function (...aArgs) {
          const constraint = [
            GlodaConstants.kConstraintStringLike,
            aAttrDef,
            ...aArgs,
          ];
          this._constraints.push(constraint);
          return this;
        };

        aSubjectNounDef.queryClass.prototype[aAttrDef.boundName + "Like"] =
          likeConstrainer;
      }

      // - Custom helpers provided by the noun type...
      if ("queryHelpers" in objectNounDef) {
        for (const name in objectNounDef.queryHelpers) {
          const helper = objectNounDef.queryHelpers[name];
          // we need a new closure...
          const helperFunc = helper;
          aSubjectNounDef.queryClass.prototype[aAttrDef.boundName + name] =
            function (...aArgs) {
              return helperFunc.call(this, aAttrDef, ...aArgs);
            };
        }
      }
    }
  },

  /**
   * Names of attribute-specific localized strings and the JS attribute they are
   *  exposed as in the attribute's "strings" attribute (if the provider has a
   *  string bundle exposed on its "strings" attribute).  They are rooted at
   *  "gloda.SUBJECT-NOUN-NAME.attr.ATTR-NAME.*".
   *
   * Please consult the localization notes in gloda.properties to understand
   *  what these are used for.
   */
  _ATTR_LOCALIZED_STRINGS: {
    /* - Faceting */
    facetNameLabel: "facetNameLabel",
    noneLabel: "noneLabel",
    includeLabel: "includeLabel",
    excludeLabel: "excludeLabel",
    remainderLabel: "remainderLabel",
    mustMatchLabel: "mustMatchLabel",
    cantMatchLabel: "cantMatchLabel",
    mayMatchLabel: "mayMatchLabel",
    mustMatchNoneLabel: "mustMatchNoneLabel",
    mustMatchSomeLabel: "mustMatchSomeLabel",
    mayMatchAnyLabel: "mayMatchAnyLabel",
  },
  /**
   * Define an attribute and all its meta-data.  Takes a single dictionary as
   *  its argument, with the following required properties:
   *
   * @param aAttrDef.provider The object instance providing a 'process' method.
   * @param aAttrDef.extensionName The name of the extension providing these
   *     attributes.
   * @param aAttrDef.attributeType The type of attribute, one of the values from
   *     the kAttr* enumeration.
   * @param aAttrDef.attributeName The name of the attribute, which also doubles
   *     as the bound property name if you pass 'bind' a value of true.  You are
   *     responsible for avoiding collisions, which presumably will mean
   *     checking/updating a wiki page in the future, or just prefixing your
   *     attribute name with your extension name or something like that.
   * @param aAttrDef.bind Should this attribute be 'bound' as a convenience
   *     attribute on the subject's object (true/false)?  For example, with an
   *     attributeName of "foo" and passing true for 'bind' with a subject noun
   *     of NOUN_MESSAGE, GlodaMessage instances will expose a "foo" getter that
   *     returns the value of the attribute.  If 'singular' is true, this means
   *     an instance of the object class corresponding to the noun type or null
   *     if the attribute does not exist.  If 'singular' is false, this means a
   *     list of instances of the object class corresponding to the noun type,
   *     where the list may be empty if no instances of the attribute are
   *     present.
   * @param aAttrDef.bindName Optional override of attributeName for purposes of
   *     the binding property's name.
   * @param aAttrDef.singular Is the attribute going to happen at most once
   *     (true), or potentially multiple times (false).  This affects whether
   *     the binding returns a list or just a single item (which is null when
   *     the attribute is not present).
   * @param [aAttrDef.emptySetIsSignificant=false] Should we
   * @param aAttrDef.subjectNouns A list of object types (NOUNs) that this
   *     attribute can be set on.  Each element in the list should be one of the
   *     NOUN_* constants or a dynamically registered noun type.
   * @param aAttrDef.objectNoun The object type (one of the NOUN_* constants or
   *     a dynamically registered noun types) that is the 'object' in the
   *     traditional RDF triple.  More pragmatically, in the database row used
   *     to represent an attribute, we store the subject (ex: message ID),
   *     attribute ID, and an integer which is the integer representation of the
   *     'object' whose type you are defining right here.
   */
  defineAttribute(aAttrDef) {
    // ensure required properties exist on aAttrDef
    if (
      !("provider" in aAttrDef) ||
      !("extensionName" in aAttrDef) ||
      !("attributeType" in aAttrDef) ||
      !("attributeName" in aAttrDef) ||
      !("singular" in aAttrDef) ||
      !("subjectNouns" in aAttrDef) ||
      !("objectNoun" in aAttrDef)
    ) {
      // perhaps we should have a list of required attributes, perchance with
      //  and explanation of what it holds, and use that to be friendlier?
      throw Error(
        "You omitted a required attribute defining property, please" +
          " consult the documentation as penance."
      );
    }

    // -- Fill in defaults
    if (!("emptySetIsSignificant" in aAttrDef)) {
      aAttrDef.emptySetIsSignificant = false;
    }

    if (!("canQuery" in aAttrDef)) {
      aAttrDef.canQuery = !!aAttrDef.facet;
    }

    // return if the attribute has already been defined
    if (aAttrDef.dbDef) {
      return aAttrDef;
    }

    // - first time we've seen a provider init logic
    if (!(aAttrDef.provider.providerName in this._attrProviders)) {
      this._attrProviders[aAttrDef.provider.providerName] = [];
      if (aAttrDef.provider.contentWhittle) {
        whittlerRegistry.registerWhittler(aAttrDef.provider);
      }
    }

    const compoundName = aAttrDef.extensionName + ":" + aAttrDef.attributeName;
    // -- Database Definition
    let attrDBDef;
    if (compoundName in GlodaDatastore._attributeDBDefs) {
      // the existence of the GlodaAttributeDBDef means that either it has
      //  already been fully defined, or has been loaded from the database but
      //  not yet 'bound' to a provider (and had important meta-info that
      //  doesn't go in the db copied over)
      attrDBDef = GlodaDatastore._attributeDBDefs[compoundName];
    } else {
      // we need to create the attribute definition in the database
      let attrID = null;
      attrID = GlodaDatastore._createAttributeDef(
        aAttrDef.attributeType,
        aAttrDef.extensionName,
        aAttrDef.attributeName,
        null
      );

      attrDBDef = new GlodaAttributeDBDef(
        GlodaDatastore,
        attrID,
        compoundName,
        aAttrDef.attributeType,
        aAttrDef.extensionName,
        aAttrDef.attributeName
      );
      GlodaDatastore._attributeDBDefs[compoundName] = attrDBDef;
      GlodaDatastore._attributeIDToDBDefAndParam[attrID] = [attrDBDef, null];
    }

    aAttrDef.dbDef = attrDBDef;
    attrDBDef.attrDef = aAttrDef;

    aAttrDef.id = aAttrDef.dbDef.id;

    if ("bindName" in aAttrDef) {
      aAttrDef.boundName = aAttrDef.bindName;
    } else {
      aAttrDef.boundName = aAttrDef.attributeName;
    }

    aAttrDef.objectNounDef = this._nounIDToDef[aAttrDef.objectNoun];
    aAttrDef.objectNounDef.objectNounOfAttributes.push(aAttrDef);

    // -- Facets
    function normalizeFacetDef(aFacetDef) {
      if (!("groupIdAttr" in aFacetDef)) {
        aFacetDef.groupIdAttr = aAttrDef.objectNounDef.idAttr;
      }
      if (!("groupComparator" in aFacetDef)) {
        aFacetDef.groupComparator = aAttrDef.objectNounDef.comparator;
      }
      if (!("filter" in aFacetDef)) {
        aFacetDef.filter = null;
      }
    }
    // No facet attribute means no facet desired; set an explicit null so that
    //  code can check without doing an "in" check.
    if (!("facet" in aAttrDef)) {
      aAttrDef.facet = null;
    } else if (aAttrDef.facet === true) {
      // Promote "true" facet values to the defaults.  Where attributes have
      //  specified values, make sure we fill in any missing defaults.
      aAttrDef.facet = {
        type: "default",
        groupIdAttr: aAttrDef.objectNounDef.idAttr,
        groupComparator: aAttrDef.objectNounDef.comparator,
        filter: null,
      };
    } else {
      normalizeFacetDef(aAttrDef.facet);
    }
    if ("extraFacets" in aAttrDef) {
      for (const facetDef of aAttrDef.extraFacets) {
        normalizeFacetDef(facetDef);
      }
    }

    function gatherLocalizedStrings(aBundle, aPropRoot, aStickIn) {
      for (const propName in Gloda._ATTR_LOCALIZED_STRINGS) {
        const attrName = Gloda._ATTR_LOCALIZED_STRINGS[propName];
        try {
          aStickIn[attrName] = aBundle.GetStringFromName(aPropRoot + propName);
        } catch (ex) {
          // do nothing.  nsIStringBundle throws exceptions when not found
        }
      }
    }

    // -- L10n.
    // If the provider has a string bundle, populate a "strings" attribute with
    //  our standard attribute strings that can be UI exposed.
    if ("strings" in aAttrDef.provider && aAttrDef.facet) {
      const bundle = aAttrDef.provider.strings;

      // -- attribute strings
      const attrStrings = (aAttrDef.facet.strings = {});
      // we use the first subject the attribute applies to as the basis of
      //  where to get the string from.  Mainly because we currently don't have
      //  any attributes with multiple subjects nor a use-case where we expose
      //  multiple noun types via the UI.  (Just messages right now.)
      const canonicalSubject = this._nounIDToDef[aAttrDef.subjectNouns[0]];
      const propRoot =
        "gloda." +
        canonicalSubject.name +
        ".attr." +
        aAttrDef.attributeName +
        ".";
      gatherLocalizedStrings(bundle, propRoot, attrStrings);

      // -- alias strings for synthetic facets
      if ("extraFacets" in aAttrDef) {
        for (const facetDef of aAttrDef.extraFacets) {
          facetDef.strings = {};
          const aliasPropRoot =
            "gloda." + canonicalSubject.name + ".attr." + facetDef.alias + ".";
          gatherLocalizedStrings(bundle, aliasPropRoot, facetDef.strings);
        }
      }
    }

    // -- Subject Noun Binding
    for (
      let iSubject = 0;
      iSubject < aAttrDef.subjectNouns.length;
      iSubject++
    ) {
      const subjectType = aAttrDef.subjectNouns[iSubject];
      const subjectNounDef = this._nounIDToDef[subjectType];
      this._bindAttribute(aAttrDef, subjectNounDef);

      // update the provider maps...
      if (
        !this._attrProviderOrderByNoun[subjectType].includes(aAttrDef.provider)
      ) {
        this._attrProviderOrderByNoun[subjectType].push(aAttrDef.provider);
        if (aAttrDef.provider.optimize) {
          this._attrOptimizerOrderByNoun[subjectType].push(aAttrDef.provider);
        }
        this._attrProvidersByNoun[subjectType][aAttrDef.provider.providerName] =
          [];
      }
      this._attrProvidersByNoun[subjectType][
        aAttrDef.provider.providerName
      ].push(aAttrDef);

      subjectNounDef.attribsByBoundName[aAttrDef.boundName] = aAttrDef;
      if (aAttrDef.domExpose) {
        subjectNounDef.domExposeAttribsByBoundName[aAttrDef.boundName] =
          aAttrDef;
      }

      if (
        "special" in aAttrDef &&
        aAttrDef.special & GlodaConstants.kSpecialColumn
      ) {
        subjectNounDef.specialLoadAttribs.push(aAttrDef);
      }

      // if this is a parent column attribute, make note of it so that if we
      //  need to do an inverse references lookup, we know what column we are
      //  issuing against.
      if (
        "special" in aAttrDef &&
        aAttrDef.special === GlodaConstants.kSpecialColumnParent
      ) {
        subjectNounDef.parentColumnAttr = aAttrDef;
      }

      if (
        aAttrDef.objectNounDef.tableName ||
        aAttrDef.objectNounDef.contributeObjDependencies
      ) {
        subjectNounDef.hasObjDependencies = true;
      }
    }

    this._attrProviders[aAttrDef.provider.providerName].push(aAttrDef);
    return aAttrDef;
  },

  /**
   * Retrieve the attribute provided by the given extension with the given
   *  attribute name.  The original idea was that plugins would effectively
   *  name-space attributes, helping avoid collisions.  Since we are leaning
   *  towards using binding heavily, this doesn't really help, as the collisions
   *  will just occur on the attribute name instead.  Also, this can turn
   *  extensions into liars as name changes/moves to core/etc. happen.
   *
   * @TODO consider removing the extension name argument parameter requirement
   */
  getAttrDef(aPluginName, aAttrName) {
    const compoundName = aPluginName + ":" + aAttrName;
    return GlodaDatastore._attributeDBDefs[compoundName];
  },

  /**
   * Create a new query instance for the given noun-type.  This provides
   *  a generic way to provide constraint-based queries of any first-class
   *  nouns supported by the system.
   *
   * The idea is that every attribute on an object can be used to express
   *  a constraint on the query object.  Constraints implicitly 'AND' together,
   *  but providing multiple arguments to a constraint function results in an
   *  'OR'ing of those values.  Additionally, you can call or() on the returned
   *  query to create an alternate query that is effectively a giant OR against
   *  all the constraints you create on the main query object (or any other
   *  alternate queries returned by or()).  (Note: there is no nesting of these
   *  alternate queries. query.or().or() is equivalent to query.or())
   * For each attribute, there is a constraint with the same name that takes
   *  one or more arguments.  The arguments represent a set of OR values that
   *  objects matching the query can have.  (If you want the constraint
   *  effectively ANDed together, just invoke the constraint function
   *  multiple times.)  For example, newQuery(NOUN_PERSON).age(25) would
   *  constraint to all the people aged 25, while age(25, 26) would constrain
   *  to all the people age 25 or 26.
   * For each attribute with a 'continuous' noun, there is a constraint with the
   *  attribute name with "Range" appended.  It takes two arguments which are an
   *  inclusive lower bound and an inclusive lower bound for values in the
   *  range.  If you would like an open-ended range on either side, pass null
   *  for that argument.  If you would like to specify multiple ranges that
   *  should be ORed together, simply pass additional (pairs of) arguments.
   *  For example, newQuery(NOUN_PERSON).age(25,100) would constraint to all
   *  the people who are >= 25 and <= 100.  Likewise age(25, null) would just
   *  return all the people who are 25 or older.  And age(25,30,35,40) would
   *  return people who are either 25-30 or 35-30.
   * There are also full-text constraint columns.  In a nutshell, their
   *  arguments are the strings that should be passed to the SQLite FTS3
   *  MATCH clause.
   *
   * @param aNounID The (integer) noun-id of the noun you want to query on.
   * @param aOptions an optional dictionary of query options, see the GlodaQuery
   *     class documentation.
   */
  newQuery(aNounID, aOptions) {
    const nounDef = this._nounIDToDef[aNounID];
    return new nounDef.queryClass(aOptions);
  },

  /**
   * Create a collection/query for the given noun-type that only matches the
   *  provided items.  This is to be used when you have an explicit set of items
   *  that you would still like to receive updates for.
   */
  explicitCollection(aNounID, aItems) {
    const nounDef = this._nounIDToDef[aNounID];
    const collection = new GlodaCollection(nounDef, aItems, null, null);
    const query = new nounDef.explicitQueryClass(collection);
    collection.query = query;
    GlodaCollectionManager.registerCollection(collection);
    return collection;
  },

  /**
   * Debugging 'wildcard' collection creation support.  A wildcard collection
   *  will 'accept' any new item instances presented to the collection manager
   *  as new.  The result is that it allows you to be notified as new items
   *  as they are indexed, existing items as they are loaded from the database,
   *  etc.
   * Because the items are added to the collection without limit, this will
   *  result in a leak if you don't do something to clean up after the
   *  collection.  (Forgetting about the collection will suffice, as it is still
   *  weakly held.)
   */
  _wildcardCollection(aNounID, aItems) {
    const nounDef = this._nounIDToDef[aNounID];
    const collection = new GlodaCollection(nounDef, aItems, null, null);
    const query = new nounDef.wildcardQueryClass(collection);
    collection.query = query;
    GlodaCollectionManager.registerCollection(collection);
    return collection;
  },

  /**
   * Attribute providers attempting to index something that experience a fatal
   *  problem should throw one of these.  For example:
   *  "throw new Gloda.BadItemContentsError('Message lacks an author.');".
   *
   * We're not really taking advantage of this yet, but it's a good idea.
   */
  BadItemContentsError,

  /* eslint-disable complexity */
  /**
   * Populate a gloda representation of an item given the thus-far built
   *  representation, the previous representation, and one or more raw
   *  representations.  The attribute providers/optimizers for the given noun
   *  type are invoked, allowing them to contribute/alter things.  Following
   *  that, we build and persist our attribute representations.
   *
   * The result of the processing ends up with attributes in 3 different forms:
   * - Database attribute rows (to be added and removed).
   * - In-memory representation.
   * - JSON-able representation.
   *
   * @param aItem The noun instance you want processed.
   * @param aRawReps A dictionary that we pass to the attribute providers.
   *     There is a(n implied) contract between the caller of grokNounItem for a
   *     given noun type and the attribute providers for that noun type, and we
   *     have nothing to do with it OTHER THAN inserting a 'trueGlodaRep'
   *     value into it.  In the event of reindexing an existing object, the
   *     gloda representation we pass to the indexers is actually a clone that
   *     allows the asynchronous indexers to mutate the object without
   *     causing visible changes in the existing representation of the gloda
   *     object.  We patch the changes back onto the original item atomically
   *     once indexing completes.  The 'trueGlodaRep' is then useful for
   *     objects that hang off of the gloda instance that need a reference
   *     back to their containing object for API convenience purposes.
   * @param aIsConceptuallyNew Is the item "new" in the sense that it would
   *     never have been visible from within user code?  This translates into
   *     whether this should trigger an itemAdded notification or an
   *     itemModified notification.
   * @param aIsRecordNew Is the item "new" in the sense that we should INSERT
   *     a record rather than UPDATE-ing a record.  For example, when dealing
   *     with messages where we may have a ghost, the ghost message is not a
   *     new record, but is conceptually new.
   * @param aCallbackHandle The GlodaIndexer-style callback handle that is being
   *     used to drive this processing in an async fashion.  (See
   *     GlodaIndexer._callbackHandle).
   * @param aDoCache Should we allow this item to be contributed to its noun
   *     cache?
   */
  *grokNounItem(
    aItem,
    aRawReps,
    aIsConceptuallyNew,
    aIsRecordNew,
    aCallbackHandle,
    aDoCache
  ) {
    const itemNounDef = aItem.NOUN_DEF;
    const attribsByBoundName = itemNounDef.attribsByBoundName;

    this._log.info(" ** grokNounItem: " + itemNounDef.name);

    const addDBAttribs = [];
    const removeDBAttribs = [];

    const jsonDict = {};

    let aOldItem;
    aRawReps.trueGlodaRep = aItem;
    if (aIsConceptuallyNew) {
      // there is no old item if we are new.
      aOldItem = {};
    } else {
      aOldItem = aItem;
      // we want to create a clone of the existing item so that we can know the
      //  deltas that happened for indexing purposes
      aItem = aItem._clone();
    }

    // Have the attribute providers directly set properties on the aItem
    const attrProviders = this._attrProviderOrderByNoun[itemNounDef.id];
    for (let iProvider = 0; iProvider < attrProviders.length; iProvider++) {
      this._log.info("  * provider: " + attrProviders[iProvider].providerName);
      yield aCallbackHandle.pushAndGo(
        attrProviders[iProvider].process(
          aItem,
          aRawReps,
          aIsConceptuallyNew,
          aCallbackHandle
        )
      );
    }

    const attrOptimizers = this._attrOptimizerOrderByNoun[itemNounDef.id];
    for (let iProvider = 0; iProvider < attrOptimizers.length; iProvider++) {
      this._log.info(
        "  * optimizer: " + attrOptimizers[iProvider].providerName
      );
      yield aCallbackHandle.pushAndGo(
        attrOptimizers[iProvider].optimize(
          aItem,
          aRawReps,
          aIsConceptuallyNew,
          aCallbackHandle
        )
      );
    }
    this._log.info(" ** done with providers.");

    // Iterate over the attributes on the item
    for (const key of Object.keys(aItem)) {
      let value = aItem[key];
      // ignore keys that start with underscores, they are private and not
      //  persisted by our attribute mechanism.  (they are directly handled by
      //  the object implementation.)
      if (key.startsWith("_")) {
        continue;
      }
      // find the attribute definition that corresponds to this key
      const attrib = attribsByBoundName[key];
      // if there's no attribute, that's not good, but not horrible.
      if (attrib === undefined) {
        this._log.warn("new proc ignoring attrib: " + key);
        continue;
      }

      const attribDB = attrib.dbDef;
      const objectNounDef = attrib.objectNounDef;

      // - translate for our JSON rep
      if (attrib.singular) {
        if (objectNounDef.toJSON) {
          jsonDict[attrib.id] = objectNounDef.toJSON(value);
        } else {
          jsonDict[attrib.id] = value;
        }
      } else if (objectNounDef.toJSON) {
        const toJSON = objectNounDef.toJSON;
        jsonDict[attrib.id] = [];
        for (const subValue of value) {
          jsonDict[attrib.id].push(toJSON(subValue));
        }
      } else {
        jsonDict[attrib.id] = value;
      }

      const oldValue = aOldItem[key];

      // the 'old' item is still the canonical one; update it
      // do the update now, because we may skip operations on addDBAttribs and
      //  removeDBattribs, if the attribute is not to generate entries in
      //  messageAttributes
      if (oldValue !== undefined || !aIsConceptuallyNew) {
        aOldItem[key] = value;
      }

      // the new canQuery property has to be set to true to generate entries
      // in the messageAttributes table. Any other truthy value (like a non
      // empty string), will still make the message query-able but without
      // using the database.
      if (attrib.canQuery !== true) {
        continue;
      }

      // - database index attributes

      // perform a delta analysis against the old value, if we have one
      if (oldValue !== undefined) {
        // in the singular case if they don't match, it's one add and one remove
        if (attrib.singular) {
          // test for identicality, failing that, see if they have explicit
          //  equals support.
          if (
            value !== oldValue &&
            (!value.equals || !value.equals(oldValue))
          ) {
            addDBAttribs.push(attribDB.convertValuesToDBAttributes([value])[0]);
            removeDBAttribs.push(
              attribDB.convertValuesToDBAttributes([oldValue])[0]
            );
          }
        } else if (objectNounDef.computeDelta) {
          // in the plural case, we have to figure the deltas accounting for
          //  possible changes in ordering (which is insignificant from an
          //  indexing perspective)
          // some nouns may not meet === equivalence needs, so must provide a
          //  custom computeDelta method to help us out
          const [valuesAdded, valuesRemoved] = objectNounDef.computeDelta(
            value,
            oldValue
          );
          // convert the values to database-style attribute rows
          addDBAttribs.push.apply(
            addDBAttribs,
            attribDB.convertValuesToDBAttributes(valuesAdded)
          );
          removeDBAttribs.push.apply(
            removeDBAttribs,
            attribDB.convertValuesToDBAttributes(valuesRemoved)
          );
        } else {
          // build a map of the previous values; we will delete the values as
          //  we see them so that we will know what old values are no longer
          //  present in the current set of values.
          const oldValueMap = {};
          for (const anOldValue of oldValue) {
            // remember, the key is just the toString'ed value, so we need to
            //  store and use the actual value as the value!
            oldValueMap[anOldValue] = anOldValue;
          }
          // traverse the current values...
          const valuesAdded = [];
          for (const curValue of value) {
            if (curValue in oldValueMap) {
              delete oldValueMap[curValue];
            } else {
              valuesAdded.push(curValue);
            }
          }
          // anything still on oldValueMap was removed.
          const valuesRemoved = Object.keys(oldValueMap).map(
            key => oldValueMap[key]
          );
          // convert the values to database-style attribute rows
          addDBAttribs.push.apply(
            addDBAttribs,
            attribDB.convertValuesToDBAttributes(valuesAdded)
          );
          removeDBAttribs.push.apply(
            removeDBAttribs,
            attribDB.convertValuesToDBAttributes(valuesRemoved)
          );
        }

        // Add/remove the empty set indicator as appropriate.
        if (attrib.emptySetIsSignificant) {
          // if we are now non-zero but previously were zero, remove.
          if (value.length && !oldValue.length) {
            removeDBAttribs.push([GlodaDatastore.kEmptySetAttrId, attribDB.id]);
          } else if (!value.length && oldValue.length) {
            // We are now zero length but previously were not, add.
            addDBAttribs.push([GlodaDatastore.kEmptySetAttrId, attribDB.id]);
          }
        }
      } else {
        // no old value, all values are new
        // add the db reps on the new values
        if (attrib.singular) {
          value = [value];
        }
        addDBAttribs.push.apply(
          addDBAttribs,
          attribDB.convertValuesToDBAttributes(value)
        );
        // Add the empty set indicator for the attribute id if appropriate.
        if (!value.length && attrib.emptySetIsSignificant) {
          addDBAttribs.push([GlodaDatastore.kEmptySetAttrId, attribDB.id]);
        }
      }
    }

    // Iterate over any remaining values in old items for purge purposes.
    for (const key of Object.keys(aOldItem)) {
      let value = aOldItem[key];
      // ignore keys that start with underscores, they are private and not
      //  persisted by our attribute mechanism.  (they are directly handled by
      //  the object implementation.)
      if (key.startsWith("_")) {
        continue;
      }
      // ignore things we saw in the new guy
      if (key in aItem) {
        continue;
      }

      // find the attribute definition that corresponds to this key
      const attrib = attribsByBoundName[key];
      // if there's no attribute, that's not good, but not horrible.
      if (attrib === undefined) {
        continue;
      }

      // delete these from the old item, as the old item is canonical, and
      //  should no longer have these values
      delete aOldItem[key];

      if (attrib.canQuery !== true) {
        this._log.debug(
          "Not inserting attribute " +
            attrib.attributeName +
            " into the db, since we don't plan on querying on it"
        );
        continue;
      }

      if (attrib.singular) {
        value = [value];
      }
      const attribDB = attrib.dbDef;
      removeDBAttribs.push.apply(
        removeDBAttribs,
        attribDB.convertValuesToDBAttributes(value)
      );
      // remove the empty set marker if there should have been one
      if (!value.length && attrib.emptySetIsSignificant) {
        removeDBAttribs.push([GlodaDatastore.kEmptySetAttrId, attribDB.id]);
      }
    }

    aItem._jsonText = JSON.stringify(jsonDict);
    this._log.debug("  json text: " + aItem._jsonText);

    if (aIsRecordNew) {
      this._log.debug(" inserting item");
      itemNounDef.objInsert.call(itemNounDef.datastore, aItem);
    } else {
      this._log.debug(" updating item");
      itemNounDef.objUpdate.call(itemNounDef.datastore, aItem);
    }

    this._log.debug(
      " adjusting attributes, add: " + addDBAttribs + " rem: " + removeDBAttribs
    );
    itemNounDef.dbAttribAdjuster.call(
      itemNounDef.datastore,
      aItem,
      addDBAttribs,
      removeDBAttribs
    );

    if (!aIsConceptuallyNew && "_declone" in aOldItem) {
      aOldItem._declone(aItem);
    }

    // Cache ramifications...
    if (aDoCache === undefined || aDoCache) {
      if (aIsConceptuallyNew) {
        GlodaCollectionManager.itemsAdded(aItem.NOUN_ID, [aItem]);
      } else {
        GlodaCollectionManager.itemsModified(aOldItem.NOUN_ID, [aOldItem]);
      }
    }

    this._log.debug(" done grokking.");

    yield GlodaConstants.kWorkDone;
  },
  /* eslint-enable complexity */

  /**
   * Processes a list of noun instances for their score within a given context.
   *  This is primarily intended for use by search ranking mechanisms, but could
   *  be used elsewhere too.  (It does, however, depend on the complicity of the
   *  score method implementations to not get confused.)
   *
   * @param aItems The non-empty list of items to score.
   * @param aContext A noun-specific dictionary that we just pass to the funcs.
   * @param aExtraScoreFuncs A list of extra scoring functions to apply.
   * @returns A list of integer scores equal in length to aItems.
   */
  scoreNounItems(aItems, aContext, aExtraScoreFuncs) {
    const scores = [];
    // bail if there is nothing to score
    if (!aItems.length) {
      return scores;
    }

    const itemNounDef = aItems[0].NOUN_DEF;
    if (aExtraScoreFuncs == null) {
      aExtraScoreFuncs = [];
    }

    for (const item of aItems) {
      let score = 0;
      const attrProviders = this._attrProviderOrderByNoun[itemNounDef.id];
      for (let iProvider = 0; iProvider < attrProviders.length; iProvider++) {
        const provider = attrProviders[iProvider];
        if (provider.score) {
          score += provider.score(item);
        }
      }
      for (const extraScoreFunc of aExtraScoreFuncs) {
        score += extraScoreFunc(item, aContext);
      }
      scores.push(score);
    }

    return scores;
  },
};

/* and initialize the Gloda object/NS before we return... */
try {
  Gloda._init();
} catch (ex) {
  Gloda._log.debug(
    "Exception during Gloda init (" +
      ex.fileName +
      ":" +
      ex.lineNumber +
      "): " +
      ex
  );
}
/* but don't forget that we effectively depend on Everybody.jsm too, and
   currently on our importer to be importing that if they need us fully armed
   and operational. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The constants used by Gloda files. Avoid importing anything into this file.
 */

export var GlodaConstants = {
  /**
   * The indexer is idle.
   */
  kIndexerIdle: 0,
  /**
   * The indexer is doing something.  We used to have other specific states, but
   *  they have been rendered irrelevant and wiped from existence.
   */
  kIndexerIndexing: 1,

  /**
   * Synchronous activities performed that can be thought of as one processing
   *  token.  Potentially yield the event-loop and re-schedule for later based
   *  on how long we've actually taken/etc.  The goal here is that code that
   *  is doing stuff synchronously yields with kWorkSync periodically to make
   *  sure that it doesn't dominate the event-loop.  Unless the processing
   *  in question is particularly intensive, it should be reasonable to apply
   *  some decimation factor (ex: 32 or 64) with the general goal of yielding
   *  every 3-10 milliseconds.
   */
  kWorkSync: 0,
  /**
   * Asynchronous activity performed, you need to relinquish flow control and
   *  trust us to call callbackDriver later.
   */
  kWorkAsync: 1,
  /**
   * We are all done with our task, close us and figure out something else to do.
   */
  kWorkDone: 2,
  /**
   * We are not done with our task, but we think it's a good idea to take a
   *  breather because we believe we have tied up the event loop for a
   *  non-trivial amount of time.  So please re-schedule us in the future.
   *
   * This is currently only used internally by the indexer's batching logic;
   *  minor changes may be required if used by actual indexers.
   */
  kWorkPause: 3,
  /**
   * We are done with our task, and have a result that we are returning.  This
   *  should only be used by your callback handler's doneWithResult method.
   *  Ex: you are passed aCallbackHandle, and you do
   *  "yield aCallbackHandle.doneWithResult(myResult);".
   */
  kWorkDoneWithResult: 4,

  /**
   * An attribute that is a defining characteristic of the subject.
   */
  kAttrFundamental: 0,
  /**
   * An attribute that is an optimization derived from two or more fundamental
   *  attributes and exists solely to improve database query performance.
   */
  kAttrOptimization: 1,
  /**
   * An attribute that is derived from the content of the subject.  For example,
   *  a message that references a bugzilla bug could have a "derived" attribute
   *  that captures the bugzilla reference.  This is not
   */
  kAttrDerived: 2,
  /**
   * An attribute that is the result of an explicit and intentional user action
   *  upon the subject.  For example, a tag placed on a message by a user (or
   *  at the user's request by a filter) is explicit.
   */
  kAttrExplicit: 3,
  /**
   * An attribute that is indirectly the result of a user's behaviour.  For
   *  example, if a user consults a message multiple times, we may conclude that
   *  the user finds the message interesting.  It is "implied", if you will,
   *  that the message is interesting.
   */
  kAttrImplicit: 4,

  /**
   * This attribute is not 'special'; it is stored as a (thing id, attribute id,
   *  attribute id) tuple in the database rather than on thing's row or on
   *  thing's fulltext row.  (Where "thing" could be a message or any other
   *  first class noun.)
   */
  kSpecialNotAtAll: 0,
  /**
   * This attribute is stored as a numeric column on the row for the noun.  The
   *  attribute definition should include this value as 'special' and the
   *  column name that stores the attribute as 'specialColumnName'.
   */
  kSpecialColumn: 16,
  kSpecialColumnChildren: 16 | 1,
  kSpecialColumnParent: 16 | 2,
  /**
   * This attribute is stored as a string column on the row for the noun.  It
   *  differs from kSpecialColumn in that it is a string, which once had
   *  query ramifications and one day may have them again.
   */
  kSpecialString: 32,
  /**
   * This attribute is stored as a fulltext column on the fulltext table for
   *  the noun.  The attribute definition should include this value as 'special'
   *  and the column name that stores the table as 'specialColumnName'.
   */
  kSpecialFulltext: 64,

  /**
   * The extensionName used for the attributes defined by core gloda plugins
   *  such as GlodaFundAttr.jsm and GlodaExplicitAttr.jsm.
   */
  BUILT_IN: "built-in",

  /**
   * Special sentinel value that will cause facets to skip a noun instance
   * when an attribute has this value.
   */
  IGNORE_FACET: "ignore-facet",

  /*
   * The following are explicit noun IDs.  While most extension-provided nouns
   *  will have dynamically allocated id's that are looked up by name, these
   *  id's can be relied upon to exist and be accessible via these
   *  pseudo-constants.  It's not really clear that we need these, although it
   *  does potentially simplify code to not have to look up all of their nouns
   *  at initialization time.
   */
  /**
   * Boolean values, expressed as 0/1 in the database and non-continuous for
   *  constraint purposes.  Like numbers, such nouns require their attributes
   *  to provide them with context, lacking any of their own.
   * Having this as a noun type may be a bad idea; a change of nomenclature
   *  (so that we are not claiming a boolean value is a noun, but still using
   *  it in the same way) or implementation to require each boolean noun
   *  actually be its own noun may be in order.
   */
  NOUN_BOOLEAN: 1,
  /**
   * A number, which could mean an integer or floating point values.  We treat
   *  these as continuous, meaning that queries on them can have ranged
   *  constraints expressed on them.  Lacking any inherent context, numbers
   *  depend on their attributes to parameterize them as required.
   * Same deal as with NOUN_BOOLEAN, we may need to change this up conceptually.
   */
  NOUN_NUMBER: 2,
  /**
   * A (non-fulltext) string.
   * Same deal as with NOUN_BOOLEAN, we may need to change this up conceptually.
   */
  NOUN_STRING: 3,
  /** A date, encoded as a PRTime, represented as a js Date object. */
  NOUN_DATE: 10,
  /**
   * Fulltext search support, somewhat magical.  This is only intended to be
   *  used for kSpecialFulltext attributes, and exclusively as a constraint
   *  mechanism.  The values are always represented as strings.  It is presumed
   *  that the user of this functionality knows how to generate SQLite FTS3
   *  style MATCH queries, or is okay with us just gluing them together with
   *  " OR " when used in an or-constraint case.  Gloda's query mechanism
   *  currently lacks the ability to to compile Gloda-style and-constraints
   *  into a single MATCH query, but it will turn out okay, just less
   *  efficiently than it could.
   */
  NOUN_FULLTEXT: 20,
  /**
   * Represents a MIME Type.  We currently lack any human-intelligible
   *  descriptions of mime types.
   */
  NOUN_MIME_TYPE: 40,
  /**
   * Captures a message tag as well as when the tag's presence was observed,
   *  hoping to approximate when the tag was applied.  It's a somewhat dubious
   *  attempt to not waste our opporunity to store a value along with the tag.
   *  (The tag is actually stored as an attribute parameter on the attribute
   *  definition, rather than a value in the attribute 'instance' for the
   *  message.)
   */
  NOUN_TAG: 50,
  /**
   * Doesn't actually work owing to a lack of an object to represent a folder.
   *  We do expose the folderURI and folderID of a message, but need to map that
   *  to a good abstraction.  Probably something thin around a SteelFolder or
   *  the like; we would contribute the functionality to easily move from a
   *  folder to the list of gloda messages in that folder, as well as the
   *  indexing preferences for that folder.
   *
   * @TODO folder noun and related abstraction
   */
  NOUN_FOLDER: 100,
  /**
   * All messages belong to a conversation.  See GlodaDataModel.jsm for the
   *  definition of the GlodaConversation class.
   */
  NOUN_CONVERSATION: 101,
  /**
   * A one-to-one correspondence with underlying (indexed) nsIMsgDBHdr
   *  instances.  See GlodaDataModel.jsm for the definition of the GlodaMessage class.
   */
  NOUN_MESSAGE: 102,
  /**
   * Corresponds to a human being, who may have multiple electronic identities
   *  (a la NOUN_IDENTITY).  There is no requirement for association with an
   *  address book contact, although when the address book contact exists,
   *  we want to be associated with it.  See GlodaDataModel.jsm for the definition
   *  of the GlodaContact class.
   */
  NOUN_CONTACT: 103,
  /**
   * A single identity of a contact, who may have one or more.  E-mail accounts,
   *  instant messaging accounts, social network site accounts, etc. are each
   *  identities.  See GlodaDataModel.jsm for the definition of the GlodaIdentity
   *  class.
   */
  NOUN_IDENTITY: 104,
  /**
   * An attachment to a message. A message may have many different attachments.
   */
  NOUN_ATTACHMENT: 105,
  /**
   * An account related to a message. A message can have only one account.
   */
  NOUN_ACCOUNT: 106,

  /**
   * Parameterized identities, for use in the from-me, to-me, cc-me optimization
   *  cases.  Not for reuse without some thought.  These nouns use the parameter
   *  to store the 'me' identity that we are talking about, and the value to
   *  store the identity of the other party.  So in both the from-me and to-me
   *  cases involving 'me' and 'foo@bar', the 'me' identity is always stored via
   *  the attribute parameter, and the 'foo@bar' identity is always stored as
   *  the attribute value.  See GlodaFundAttr.jsm for more information on this, but
   *  you probably shouldn't be touching this unless you are fundattr.
   */
  NOUN_PARAM_IDENTITY: 200,

  kConstraintIdIn: 0,
  kConstraintIn: 1,
  kConstraintRanges: 2,
  kConstraintEquals: 3,
  kConstraintStringLike: 4,
  kConstraintFulltext: 5,
};

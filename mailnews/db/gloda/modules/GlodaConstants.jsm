/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The constants used by Gloda files. Avoid importing anything into this file.
 */

const EXPORTED_SYMBOLS = ["GlodaConstants"];

var GlodaConstants = {
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
};

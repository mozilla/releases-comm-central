/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the mechanics our query functionality.  Tests in this file are intended
 *  to cover extreme boundary cases and things that are just unlikely to happen
 *  in reasonable message use-cases.  (Which is to say, it could be hard to
 *  formulate a set of synthetic messages that result in the situation we want
 *  to test for.)
 */

var { prepareIndexerForTesting } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { queryExpect } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaQueryHelper.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaConstants } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaConstants.jsm"
);
var { GlodaIndexer, IndexingJob } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);

/* ===== Test Noun ===== */
/*
 * Introduce a simple noun type for our testing so that we can avoid having to
 * deal with the semantics of messages/friends and all their complexity.
 */

var WidgetProvider = {
  providerName: "widget",
  *process() {
    yield GlodaConstants.kWorkDone;
  },
};

add_setup(function () {
  // Don't initialize the index message state
  prepareIndexerForTesting();
  GlodaIndexer.registerIndexer(GenericIndexer);
  Gloda.addIndexerListener(genericIndexerCallback);
});

var WidgetNoun;
add_task(function setup_test_noun_and_attributes() {
  // --- noun
  WidgetNoun = Gloda.defineNoun({
    name: "widget",
    clazz: Widget,
    allowsArbitraryAttrs: true,
    // It is vitally important to our correctness that we allow caching
    //  otherwise our in-memory representations will not be canonical and the db
    //  will load some.  Or we could add things to collections as we index them.
    cache: true,
    cacheCost: 32,
    schema: {
      columns: [
        ["id", "INTEGER PRIMARY KEY"],
        ["intCol", "NUMBER", "inum"],
        // datePRTime is special and creates a Date object.
        ["dateCol", "NUMBER", "datePRTime"],
        ["strCol", "STRING", "str"],
        ["notabilityCol", "NUMBER", "notability"],
        ["textOne", "STRING", "text1"],
        ["textTwo", "STRING", "text2"],
      ],
      indices: {
        intCol: ["intCol"],
        strCol: ["strCol"],
      },
      fulltextColumns: [
        ["fulltextOne", "TEXT", "text1"],
        ["fulltextTwo", "TEXT", "text2"],
      ],
      genericAttributes: true,
    },
  });

  const EXT_NAME = "test";

  // --- special (on-row) attributes
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "inum",
    singular: true,
    special: GlodaConstants.kSpecialColumn,
    specialColumnName: "intCol",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_NUMBER,
    canQuery: true,
  });
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "date",
    singular: true,
    special: GlodaConstants.kSpecialColumn,
    specialColumnName: "dateCol",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_DATE,
    canQuery: true,
  });
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "str",
    singular: true,
    special: GlodaConstants.kSpecialString,
    specialColumnName: "strCol",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_STRING,
    canQuery: true,
  });

  // --- fulltext attributes
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "text1",
    singular: true,
    special: GlodaConstants.kSpecialFulltext,
    specialColumnName: "fulltextOne",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_FULLTEXT,
    canQuery: true,
  });
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "text2",
    singular: true,
    special: GlodaConstants.kSpecialFulltext,
    specialColumnName: "fulltextTwo",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_FULLTEXT,
    canQuery: true,
  });
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "fulltextAll",
    singular: true,
    special: GlodaConstants.kSpecialFulltext,
    specialColumnName: WidgetNoun.tableName + "Text",
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_FULLTEXT,
    canQuery: true,
  });

  // --- external (attribute-storage) attributes
  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "singleIntAttr",
    singular: true,
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_NUMBER,
    canQuery: true,
  });

  Gloda.defineAttribute({
    provider: WidgetProvider,
    extensionName: EXT_NAME,
    attributeType: GlodaConstants.kAttrFundamental,
    attributeName: "multiIntAttr",
    singular: false,
    emptySetIsSignificant: true,
    subjectNouns: [WidgetNoun.id],
    objectNoun: GlodaConstants.NOUN_NUMBER,
    canQuery: true,
  });
});

/* ===== Tests ===== */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
add_task(async function test_lots_of_string_constraints() {
  const stringConstraints = [];
  for (let i = 0; i < 2049; i++) {
    stringConstraints.push(
      ALPHABET[Math.floor(i / (ALPHABET.length * 2)) % ALPHABET.length] +
        ALPHABET[Math.floor(i / ALPHABET.length) % ALPHABET.length] +
        ALPHABET[i % ALPHABET.length] +
        // Throw in something that will explode if not quoted
        // and use an uneven number of things so if we fail
        // to quote it won't get quietly eaten.
        "'\""
    );
  }

  const query = Gloda.newQuery(WidgetNoun.id);
  query.str.apply(query, stringConstraints);

  await queryExpect(query, []);
});

/* === Query === */

/**
 * Use a counter so that each test can have its own unique value for intCol so
 *  that it can use that as a constraint.  Otherwise we would need to purge
 *  between every test.  That's not an unreasonable alternative, but this works.
 * Every test should increment this before using it.
 */
var testUnique = 100;

/**
 * Widgets with multiIntAttr populated with one or more values.
 */
var nonSingularWidgets;
/**
 * Widgets with multiIntAttr unpopulated.
 */
var singularWidgets;

add_task(async function setup_non_singular_values() {
  testUnique++;
  const origin = new Date("2007/01/01");
  nonSingularWidgets = [
    new Widget(testUnique, origin, "ns1", 0, "", ""),
    new Widget(testUnique, origin, "ns2", 0, "", ""),
  ];
  singularWidgets = [
    new Widget(testUnique, origin, "s1", 0, "", ""),
    new Widget(testUnique, origin, "s2", 0, "", ""),
  ];
  nonSingularWidgets[0].multiIntAttr = [1, 2];
  nonSingularWidgets[1].multiIntAttr = [3];
  singularWidgets[0].multiIntAttr = [];
  // And don't bother setting it on singularWidgets[1].

  GenericIndexer.indexObjects(nonSingularWidgets.concat(singularWidgets));
  await promiseGenericIndexerCallback;

  // Reset promise.
  promiseGenericIndexerCallback = new Promise(resolve => {
    promiseGenericIndexerCallbackResolve = resolve;
  });
});

add_task(async function test_query_has_value_for_non_singular() {
  const query = Gloda.newQuery(WidgetNoun.id);
  query.inum(testUnique);
  query.multiIntAttr();
  await queryExpect(query, nonSingularWidgets);
});

/**
 * We should find the one singular object where we set the multiIntAttr to an
 *  empty set.  We don't find the one without the attribute since that's
 *  actually something different.
 * We also want to test that re-indexing properly adds/removes the attribute
 *  so change the object and make sure everything happens correctly.
 *
 * Tests gloda.datastore.sqlgen.kConstraintIn.emptySet
 * Tests gloda.query.test.kConstraintIn.emptySet
 */
add_task(async function test_empty_set_logic() {
  // - Initial query based on the setup previously.
  dump("Initial index case\n");
  let query = Gloda.newQuery(WidgetNoun.id);
  query.inum(testUnique);
  query.multiIntAttr(null);
  await queryExpect(query, [singularWidgets[0]]);

  // - Make one of the non-singulars move to empty and move the guy who matched
  //  to no longer match.
  dump("Incremental index case\n");
  nonSingularWidgets[0].multiIntAttr = [];
  singularWidgets[0].multiIntAttr = [4, 5];

  GenericIndexer.indexObjects([nonSingularWidgets[0], singularWidgets[0]]);
  await promiseGenericIndexerCallback;

  // Reset promise;
  promiseGenericIndexerCallback = new Promise(resolve => {
    promiseGenericIndexerCallbackResolve = resolve;
  });

  query = Gloda.newQuery(WidgetNoun.id);
  query.inum(testUnique);
  query.multiIntAttr(null);
  await queryExpect(query, [nonSingularWidgets[0]]);

  // Make sure that the query doesn't explode when it has to handle a case
  //  that's not supposed to match.
  Assert.ok(!query.test(singularWidgets[0]));
});

/* === Search === */
/*
 * The conceit of our search is that more recent messages are better than older
 *  messages.  But at the same time, we care about some messages more than
 *  others (in general), and we care about messages that match search terms
 *  more strongly too.  So we introduce a general 'score' heuristic which we
 *  then apply to message timestamps to make them appear more recent.  We
 *  then order by this 'date score' hybrid, which we dub "dascore".  Such a
 *  flattening heuristic is over-simple, but believed to be sufficient to
 *  generally get us the messages we want.  Post-processing based can then
 *  be more multi-dimensional and what not, but that is beyond the scope of
 *  this unit test.
 */

/**
 * How much time boost should a 'score point' amount to?  The authoritative,
 *  incontrivertible answer, across all time and space, is a week.
 *  Gloda and storage like to store things as PRTime and so we do it too,
 *  even though milliseconds are the actual granularity of JS Date instances.
 */
const SCORE_TIMESTAMP_FACTOR = 1000 * 1000 * 60 * 60 * 24 * 7;

/**
 * How many score points for each fulltext match?
 */
const SCORE_FOR_FULLTEXT_MATCH = 1;

/**
 * Roughly how many characters are in each offset match.
 */
const OFFSET_CHARS_PER_FULLTEXT_MATCH = 8;

var fooWidgets = null;
var barBazWidgets = null;

add_task(async function setup_search_ranking_idiom() {
  // --- Build some widgets for testing.
  // Use inum to represent the expected result sequence
  // Setup a base date.
  const origin = new Date("2008/01/01");
  const daymore = new Date("2008/01/02");
  const monthmore = new Date("2008/02/01");
  fooWidgets = [
    // -- Setup the term "foo" to do frequency tests.
    new Widget(5, origin, "", 0, "", "foo"),
    new Widget(4, origin, "", 0, "", "foo foo"),
    new Widget(3, origin, "", 0, "foo", "foo foo"),
    new Widget(2, origin, "", 0, "foo foo", "foo foo"),
    new Widget(1, origin, "", 0, "foo foo", "foo foo foo"),
    new Widget(0, origin, "", 0, "foo foo foo", "foo foo foo"),
  ];
  barBazWidgets = [
    // -- Setup score and matches to boost older messages over newer messages.
    new Widget(7, origin, "", 0, "", "bar"), // score boost: 1 + date: 0
    new Widget(6, daymore, "", 0, "", "bar"), // 1 + 0+
    new Widget(5, origin, "", 1, "", "bar"), // 2 + 0
    new Widget(4, daymore, "", 0, "bar", "bar"), // 2 + 0+
    new Widget(3, origin, "", 1, "bar", "baz"), // 3 + 0
    new Widget(2, monthmore, "", 0, "", "bar"), // 1 + 4
    new Widget(1, origin, "", 0, "bar baz", "bar baz bar bar"), // 6 + 0
    new Widget(0, origin, "", 1, "bar baz", "bar baz bar bar"), // 7 + 0
  ];

  GenericIndexer.indexObjects(fooWidgets.concat(barBazWidgets));
  await promiseGenericIndexerCallback;

  // Reset promise.
  promiseGenericIndexerCallback = new Promise(resolve => {
    promiseGenericIndexerCallbackResolve = resolve;
  });
});

// Add one because the last snippet shouldn't have a trailing space.
const OFFSET_SCORE_SQL_SNIPPET =
  "(((length(osets) + 1) / " +
  OFFSET_CHARS_PER_FULLTEXT_MATCH +
  ") * " +
  SCORE_FOR_FULLTEXT_MATCH +
  ")";

const SCORE_SQL_SNIPPET = "(" + OFFSET_SCORE_SQL_SNIPPET + " + notabilityCol)";

const DASCORE_SQL_SNIPPET =
  "((" + SCORE_SQL_SNIPPET + " * " + SCORE_TIMESTAMP_FACTOR + ") + dateCol)";

const WIDGET_FULLTEXT_QUERY_EXPLICIT_SQL =
  "SELECT ext_widget.*, offsets(ext_widgetText) AS osets " +
  "FROM ext_widget, ext_widgetText WHERE ext_widgetText MATCH ?" +
  " AND ext_widget.id == ext_widgetText.docid";

/**
 * Used by queryExpect to verify
 */
function verify_widget_order_and_stashing(
  aZeroBasedIndex,
  aWidget,
  aCollection
) {
  Assert.equal(aZeroBasedIndex, aWidget.inum);
  if (
    !aCollection.stashedColumns[aWidget.id] ||
    !aCollection.stashedColumns[aWidget.id].length
  ) {
    do_throw("no stashed information for widget: " + aWidget);
  }
}

/**
 * Test the fundamentals of the search ranking idiom we use elsewhere.  This
 *  is primarily a simplified
 */
add_task(async function test_search_ranking_idiom_offsets() {
  const query = Gloda.newQuery(WidgetNoun.id, {
    explicitSQL: WIDGET_FULLTEXT_QUERY_EXPLICIT_SQL,
    // osets becomes 0-based column number 7.
    // dascore becomes 0-based column number 8.
    outerWrapColumns: [DASCORE_SQL_SNIPPET + " AS dascore"],
    // Save our extra columns for analysis and debugging.
    stashColumns: [7, 8],
  });
  query.fulltextAll("foo");
  query.orderBy("-dascore");
  await queryExpect(
    query,
    fooWidgets,
    null,
    null,
    verify_widget_order_and_stashing
  );
});

add_task(async function test_search_ranking_idiom_score() {
  const query = Gloda.newQuery(WidgetNoun.id, {
    explicitSQL: WIDGET_FULLTEXT_QUERY_EXPLICIT_SQL,
    // osets becomes 0-based column number 7
    // dascore becomes 0-based column number 8
    outerWrapColumns: [
      DASCORE_SQL_SNIPPET + " AS dascore",
      SCORE_SQL_SNIPPET + " AS dabore",
      "dateCol",
    ],
    // Save our extra columns for analysis and debugging.
    stashColumns: [7, 8, 9, 10],
  });
  query.fulltextAll("bar OR baz");
  query.orderBy("-dascore");
  await queryExpect(
    query,
    barBazWidgets,
    null,
    null,
    verify_widget_order_and_stashing
  );
});

/**
 * Generic indexing mechanism; does nothing special, just uses
 *  Gloda.grokNounItem.  Call GenericIndexer.indexNewObjects() to queue
 *  queue your objects for initial indexing.
 */
var GenericIndexer = {
  _log: console.createInstance({
    prefix: "gloda.test",
    maxLogLevel: "Warn",
    maxLogLevelPref: "gloda.test.loglevel",
  }),
  /* public interface */
  name: "generic_indexer",
  enable() {
    this.enabled = true;
  },
  disable() {
    this.enabled = false;
  },
  get workers() {
    return [
      [
        "generic",
        {
          worker: this._worker_index_generic,
        },
      ],
    ];
  },
  initialSweep() {},
  /* mock interface */
  enabled: false,
  initialSweepCalled: false,
  indexObjects(aObjects) {
    indexingInProgress = true;
    this._log.debug(
      "enqueuing " +
        aObjects.length +
        " generic objects with id: " +
        aObjects[0].NOUN_ID
    );
    GlodaIndexer.indexJob(new IndexingJob("generic", null, aObjects.concat()));
  },
  /* implementation */
  *_worker_index_generic(aJob, aCallbackHandle) {
    this._log.debug(
      "Beginning indexing " + aJob.items.length + " generic items"
    );
    for (const item of aJob.items) {
      this._log.debug("Indexing: " + item);
      yield aCallbackHandle.pushAndGo(
        Gloda.grokNounItem(
          item,
          {},
          item.id === undefined,
          item.id === undefined,
          aCallbackHandle,
          item.NOUN_DEF.cache
        )
      );
      item._stash();
    }

    yield GlodaConstants.kWorkDone;
    this._log.debug("Done indexing");
  },
};

var indexingInProgress = false;
var promiseGenericIndexerCallbackResolve;
var promiseGenericIndexerCallback = new Promise(resolve => {
  promiseGenericIndexerCallbackResolve = resolve;
});
function genericIndexerCallback(aStatus) {
  // If indexingInProgress is false, we've received the synthetic
  // notification, so ignore it.
  if (indexingInProgress && aStatus == GlodaConstants.kIndexerIdle) {
    indexingInProgress = false;
    promiseGenericIndexerCallbackResolve();
  }
}

/**
 * Simple test object.
 *
 * Has some tricks for gloda indexing to deal with gloda's general belief that
 *  things are immutable.  When we get indexed we stash all of our attributes
 *  at that time in _indexStash.  Then when we get cloned we propagate our
 *  current attributes over to the cloned object and restore _indexStash.  This
 *  sets things up the way gloda expects them as long as we never de-persist
 *  from the db.
 */
function Widget(inum, date, str, notability, text1, text2) {
  this._id = undefined;
  this._inum = inum;
  this._date = date;
  this._str = str;
  this._notability = notability;
  this._text1 = text1;
  this._text2 = text2;

  this._indexStash = null;
  this._restoreStash = null;
}
Widget.prototype = {
  _clone() {
    const clonus = new Widget(
      this._inum,
      this._date,
      this._str,
      this._notability,
      this._text1,
      this._text2
    );
    clonus._id = this._id;
    clonus._iAmAClone = true;

    for (const key of Object.keys(this)) {
      const value = this[key];
      if (key.startsWith("_")) {
        continue;
      }
      clonus[key] = value;
      if (key in this._indexStash) {
        this[key] = this._indexStash[key];
      }
    }

    return clonus;
  },
  _stash() {
    this._indexStash = {};
    for (const key of Object.keys(this)) {
      const value = this[key];
      if (key[0].startsWith("_")) {
        continue;
      }
      this._indexStash[key] = value;
    }
  },

  get id() {
    return this._id;
  },
  set id(aVal) {
    this._id = aVal;
  },

  // Gloda's attribute idiom demands that row attributes be prefixed with a '_'
  //  (Because Gloda.grokNounItem detects attributes by just walking.).  This
  //  could be resolved by having the special attributes moot these dudes, but
  //  that's not how things are right now.
  get inum() {
    return this._inum;
  },
  set inum(aVal) {
    this._inum = aVal;
  },
  get date() {
    return this._date;
  },
  set date(aVal) {
    this._date = aVal;
  },

  get datePRTime() {
    return this._date.valueOf() * 1000;
  },
  // We need a special setter to convert back from PRTime to an actual
  //  date object.
  set datePRTime(aVal) {
    this._date = new Date(aVal / 1000);
  },

  get str() {
    return this._str;
  },
  set str(aVal) {
    this._str = aVal;
  },
  get notability() {
    return this._notability;
  },
  set notability(aVal) {
    this._notability = aVal;
  },
  get text1() {
    return this._text1;
  },
  set text1(aVal) {
    this._text1 = aVal;
  },
  get text2() {
    return this._text2;
  },
  set text2(aVal) {
    this._text2 = aVal;
  },

  toString() {
    return "" + this.id;
  },
};

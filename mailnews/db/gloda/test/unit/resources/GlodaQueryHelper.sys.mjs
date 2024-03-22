/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides gloda query helpers for the test infrastructure.
 */

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";

import { GlodaDatastore } from "resource:///modules/gloda/GlodaDatastore.sys.mjs";

var log = console.createInstance({
  prefix: "gloda.queryHelper",
  maxLogLevel: "Warn",
  maxLogLevelPref: "gloda.loglevel",
});

var _defaultExpectationExtractors = {};
_defaultExpectationExtractors[GlodaConstants.NOUN_MESSAGE] = [
  function expectExtract_message_gloda(aGlodaMessage) {
    return aGlodaMessage.headerMessageID;
  },
  function expectExtract_message_synth(aSynthMessage) {
    return aSynthMessage.messageId;
  },
];
_defaultExpectationExtractors[GlodaConstants.NOUN_CONTACT] = [
  function expectExtract_contact_gloda(aGlodaContact) {
    return aGlodaContact.name;
  },
  function expectExtract_contact_name(aName) {
    return aName;
  },
];
_defaultExpectationExtractors[GlodaConstants.NOUN_IDENTITY] = [
  function expectExtract_identity_gloda(aGlodaIdentity) {
    return aGlodaIdentity.value;
  },
  function expectExtract_identity_address(aAddress) {
    return aAddress;
  },
];

function expectExtract_default_toString(aThing) {
  return aThing.toString();
}

/**
 * @see queryExpect for info on what we do.
 */
class QueryExpectationListener {
  constructor(
    aExpectedSet,
    aGlodaExtractor,
    aOrderVerifier,
    aCallerStackFrame
  ) {
    this.expectedSet = aExpectedSet;
    this.glodaExtractor = aGlodaExtractor;
    this.orderVerifier = aOrderVerifier;
    this.completed = false;
    this.callerStackFrame = aCallerStackFrame;
    // Track our current 'index' in the results for the (optional) order verifier,
    //  but also so we can provide slightly more useful debug output.
    this.nextIndex = 0;

    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  onItemsAdded(aItems, aCollection) {
    log.debug("QueryExpectationListener onItemsAdded received.");
    for (const item of aItems) {
      let glodaStringRep;
      try {
        glodaStringRep = this.glodaExtractor(item);
      } catch (ex) {
        this._reject(
          new Error(
            "Gloda extractor threw during query expectation.\n" +
              "Item:\n" +
              item +
              "\nException:\n" +
              ex
          )
        );
        return; // We don't have to continue for more checks.
      }

      // Make sure we were expecting this guy.
      if (glodaStringRep in this.expectedSet) {
        delete this.expectedSet[glodaStringRep];
      } else {
        this._reject(
          new Error(
            "Query returned unexpected result!\n" +
              "Item:\n" +
              item +
              "\nExpected set:\n" +
              this.expectedSet +
              "\nCaller:\n" +
              this.callerStackFrame
          )
        );
        return; // We don't have to continue for more checks.
      }

      if (this.orderVerifier) {
        try {
          this.orderVerifier(this.nextIndex, item, aCollection);
        } catch (ex) {
          // If the order was wrong, we could probably go for an output of what
          //  we actually got...
          dump("Order Problem detected. Dump of data:\n");
          for (const [iThing, thing] of aItems.entries()) {
            dump(
              iThing +
                ": " +
                thing +
                (aCollection.stashedColumns
                  ? ". " + aCollection.stashedColumns[thing.id].join(", ")
                  : "") +
                "\n"
            );
          }
          this._reject(ex);
          return; // We don't have to continue for more checks.
        }
      }
      this.nextIndex++;

      // Make sure the query's test method agrees with the database about this.
      if (!aCollection.query.test(item)) {
        this._reject(
          new Error(
            "Query test returned false when it should have been true on.\n" +
              "Extracted:\n" +
              glodaStringRep +
              "\nItem:\n" +
              item
          )
        );
      }
    }
  }
  onItemsModified() {
    log.debug(
      "QueryExpectationListener onItemsModified received. Nothing done."
    );
  }
  onItemsRemoved() {
    log.debug(
      "QueryExpectationListener onItemsRemoved received. Nothing done."
    );
  }
  onQueryCompleted(aCollection) {
    log.debug("QueryExpectationListener onQueryCompleted received.");
    // We may continue to match newly added items if we leave our query as it
    //  is, so let's become explicit to avoid related troubles.
    aCollection.becomeExplicit();

    // `expectedSet` should now be empty.
    for (const key in this.expectedSet) {
      const value = this.expectedSet[key];
      this._reject(
        new Error(
          "Query should have returned:\n" +
            key +
            " (" +
            value +
            ").\n" +
            "But " +
            this.nextIndex +
            " was seen."
        )
      );
      return; // We don't have to continue for more checks.
    }

    // If no error is thrown then we're fine here.
    this._resolve();
  }

  get promise() {
    return this._promise;
  }
}

/**
 * Execute the given query, verifying that the result set contains exactly the
 *  contents of the expected set; no more, no less.  Since we expect that the
 *  query will result in gloda objects, but your expectations will not be posed
 *  in terms of gloda objects (though they could be), we rely on extractor
 *  functions to take the gloda result objects and the expected result objects
 *  into the same string.
 * If you don't provide extractor functions, we will use our defaults (based on
 *  the query noun type) if available, or assume that calling toString is
 *  sufficient.
 *
 * @param aQuery Either a query to execute, or a dict with the following keys:
 *     - queryFunc: The function to call that returns a function.
 *     - queryThis: The 'this' to use for the invocation of queryFunc.
 *     - args: A list (possibly empty) or arguments to precede the traditional
 *         arguments to query.getCollection.
 *     - nounId: The (numeric) noun id of the noun type expected to be returned.
 * @param aExpectedSet The list of expected results from the query where each
 *     item is suitable for extraction using aExpectedExtractor.  We have a soft
 *     spot for SyntheticMessageSets and automatically unbox them.
 * @param aGlodaExtractor The extractor function to take an instance of the
 *     gloda representation and return a string for comparison/equivalence
 *     against that returned by the expected extractor (against the input
 *     instance in aExpectedSet.)  The value returned must be unique for all
 *     of the expected gloda representations of the expected set.  If omitted,
 *     the default extractor for the gloda noun type is used.  If no default
 *     extractor exists, toString is called on the item.
 * @param aExpectedExtractor The extractor function to take an instance from the
 *     values in the aExpectedSet and return a string for comparison/equivalence
 *     against that returned by the gloda extractor.  The value returned must
 *     be unique for all of the values in the expected set.  If omitted, the
 *     default extractor for the presumed input type based on the gloda noun
 *     type used for the query is used, failing over to toString.
 * @param aOrderVerifier Optional function to verify the order the results are
 *     received in.  Function signature should be of the form (aZeroBasedIndex,
 *     aItem, aCollectionResultIsFor).
 */
export async function queryExpect(
  aQuery,
  aExpectedSet,
  aGlodaExtractor,
  aExpectedExtractor,
  aOrderVerifier
) {
  if (aQuery.test) {
    aQuery = {
      queryFunc: aQuery.getCollection,
      queryThis: aQuery,
      args: [],
      nounId: aQuery._nounDef.id,
    };
  }

  if ("synMessages" in aExpectedSet) {
    aExpectedSet = aExpectedSet.synMessages;
  }

  // - set extractor functions to defaults if omitted
  if (aGlodaExtractor == null) {
    if (_defaultExpectationExtractors[aQuery.nounId] !== undefined) {
      aGlodaExtractor = _defaultExpectationExtractors[aQuery.nounId][0];
    } else {
      aGlodaExtractor = expectExtract_default_toString;
    }
  }
  if (aExpectedExtractor == null) {
    if (_defaultExpectationExtractors[aQuery.nounId] !== undefined) {
      aExpectedExtractor = _defaultExpectationExtractors[aQuery.nounId][1];
    } else {
      aExpectedExtractor = expectExtract_default_toString;
    }
  }

  // - build the expected set
  const expectedSet = {};
  for (const item of aExpectedSet) {
    try {
      expectedSet[aExpectedExtractor(item)] = item;
    } catch (ex) {
      throw new Error(
        "Expected extractor threw during query expectation for item:\n" +
          item +
          "\nException:\n" +
          ex
      );
    }
  }

  // - create the listener...
  const listener = new QueryExpectationListener(
    expectedSet,
    aGlodaExtractor,
    aOrderVerifier,
    Components.stack.caller
  );
  aQuery.args.push(listener);
  const queryValue = aQuery.queryFunc.apply(aQuery.queryThis, aQuery.args);
  // Wait for the QueryListener to finish.
  await listener.promise;
  return queryValue;
}

/**
 * Asynchronously run a SQL statement against the gloda database.  This can grow
 *  binding logic and data returning as needed.
 *
 * We run the statement asynchronously to get a consistent view of the database.
 */
export async function sqlRun(sql) {
  const conn = GlodaDatastore.asyncConnection;
  const stmt = conn.createAsyncStatement(sql);
  let rows = null;

  let promiseResolve;
  let promiseReject;
  const promise = new Promise((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
  });
  // Running SQL.
  stmt.executeAsync({
    handleResult(aResultSet) {
      if (!rows) {
        rows = [];
      }
      let row;
      while ((row = aResultSet.getNextRow())) {
        rows.push(row);
      }
    },
    handleError(aError) {
      promiseReject(
        new Error("SQL error!\nResult:\n" + aError + "\nSQL:\n" + sql)
      );
    },
    handleCompletion() {
      promiseResolve(rows);
    },
  });
  stmt.finalize();
  return promise;
}

/**
 * Run an (async) SQL statement against the gloda database.  The statement
 *  should be a SELECT COUNT; we check the count against aExpectedCount.
 *  Any additional arguments are positionally bound to the statement.
 *
 * We run the statement asynchronously to get a consistent view of the database.
 */
export async function sqlExpectCount(aExpectedCount, aSQLString, ...params) {
  const conn = GlodaDatastore.asyncConnection;
  const stmt = conn.createStatement(aSQLString);

  for (let iArg = 0; iArg < params.length; iArg++) {
    GlodaDatastore._bindVariant(stmt, iArg, params[iArg]);
  }

  const desc = [aSQLString, ...params];
  // Running SQL count.
  const listener = new SqlExpectationListener(
    aExpectedCount,
    desc,
    Components.stack.caller
  );
  stmt.executeAsync(listener);
  // We don't need the statement anymore.
  stmt.finalize();

  await listener.promise;
}

class SqlExpectationListener {
  constructor(aExpectedCount, aDesc, aCallerStackFrame) {
    this.actualCount = null;
    this.expectedCount = aExpectedCount;
    this.sqlDesc = aDesc;
    this.callerStackFrame = aCallerStackFrame;

    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  handleResult(aResultSet) {
    const row = aResultSet.getNextRow();
    if (!row) {
      this._reject(
        new Error(
          "No result row returned from caller:\n" +
            this.callerStackFrame +
            "\nSQL:\n" +
            this.sqlDesc
        )
      );
      return; // We don't have to continue for more checks.
    }
    this.actualCount = row.getInt64(0);
  }

  handleError(aError) {
    this._reject(
      new Error(
        "SQL error from caller:\n" +
          this.callerStackFrame +
          "\nResult:\n" +
          aError +
          "\nSQL:\n" +
          this.sqlDesc
      )
    );
  }

  handleCompletion() {
    if (this.actualCount != this.expectedCount) {
      this._reject(
        new Error(
          "Actual count of " +
            this.actualCount +
            "does not match expected count of:\n" +
            this.expectedCount +
            "\nFrom caller:" +
            this.callerStackFrame +
            "\nSQL:\n" +
            this.sqlDesc
        )
      );
      return; // We don't have to continue for more checks.
    }
    this._resolve();
  }

  get promise() {
    return this._promise;
  }
}

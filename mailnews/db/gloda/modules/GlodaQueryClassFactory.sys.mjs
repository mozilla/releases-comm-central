/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";

/**
 * @class Query class core; each noun gets its own sub-class where attributes
 *  have helper methods bound.
 *
 * @param aOptions A dictionary of options.  Current legal options are:
 *     - noMagic: Indicates that the noun's dbQueryJoinMagic should be ignored.
 *                Currently, this means that messages will not have their
 *                full-text indexed values re-attached.  This is planned to be
 *                offset by having queries/cache lookups that do not request
 *                noMagic to ensure that their data does get loaded.
 *     - explicitSQL: A hand-rolled alternate representation for the core
 *           SELECT portion of the SQL query.  The queryFromQuery logic still
 *           generates its normal query, we just ignore its result in favor of
 *           your provided value.  This means that the positional parameter
 *           list is still built and you should/must rely on those bound
 *           parameters (using '?').  The replacement occurs prior to the
 *           outerWrapColumns, ORDER BY, and LIMIT contributions to the query.
 *     - outerWrapColumns: If provided, wraps the query in a "SELECT *,blah
 *           FROM (actual query)" where blah is your list of outerWrapColumns
 *           made comma-delimited.  The idea is that this allows you to
 *           reference the result of expressions inside the query using their
 *           names rather than having to duplicate the logic.  In practice,
 *           this makes things more readable but is unlikely to improve
 *           performance.  (Namely, my use of 'offsets' for full-text stuff
 *           ends up in the EXPLAIN plan twice despite this.)
 *     - noDbQueryValidityConstraints: Indicates that any validity constraints
 *           should be ignored. This should be used when you need to get every
 *           match regardless of whether it's valid.
 *
 * @property _owner The query instance that holds the list of unions...
 * @property _constraints A list of (lists of OR constraints) that are ANDed
 *     together.  For example [[FROM bob, FROM jim], [DATE last week]] would
 *     be requesting us to find all the messages from either bob or jim, and
 *     sent in the last week.
 * @property _unions A list of other queries whose results are unioned with our
 *     own.  There is no concept of nesting or sub-queries apart from this
 *     mechanism.
 */
function GlodaQueryClass(aOptions) {
  this.options = aOptions != null ? aOptions : {};

  // if we are an 'or' clause, who is our parent whom other 'or' clauses should
  //  spawn from...
  this._owner = null;
  // our personal chain of and-ing.
  this._constraints = [];
  // the other instances we union with
  this._unions = [];

  this._order = [];
  this._limit = 0;
}

GlodaQueryClass.prototype = {
  WILDCARD: {},

  get constraintCount() {
    return this._constraints.length;
  },

  or() {
    const owner = this._owner || this;
    const orQuery = new this._queryClass();
    orQuery._owner = owner;
    owner._unions.push(orQuery);
    return orQuery;
  },

  orderBy(...aArgs) {
    this._order.push(...aArgs);
    return this;
  },

  limit(aLimit) {
    this._limit = aLimit;
    return this;
  },

  /**
   * Return a collection asynchronously populated by this collection.  You must
   *  provide a listener to receive notifications from the collection as it
   *  receives updates.  The listener object should implement onItemsAdded,
   *  onItemsModified, and onItemsRemoved methods, all of which take a single
   *  argument which is the list of items which have been added, modified, or
   *  removed respectively.
   *
   * @param aListener The collection listener.
   * @param [aData] The data attribute to set on the collection.
   * @param [aArgs.becomeExplicit] Make the collection explicit so that the
   *     collection will only ever contain results found from the database
   *     query and the query will not be updated as new items are indexed that
   *     also match the query.
   * @param [aArgs.becomeNull] Change the collection's query to a null query so
   *     that it will never receive any additional added/modified/removed events
   *     apart from the underlying database query.  This is really only intended
   *     for gloda internal use but may be acceptable for non-gloda use.  Please
   *     ask on mozilla.dev.apps.thunderbird first to make sure there isn't a
   *     better solution for your use-case.  (Note: removals will still happen
   *     when things get fully deleted.)
   */
  getCollection(aListener, aData, aArgs) {
    this.completed = false;
    return this._nounDef.datastore.queryFromQuery(
      this,
      aListener,
      aData,
      /* aExistingCollection */ null,
      /* aMasterCollection */ null,
      aArgs
    );
  },

  /* eslint-disable complexity */
  /**
   * Test whether the given first-class noun instance satisfies this query.
   *
   * @testpoint gloda.query.test
   */
  test(aObj) {
    // when changing this method, be sure that GlodaDatastore's queryFromQuery
    //  method likewise has any required changes made.
    const unionQueries = [this].concat(this._unions);

    for (let iUnion = 0; iUnion < unionQueries.length; iUnion++) {
      const curQuery = unionQueries[iUnion];

      // assume success until a specific (or) constraint proves us wrong
      let querySatisfied = true;
      for (
        let iConstraint = 0;
        iConstraint < curQuery._constraints.length;
        iConstraint++
      ) {
        const constraint = curQuery._constraints[iConstraint];
        const [constraintType, attrDef] = constraint;
        const boundName = attrDef ? attrDef.boundName : "id";
        if (
          boundName in aObj &&
          aObj[boundName] === GlodaConstants.IGNORE_FACET
        ) {
          querySatisfied = false;
          break;
        }

        const constraintValues = constraint.slice(2);

        if (constraintType === GlodaConstants.kConstraintIdIn) {
          if (!constraintValues.includes(aObj.id)) {
            querySatisfied = false;
            break;
          }
        } else if (
          constraintType === GlodaConstants.kConstraintIn ||
          constraintType === GlodaConstants.kConstraintEquals
        ) {
          // @testpoint gloda.query.test.kConstraintIn
          const objectNounDef = attrDef.objectNounDef;

          // if they provide an equals comparator, use that.
          // (note: the next case has better optimization possibilities than
          //  this mechanism, but of course has higher initialization costs or
          //  code complexity costs...)
          if (objectNounDef.equals) {
            let testValues;
            if (!(boundName in aObj)) {
              testValues = [];
            } else if (attrDef.singular) {
              testValues = [aObj[boundName]];
            } else {
              testValues = aObj[boundName];
            }

            // If there are no constraints, then we are just testing for there
            //  being a value.  Succeed (continue) in that case.
            if (
              constraintValues.length == 0 &&
              testValues.length &&
              testValues[0] != null
            ) {
              continue;
            }

            // If there are no test values and the empty set is significant,
            //  then check if any of the constraint values are null (our
            //  empty indicator.)
            if (testValues.length == 0 && attrDef.emptySetIsSignificant) {
              let foundEmptySetSignifier = false;
              for (const constraintValue of constraintValues) {
                if (constraintValue == null) {
                  foundEmptySetSignifier = true;
                  break;
                }
              }
              if (foundEmptySetSignifier) {
                continue;
              }
            }

            let foundMatch = false;
            for (const testValue of testValues) {
              for (const value of constraintValues) {
                if (objectNounDef.equals(testValue, value)) {
                  foundMatch = true;
                  break;
                }
              }
              if (foundMatch) {
                break;
              }
            }
            if (!foundMatch) {
              querySatisfied = false;
              break;
            }
          } else {
            // otherwise, we need to convert everyone to their param/value form
            //  in order to test for equality
            // let's just do the simple, obvious thing for now.  which is
            //  what we did in the prior case but exploding values using
            //  toParamAndValue, and then comparing.
            let testValues;
            if (!(boundName in aObj)) {
              testValues = [];
            } else if (attrDef.singular) {
              testValues = [aObj[boundName]];
            } else {
              testValues = aObj[boundName];
            }

            // If there are no constraints, then we are just testing for there
            //  being a value.  Succeed (continue) in that case.
            if (
              constraintValues.length == 0 &&
              testValues.length &&
              testValues[0] != null
            ) {
              continue;
            }
            // If there are no test values and the empty set is significant,
            //  then check if any of the constraint values are null (our
            //  empty indicator.)
            if (testValues.length == 0 && attrDef.emptySetIsSignificant) {
              let foundEmptySetSignifier = false;
              for (const constraintValue of constraintValues) {
                if (constraintValue == null) {
                  foundEmptySetSignifier = true;
                  break;
                }
              }
              if (foundEmptySetSignifier) {
                continue;
              }
            }

            let foundMatch = false;
            for (const testValue of testValues) {
              const [aParam, aValue] = objectNounDef.toParamAndValue(testValue);
              for (const value of constraintValues) {
                // skip empty set check sentinel values
                if (value == null && attrDef.emptySetIsSignificant) {
                  continue;
                }
                const [bParam, bValue] = objectNounDef.toParamAndValue(value);
                if (aParam == bParam && aValue == bValue) {
                  foundMatch = true;
                  break;
                }
              }
              if (foundMatch) {
                break;
              }
            }
            if (!foundMatch) {
              querySatisfied = false;
              break;
            }
          }
        } else if (constraintType === GlodaConstants.kConstraintRanges) {
          // @testpoint gloda.query.test.kConstraintRanges
          const objectNounDef = attrDef.objectNounDef;

          let testValues;
          if (!(boundName in aObj)) {
            testValues = [];
          } else if (attrDef.singular) {
            testValues = [aObj[boundName]];
          } else {
            testValues = aObj[boundName];
          }

          let foundMatch = false;
          for (const testValue of testValues) {
            const [tParam, tValue] = objectNounDef.toParamAndValue(testValue);
            for (const rangeTuple of constraintValues) {
              const [lowerRValue, upperRValue] = rangeTuple;
              if (lowerRValue == null) {
                const [upperParam, upperValue] =
                  objectNounDef.toParamAndValue(upperRValue);
                if (tParam == upperParam && tValue <= upperValue) {
                  foundMatch = true;
                  break;
                }
              } else if (upperRValue == null) {
                const [lowerParam, lowerValue] =
                  objectNounDef.toParamAndValue(lowerRValue);
                if (tParam == lowerParam && tValue >= lowerValue) {
                  foundMatch = true;
                  break;
                }
              } else {
                // no one is null
                const [upperParam, upperValue] =
                  objectNounDef.toParamAndValue(upperRValue);
                const [lowerParam, lowerValue] =
                  objectNounDef.toParamAndValue(lowerRValue);
                if (
                  tParam == lowerParam &&
                  tValue >= lowerValue &&
                  tParam == upperParam &&
                  tValue <= upperValue
                ) {
                  foundMatch = true;
                  break;
                }
              }
            }
            if (foundMatch) {
              break;
            }
          }
          if (!foundMatch) {
            querySatisfied = false;
            break;
          }
        } else if (constraintType === GlodaConstants.kConstraintStringLike) {
          // @testpoint gloda.query.test.kConstraintStringLike
          let curIndex = 0;
          const value = boundName in aObj ? aObj[boundName] : "";
          // the attribute must be singular, we don't support arrays of strings.
          for (const valuePart of constraintValues) {
            if (typeof valuePart == "string") {
              const index = value.indexOf(valuePart);
              // if curIndex is null, we just need any match
              // if it's not null, it must match the offset of our found match
              if (curIndex === null) {
                if (index == -1) {
                  querySatisfied = false;
                } else {
                  curIndex = index + valuePart.length;
                }
              } else if (index != curIndex) {
                querySatisfied = false;
              } else {
                curIndex = index + valuePart.length;
              }
              if (!querySatisfied) {
                break;
              }
            } else {
              // wild!
              curIndex = null;
            }
          }
          // curIndex must be null or equal to the length of the string
          if (querySatisfied && curIndex !== null && curIndex != value.length) {
            querySatisfied = false;
          }
        } else if (constraintType === GlodaConstants.kConstraintFulltext) {
          // @testpoint gloda.query.test.kConstraintFulltext
          // this is beyond our powers. Even if we have the fulltext content in
          //  memory, which we may not, the tokenization and such to perform
          //  the testing gets very complicated in the face of i18n, etc.
          // so, let's fail if the item is not already in the collection, and
          //  let the testing continue if it is.  (some other constraint may no
          //  longer apply...)
          if (!(aObj.id in this.collection._idMap)) {
            querySatisfied = false;
          }
        }

        if (!querySatisfied) {
          break;
        }
      }

      if (querySatisfied) {
        return true;
      }
    }
    return false;
  },
  /* eslint-enable complexity */

  /**
   * Helper code for noun definitions of queryHelpers that want to build a
   *  traditional in/equals constraint.  The goal is to let them build a range
   *  without having to know how we structure |_constraints|.
   *
   * @protected
   */
  _inConstraintHelper(aAttrDef, aValues) {
    const constraint = [GlodaConstants.kConstraintIn, aAttrDef].concat(aValues);
    this._constraints.push(constraint);
    return this;
  },

  /**
   * Helper code for noun definitions of queryHelpers that want to build a
   *  range.  The goal is to let them build a range without having to know how
   *  we structure |_constraints| or requiring them to mark themselves as
   *  continuous to get a "Range".
   *
   * @protected
   */
  _rangedConstraintHelper(aAttrDef, aRanges) {
    const constraint = [GlodaConstants.kConstraintRanges, aAttrDef].concat(
      aRanges
    );
    this._constraints.push(constraint);
    return this;
  },
};

/**
 * @class A query that never matches anything.
 *
 * Collections corresponding to this query are intentionally frozen in time and
 *  do not want to be notified of any updates.  We need the collection to be
 *  registered with the collection manager so that the noun instances in the
 *  collection are always 'reachable' via the collection for as long as we might
 *  be handing out references to the instances.  (The other way to avoid updates
 *  would be to not register the collection, but then items might not be
 *  reachable.)
 * This is intended to be used in implementation details behind the gloda
 *  abstraction barrier.  For example, the message indexer likes to be able
 *  to represent 'ghost' and deleted messages, but these should never be exposed
 *  to the user.  For code simplicity, it wants to be able to use the query
 *  mechanism.  But it doesn't want updates that are effectively
 *  nonsensical.  For example, a ghost message that is reused by message
 *  indexing may already be present in a collection; when the collection manager
 *  receives an itemsAdded event, a GlodaExplicitQueryClass would result in
 *  an item added notification in that case, which would wildly not be desired.
 */
function GlodaNullQueryClass() {}

GlodaNullQueryClass.prototype = {
  /**
   * No options; they are currently only needed for SQL query generation, which
   *  does not happen for null queries.
   */
  options: {},

  /**
   * Provide a duck-typing way of indicating to GlodaCollectionManager that our
   *  associated collection just doesn't want anything to change.  Our test
   *  function is able to convey most of it, but special-casing has to happen
   *  somewhere, so it happens here.
   */
  frozen: true,

  /**
   * Since our query never matches anything, it doesn't make sense to let
   *  someone attempt to construct a boolean OR involving us.
   *
   * @returns null
   */
  or() {
    return null;
  },

  /**
   * Return nothing (null) because it does not make sense to create a collection
   *  based on a null query.  This method is normally used (on a normal query)
   *  to return a collection populated by the constraints of the query.  We
   *  match nothing, so we should return nothing.  More importantly, you are
   *  currently doing something wrong if you try and do this, so null is
   *  appropriate.  It may turn out that it makes sense for us to return an
   *  empty collection in the future for sentinel value purposes, but we'll
   *  cross that bridge when we come to it.
   *
   * @returns null
   */
  getCollection() {
    return null;
  },

  /**
   * Never matches anything.
   *
   * @param aObj The object someone wants us to test for relevance to our
   *     associated collection.  But we don't care!  Not a fig!
   * @returns false
   */
  test() {
    return false;
  },
};

/**
 * @class A query that only 'tests' for already belonging to the collection.
 *
 * This type of collection is useful for when you (or rather your listener)
 *  are interested in hearing about modifications to your collection or removals
 *  from your collection because of deletion, but do not want to be notified
 *  about newly indexed items matching your normal query constraints.
 *
 * @param aCollection The collection this query belongs to.  This needs to be
 *     passed-in here or the collection should set the attribute directly when
 *     the query is passed in to a collection's constructor.
 */
function GlodaExplicitQueryClass(aCollection) {
  this.collection = aCollection;
}

GlodaExplicitQueryClass.prototype = {
  /**
   * No options; they are currently only needed for SQL query generation, which
   *  does not happen for explicit queries.
   */
  options: {},

  /**
   * Since our query is intended to only match the contents of our collection,
   *  it doesn't make sense to let someone attempt to construct a boolean OR
   *  involving us.
   *
   * @returns null
   */
  or() {
    return null;
  },

  /**
   * Return nothing (null) because it does not make sense to create a collection
   *  based on an explicit query.  This method is normally used (on a normal
   *  query) to return a collection populated by the constraints of the query.
   *  In the case of an explicit query, we expect it will be associated with
   *  either a hand-created collection or the results of a normal query that is
   *  immediately converted into an explicit query.  In all likelihood, calling
   *  this method on an instance of this type is an error, so it is helpful to
   *  return null because people will error hard.
   *
   * @returns null
   */
  getCollection() {
    return null;
  },

  /**
   * Matches only items that are already in the collection associated with this
   *  query (by id).
   *
   * @param aObj The object/item to test for already being in the associated
   *     collection.
   * @returns true when the object is in the associated collection, otherwise
   *     false.
   */
  test(aObj) {
    return aObj.id in this.collection._idMap;
  },
};

/**
 * @class A query that 'tests' true for everything.  Intended for debugging purposes
 *  only.
 */
function GlodaWildcardQueryClass() {}

GlodaWildcardQueryClass.prototype = {
  /**
   * No options; they are currently only needed for SQL query generation.
   */
  options: {},

  // don't let people try and mess with us
  or() {
    return null;
  },
  // don't let people try and query on us (until we have a real use case for
  //  that...)
  getCollection() {
    return null;
  },
  /**
   * Everybody wins!
   */
  test() {
    return true;
  },
};

/**
 * Factory method to effectively create per-noun subclasses of GlodaQueryClass,
 *  GlodaNullQueryClass, GlodaExplicitQueryClass, and GlodaWildcardQueryClass.
 *  For GlodaQueryClass this allows us to add per-noun helpers.  For the others,
 *  this is merely a means of allowing us to attach the (per-noun) nounDef to
 *  the 'class'.
 */
export function GlodaQueryClassFactory(aNounDef) {
  const newQueryClass = function (aOptions) {
    GlodaQueryClass.call(this, aOptions);
  };
  newQueryClass.prototype = new GlodaQueryClass();
  newQueryClass.prototype._queryClass = newQueryClass;
  newQueryClass.prototype._nounDef = aNounDef;

  const newNullClass = function (aCollection) {
    GlodaNullQueryClass.call(this);
    this.collection = aCollection;
  };
  newNullClass.prototype = new GlodaNullQueryClass();
  newNullClass.prototype._queryClass = newNullClass;
  newNullClass.prototype._nounDef = aNounDef;

  const newExplicitClass = function (aCollection) {
    GlodaExplicitQueryClass.call(this);
    this.collection = aCollection;
  };
  newExplicitClass.prototype = new GlodaExplicitQueryClass();
  newExplicitClass.prototype._queryClass = newExplicitClass;
  newExplicitClass.prototype._nounDef = aNounDef;

  const newWildcardClass = function (aCollection) {
    GlodaWildcardQueryClass.call(this);
    this.collection = aCollection;
  };
  newWildcardClass.prototype = new GlodaWildcardQueryClass();
  newWildcardClass.prototype._queryClass = newWildcardClass;
  newWildcardClass.prototype._nounDef = aNounDef;

  return [newQueryClass, newNullClass, newExplicitClass, newWildcardClass];
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides faceting logic.
 */

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
});

/**
 * Decides the appropriate faceters for the noun type and drives the faceting
 *  process.  This class and the faceters are intended to be reusable so that
 *  you only need one instance per faceting session.  (Although each faceting
 *  pass is accordingly destructive to previous results.)
 *
 * Our strategy for faceting is to process one attribute at a time across all
 *  the items in the provided set.  The alternative would be to iterate over
 *  the items and then iterate over the attributes on each item.  While both
 *  approaches have caching downsides
 */
export function FacetDriver(aNounDef, aWindow) {
  this.nounDef = aNounDef;
  this._window = aWindow;

  this._makeFaceters();
}

FacetDriver.prototype = {
  /**
   * Populate |this.faceters| with a set of faceters appropriate to the noun
   *  definition associated with this instance.
   */
  _makeFaceters() {
    const faceters = (this.faceters = []);

    function makeFaceter(aAttrDef, aFacetDef) {
      const facetType = aFacetDef.type;

      if (aAttrDef.singular) {
        if (facetType == "date") {
          faceters.push(new DateFaceter(aAttrDef, aFacetDef));
        } else {
          faceters.push(new DiscreteFaceter(aAttrDef, aFacetDef));
        }
      } else if (facetType == "nonempty?") {
        faceters.push(new NonEmptySetFaceter(aAttrDef, aFacetDef));
      } else {
        faceters.push(new DiscreteSetFaceter(aAttrDef, aFacetDef));
      }
    }

    for (const key in this.nounDef.attribsByBoundName) {
      const attrDef = this.nounDef.attribsByBoundName[key];
      // ignore attributes that do not want to be faceted
      if (!attrDef.facet) {
        continue;
      }

      makeFaceter(attrDef, attrDef.facet);

      if ("extraFacets" in attrDef) {
        for (const facetDef of attrDef.extraFacets) {
          makeFaceter(attrDef, facetDef);
        }
      }
    }
  },
  /**
   * Asynchronously facet the provided items, calling the provided callback when
   *  completed.
   */
  go(aItems, aCallback, aCallbackThis) {
    this.items = aItems;
    this.callback = aCallback;
    this.callbackThis = aCallbackThis;

    this._nextFaceter = 0;
    this._drive();
  },

  _MAX_FACETING_TIMESLICE_MS: 100,
  _FACETING_YIELD_DURATION_MS: 0,
  _driveWrapper(aThis) {
    aThis._drive();
  },
  _drive() {
    const start = Date.now();

    while (this._nextFaceter < this.faceters.length) {
      const faceter = this.faceters[this._nextFaceter++];
      // for now we facet in one go, but the long-term plan allows for them to
      //  be generators.
      faceter.facetItems(this.items);

      const delta = Date.now() - start;
      if (delta > this._MAX_FACETING_TIMESLICE_MS) {
        this._window.setTimeout(
          this._driveWrapper,
          this._FACETING_YIELD_DURATION_MS,
          this
        );
        return;
      }
    }

    // we only get here once we are done with the faceters
    this.callback.call(this.callbackThis);
  },
};

export var FacetUtils = {
  _groupSizeComparator(a, b) {
    return b[1].length - a[1].length;
  },

  /**
   * Given a list where each entry is a tuple of [group object, list of items
   *  belonging to that group], produce a new list of the top grouped items.  We
   *  used to also produce an "other" aggregation, but that turned out to be
   *  conceptually difficult to deal with, so that's gone, leaving this method
   *  with much less to do.
   *
   * @param {object} aAttrDef - The attribute for the facet we are working with.
   * @param {object} aGroups - The list of groups built for the facet.
   * @param {integer} aMaxCount - The number of result rows you want back.
   */
  makeTopGroups(aAttrDef, aGroups, aMaxCount) {
    const nounDef = aAttrDef.objectNounDef;
    const realGroupsToUse = aMaxCount;

    const orderedBySize = aGroups.concat();
    orderedBySize.sort(this._groupSizeComparator);

    // - get the real groups to use and order them by the attribute comparator
    const outGroups = orderedBySize.slice(0, realGroupsToUse);
    const comparator = nounDef.comparator;
    function comparatorHelper(a, b) {
      return comparator(a[0], b[0]);
    }
    outGroups.sort(comparatorHelper);

    return outGroups;
  },
};

/**
 * Facet discrete things like message authors, boolean values, etc.  Only
 *  appropriate for use on singular values.  Use |DiscreteSetFaceter| for
 *  non-singular values.
 */
function DiscreteFaceter(aAttrDef, aFacetDef) {
  this.attrDef = aAttrDef;
  this.facetDef = aFacetDef;
}
DiscreteFaceter.prototype = {
  type: "discrete",
  /**
   * Facet the given set of items, deferring to the appropriate helper method
   */
  facetItems(aItems) {
    if (this.attrDef.objectNounDef.isPrimitive) {
      return this.facetPrimitiveItems(aItems);
    }
    return this.facetComplexItems(aItems);
  },
  /**
   * Facet an attribute whose value is primitive, meaning that it is a raw
   *  numeric value or string, rather than a complex object.
   */
  facetPrimitiveItems(aItems) {
    const attrKey = this.attrDef.boundName;
    const filter = this.facetDef.filter;

    const valStrToVal = {};
    const groups = (this.groups = {});
    this.groupCount = 0;

    for (const item of aItems) {
      const val = attrKey in item ? item[attrKey] : null;
      if (val === GlodaConstants.IGNORE_FACET) {
        continue;
      }

      // skip items the filter tells us to ignore
      if (filter && !filter(val)) {
        continue;
      }

      // We need to use hasOwnProperty because we cannot guarantee that the
      //  contents of val won't collide with the attributes in Object.prototype.
      if (groups.hasOwnProperty(val)) {
        groups[val].push(item);
      } else {
        groups[val] = [item];
        valStrToVal[val] = val;
        this.groupCount++;
      }
    }

    const orderedGroups = Object.keys(groups).map(key => [
      valStrToVal[key],
      groups[key],
    ]);
    const comparator = this.facetDef.groupComparator;
    function comparatorHelper(a, b) {
      return comparator(a[0], b[0]);
    }
    orderedGroups.sort(comparatorHelper);
    this.orderedGroups = orderedGroups;
  },
  /**
   * Facet an attribute whose value is a complex object that can be identified
   *  by its 'id' attribute.  This is the case where the value is itself a noun
   *  instance.
   */
  facetComplexItems(aItems) {
    const attrKey = this.attrDef.boundName;
    const filter = this.facetDef.filter;
    const idAttr = this.facetDef.groupIdAttr;

    const groups = (this.groups = {});
    const groupMap = (this.groupMap = {});
    this.groupCount = 0;

    for (const item of aItems) {
      const val = attrKey in item ? item[attrKey] : null;
      if (val === GlodaConstants.IGNORE_FACET) {
        continue;
      }

      // skip items the filter tells us to ignore
      if (filter && !filter(val)) {
        continue;
      }

      const valId = val == null ? null : val[idAttr];
      // We need to use hasOwnProperty because tag nouns are complex objects
      //  with id's that are non-numeric and so can collide with the contents
      //  of Object.prototype.  (Note: the "tags" attribute is actually handled
      //  by the DiscreteSetFaceter.)
      if (groupMap.hasOwnProperty(valId)) {
        groups[valId].push(item);
      } else {
        groupMap[valId] = val;
        groups[valId] = [item];
        this.groupCount++;
      }
    }

    const orderedGroups = Object.keys(groups).map(key => [
      groupMap[key],
      groups[key],
    ]);
    const comparator = this.facetDef.groupComparator;
    function comparatorHelper(a, b) {
      return comparator(a[0], b[0]);
    }
    orderedGroups.sort(comparatorHelper);
    this.orderedGroups = orderedGroups;
  },
};

/**
 * Facet sets of discrete items.  For example, tags applied to messages.
 *
 * The main differences between us and |DiscreteFaceter| are:
 * - The empty set is notable.
 * - Specific set configurations could be interesting, but are not low-hanging
 *    fruit.
 */
function DiscreteSetFaceter(aAttrDef, aFacetDef) {
  this.attrDef = aAttrDef;
  this.facetDef = aFacetDef;
}
DiscreteSetFaceter.prototype = {
  type: "discrete",
  /**
   * Facet the given set of items, deferring to the appropriate helper method
   */
  facetItems(aItems) {
    if (this.attrDef.objectNounDef.isPrimitive) {
      return this.facetPrimitiveItems(aItems);
    }
    return this.facetComplexItems(aItems);
  },
  /**
   * Facet an attribute whose value is primitive, meaning that it is a raw
   *  numeric value or string, rather than a complex object.
   */
  facetPrimitiveItems(aItems) {
    const attrKey = this.attrDef.boundName;
    const filter = this.facetDef.filter;

    const groups = (this.groups = {});
    const valStrToVal = {};
    this.groupCount = 0;

    for (const item of aItems) {
      let vals = attrKey in item ? item[attrKey] : null;
      if (vals === GlodaConstants.IGNORE_FACET) {
        continue;
      }

      if (vals == null || vals.length == 0) {
        vals = [null];
      }
      for (const val of vals) {
        // skip items the filter tells us to ignore
        if (filter && !filter(val)) {
          continue;
        }

        // We need to use hasOwnProperty because we cannot guarantee that the
        //  contents of val won't collide with the attributes in
        //  Object.prototype.
        if (groups.hasOwnProperty(val)) {
          groups[val].push(item);
        } else {
          groups[val] = [item];
          valStrToVal[val] = val;
          this.groupCount++;
        }
      }
    }

    const orderedGroups = Object.keys(groups).map(key => [
      valStrToVal[key],
      groups[key],
    ]);
    const comparator = this.facetDef.groupComparator;
    function comparatorHelper(a, b) {
      return comparator(a[0], b[0]);
    }
    orderedGroups.sort(comparatorHelper);
    this.orderedGroups = orderedGroups;
  },
  /**
   * Facet an attribute whose value is a complex object that can be identified
   *  by its 'id' attribute.  This is the case where the value is itself a noun
   *  instance.
   */
  facetComplexItems(aItems) {
    const attrKey = this.attrDef.boundName;
    const filter = this.facetDef.filter;
    const idAttr = this.facetDef.groupIdAttr;

    const groups = (this.groups = {});
    const groupMap = (this.groupMap = {});
    this.groupCount = 0;

    for (const item of aItems) {
      let vals = attrKey in item ? item[attrKey] : null;
      if (vals === GlodaConstants.IGNORE_FACET) {
        continue;
      }

      if (vals == null || vals.length == 0) {
        vals = [null];
      }
      for (const val of vals) {
        // skip items the filter tells us to ignore
        if (filter && !filter(val)) {
          continue;
        }

        const valId = val == null ? null : val[idAttr];
        // We need to use hasOwnProperty because tag nouns are complex objects
        //  with id's that are non-numeric and so can collide with the contents
        //  of Object.prototype.
        if (groupMap.hasOwnProperty(valId)) {
          groups[valId].push(item);
        } else {
          groupMap[valId] = val;
          groups[valId] = [item];
          this.groupCount++;
        }
      }
    }

    const orderedGroups = Object.keys(groups).map(key => [
      groupMap[key],
      groups[key],
    ]);
    const comparator = this.facetDef.groupComparator;
    function comparatorHelper(a, b) {
      return comparator(a[0], b[0]);
    }
    orderedGroups.sort(comparatorHelper);
    this.orderedGroups = orderedGroups;
  },
};

/**
 * Given a non-singular attribute, facet it as if it were a boolean based on
 *  whether there is anything in the list (set).
 */
function NonEmptySetFaceter(aAttrDef, aFacetDef) {
  this.attrDef = aAttrDef;
  this.facetDef = aFacetDef;
}
NonEmptySetFaceter.prototype = {
  type: "boolean",
  /**
   * Facet the given set of items, deferring to the appropriate helper method
   */
  facetItems(aItems) {
    const attrKey = this.attrDef.boundName;

    const trueValues = [];
    const falseValues = [];

    this.groupCount = 0;

    for (const item of aItems) {
      const vals = attrKey in item ? item[attrKey] : null;
      if (vals == null || vals.length == 0) {
        falseValues.push(item);
      } else {
        trueValues.push(item);
      }
    }

    this.orderedGroups = [];
    if (trueValues.length) {
      this.orderedGroups.push([true, trueValues]);
    }
    if (falseValues.length) {
      this.orderedGroups.push([false, falseValues]);
    }
    this.groupCount = this.orderedGroups.length;
  },
  makeQuery(aGroupValues, aInclusive) {
    const query = (this.query = lazy.Gloda.newQuery(
      GlodaConstants.NOUN_MESSAGE
    ));

    const constraintFunc = query[this.attrDef.boundName];
    constraintFunc.call(query);

    // Our query is always for non-empty lists (at this time), so we want to
    //  invert if they're excluding 'true' or including 'false', which means !=.
    const invert = aGroupValues[0] != aInclusive;

    return [query, invert];
  },
};

/**
 * Facet dates.  We build a hierarchical nested structure of year, month, and
 *  day nesting levels.  This decision was made speculatively in the hopes that
 *  it would allow us to do clustered analysis and that there might be a benefit
 *  for that.  For example, if you search for "Christmas", we might notice
 *  clusters of messages around December of each year.  We could then present
 *  these in a list as likely candidates, rather than a graphical timeline.
 *  Alternately, it could be used to inform a non-linear visualization.  As it
 *  stands (as of this writing), it's just a complicating factor.
 */
function DateFaceter(aAttrDef, aFacetDef) {
  this.attrDef = aAttrDef;
  this.facetDef = aFacetDef;
}
DateFaceter.prototype = {
  type: "date",
  /**
   *
   */
  facetItems(aItems) {
    const attrKey = this.attrDef.boundName;

    const years = (this.years = { _subCount: 0 });
    // generally track the time range
    let oldest = null,
      newest = null;

    this.validItems = [];

    // just cheat and put us at the front...
    this.groupCount = aItems.length ? 1000 : 0;
    this.orderedGroups = null;

    /** The number of items with a null/missing attribute. */
    this.missing = 0;

    /**
     * The number of items with a date that is unreasonably far in the past or
     *  in the future.  Old-wise, we are concerned about incorrectly formatted
     *  messages (spam) that end up placed around the UNIX epoch.  New-wise,
     *  we are concerned about messages that can't be explained by users who
     *  don't know how to set their clocks (both the current user and people
     *  sending them mail), mainly meaning spam.
     * We want to avoid having our clever time-scale logic being made useless by
     *  these unreasonable messages.
     */
    this.unreasonable = 0;
    // feb 1, 1970
    const tooOld = new Date(1970, 1, 1);
    // 3 days from now
    const tooNew = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    for (const item of aItems) {
      const val = attrKey in item ? item[attrKey] : null;
      // -- missing
      if (val == null) {
        this.missing++;
        continue;
      }

      // -- unreasonable
      if (val < tooOld || val > tooNew) {
        this.unreasonable++;
        continue;
      }

      this.validItems.push(item);

      // -- time range
      if (oldest == null) {
        oldest = newest = val;
      } else if (val < oldest) {
        oldest = val;
      } else if (val > newest) {
        newest = val;
      }

      // -- bucket
      // - year
      let year;
      const valYear = val.getYear();
      if (valYear in years) {
        year = years[valYear];
        year._dateCount++;
      } else {
        year = years[valYear] = {
          _dateCount: 1,
          _subCount: 0,
        };
        years._subCount++;
      }

      // - month
      let month;
      const valMonth = val.getMonth();
      if (valMonth in year) {
        month = year[valMonth];
        month._dateCount++;
      } else {
        month = year[valMonth] = {
          _dateCount: 1,
          _subCount: 0,
        };
        year._subCount++;
      }

      // - day
      const valDate = val.getDate();
      if (valDate in month) {
        month[valDate].push(item);
      } else {
        month[valDate] = [item];
      }
    }

    this.oldest = oldest;
    this.newest = newest;
  },

  _unionMonth(aMonthObj) {
    const dayItemLists = [];
    for (const key in aMonthObj) {
      const dayItemList = aMonthObj[key];
      if (typeof key == "string" && key.startsWith("_")) {
        continue;
      }
      dayItemLists.push(dayItemList);
    }
    return dayItemLists;
  },

  _unionYear(aYearObj) {
    const monthItemLists = [];
    for (const key in aYearObj) {
      const monthObj = aYearObj[key];
      if (typeof key == "string" && key.startsWith("_")) {
        continue;
      }
      monthItemLists.push(this._unionMonth(monthObj));
    }
    return monthItemLists;
  },
};

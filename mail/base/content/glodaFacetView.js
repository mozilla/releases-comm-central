/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides the global context for the faceting environment.  In the
 *  Model View Controller (paradigm), we are the view and the XBL widgets are
 *  the the view and controller.
 *
 * Because much of the work related to faceting is not UI-specific, we try and
 *  push as much of it into mailnews/db/gloda/Facet.sys.mjs.  In some cases we may
 *  get it wrong and it may eventually want to migrate.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { TagUtils } = ChromeUtils.importESModule(
  "resource:///modules/TagUtils.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaPublic.sys.mjs"
);
var { GlodaConstants } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaConstants.sys.mjs"
);
var { GlodaSyntheticView } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaSyntheticView.sys.mjs"
);
var { FacetDriver, FacetUtils } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Facet.sys.mjs"
);

var glodaFacetStrings = Services.strings.createBundle(
  "chrome://messenger/locale/glodaFacetView.properties"
);

/**
 * Object containing query-explanantion binding methods.
 */
const QueryExplanation = {
  get node() {
    return document.getElementById("query-explanation");
  },
  /**
   * Indicate that we are based on a fulltext search
   */
  setFulltext(aMsgSearcher) {
    while (this.node.hasChildNodes()) {
      this.node.lastChild.remove();
    }

    const spanify = (text, classNames) => {
      const span = document.createElement("span");
      span.setAttribute("class", classNames);
      span.textContent = text;
      this.node.appendChild(span);
      return span;
    };

    const searchLabel = glodaFacetStrings.GetStringFromName(
      "glodaFacetView.search.label2"
    );
    spanify(searchLabel, "explanation-fulltext-label");

    const criteriaText = glodaFacetStrings.GetStringFromName(
      "glodaFacetView.constraints.query.fulltext." +
        (aMsgSearcher.andTerms ? "and" : "or") +
        "JoinWord"
    );
    for (const [iTerm, term] of aMsgSearcher.fulltextTerms.entries()) {
      if (iTerm) {
        spanify(criteriaText, "explanation-fulltext-criteria");
      }
      spanify(term, "explanation-fulltext-term");
    }
  },
  setQuery(msgQuery) {
    try {
      while (this.node.hasChildNodes()) {
        this.node.lastChild.remove();
      }

      const spanify = (text, classNames) => {
        const span = document.createElement("span");
        span.setAttribute("class", classNames);
        span.textContent = text;
        this.node.appendChild(span);
        return span;
      };

      let label = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.search.label2"
      );
      spanify(label, "explanation-query-label");

      const constraintStrings = [];
      for (const constraint of msgQuery._constraints) {
        if (constraint[0] != 1) {
          // No idea what this is about.
          return;
        }
        if (constraint[1].attributeName == "involves") {
          let involvesLabel = glodaFacetStrings.GetStringFromName(
            "glodaFacetView.constraints.query.involves.label"
          );
          involvesLabel = involvesLabel.replace("#1", constraint[2].value);
          spanify(involvesLabel, "explanation-query-involves");
        } else if (constraint[1].attributeName == "tag") {
          const tagLabel = glodaFacetStrings.GetStringFromName(
            "glodaFacetView.constraints.query.tagged.label"
          );
          const tag = constraint[2];
          const tagNode = document.createElement("span");
          const color = MailServices.tags.getColorForKey(tag.key);
          tagNode.setAttribute("class", "message-tag");
          if (color) {
            const textColor = !TagUtils.isColorContrastEnough(color)
              ? "white"
              : "black";
            tagNode.setAttribute(
              "style",
              "color: " + textColor + "; background-color: " + color + ";"
            );
          }
          tagNode.textContent = tag.tag;
          spanify(tagLabel, "explanation-query-tagged");
          this.node.appendChild(tagNode);
        }
      }
      label = label + constraintStrings.join(", "); // XXX l10n?
    } catch (e) {
      console.error(e);
    }
  },
};

/**
 * Object containing facets binding methods.
 */
const UIFacets = {
  get node() {
    return document.getElementById("facets");
  },
  clearFacets() {
    while (this.node.hasChildNodes()) {
      this.node.lastChild.remove();
    }
  },
  addFacet(type, attrDef, args) {
    let facet;

    if (type === "boolean") {
      facet = document.createElement("facet-boolean");
    } else if (type === "boolean-filtered") {
      facet = document.createElement("facet-boolean-filtered");
    } else if (type === "discrete") {
      facet = document.createElement("facet-discrete");
    } else {
      facet = document.createElement("div");
      facet.setAttribute("class", "facetious");
    }

    facet.attrDef = attrDef;
    facet.nounDef = attrDef.objectNounDef;
    facet.setAttribute("type", type);

    for (const key in args) {
      facet[key] = args[key];
    }

    facet.setAttribute("name", attrDef.attributeName);
    this.node.appendChild(facet);

    return facet;
  },
};

/**
 * Represents the active constraints on a singular facet.  Singular facets can
 *  only have an inclusive set or an exclusive set, but not both.  Non-singular
 *  facets can have both.  Because they are different worlds, non-singular gets
 *  its own class, |ActiveNonSingularConstraint|.
 */
function ActiveSingularConstraint(aFaceter, aRanged) {
  this.faceter = aFaceter;
  this.attrDef = aFaceter.attrDef;
  this.facetDef = aFaceter.facetDef;
  this.ranged = Boolean(aRanged);
  this.clear();
}
ActiveSingularConstraint.prototype = {
  _makeQuery() {
    // have the faceter make the query and the invert decision for us if it
    //  implements the makeQuery method.
    if ("makeQuery" in this.faceter) {
      [this.query, this.invertQuery] = this.faceter.makeQuery(
        this.groupValues,
        this.inclusive
      );
      return;
    }

    const query = (this.query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE));
    let constraintFunc;
    // If the facet definition references a queryHelper defined by the noun
    //  type, use that instead of the standard constraint function.
    if ("queryHelper" in this.facetDef) {
      constraintFunc =
        query[this.attrDef.boundName + this.facetDef.queryHelper];
    } else {
      constraintFunc =
        query[
          this.ranged
            ? this.attrDef.boundName + "Range"
            : this.attrDef.boundName
        ];
    }
    constraintFunc.apply(query, this.groupValues);

    this.invertQuery = !this.inclusive;
  },
  /**
   * Adjust the constraint given the incoming faceting constraint desired.
   *  Mainly, if the inclusive flag is the same as what we already have, we
   *  just append the new values to the existing set of values.  If it is not
   *  the same, we replace them.
   *
   * @returns {boolean} true if the caller needs to revalidate their understanding of the
   *     constraint because we have flipped whether we are inclusive or
   *     exclusive and have thrown away some constraints as a result.
   */
  constrain(aInclusive, aGroupValues) {
    if (aInclusive == this.inclusive) {
      this.groupValues = this.groupValues.concat(aGroupValues);
      this._makeQuery();
      return false;
    }

    const needToRevalidate = this.inclusive != null;
    this.inclusive = aInclusive;
    this.groupValues = aGroupValues;
    this._makeQuery();

    return needToRevalidate;
  },
  /**
   * Relax something we previously constrained.  Remove it, some might say.  It
   *  is possible after relaxing that we will no longer be an active constraint.
   *
   * @returns {boolean} true if we are no longer constrained at all.
   */
  relax(aInclusive, aGroupValues) {
    if (aInclusive != this.inclusive) {
      throw new Error("You can't relax a constraint that isn't possible.");
    }

    for (const groupValue of aGroupValues) {
      const index = this.groupValues.indexOf(groupValue);
      if (index == -1) {
        throw new Error("Tried to relax a constraint that was not in force.");
      }
      this.groupValues.splice(index, 1);
    }
    if (this.groupValues.length == 0) {
      this.clear();
      return true;
    }
    this._makeQuery();

    return false;
  },
  /**
   * Indicate whether this constraint is actually doing anything anymore.
   */
  get isConstrained() {
    return this.inclusive != null;
  },
  /**
   * Clear the constraint so that the next call to adjust initializes it.
   */
  clear() {
    this.inclusive = null;
    this.groupValues = null;
    this.query = null;
    this.invertQuery = null;
  },
  /**
   * Filter the items against our constraint.
   */
  sieve(aItems) {
    const query = this.query;
    const expectedResult = !this.invertQuery;
    return aItems.filter(item => query.test(item) == expectedResult);
  },
  isIncludedGroup(aGroupValue) {
    if (!this.inclusive) {
      return false;
    }
    return this.groupValues.includes(aGroupValue);
  },
  isExcludedGroup(aGroupValue) {
    if (this.inclusive) {
      return false;
    }
    return this.groupValues.includes(aGroupValue);
  },
};

function ActiveNonSingularConstraint(aFaceter, aRanged) {
  this.faceter = aFaceter;
  this.attrDef = aFaceter.attrDef;
  this.facetDef = aFaceter.facetDef;
  this.ranged = Boolean(aRanged);

  this.clear();
}
ActiveNonSingularConstraint.prototype = {
  _makeQuery(aInclusive, aGroupValues) {
    // have the faceter make the query and the invert decision for us if it
    //  implements the makeQuery method.
    if ("makeQuery" in this.faceter) {
      // returns [query, invertQuery] directly
      return this.faceter.makeQuery(aGroupValues, aInclusive);
    }

    const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
    let constraintFunc;
    // If the facet definition references a queryHelper defined by the noun
    //  type, use that instead of the standard constraint function.
    if ("queryHelper" in this.facetDef) {
      constraintFunc =
        query[this.attrDef.boundName + this.facetDef.queryHelper];
    } else {
      constraintFunc =
        query[
          this.ranged
            ? this.attrDef.boundName + "Range"
            : this.attrDef.boundName
        ];
    }
    constraintFunc.apply(query, aGroupValues);

    return [query, false];
  },

  /**
   * Adjust the constraint given the incoming faceting constraint desired.
   *  Mainly, if the inclusive flag is the same as what we already have, we
   *  just append the new values to the existing set of values.  If it is not
   *  the same, we replace them.
   */
  constrain(aInclusive, aGroupValues) {
    const groupIdAttr = this.attrDef.objectNounDef.isPrimitive
      ? null
      : this.facetDef.groupIdAttr;
    const idMap = aInclusive ? this.includedGroupIds : this.excludedGroupIds;
    const valList = aInclusive
      ? this.includedGroupValues
      : this.excludedGroupValues;
    for (const groupValue of aGroupValues) {
      const valId =
        groupIdAttr !== null && groupValue != null
          ? groupValue[groupIdAttr]
          : groupValue;
      idMap[valId] = true;
      valList.push(groupValue);
    }

    const [query, invertQuery] = this._makeQuery(aInclusive, valList);
    if (aInclusive && !invertQuery) {
      this.includeQuery = query;
    } else {
      this.excludeQuery = query;
    }

    return false;
  },
  /**
   * Relax something we previously constrained.  Remove it, some might say.  It
   *  is possible after relaxing that we will no longer be an active constraint.
   *
   * @returns {boolean} true if we are no longer constrained at all.
   */
  relax(aInclusive, aGroupValues) {
    const groupIdAttr = this.attrDef.objectNounDef.isPrimitive
      ? null
      : this.facetDef.groupIdAttr;
    const idMap = aInclusive ? this.includedGroupIds : this.excludedGroupIds;
    const valList = aInclusive
      ? this.includedGroupValues
      : this.excludedGroupValues;
    for (const groupValue of aGroupValues) {
      const valId =
        groupIdAttr !== null && groupValue != null
          ? groupValue[groupIdAttr]
          : groupValue;
      if (!(valId in idMap)) {
        throw new Error("Tried to relax a constraint that was not in force.");
      }
      delete idMap[valId];

      const index = valList.indexOf(groupValue);
      valList.splice(index, 1);
    }

    if (valList.length == 0) {
      if (aInclusive) {
        this.includeQuery = null;
      } else {
        this.excludeQuery = null;
      }
    } else {
      const [query, invertQuery] = this._makeQuery(aInclusive, valList);
      if (aInclusive && !invertQuery) {
        this.includeQuery = query;
      } else {
        this.excludeQuery = query;
      }
    }

    return this.includeQuery == null && this.excludeQuery == null;
  },
  /**
   * Indicate whether this constraint is actually doing anything anymore.
   */
  get isConstrained() {
    return this.includeQuery == null && this.excludeQuery == null;
  },
  /**
   * Clear the constraint so that the next call to adjust initializes it.
   */
  clear() {
    this.includeQuery = null;
    this.includedGroupIds = {};
    this.includedGroupValues = [];

    this.excludeQuery = null;
    this.excludedGroupIds = {};
    this.excludedGroupValues = [];
  },
  /**
   * Filter the items against our constraint.
   */
  sieve(aItems) {
    const includeQuery = this.includeQuery;
    const excludeQuery = this.excludeQuery;
    return aItems.filter(
      item =>
        (!includeQuery || includeQuery.test(item)) &&
        (!excludeQuery || !excludeQuery.test(item))
    );
  },
  isIncludedGroup(aGroupValue) {
    const valId = aGroupValue[this.facetDef.groupIdAttr];
    return valId in this.includedGroupIds;
  },
  isExcludedGroup(aGroupValue) {
    const valId = aGroupValue[this.facetDef.groupIdAttr];
    return valId in this.excludedGroupIds;
  },
};

var FacetContext = {
  facetDriver: new FacetDriver(Gloda.lookupNounDef("message"), window),
  _sortContactsBy: "frequency",

  updateSortMode(mode) {
    FacetContext._sortContactsBy = mode;
    console.log("Sort mode selected:", mode);

    const involvesFacet = FacetContext.faceters.find(
      f => f.attrDef.attributeName === "involves"
    );
    if (!involvesFacet || !involvesFacet.xblNode) {
      console.error("People facet or its binding (xblNode) not found.");
      return;
    }

    const groups = involvesFacet.xblNode.orderedGroups;

    const getName = g =>
      g.value?._contact?._name || g.value?._name || g.label || "";
    const getCount = g =>
      typeof g.groupCount === "number" ? g.groupCount : 0;

    console.log("Before sort:", groups.map(g => ({
      name: getName(g),
      count: getCount(g),
    })));

    if (mode === "alphabetical") {
      groups.sort((a, b) => getName(a).localeCompare(getName(b)));
    } else {
      groups.sort((a, b) => getCount(b) - getCount(a));
    }

    console.log("After sort:", groups.map(g => ({
      name: getName(g),
      count: getCount(g),
    })));

    involvesFacet.xblNode.orderedGroups = groups;
    involvesFacet.xblNode.build(false);
  },

  _collection: null,
  set collection(aCollection) {
    this._collection = aCollection;
  },
  get collection() {
    return this._collection;
  },

  _sortBy: null,
  get sortBy() {
    return this._sortBy;
  },
  set sortBy(val) {
    try {
      if (val == this._sortBy) {
        return;
      }
      this._sortBy = val;
      this.build(this._sieveAll());
    } catch (e) {
      console.error(e);
    }
  },
  /**
   * List of the current working set
   */
  _activeSet: null,
  get activeSet() {
    return this._activeSet;
  },

  /**
   * fullSet is a special attribute which is passed a set of items that we're
   * displaying, but the order of which is determined by the sortBy property.
   * On setting the fullSet, we compute both sorted lists, and then on getting,
   * we return the appropriate one.
   */
  get fullSet() {
    return this._sortBy == "-dascore"
      ? this._relevantSortedItems
      : this._dateSortedItems;
  },

  set fullSet(items) {
    let scores;
    if (this.searcher && this.searcher.scores) {
      scores = this.searcher.scores;
    } else {
      scores = Gloda.scoreNounItems(items);
    }
    const scoredItems = items.map(function (item, index) {
      return [scores[index], item];
    });
    scoredItems.sort((a, b) => b[0] - a[0]);
    this._relevantSortedItems = scoredItems.map(scoredItem => scoredItem[1]);

    this._dateSortedItems = this._relevantSortedItems
      .concat()
      .sort((a, b) => b.date - a.date);
  },

  initialBuild() {
    if (this.searcher) {
      QueryExplanation.setFulltext(this.searcher);
    } else {
      QueryExplanation.setQuery(this.collection.query);
    }
    // we like to sort them so should clone the list
    this.faceters = this.facetDriver.faceters.concat();

    this._timelineShown = !Services.prefs.getBoolPref(
      "gloda.facetview.hidetimeline"
    );

    this.everFaceted = false;
    this._activeConstraints = {};
    if (this.searcher) {
      const sortByPref = Services.prefs.getIntPref("gloda.facetview.sortby");
      this._sortBy = sortByPref == 0 || sortByPref == 2 ? "-dascore" : "-date";
    } else {
      this._sortBy = "-date";
    }
    this.fullSet = this._removeDupes(this._collection.items.concat());
    if ("IMCollection" in this) {
      this.fullSet = this.fullSet.concat(this.IMCollection.items);
    }
    this.build(this.fullSet);
  },

  /**
   * Remove duplicate messages from search results.
   *
   * @param {GlodaMessage[]} aItems - The initial set of messages to deduplicate
   * @returns {GlodaMessage[]} the subset of those, with duplicates removed.
   *
   * Some IMAP servers (here's looking at you, Gmail) will create message
   * duplicates unbeknownst to the user.  We'd like to deal with them earlier
   * in the pipeline, but that's a bit hard right now.  So as a workaround
   * we'd rather not show them in the Search Results UI.  The simplest way
   * of doing that is just to cull (from the display) messages with have the
   * Message-ID of a message already displayed.
   */
  _removeDupes(aItems) {
    const deduped = [];
    const msgIdsSeen = {};
    for (const item of aItems) {
      if (item.headerMessageID in msgIdsSeen) {
        continue;
      }
      deduped.push(item);
      msgIdsSeen[item.headerMessageID] = true;
    }
    return deduped;
  },

  /**
   * Kick-off a new faceting pass.
   *
   * @param {GlodaMessage[]} aNewSet - The set of items to facet.
   * @param {Function} aCallback - The callback to invoke when faceting is completed.
   */
  build(aNewSet, aCallback) {
    this._activeSet = aNewSet;
    this._callbackOnFacetComplete = aCallback;
    this.facetDriver.go(this._activeSet, this.facetingCompleted, this);
  },

  /**
   * Attempt to figure out a reasonable number of rows to limit each facet to
   *  display.  While the number will ordinarily be dominated by the maximum
   *  number of rows we believe the user can easily scan, this may also be
   *  impacted by layout concerns (since we want to avoid scrolling).
   */
  planLayout() {
    // XXX arbitrary!
    this.maxDisplayRows = 8;
    this.maxMessagesToShow = 10;
  },

  /**
   * Clean up the UI in preparation for a new query to come in.
   */
  _resetUI() {
    for (const faceter of this.faceters) {
      if (faceter.xblNode && !faceter.xblNode.explicit) {
        faceter.xblNode.remove();
      }
      faceter.xblNode = null;
      faceter.constraint = null;
    }
  },

  _groupCountComparator(a, b) {
    return b.groupCount - a.groupCount;
  },
  /**
   * Tells the UI about all the facets when notified by the |facetDriver| when
   *  it is done faceting everything.
   */
  facetingCompleted() {
    this.planLayout();

    if (!this.everFaceted) {
      this.everFaceted = true;
      this.faceters.sort(this._groupCountComparator);
      for (const faceter of this.faceters) {
        const attrName = faceter.attrDef.attributeName;
        const explicitBinding = document.getElementById("facet-" + attrName);

        if (explicitBinding) {
          explicitBinding.explicit = true;
          explicitBinding.faceter = faceter;
          explicitBinding.attrDef = faceter.attrDef;
          explicitBinding.facetDef = faceter.facetDef;
          explicitBinding.nounDef = faceter.attrDef.objectNounDef;
          explicitBinding.orderedGroups = faceter.orderedGroups;
          // explicit booleans should always be displayed for consistency
          if (
            faceter.groupCount >= 1 ||
            explicitBinding.getAttribute("type").includes("boolean")
          ) {
            try {
              explicitBinding.build(true);
            } catch (e) {
              console.error(e);
            }
            explicitBinding.removeAttribute("uninitialized");
          }
          faceter.xblNode = explicitBinding;
          continue;
        }

        // ignore facets that do not vary!
        if (faceter.groupCount <= 1) {
          faceter.xblNode = null;
          continue;
        }

        faceter.xblNode = UIFacets.addFacet(faceter.type, faceter.attrDef, {
          faceter,
          facetDef: faceter.facetDef,
          orderedGroups: faceter.orderedGroups,
          maxDisplayRows: this.maxDisplayRows,
          explicit: false,
        });
      }
    } else {
      for (const faceter of this.faceters) {
        // Do not bother with un-displayed facets, or that are locked by a
        //  constraint.  But do bother if the widget can be updated without
        //  losing important data.
        if (
          !faceter.xblNode ||
          (faceter.constraint && !faceter.xblNode.canUpdate)
        ) {
          continue;
        }

        // hide things that have 0/1 groups now and are not constrained and not
        //  explicit
        if (
          faceter.groupCount <= 1 &&
          !faceter.constraint &&
          (!faceter.xblNode.explicit || faceter.type == "date")
        ) {
          faceter.xblNode.style.display = "none";
        } else {
          // otherwise, update
          faceter.xblNode.orderedGroups = faceter.orderedGroups;
          faceter.xblNode.build(false);
          faceter.xblNode.removeAttribute("style");
        }
      }
    }

    if (!this._timelineShown) {
      this._hideTimeline(true);
    }

    this._showResults();

    if (this._callbackOnFacetComplete) {
      const callback = this._callbackOnFacetComplete;
      this._callbackOnFacetComplete = null;
      callback();
    }
  },

  _showResults() {
    const results = document.getElementById("results");
    const numMessageToShow = Math.min(
      this.maxMessagesToShow * this._numPages,
      this._activeSet.length
    );
    results.setMessages(this._activeSet.slice(0, numMessageToShow));

    const showLoading = document.getElementById("showLoading");
    showLoading.style.display = "none"; // Hide spinner, we're done thinking.

    const showEmpty = document.getElementById("showEmpty");
    const showAll = document.getElementById("gloda-showall");
    // Check for no messages at all.
    if (this._activeSet.length == 0) {
      showEmpty.style.display = "block";
      showAll.style.display = "none";
    } else {
      showEmpty.style.display = "none";
      showAll.style.display = "block";
    }

    const showMore = document.getElementById("showMore");
    showMore.style.display =
      this._activeSet.length > numMessageToShow ? "block" : "none";
  },

  showMore() {
    this._numPages += 1;
    this._showResults();
  },

  zoomOut() {
    const facetDate = document.getElementById("facet-date");
    this.removeFacetConstraint(
      facetDate.faceter,
      true,
      facetDate.vis.constraints
    );
    facetDate.setAttribute("zoomedout", "true");
  },

  toggleTimeline() {
    try {
      this._timelineShown = !this._timelineShown;
      if (this._timelineShown) {
        this._showTimeline();
      } else {
        this._hideTimeline(false);
      }
    } catch (e) {
      console.error(e);
    }
  },

  _showTimeline() {
    const facetDate = document.getElementById("facet-date");
    if (facetDate.style.display == "none") {
      facetDate.style.display = "inherit";
      // Force binding attachment so the transition to the
      // visible state actually happens.
      facetDate.getBoundingClientRect();
    }
    const listener = () => {
      // Need to set overflow to visible so that the zoom button
      // is not cut off at the top, and overflow=hidden causes
      // the transition to not work as intended.
      facetDate.removeAttribute("style");
    };
    facetDate.addEventListener("transitionend", listener, { once: true });
    facetDate.removeAttribute("hide");
    document.getElementById("date-toggle").setAttribute("checked", "true");
    Services.prefs.setBoolPref("gloda.facetview.hidetimeline", false);
  },

  _hideTimeline(immediate) {
    const facetDate = document.getElementById("facet-date");
    if (immediate) {
      facetDate.style.display = "none";
    }
    facetDate.style.overflow = "hidden";
    facetDate.setAttribute("hide", "true");
    document.getElementById("date-toggle").removeAttribute("checked");
    Services.prefs.setBoolPref("gloda.facetview.hidetimeline", true);
  },

  _timelineShown: true,

  /** For use in hovering specific results. */
  fakeResultFaceter: {},
  /** For use in hovering specific results. */
  fakeResultAttr: {},

  _numPages: 1,
  _HOVER_STABILITY_DURATION_MS: 100,
  _brushedFacet: null,
  _brushedGroup: null,
  _brushedItems: null,
  _brushTimeout: null,
  hoverFacet(aFaceter, aAttrDef, aGroupValue, aGroupItems) {
    // bail if we are already brushing this item
    if (this._brushedFacet == aFaceter && this._brushedGroup == aGroupValue) {
      return;
    }

    this._brushedFacet = aFaceter;
    this._brushedGroup = aGroupValue;
    this._brushedItems = aGroupItems;

    if (this._brushTimeout != null) {
      clearTimeout(this._brushTimeout);
    }
    this._brushTimeout = setTimeout(
      this._timeoutHoverWrapper,
      this._HOVER_STABILITY_DURATION_MS,
      this
    );
  },
  _timeoutHover() {
    this._brushTimeout = null;
    for (const faceter of this.faceters) {
      if (faceter == this._brushedFacet || !faceter.xblNode) {
        continue;
      }

      if (this._brushedItems != null) {
        faceter.xblNode.brushItems(this._brushedItems);
      } else {
        faceter.xblNode.clearBrushedItems();
      }
    }
  },
  _timeoutHoverWrapper(aThis) {
    aThis._timeoutHover();
  },
  unhoverFacet(aFaceter, aAttrDef, aGroupValue) {
    // have we already brushed from some other source already?  ignore then.
    if (this._brushedFacet != aFaceter || this._brushedGroup != aGroupValue) {
      return;
    }

    // reuse hover facet to null everyone out
    this.hoverFacet(null, null, null, null);
  },

  /**
   * Maps attribute names to their corresponding |ActiveConstraint|, if they
   *  have one.
   */
  _activeConstraints: null,
  /**
   * Called by facet bindings when the user does some clicking and wants to
   *  impose a new constraint.
   *
   * @param {object} aFaceter - The faceter that is the source of this
   *   constraint. We need to know this because once a facet has a constraint
   *   attached, the UI stops updating it. See Facet.sys.mjs
   * @param {boolean} aInclusive - Is this an inclusive (true) or exclusive
   *     (false) constraint?  The constraint instance is the one that deals with
   *     the nuances resulting from this.
   * @param {object[]} aGroupValues - A list of the group values this constraint
   *   covers. In  general, we expect that only one group value will be present
   *   in the list since this method should get called each time the user clicks
   *   something.  Previously, we provided support for an "other" case which
   *   covered multiple groupValues so a single click needed to be able to
   *   pass in a list.  The "other" case is gone now, but semantically it's
   *   okay for us to support a list.
   * @param {boolean} [aRanged] Is it a ranged constraint? (Only for dates)
   * @param {boolean} [aNukeExisting] Do we need to replace the existing
   *   constraint and re-sieve everything? This currently only happens for
   *   dates, where our display allows a click to actually make our range more
   *   generic than it currently is. (But this only matters if we already have
   *   a date constraint applied.)
   * @param {Function} [aCallback] - The callback to call once (re-)faceting has completed.
   *
   * @returns {boolean} true if the caller needs to revalidate because the constraint has
   *   changed in a way other than explicitly requested.  This can occur if
   *   a singular constraint flips its inclusive state and throws away
   *   constraints.
   */
  addFacetConstraint(
    aFaceter,
    aInclusive,
    aGroupValues,
    aRanged,
    aNukeExisting,
    aCallback
  ) {
    const attrName = aFaceter.attrDef.attributeName;

    let constraint;
    let needToSieveAll = false;
    if (attrName in this._activeConstraints) {
      constraint = this._activeConstraints[attrName];

      needToSieveAll = true;
      if (aNukeExisting) {
        constraint.clear();
      }
    } else {
      const constraintClass = aFaceter.attrDef.singular
        ? ActiveSingularConstraint
        : ActiveNonSingularConstraint;
      constraint = this._activeConstraints[attrName] = new constraintClass(
        aFaceter,
        aRanged
      );
      aFaceter.constraint = constraint;
    }
    const needToRevalidate = constraint.constrain(aInclusive, aGroupValues);

    // Given our current implementation, we can only be further constraining our
    //  active set, so we can just sieve the existing active set with the
    //  (potentially updated) constraint.  In some cases, it would be much
    //  cheaper to use the facet's knowledge about the items in the groups, but
    //  for now let's keep a single code-path for how we refine the active set.
    this.build(
      needToSieveAll ? this._sieveAll() : constraint.sieve(this.activeSet),
      aCallback
    );

    return needToRevalidate;
  },

  /**
   * Remove a constraint previously imposed by addFacetConstraint.  The
   *  constraint must still be active, which means you need to pay attention
   *  when |addFacetConstraint| returns true indicating that you need to
   *  revalidate.
   *
   * @param {object} aFaceter
   * @param {boolean} aInclusive - Whether the group values were previously
   *   included / excluded.  If you want to remove some values that were
   *    included and some that were excluded then you need to call us once for
   *    each case.
   * @param {object[]} aGroupValues - The list of group values to remove.
   * @param {Function} aCallback - The callback to call once all facets have
   *   been updated.
   *
   * @returns {boolean} true if the constraint has been completely removed.
   *   Under the current regime, this will likely cause the binding that is
   *   calling us to be rebuilt, so be aware if you are trying to do any cool
   *   animation that might no longer make sense.
   */
  removeFacetConstraint(aFaceter, aInclusive, aGroupValues, aCallback) {
    const attrName = aFaceter.attrDef.attributeName;
    const constraint = this._activeConstraints[attrName];

    let constraintGone = false;

    if (constraint.relax(aInclusive, aGroupValues)) {
      delete this._activeConstraints[attrName];
      aFaceter.constraint = null;
      constraintGone = true;
    }

    // we definitely need to re-sieve everybody in this case...
    this.build(this._sieveAll(), aCallback);

    return constraintGone;
  },

  /**
   * Sieve the items from the underlying collection against all constraints,
   *  returning the value.
   */
  _sieveAll() {
    let items = this.fullSet;

    for (const elem in this._activeConstraints) {
      items = this._activeConstraints[elem].sieve(items);
    }

    return items;
  },

  toggleFulltextCriteria() {
    this.tab.searcher.andTerms = !this.tab.searcher.andTerms;
    this._resetUI();
    this.collection = this.tab.searcher.getCollection(this);
  },

  /**
   * Show the active message set in a 3-pane tab.
   */
  showActiveSetInTab() {
    const tabmail = this.rootWin.document.getElementById("tabmail");
    tabmail.openTab("mail3PaneTab", {
      folderPaneVisible: false,
      syntheticView: new GlodaSyntheticView({
        collection: Gloda.explicitCollection(
          GlodaConstants.NOUN_MESSAGE,
          this.activeSet
        ),
      }),
      title: this.tab.title,
    });
  },

  /**
   * Show the conversation in a new 3-pane tab.
   *
   * @param {MozFacetResultMessage} aResultMessage - The result the user wants
   *   to see in more details.
   * @param {boolean} [aBackground] Whether it should be in the background.
   */
  showConversationInTab(aResultMessage, aBackground) {
    const tabmail = this.rootWin.document.getElementById("tabmail");
    const message = aResultMessage.message;
    if (
      "IMCollection" in this &&
      message instanceof Gloda.lookupNounDef("im-conversation").clazz
    ) {
      tabmail.openTab("chat", {
        convType: "log",
        conv: message,
        searchTerm: aResultMessage.firstMatchText,
        background: aBackground,
      });
      return;
    }
    tabmail.openTab("mail3PaneTab", {
      folderPaneVisible: false,
      syntheticView: new GlodaSyntheticView({
        conversation: message.conversation,
        message,
      }),
      title: message.conversation.subject,
      background: aBackground,
    });
  },

  onItemsAdded() {},
  onItemsModified() {},
  onItemsRemoved() {},
  onQueryCompleted() {
    if (
      this.tab.query.completed &&
      (!("IMQuery" in this.tab) || this.tab.IMQuery.completed)
    ) {
      this.initialBuild();
    }
  },
};

/**
 * addEventListener betrayals compel us to establish our link with the
 *  outside world from inside.  NeilAway suggests the problem might have
 *  been the registration of the listener prior to initiating the load.  Which
 *  is odd considering it works for the XUL case, but I could see how that might
 *  differ.  Anywho, this works for now and is a delightful reference to boot.
 */
function reachOutAndTouchFrame() {
  const us = window
    .getInterface(Ci.nsIWebNavigation)
    .QueryInterface(Ci.nsIDocShellTreeItem);

  FacetContext.rootWin = us.rootTreeItem.domWindow;

  const parentWin = us.parent.domWindow;
  const aTab = (FacetContext.tab = parentWin.tab);
  parentWin.tab = null;
  window.addEventListener("resize", function () {
    document.getElementById("facet-date").build(true);
  });
  // we need to hook the context up as a listener in all cases since
  //  removal notifications are required.
  if ("searcher" in aTab) {
    FacetContext.searcher = aTab.searcher;
    aTab.searcher.listener = FacetContext;
    if ("IMSearcher" in aTab) {
      FacetContext.IMSearcher = aTab.IMSearcher;
      aTab.IMSearcher.listener = FacetContext;
    }
  } else {
    FacetContext.searcher = null;
    aTab.collection.listener = FacetContext;
  }
  FacetContext.collection = aTab.collection;
  if ("IMCollection" in aTab) {
    FacetContext.IMCollection = aTab.IMCollection;
  }

  // if it has already completed, we need to prod things
  if (
    aTab.query.completed &&
    (!("IMQuery" in aTab) || aTab.IMQuery.completed)
  ) {
    FacetContext.initialBuild();
  }
}

function clickOnBody(event) {
  if (event.bubbles) {
    document.querySelector("facet-popup-menu").hide();
  }
  return 0;
}

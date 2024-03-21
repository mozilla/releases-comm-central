/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * glautocomp.js decides which autocomplete item type to
 * use when one enters text in global search box. There are
 * following types of autocomplete item: gloda-contact-chunk-richlistitem,
 * gloda-fulltext-all-richlistitem, gloda-fulltext-single-richlistitem, gloda-multi-richlistitem,
 * gloda-single-identity-richlistitem, gloda-single-tag-richlistitem.
 */

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  MultiSuffixTree: "resource:///modules/gloda/SuffixTree.sys.mjs",
  TagNoun: "resource:///modules/gloda/NounTag.sys.mjs",
  FreeTagNoun: "resource:///modules/gloda/NounFreetag.sys.mjs",
});

function ResultRowFullText(aItem, words, typeForStyle) {
  this.item = aItem;
  this.words = words;
  this.typeForStyle = "gloda-fulltext-" + typeForStyle + "-richlistitem";
}
ResultRowFullText.prototype = {
  multi: false,
  fullText: true,
};

function ResultRowSingle(aItem, aCriteriaType, aCriteria, aExplicitNounID) {
  this.nounID = aExplicitNounID || aItem.NOUN_ID;
  this.nounDef = lazy.Gloda._nounIDToDef[this.nounID];
  this.criteriaType = aCriteriaType;
  this.criteria = aCriteria;
  this.item = aItem;
  this.typeForStyle = "gloda-single-" + this.nounDef.name + "-richlistitem";
}
ResultRowSingle.prototype = {
  multi: false,
  fullText: false,
};

function ResultRowMulti(aNounID, aCriteriaType, aCriteria, aQuery) {
  this.nounID = aNounID;
  this.nounDef = lazy.Gloda._nounIDToDef[aNounID];
  this.criteriaType = aCriteriaType;
  this.criteria = aCriteria;
  this.collection = aQuery.getCollection(this);
  this.collection.becomeExplicit();
  this.renderer = null;
}
ResultRowMulti.prototype = {
  multi: true,
  typeForStyle: "gloda-multi-richlistitem",
  fullText: false,
  onItemsAdded(aItems) {
    if (this.renderer) {
      for (const [, item] of aItems.entries()) {
        this.renderer.renderItem(item);
      }
    }
  },
  onItemsModified(aItems) {},
  onItemsRemoved(aItems) {},
  onQueryCompleted() {},
};

function nsAutoCompleteGlodaResult(aListener, aCompleter, aString) {
  this.listener = aListener;
  this.completer = aCompleter;
  this.searchString = aString;
  this._results = [];
  this._pendingCount = 0;
  this._problem = false;
  // Track whether we have reported anything to the complete controller so
  //  that we know not to send notifications to it during calls to addRows
  //  prior to that point.
  this._initiallyReported = false;

  this.wrappedJSObject = this;
}
nsAutoCompleteGlodaResult.prototype = {
  getObjectAt(aIndex) {
    return this._results[aIndex] || null;
  },
  markPending(aCompleter) {
    this._pendingCount++;
  },
  markCompleted(aCompleter) {
    if (--this._pendingCount == 0 && this.active) {
      this.listener.onSearchResult(this.completer, this);
    }
  },
  announceYourself() {
    this._initiallyReported = true;
    this.listener.onSearchResult(this.completer, this);
  },
  addRows(aRows) {
    if (!aRows.length) {
      return;
    }
    this._results.push.apply(this._results, aRows);
    if (this._initiallyReported && this.active) {
      this.listener.onSearchResult(this.completer, this);
    }
  },
  // ==== nsIAutoCompleteResult
  searchString: null,
  get searchResult() {
    if (this._problem) {
      return Ci.nsIAutoCompleteResult.RESULT_FAILURE;
    }
    if (this._results.length) {
      return !this._pendingCount
        ? Ci.nsIAutoCompleteResult.RESULT_SUCCESS
        : Ci.nsIAutoCompleteResult.RESULT_SUCCESS_ONGOING;
    }
    return !this._pendingCount
      ? Ci.nsIAutoCompleteResult.RESULT_NOMATCH
      : Ci.nsIAutoCompleteResult.RESULT_NOMATCH_ONGOING;
  },
  active: false,
  defaultIndex: -1,
  errorDescription: null,
  get matchCount() {
    return this._results === null ? 0 : this._results.length;
  },
  // this is the lower text, (shows the url in firefox)
  // we try and show the contact's name here.
  getValueAt(aIndex) {
    const thing = this._results[aIndex];
    return thing.name || thing.value || thing.subject || null;
  },
  getLabelAt(aIndex) {
    return this.getValueAt(aIndex);
  },
  // rich uses this to be the "title".  it is the upper text
  // we try and show the identity here.
  getCommentAt(aIndex) {
    const thing = this._results[aIndex];
    if (thing.value) {
      // identity
      return thing.contact.name;
    }
    return thing.name || thing.subject;
  },
  // rich uses this to be the "type"
  getStyleAt(aIndex) {
    const row = this._results[aIndex];
    return row.typeForStyle;
  },
  // rich uses this to be the icon
  getImageAt(aIndex) {
    const thing = this._results[aIndex];
    if (!thing.value) {
      return null;
    }

    return ""; // we don't want to use gravatars as is.
    /*
    let md5hash = GlodaUtils.md5HashString(thing.value);
    let gravURL = "http://www.gravatar.com/avatar/" + md5hash +
                                "?d=identicon&s=32&r=g";
    return gravURL;
    */
  },
  getFinalCompleteValueAt(aIndex) {
    return this.getValueAt(aIndex);
  },
  removeValueAt() {},
  _stop() {},
};

var MAX_POPULAR_CONTACTS = 200;

/**
 * Complete contacts/identities based on name/email.  Instant phase is based on
 *  a suffix-tree built of popular contacts/identities.  Delayed phase relies
 *  on a LIKE search of all known contacts.
 */
function ContactIdentityCompleter() {
  // get all the contacts
  const contactQuery = lazy.Gloda.newQuery(GlodaConstants.NOUN_CONTACT);
  contactQuery.orderBy("-popularity").limit(MAX_POPULAR_CONTACTS);
  this.contactCollection = contactQuery.getCollection(this, null);
  this.contactCollection.becomeExplicit();
}
ContactIdentityCompleter.prototype = {
  _popularitySorter(a, b) {
    return b.popularity - a.popularity;
  },
  complete(aResult, aString) {
    if (aString.length < 3) {
      // In CJK, first name or last name is sometime used as 1 character only.
      // So we allow autocompleted search even if 1 character.
      //
      // [U+3041 - U+9FFF ... Full-width Katakana, Hiragana
      //                      and CJK Ideograph
      // [U+AC00 - U+D7FF ... Hangul
      // [U+F900 - U+FFDC ... CJK compatibility ideograph
      if (!aString.match(/[\u3041-\u9fff\uac00-\ud7ff\uf900-\uffdc]/)) {
        return false;
      }
    }

    let matches;
    if (this.suffixTree) {
      matches = this.suffixTree.findMatches(aString.toLowerCase());
    } else {
      matches = [];
    }

    // let's filter out duplicates due to identity/contact double-hits by
    //  establishing a map based on the contact id for these guys.
    // let's also favor identities as we do it, because that gets us the
    //  most accurate gravat, potentially
    const contactToThing = {};
    for (let iMatch = 0; iMatch < matches.length; iMatch++) {
      const thing = matches[iMatch];
      if (
        thing.NOUN_ID == GlodaConstants.NOUN_CONTACT &&
        !(thing.id in contactToThing)
      ) {
        contactToThing[thing.id] = thing;
      } else if (thing.NOUN_ID == GlodaConstants.NOUN_IDENTITY) {
        contactToThing[thing.contactID] = thing;
      }
    }
    // and since we can now map from contacts down to identities, map contacts
    //  to the first identity for them that we find...
    matches = Object.keys(contactToThing)
      .map(id => contactToThing[id])
      .map(val =>
        val.NOUN_ID == GlodaConstants.NOUN_IDENTITY ? val : val.identities[0]
      );

    const rows = matches.map(
      match => new ResultRowSingle(match, "text", aResult.searchString)
    );
    aResult.addRows(rows);

    // - match against database contacts / identities
    const pending = { contactToThing, pendingCount: 2 };

    const contactQuery = lazy.Gloda.newQuery(GlodaConstants.NOUN_CONTACT);
    contactQuery.nameLike(
      contactQuery.WILDCARD,
      aString,
      contactQuery.WILDCARD
    );
    pending.contactColl = contactQuery.getCollection(this, aResult);
    pending.contactColl.becomeExplicit();

    const identityQuery = lazy.Gloda.newQuery(GlodaConstants.NOUN_IDENTITY);
    identityQuery
      .kind("email")
      .valueLike(identityQuery.WILDCARD, aString, identityQuery.WILDCARD);
    pending.identityColl = identityQuery.getCollection(this, aResult);
    pending.identityColl.becomeExplicit();

    aResult._contactCompleterPending = pending;

    return true;
  },
  onItemsAdded(aItems, aCollection) {},
  onItemsModified(aItems, aCollection) {},
  onItemsRemoved(aItems, aCollection) {},
  onQueryCompleted(aCollection) {
    // handle the initial setup case...
    if (aCollection.data == null) {
      // cheat and explicitly add our own contact...
      if (
        lazy.Gloda.myContact &&
        !(lazy.Gloda.myContact.id in this.contactCollection._idMap)
      ) {
        this.contactCollection._onItemsAdded([lazy.Gloda.myContact]);
      }

      // the set of identities owned by the contacts is automatically loaded as part
      //  of the contact loading...
      // (but only if we actually have any contacts)
      this.identityCollection =
        this.contactCollection.subCollections[GlodaConstants.NOUN_IDENTITY];

      const contactNames = this.contactCollection.items.map(
        c => c.name.replace(" ", "").toLowerCase() || "x"
      );
      // if we had no contacts, we will have no identity collection!
      let identityMails;
      if (this.identityCollection) {
        identityMails = this.identityCollection.items.map(i =>
          i.value.toLowerCase()
        );
      }

      // The suffix tree takes two parallel lists; the first contains strings
      //  while the second contains objects that correspond to those strings.
      // In the degenerate case where identityCollection does not exist, it will
      //  be undefined.  Calling concat with an argument of undefined simply
      //  duplicates the list we called concat on, and is thus harmless.  Our
      //  use of && on identityCollection allows its undefined value to be
      //  passed through to concat.  identityMails will likewise be undefined.
      this.suffixTree = new lazy.MultiSuffixTree(
        contactNames.concat(identityMails),
        this.contactCollection.items.concat(
          this.identityCollection && this.identityCollection.items
        )
      );

      return;
    }

    // handle the completion case
    const result = aCollection.data;
    const pending = result._contactCompleterPending;

    if (--pending.pendingCount == 0) {
      const possibleDudes = [];

      const contactToThing = pending.contactToThing;

      let items;

      // check identities first because they are better than contacts in terms
      //  of display
      items = pending.identityColl.items;
      for (let iIdentity = 0; iIdentity < items.length; iIdentity++) {
        const identity = items[iIdentity];
        if (!(identity.contactID in contactToThing)) {
          contactToThing[identity.contactID] = identity;
          possibleDudes.push(identity);
          // augment the identity with its contact's popularity
          identity.popularity = identity.contact.popularity;
        }
      }
      items = pending.contactColl.items;
      for (let iContact = 0; iContact < items.length; iContact++) {
        const contact = items[iContact];
        if (!(contact.id in contactToThing)) {
          contactToThing[contact.id] = contact;
          possibleDudes.push(contact.identities[0]);
        }
      }

      // sort in order of descending popularity
      possibleDudes.sort(this._popularitySorter);
      const rows = possibleDudes.map(
        dude => new ResultRowSingle(dude, "text", result.searchString)
      );
      result.addRows(rows);
      result.markCompleted(this);

      // the collections no longer care about the result, make it clear.
      delete pending.identityColl.data;
      delete pending.contactColl.data;
      // the result object no longer needs us or our data
      delete result._contactCompleterPending;
    }
  },
};

/**
 * Complete tags that are used on contacts.
 */
function ContactTagCompleter() {
  lazy.FreeTagNoun.populateKnownFreeTags();
  this._buildSuffixTree();
  lazy.FreeTagNoun.addListener(this);
}
ContactTagCompleter.prototype = {
  _buildSuffixTree() {
    const tagNames = [],
      tags = [];
    for (const [tagName, tag] of Object.entries(
      lazy.FreeTagNoun.knownFreeTags
    )) {
      tagNames.push(tagName.toLowerCase());
      tags.push(tag);
    }
    this._suffixTree = new lazy.MultiSuffixTree(tagNames, tags);
    this._suffixTreeDirty = false;
  },
  onFreeTagAdded(aTag) {
    this._suffixTreeDirty = true;
  },
  complete(aResult, aString) {
    // now is not the best time to do this; have onFreeTagAdded use a timer.
    if (this._suffixTreeDirty) {
      this._buildSuffixTree();
    }

    if (aString.length < 2) {
      // No async mechanism that will add new rows.
      return false;
    }

    const tags = this._suffixTree.findMatches(aString.toLowerCase());
    const rows = [];
    for (const tag of tags) {
      const query = lazy.Gloda.newQuery(GlodaConstants.NOUN_CONTACT);
      query.freeTags(tag);
      const resRow = new ResultRowMulti(
        GlodaConstants.NOUN_CONTACT,
        "tag",
        tag.name,
        query
      );
      rows.push(resRow);
    }
    aResult.addRows(rows);

    return false; // no async mechanism that will add new rows
  },
};

/**
 * Complete tags that are used on messages
 */
function MessageTagCompleter() {
  this._buildSuffixTree();
}
MessageTagCompleter.prototype = {
  _buildSuffixTree() {
    const tagNames = [],
      tags = [];
    const tagArray = lazy.TagNoun.getAllTags();
    for (let iTag = 0; iTag < tagArray.length; iTag++) {
      const tag = tagArray[iTag];
      tagNames.push(tag.tag.toLowerCase());
      tags.push(tag);
    }
    this._suffixTree = new lazy.MultiSuffixTree(tagNames, tags);
    this._suffixTreeDirty = false;
  },
  complete(aResult, aString) {
    if (aString.length < 2) {
      return false;
    }

    const tags = this._suffixTree.findMatches(aString.toLowerCase());
    const rows = [];
    for (const tag of tags) {
      const resRow = new ResultRowSingle(tag, "tag", tag.tag, lazy.TagNoun.id);
      rows.push(resRow);
    }
    aResult.addRows(rows);

    return false; // no async mechanism that will add new rows
  },
};

/**
 * Complete with helpful hints about full-text search
 */
function FullTextCompleter() {}
FullTextCompleter.prototype = {
  complete(aResult, aSearchString) {
    if (aSearchString.length < 4) {
      return false;
    }
    // We use code very similar to that in GlodaMsgSearcher.sys.mjs, except that we
    // need to detect when we found phrases, as well as strip commas.
    aSearchString = aSearchString.trim();
    const terms = [];
    let phraseFound = false;
    while (aSearchString) {
      let term = "";
      if (aSearchString.startsWith('"')) {
        const endIndex = aSearchString.indexOf(aSearchString[0], 1);
        // eat the quote if it has no friend
        if (endIndex == -1) {
          aSearchString = aSearchString.substring(1);
          continue;
        }
        phraseFound = true;
        term = aSearchString.substring(1, endIndex).trim();
        if (term) {
          terms.push(term);
        }
        aSearchString = aSearchString.substring(endIndex + 1);
        continue;
      }

      const spaceIndex = aSearchString.indexOf(" ");
      if (spaceIndex == -1) {
        terms.push(aSearchString.replace(/,/g, ""));
        break;
      }

      term = aSearchString.substring(0, spaceIndex).replace(/,/g, "");
      if (term) {
        terms.push(term);
      }
      aSearchString = aSearchString.substring(spaceIndex + 1);
    }

    if (terms.length == 1 && !phraseFound) {
      aResult.addRows([new ResultRowFullText(aSearchString, terms, "single")]);
    } else {
      aResult.addRows([new ResultRowFullText(aSearchString, terms, "all")]);
    }

    return false; // no async mechanism that will add new rows
  },
};

export function GlodaAutoComplete() {
  this.wrappedJSObject = this;
  try {
    this.completers = [];
    this.curResult = null;

    this.completers.push(new FullTextCompleter()); // not async.
    this.completers.push(new ContactIdentityCompleter()); // potentially async.
    this.completers.push(new ContactTagCompleter()); // not async.
    this.completers.push(new MessageTagCompleter()); // not async.
  } catch (e) {
    console.error(e);
  }
}

GlodaAutoComplete.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteSearch"]),

  startSearch(aString, aParam, aResult, aListener) {
    try {
      const result = new nsAutoCompleteGlodaResult(aListener, this, aString);
      // save this for hacky access to the search.  I somewhat suspect we simply
      //  should not be using the formal autocomplete mechanism at all.
      // Used in glodacomplete.xml.
      this.curResult = result;

      // Guard against late async results being sent.
      this.curResult.active = true;

      if (aParam == "global") {
        for (const completer of this.completers) {
          // they will return true if they have something pending.
          if (completer.complete(result, aString)) {
            result.markPending(completer);
          }
        }
        // } else {
        //   It'd be nice to do autocomplete in the quicksearch modes based
        //   on the specific values for that mode in the current view.
        //   But we don't do that yet.
      }

      result.announceYourself();
    } catch (e) {
      console.error(e);
    }
  },

  stopSearch() {
    this.curResult.active = false;
  },
};

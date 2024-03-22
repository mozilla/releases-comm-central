/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides the "explicit attribute" provider for messages.  It is
 *  concerned with attributes that are the result of user actions.  For example,
 *  whether a message is starred (flagged), message tags, whether it is
 *  read/unread, etc.
 */

import { Gloda } from "resource:///modules/gloda/Gloda.sys.mjs";

import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";
import { TagNoun } from "resource:///modules/gloda/NounTag.sys.mjs";

/**
 * @namespace Explicit attribute provider.  Indexes/defines attributes that are
 *  explicitly a result of user action.  This dubiously includes marking a
 *  message as read.
 */
export var GlodaExplicitAttr = {
  providerName: "gloda.explattr",
  strings: Services.strings.createBundle(
    "chrome://messenger/locale/gloda.properties"
  ),
  _log: null,

  init() {
    this._log = console.createInstance({
      prefix: "gloda.explattr",
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

  /** Boost for starred messages. */
  NOTABILITY_STARRED: 16,
  /** Boost for tagged messages, first tag. */
  NOTABILITY_TAGGED_FIRST: 8,
  /** Boost for tagged messages, each additional tag. */
  NOTABILITY_TAGGED_ADDL: 1,

  defineAttributes() {
    // Tag
    this._attrTag = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "tag",
      bindName: "tags",
      singular: false,
      emptySetIsSignificant: true,
      facet: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_TAG,
      parameterNoun: null,
      // Property change notifications that we care about:
      propertyChanges: ["keywords"],
    }); // not-tested

    // Star
    this._attrStar = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "star",
      bindName: "starred",
      singular: true,
      facet: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_BOOLEAN,
      parameterNoun: null,
    }); // tested-by: test_attributes_explicit
    // Read/Unread
    this._attrRead = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "read",
      // Make the message query-able but without using the database.
      canQuery: "truthy-but-not-true",
      singular: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_BOOLEAN,
      parameterNoun: null,
    }); // tested-by: test_attributes_explicit

    /**
     * Has this message been replied to by the user.
     */
    this._attrRepliedTo = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "repliedTo",
      singular: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_BOOLEAN,
      parameterNoun: null,
    }); // tested-by: test_attributes_explicit

    /**
     * Has this user forwarded this message to someone.
     */
    this._attrForwarded = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrExplicit,
      attributeName: "forwarded",
      singular: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_BOOLEAN,
      parameterNoun: null,
    }); // tested-by: test_attributes_explicit
  },

  *process(aGlodaMessage, aRawReps) {
    const aMsgHdr = aRawReps.header;

    aGlodaMessage.starred = aMsgHdr.isFlagged;
    if (aGlodaMessage.starred) {
      aGlodaMessage.notability += this.NOTABILITY_STARRED;
    }

    aGlodaMessage.read = aMsgHdr.isRead;

    const flags = aMsgHdr.flags;
    aGlodaMessage.repliedTo = Boolean(flags & Ci.nsMsgMessageFlags.Replied);
    aGlodaMessage.forwarded = Boolean(flags & Ci.nsMsgMessageFlags.Forwarded);

    const tags = (aGlodaMessage.tags = []);

    // -- Tag
    // build a map of the keywords
    const keywords = aMsgHdr.getStringProperty("keywords");
    const keywordList = keywords.split(" ");
    const keywordMap = {};
    for (let iKeyword = 0; iKeyword < keywordList.length; iKeyword++) {
      const keyword = keywordList[iKeyword];
      keywordMap[keyword] = true;
    }

    const tagArray = TagNoun.getAllTags();
    for (let iTag = 0; iTag < tagArray.length; iTag++) {
      const tag = tagArray[iTag];
      if (tag.key in keywordMap) {
        tags.push(tag);
      }
    }

    if (tags.length) {
      aGlodaMessage.notability +=
        this.NOTABILITY_TAGGED_FIRST +
        (tags.length - 1) * this.NOTABILITY_TAGGED_ADDL;
    }

    yield GlodaConstants.kWorkDone;
  },

  /**
   * Duplicates the notability logic from process().  Arguably process should
   *  be factored to call us, grokNounItem should be factored to call us, or we
   *  should get sufficiently fancy that our code wildly diverges.
   */
  score(aMessage) {
    let score = 0;
    if (aMessage.starred) {
      score += this.NOTABILITY_STARRED;
    }
    if (aMessage.tags.length) {
      score +=
        this.NOTABILITY_TAGGED_FIRST +
        (aMessage.tags.length - 1) * this.NOTABILITY_TAGGED_ADDL;
    }
    return score;
  },
};

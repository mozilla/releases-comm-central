/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["TagNoun"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
const { GlodaConstants } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaConstants.jsm"
);

/**
 * @namespace Tag noun provider.
 */
var TagNoun = {
  name: "tag",
  clazz: Ci.nsIMsgTag,
  usesParameter: true,
  allowsArbitraryAttrs: false,
  idAttr: "key",
  _msgTagService: null,
  _tagMap: null,
  _tagList: null,

  _init() {
    // This reference can be substituted for testing purposes.
    this._msgTagService = MailServices.tags;
    this._updateTagMap();
  },

  getAllTags() {
    if (this._tagList == null) {
      this._updateTagMap();
    }
    return this._tagList;
  },

  _updateTagMap() {
    this._tagMap = {};
    const tagArray = (this._tagList = this._msgTagService.getAllTags());
    for (let iTag = 0; iTag < tagArray.length; iTag++) {
      const tag = tagArray[iTag];
      this._tagMap[tag.key] = tag;
    }
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
    return a.tag.localeCompare(b.tag);
  },
  userVisibleString(aTag) {
    return aTag.tag;
  },

  // we cannot be an attribute value

  toParamAndValue(aTag) {
    return [aTag.key, null];
  },
  toJSON(aTag) {
    return aTag.key;
  },
  fromJSON(aTagKey, aIgnored) {
    let tag = this._tagMap.hasOwnProperty(aTagKey)
      ? this._tagMap[aTagKey]
      : undefined;
    // you will note that if a tag is removed, we are unable to aggressively
    //  deal with this.  we are okay with this, but it would be nice to be able
    //  to listen to the message tag service to know when we should rebuild.
    if (tag === undefined && this._msgTagService.isValidKey(aTagKey)) {
      this._updateTagMap();
      tag = this._tagMap[aTagKey];
    }
    // we intentionally are returning undefined if the tag doesn't exist
    return tag;
  },
  /**
   * Convenience helper to turn a tag key into a tag name.
   */
  getTag(aTagKey) {
    return this.fromJSON(aTagKey);
  },
};

TagNoun._init();
Gloda.defineNoun(TagNoun, GlodaConstants.NOUN_TAG);

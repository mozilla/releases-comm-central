/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["FreeTag", "FreeTagNoun"];

const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");

function FreeTag(aTagName) {
  this.name = aTagName;
}

FreeTag.prototype = {
  toString() {
    return this.name;
  },
};

/**
 * @namespace Tag noun provider.  Since the tag unique value is stored as a
 *  parameter, we are an odd case and semantically confused.
 */
var FreeTagNoun = {
  _log: console.createInstance({
    prefix: "gloda.noun.freetag",
    maxLogLevel: "Warn",
    maxLogLevelPref: "gloda.loglevel",
  }),

  name: "freetag",
  clazz: FreeTag,
  allowsArbitraryAttrs: false,
  usesParameter: true,

  _listeners: [],
  addListener(aListener) {
    this._listeners.push(aListener);
  },
  removeListener(aListener) {
    const index = this._listeners.indexOf(aListener);
    if (index >= 0) {
      this._listeners.splice(index, 1);
    }
  },

  populateKnownFreeTags() {
    for (const attr of this.objectNounOfAttributes) {
      const attrDB = attr.dbDef;
      for (const param in attrDB.parameterBindings) {
        this.getFreeTag(param);
      }
    }
  },

  knownFreeTags: {},
  getFreeTag(aTagName) {
    let tag = this.knownFreeTags[aTagName];
    if (!tag) {
      tag = this.knownFreeTags[aTagName] = new FreeTag(aTagName);
      for (const listener of this._listeners) {
        listener.onFreeTagAdded(tag);
      }
    }
    return tag;
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
    return a.name.localeCompare(b.name);
  },

  toParamAndValue(aTag) {
    return [aTag.name, null];
  },

  toJSON(aTag) {
    return aTag.name;
  },
  fromJSON(aTagName) {
    return this.getFreeTag(aTagName);
  },
};

Gloda.defineNoun(FreeTagNoun);

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Gloda"];

const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");
/* nothing to import, just run some code */ ChromeUtils.import(
  "resource:///modules/gloda/Everybody.jsm"
);
const { GlodaIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaIndexer.jsm"
);
// initialize the indexer! (who was actually imported as a nested dep by the
//  things Everybody.jsm imported.)  We waited until now so it could know about
//  its indexers.
GlodaIndexer._init();
const { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

/**
 * Expose some junk
 */
function proxy(aSourceObj, aSourceAttr, aDestObj, aDestAttr) {
  aDestObj[aDestAttr] = function(...aArgs) {
    return aSourceObj[aSourceAttr](...aArgs);
  };
}

proxy(GlodaIndexer, "addListener", Gloda, "addIndexerListener");
proxy(GlodaIndexer, "removeListener", Gloda, "removeIndexerListener");
proxy(GlodaMsgIndexer, "isMessageIndexed", Gloda, "isMessageIndexed");
proxy(
  GlodaMsgIndexer,
  "setFolderIndexingPriority",
  Gloda,
  "setFolderIndexingPriority"
);
proxy(
  GlodaMsgIndexer,
  "resetFolderIndexingPriority",
  Gloda,
  "resetFolderIndexingPriority"
);

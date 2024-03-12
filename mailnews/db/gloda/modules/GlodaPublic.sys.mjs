/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Gloda as Gloda2 } from "resource:///modules/gloda/Gloda.sys.mjs";

export var Gloda = Gloda2;

// nothing to import, just run some code
/* eslint-disable-next-line import/no-unassigned-import */
import "resource:///modules/gloda/Everybody.sys.mjs";

import { GlodaIndexer } from "resource:///modules/gloda/GlodaIndexer.sys.mjs";
// initialize the indexer! (who was actually imported as a nested dep by the
//  things Everybody.sys.mjs imported.)  We waited until now so it could know
//  about its indexers.
GlodaIndexer._init();

import { GlodaMsgIndexer } from "resource:///modules/gloda/IndexMsg.sys.mjs";

/**
 * Expose some junk
 */
function proxy(aSourceObj, aSourceAttr, aDestObj, aDestAttr) {
  aDestObj[aDestAttr] = function (...aArgs) {
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

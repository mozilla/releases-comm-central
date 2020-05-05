/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [];

const { GlodaFundAttr } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaFundAttr.jsm"
);
GlodaFundAttr.init();
const { GlodaExplicitAttr } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaExplicitAttr.jsm"
);
GlodaExplicitAttr.init();

ChromeUtils.import("resource:///modules/gloda/NounTag.jsm");
ChromeUtils.import("resource:///modules/gloda/NounFreetag.jsm");
ChromeUtils.import("resource:///modules/gloda/NounMimetype.jsm");
ChromeUtils.import("resource:///modules/gloda/IndexMsg.jsm");
const { GlodaABAttrs } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaMsgIndexer.jsm"
);
GlodaABAttrs.init();

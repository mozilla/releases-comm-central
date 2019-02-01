/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [];

const {Log4Moz} = ChromeUtils.import("resource:///modules/gloda/log4moz.js");
var LOG = Log4Moz.repository.getLogger("gloda.everybody");

const {GlodaFundAttr} = ChromeUtils.import("resource:///modules/gloda/fundattr.js");
GlodaFundAttr.init();
const {GlodaExplicitAttr} = ChromeUtils.import("resource:///modules/gloda/explattr.js");
GlodaExplicitAttr.init();

ChromeUtils.import("resource:///modules/gloda/noun_tag.js");
ChromeUtils.import("resource:///modules/gloda/noun_freetag.js");
ChromeUtils.import("resource:///modules/gloda/noun_mimetype.js");
ChromeUtils.import("resource:///modules/gloda/index_msg.js");
const {GlodaABAttrs} = ChromeUtils.import("resource:///modules/gloda/index_ab.js");
GlodaABAttrs.init();

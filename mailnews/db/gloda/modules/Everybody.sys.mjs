/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable import/no-unassigned-import */

import { GlodaFundAttr } from "resource:///modules/gloda/GlodaFundAttr.sys.mjs";

GlodaFundAttr.init();

import { GlodaExplicitAttr } from "resource:///modules/gloda/GlodaExplicitAttr.sys.mjs";

GlodaExplicitAttr.init();

import "resource:///modules/gloda/NounTag.sys.mjs";
import "resource:///modules/gloda/NounFreetag.sys.mjs";
import "resource:///modules/gloda/NounMimetype.sys.mjs";
import "resource:///modules/gloda/IndexMsg.sys.mjs";

import { GlodaABAttrs } from "resource:///modules/gloda/GlodaMsgIndexer.sys.mjs";

GlodaABAttrs.init();

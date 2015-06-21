/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function parseNewsgroups(headers) {
  let ng = [];
  for (let header of headers) {
    ng = ng.concat(header.split(/\s*,\s*/));
  }
  return ng;
}

function emitNewsgroups(groups) {
  // Don't encode the newsgroups names in RFC 2047...
  if (groups.length == 1)
    this.addText(groups[0], false);
  else {
    this.addText(groups[0], false);
    for (let i = 1; i < groups.length; i++) {
      this.addText(",", false); // only comma, no space!
      this.addText(groups[i], false);
    }
  }
}

jsmime.headerparser.addStructuredDecoder("Newsgroups", parseNewsgroups);
jsmime.headerparser.addStructuredDecoder("Followup-To", parseNewsgroups);
jsmime.headeremitter.addStructuredEncoder("Newsgroups", emitNewsgroups);
jsmime.headeremitter.addStructuredEncoder("Followup-To", emitNewsgroups);

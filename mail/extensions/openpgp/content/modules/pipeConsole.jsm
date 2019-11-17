/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailConsole"];

const MAX_SIZE = 32768;
var dataCache = "";
var gotNewData = false;

var EnigmailConsole = {
  write: function(data) {
    dataCache += data;
    if (dataCache.length > MAX_SIZE) {
      dataCache = dataCache.substr(-MAX_SIZE, MAX_SIZE);
    }
    gotNewData = true;
  },

  hasNewData: function() {
    return gotNewData;
  },

  getData: function() {
    gotNewData = false;
    return dataCache;
  }
};

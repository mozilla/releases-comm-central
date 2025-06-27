/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from head.js */

var IS_EWS = true;

const wrappedCreateAccount = createAccount;
createAccount = function (type = "ews", options = {}) {
  return wrappedCreateAccount(type, options);
};

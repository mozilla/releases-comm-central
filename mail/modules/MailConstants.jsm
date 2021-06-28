#filter substitution
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["MailConstants"];

// Immutable for export.
var MailConstants = Object.freeze({

  MOZ_OPENPGP:
#ifdef MOZ_OPENPGP
  true,
#else
  false,
#endif

});

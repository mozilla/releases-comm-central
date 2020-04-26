/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup() {
  let compatMode = document.getElementById("uaFirefoxCompat");
  let modeFirefox =
    document.getElementById("general.useragent.compatMode.firefox");
  let modeStrict =
    document.getElementById("general.useragent.compatMode.strict-firefox");

  if (modeStrict.value)
    compatMode.value = "strict";
  else if (modeFirefox.value)
    compatMode.value = "compat";
  else
    compatMode.value = "none";
}

function updateUAPrefs(aCompatMode) {
  let modeFirefox =
    document.getElementById("general.useragent.compatMode.firefox");
  // The strict option will only work in builds compiled from a SeaMonkey
  // release branch. Additional code needs to be added to the mozilla sources.
  // See Bug 1242294 for the needed changes.
  let modeStrict =
    document.getElementById("general.useragent.compatMode.strict-firefox");
  switch (aCompatMode.value) {
    case "strict":
      modeStrict.value = true;
      modeFirefox.value = false;
      break;
    case "compat":
      modeStrict.value = false;
      modeFirefox.value = true;
      break;
    case "none":
      modeStrict.value = false;
      modeFirefox.value = false;
  }
}

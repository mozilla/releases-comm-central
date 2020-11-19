/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Error url must be formatted like this:
//   about:newserror?r=response&m=messageid&k=messagekey&f=folderuri
// "r" is required; "m" and "f" are optional, but "k" always comes with "m".

var folderUri;

function initPage() {
  let uri = document.documentURI;
  let query = uri.slice(uri.indexOf("?") + 1);
  let params = {};
  for (let piece of query.split("&")) {
    let [key, value] = piece.split("=");
    params[key] = decodeURIComponent(value);
  }

  document.getElementById("ngResp").textContent = params.r;

  if ("m" in params) {
    document.getElementById("msgId").textContent = params.m;
    document.getElementById("msgKey").textContent = params.k;
  } else {
    document.getElementById("messageIdDesc").hidden = true;
  }

  if ("f" in params) {
    folderUri = params.f;
  } else {
    document.getElementById("errorTryAgain").hidden = true;
  }
}

function removeExpired() {
  document.location.href = folderUri + "?list-ids";
}

let errorTryAgain = document.getElementById("errorTryAgain");
errorTryAgain.addEventListener("click", function() {
  removeExpired();
});

// This must be called in this way,
// see mozilla-central/docshell/resources/content/netError.js after which
// this is modelled.
initPage();

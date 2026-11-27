/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Counts requests per key. "?hit=KEY" records a hit and returns an empty
 * stylesheet, "?count=KEY" returns the number of hits recorded for KEY.
 */
function handleRequest(request, response) {
  const params = new URLSearchParams(request.queryString);
  response.setHeader("Cache-Control", "no-store", false);
  if (params.has("count")) {
    response.setHeader("Content-Type", "text/plain", false);
    response.write(getState(params.get("count")) || "0");
    return;
  }
  const key = params.get("hit");
  setState(key, String(+(getState(key) || "0") + 1));
  response.setHeader("Content-Type", "text/css", false);
}

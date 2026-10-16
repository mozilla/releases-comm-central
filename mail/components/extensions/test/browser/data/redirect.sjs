/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// "?hit" counts a request, "?hits" returns the count, anything else is a
// redirect target.
function handleRequest(request, response) {
  const query = request.queryString;
  if (query == "hit") {
    setSharedState("hits", String(+getSharedState("hits") + 1));
    response.setStatusLine(request.httpVersion, 404, "Not Found");
    return;
  }
  if (query == "hits") {
    response.setHeader("Cache-Control", "no-store", false);
    response.write(getSharedState("hits") || "0");
    return;
  }
  response.setStatusLine(request.httpVersion, 302, "Found");
  response.setHeader("Location", query, false);
}

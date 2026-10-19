/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 302, "Found");
  response.setHeader(
    "Location",
    decodeURIComponent(request.queryString),
    false
  );
}

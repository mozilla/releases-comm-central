/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Echoes request headers as JSON so a test can check what was sent.

/* eslint-disable-next-line mozilla/reject-importGlobalProperties */
Cu.importGlobalProperties(["URLSearchParams"]);

function handleRequest(request, response) {
  if (!request.hasHeader("Authorization")) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="test"`);
    return;
  }

  response.setHeader("Content-Type", "application/json", false);

  const headers = {};
  const enumerator = request.headers;
  while (enumerator.hasMoreElements()) {
    const header = enumerator.getNext().data;
    headers[header.toLowerCase()] = request.getHeader(header);
  }

  response.write(JSON.stringify(headers));
}

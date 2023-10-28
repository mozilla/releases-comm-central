/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Serves as the authorisation endpoint for OAuth2 testing.

/* eslint-disable-next-line mozilla/reject-importGlobalProperties */
Cu.importGlobalProperties(["URLSearchParams", "URL"]);

function handleRequest(request, response) {
  const params = new URLSearchParams(request.queryString);

  if (request.method == "POST") {
    response.setStatusLine(request.httpVersion, 303, "Redirected");
  } else {
    response.setStatusLine(request.httpVersion, 302, "Moved Temporarily");
  }

  const url = new URL(params.get("redirect_uri"));
  url.searchParams.set("code", "success");
  response.setHeader("Location", url.href);
}

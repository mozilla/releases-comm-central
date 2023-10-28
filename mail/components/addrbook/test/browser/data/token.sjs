/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Serves as the token endpoint for OAuth2 testing.

/* eslint-disable-next-line mozilla/reject-importGlobalProperties */
Cu.importGlobalProperties(["URLSearchParams"]);

function handleRequest(request, response) {
  const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  stream.setInputStream(request.bodyInputStream);

  const input = stream.readBytes(request.bodyInputStream.available());
  const params = new URLSearchParams(input);

  response.setHeader("Content-Type", "application/json", false);

  if (params.get("refresh_token") == "expired_token") {
    response.setStatusLine("1.1", 400, "Bad Request");
    response.write(JSON.stringify({ error: "invalid_grant" }));
    return;
  }

  const data = { access_token: "bobs_access_token" };

  if (params.get("code") == "success") {
    // Authorisation just happened, set a different access token so the test
    // can detect it, and provide a refresh token.
    data.access_token = "new_access_token";
    data.refresh_token = "new_refresh_token";
  }

  response.write(JSON.stringify(data));
}

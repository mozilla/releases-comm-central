/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
var { HttpServer } = ChromeUtils.import("resource://testing-common/httpd.js");

function run_test() {
  const httpserv = new HttpServer();
  httpserv.registerPrefixHandler("/", {
    handle(request, response) {
      response.setStatusLine(request.httpVersion, 200, "OK");
      equal(request.path, "/test_webcal");
    },
  });
  httpserv.start(-1);

  const baseUri = "://localhost:" + httpserv.identity.primaryPort + "/test_webcal";
  add_test(check_webcal_uri.bind(null, "webcal" + baseUri));
  // TODO webcals needs bug 466524 to be fixed
  // add_test(check_webcal_uri.bind(null, "webcals" + baseUri));
  add_test(() => httpserv.stop(run_next_test));

  // Now lets go...
  run_next_test();
}

function check_webcal_uri(aUri) {
  const uri = Services.io.newURI(aUri);

  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  NetUtil.asyncFetch(channel, (data, status, request) => {
    ok(Components.isSuccessCode(status));
    run_next_test();
  });
}

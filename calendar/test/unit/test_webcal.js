/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://testing-common/httpd.js");

function run_test() {
    let httpserv = new HttpServer();
    httpserv.registerPrefixHandler("/", {
        handle: function(request, response) {
          response.setStatusLine(request.httpVersion, 200, "OK");
          equal(request.path, "/test_webcal");
        }
    });
    httpserv.start(-1);

    let baseUri = "://localhost:" + httpserv.identity.primaryPort + "/test_webcal";
    add_test(check_webcal_uri.bind(null, "webcal" + baseUri));
    // TODO webcals needs bug 466524 to be fixed
    // add_test(check_webcal_uri.bind(null, "webcals" + baseUri));
    add_test(() =>  httpserv.stop(run_next_test));

    // Now lets go...
    run_next_test();
}

function check_webcal_uri(aUri) {
    let uri = Services.io.newURI(aUri, null, null);

    let channel = Services.io.newChannelFromURI2(uri,
                                                 null,
                                                 Services.scriptSecurityManager.getSystemPrincipal(),
                                                 null,
                                                 Components.interfaces.nsILoadInfo.SEC_NORMAL,
                                                 Components.interfaces.nsIContentPolicy.TYPE_OTHER);

    NetUtil.asyncFetch(channel, function(data, status, request) {
        ok(Components.isSuccessCode(status));
        run_next_test();
    });
}

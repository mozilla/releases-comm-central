/* -*- mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgContentPolicy to check we could add/remove customized protocol to
 * nsMsgContentPolicy.
 */

function makeURI(aURL) {
  var ioService = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, null, null);
}

function run_test() {
  var content_policy = Cc["@mozilla.org/messenger/content-policy;1"]
                         .getService(Ci.nsIContentPolicy);

  Assert.ok(content_policy);

  var msg_content_policy = content_policy.QueryInterface(Ci.nsIMsgContentPolicy);

  Assert.ok(msg_content_policy);

  var req_uri = makeURI("custom-scheme://custom_url/1.emal");
  Assert.ok(req_uri);

  var content_uri = makeURI("custom-scheme://custom_content_url/1.jsp");
  Assert.ok(content_uri);

  var decision = content_policy.shouldLoad(Ci.nsIContentPolicy.TYPE_IMAGE,
                                           content_uri,
                                           req_uri,
                                           null,
                                           "img/jpeg",
                                           null);
  Assert.notEqual(decision,
                  Ci.nsIContentPolicy.ACCEPT,
                  "customized protocol should not load");

  msg_content_policy.addExposedProtocol("custom-scheme");

  decision = content_policy.shouldLoad(Ci.nsIContentPolicy.TYPE_IMAGE,
                                       content_uri,
                                       req_uri,
                                       null,
                                       "img/jpeg",
                                       null);
  Assert.equal(decision,
               Ci.nsIContentPolicy.ACCEPT,
               "customized protocol should load");

  msg_content_policy.removeExposedProtocol("custom-scheme");

  decision = content_policy.shouldLoad(Ci.nsIContentPolicy.TYPE_IMAGE,
                                       content_uri,
                                       req_uri,
                                       null,
                                       "img/jpeg",
                                       null);
  Assert.notEqual(decision,
                  Ci.nsIContentPolicy.ACCEPT,
                  "customized protocol should not load");
};


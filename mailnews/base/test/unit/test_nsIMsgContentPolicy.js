/* -*- mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgContentPolicy to check we could add/remove customized protocol to
 * nsMsgContentPolicy.
 */
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

function makeURI(aURL) {
  return Services.io.newURI(aURL);
}

function run_test() {
  var content_policy = Cc["@mozilla.org/messenger/content-policy;1"].getService(
    Ci.nsIContentPolicy
  );

  Assert.ok(content_policy);

  var msg_content_policy = content_policy.QueryInterface(
    Ci.nsIMsgContentPolicy
  );

  Assert.ok(msg_content_policy);

  var req_uri = makeURI("custom-scheme://custom_url/1.emal");
  Assert.ok(req_uri);

  var content_uri = makeURI("custom-scheme://custom_content_url/1.jsp");
  Assert.ok(content_uri);

  const tmpChannel = NetUtil.newChannel({
    uri: content_uri,
    // Needs one of 'loadingNode', 'loadingPrincipal' or 'loadUsingSystemPrincipal' which we don't have.
    // Even with `loadUsingSystemPrincipal: true` this fails with "unknown protocol". See bug 1446587.
    securityFlags: Ci.nsILoadInfo.SEC_ONLY_FOR_EXPLICIT_CONTENTSEC_CHECK,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
  });
  const tmpLoadInfo = tmpChannel.loadInfo;

  var decision = content_policy.shouldLoad(
    content_uri,
    tmpLoadInfo,
    "img/jpeg"
  );
  Assert.notEqual(
    decision,
    Ci.nsIContentPolicy.ACCEPT,
    "customized protocol should not load"
  );

  msg_content_policy.addExposedProtocol("custom-scheme");

  decision = content_policy.shouldLoad(content_uri, tmpLoadInfo, "img/jpeg");
  Assert.equal(
    decision,
    Ci.nsIContentPolicy.ACCEPT,
    "customized protocol should load"
  );

  msg_content_policy.removeExposedProtocol("custom-scheme");

  decision = content_policy.shouldLoad(content_uri, tmpLoadInfo, "img/jpeg");
  Assert.notEqual(
    decision,
    Ci.nsIContentPolicy.ACCEPT,
    "customized protocol should not load"
  );
}

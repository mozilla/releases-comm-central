/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests of override functionality using a demo "foo" type url.

var { JaBaseUrlProperties } = ChromeUtils.importESModule(
  "resource:///modules/jsaccount/JaBaseUrl.sys.mjs"
);

var extraInterfaces = [Ci.msgIFooUrl];

function newURL() {
  return Cc["@mozilla.org/jsaccount/testjafoourl;1"].createInstance(
    Ci.nsISupports
  );
}

var tests = [
  function testExists() {
    // test the existence of components and their interfaces.
    const url = newURL();
    for (const iface of JaBaseUrlProperties.baseInterfaces) {
      Assert.ok(url instanceof iface);
      const urlQI = url.QueryInterface(iface);
      // Since the URL wasn't properly initialised, that is, it has no spec
      // the following will crash. The underlying nsMsgMailNewsUrl
      // has no m_baseURL yet and hence GetSpec() triggered by the
      // Assert.uk(urlQI) will crash. So use this instead:
      Assert.ok(urlQI != null);
    }
    for (const iface of extraInterfaces) {
      const fooUrl = url.getInterface(iface);
      Assert.ok(fooUrl instanceof iface);
      Assert.ok(fooUrl.QueryInterface(iface) != null);
    }
  },
  function test_msgIOverride() {
    const url = newURL().QueryInterface(Ci.msgIOverride);

    // test of access to wrapped JS object.

    // Access the ._hidden attribute using the XPCOM interface,
    // where it is not defined.
    Assert.equal(typeof url.jsDelegate._hidden, "undefined");

    // Get the JS object, where _hidden IS defined.
    Assert.equal(url.jsDelegate.wrappedJSObject._hidden, "IAmHidden");
  },

  // We used to test nsIURI, nsIURL, and nsIMsgMailNewsUrl overrides, but those
  // can no longer be overridden.
  function test_nsIMsgMessageUrl() {
    const url = newURL().QueryInterface(Ci.nsIMsgMessageUrl);
    Assert.ok("originalSpec" in url);
    const appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    Assert.ok(appDir.path);
    // test attributes
    url.messageFile = appDir;
    Assert.equal(url.messageFile.path, appDir.path);
  },
  function test_msgIJaUrl() {
    const url = newURL().QueryInterface(Ci.msgIJaUrl);
    url.setUrlType(Ci.nsIMsgMailNewsUrl.eMove);
    Assert.ok(
      url
        .QueryInterface(Ci.nsIMsgMailNewsUrl)
        .IsUrlType(Ci.nsIMsgMailNewsUrl.eMove)
    );
  },
  function test_msgIFooUrl() {
    const url = newURL().QueryInterface(Ci.nsIInterfaceRequestor);
    const fooUrl = url.getInterface(Ci.msgIFooUrl);
    Assert.ok(fooUrl instanceof Ci.msgIFooUrl);

    fooUrl.itemId = "theItemId";
    Assert.equal(fooUrl.itemId, "theItemId");

    url.QueryInterface(Ci.msgIJaUrl).setSpec("https://foo.invalid/bar/");
    Assert.ok(!fooUrl.isAttachment);
    url
      .QueryInterface(Ci.msgIJaUrl)
      .setSpec("https://foo.invalid/bar?part=1.4&dummy=stuff");
    Assert.ok(fooUrl.isAttachment);
  },
];

function run_test() {
  for (var test of tests) {
    test();
  }
}

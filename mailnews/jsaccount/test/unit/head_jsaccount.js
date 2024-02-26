/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var CC = Components.Constructor;

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

// Load the test components.
const contracts = [
  {
    contractID: "@mozilla.org/jsaccount/testjafoourl;1",
    classID: "{73F98539-A59F-4F6F-9A72-D83A08646C23}",
    source: "resources/testJaFooUrlComponent.js",
  },
  {
    contractID: "@mozilla.org/mail/folder-factory;1?name=testja",
    classID: "{8508ddeb-3eab-4877-a420-297518f62371}",
    source: "resources/testJaBaseMsgFolderComponent.js",
  },
  {
    contractID: "@mozilla.org/messenger/server;1?type=testja",
    classID: "{0eec03cd-da67-4949-ab2d-5fa4bdc68135}",
    source: "resources/testJaBaseIncomingServerComponent.js",
  },
];

const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
for (const { contractID, classID, source } of contracts) {
  const scope = {};
  Services.scriptloader.loadSubScript(
    Services.io.newFileURI(do_get_file(source)).spec,
    scope
  );
  registrar.registerFactory(
    Components.ID(classID),
    "",
    contractID,
    scope.xpcomFactory
  );
}

// Ensure the profile directory is set up.
do_get_profile();

registerCleanupFunction(function () {
  load("../../../../mailnews/resources/mailShutdown.js");
});

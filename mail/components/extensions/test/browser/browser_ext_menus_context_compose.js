/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

let gAccount, gFolders, gMessage;
add_setup(async () => {
  await Services.search.init();

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolders = gAccount.incomingServer.rootFolder.subFolders;
  createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await fetch(`${URL_BASE}/content.html`).then(r => r.text()),
    },
  });
  gMessage = [...gFolders[0].messages][0];

  document.getElementById("tabmail").currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: gAccount.incomingServer.rootFolder.URI,
  });
});

async function subtest_compose(manifest) {
  const extension = await getMenuExtension(manifest);

  await extension.startup();
  await extension.awaitMessage("menus-created");

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.composeFields.body = await fetch(`${URL_BASE}/content_body.html`).then(
    r => r.text()
  );

  for (const ordinal of ["first", "second", "third", "fourth"]) {
    const attachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    attachment.name = `${ordinal}.txt`;
    attachment.url = `data:text/plain,I'm the ${ordinal} attachment!`;
    attachment.size = attachment.url.length - 16;
    params.composeFields.addAttachment(attachment);
  }

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  const composeDocument = composeWindow.document;
  await focusWindow(composeWindow);

  info("Test the message being composed.");

  const messagePane = composeWindow.GetCurrentEditorElement();

  await subtest_compose_body(
    extension,
    manifest.permissions?.includes("compose"),
    messagePane,
    "about:blank?compose",
    {
      active: true,
      index: 0,
      mailTab: false,
    }
  );

  const chromeElementsMap = {
    msgSubject: "composeSubject",
    toAddrInput: "composeTo",
  };
  for (const elementId of Object.keys(chromeElementsMap)) {
    info(`Test element ${elementId}.`);
    await subtest_element(
      extension,
      manifest.permissions?.includes("compose"),
      composeWindow.document.getElementById(elementId),
      "about:blank?compose",
      {
        active: true,
        index: 0,
        mailTab: false,
        fieldId: chromeElementsMap[elementId],
      }
    );
  }

  info("Test the attachments context menu.");

  composeWindow.toggleAttachmentPane("show");
  const menu = composeDocument.getElementById(
    "msgComposeAttachmentItemContext"
  );
  const attachmentBucket = composeDocument.getElementById("attachmentBucket");

  EventUtils.synthesizeMouseAtCenter(
    attachmentBucket.itemChildren[0],
    {},
    composeWindow
  );
  await rightClick(menu, attachmentBucket.itemChildren[0], composeWindow);
  Assert.ok(
    menu.querySelector("#menus_mochi_test-menuitem-_compose_attachments")
  );
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["compose_attachments"],
      contexts: ["compose_attachments", "all"],
      attachments: manifest.permissions?.includes("compose")
        ? [{ name: "first.txt", size: 25 }]
        : undefined,
    },
    { active: true, index: 0, mailTab: false }
  );

  attachmentBucket.addItemToSelection(attachmentBucket.itemChildren[3]);
  await rightClick(menu, attachmentBucket.itemChildren[0], composeWindow);
  Assert.ok(
    menu.querySelector("#menus_mochi_test-menuitem-_compose_attachments")
  );
  menu.hidePopup();

  await checkShownEvent(
    extension,
    {
      menuIds: ["compose_attachments"],
      contexts: ["compose_attachments", "all"],
      attachments: manifest.permissions?.includes("compose")
        ? [
            { name: "first.txt", size: 25 },
            { name: "fourth.txt", size: 26 },
          ]
        : undefined,
    },
    { active: true, index: 0, mailTab: false }
  );

  await extension.unload();

  await BrowserTestUtils.closeWindow(composeWindow);
}
add_task(async function test_compose_mv2() {
  return subtest_compose({
    manifest_version: 2,
    permissions: ["compose"],
  });
});
add_task(async function test_compose_no_permissions_mv2() {
  return subtest_compose({
    manifest_version: 2,
  });
});
add_task(async function test_compose_mv3() {
  return subtest_compose({
    manifest_version: 3,
    permissions: ["compose"],
  });
});
add_task(async function test_compose_no_permissions_mv3() {
  return subtest_compose({
    manifest_version: 3,
  });
});

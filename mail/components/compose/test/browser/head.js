/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

const generator = new MessageGenerator();

async function newComposeWindow() {
  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const [name, address] = generator.makeNameAndAddress();
  const subject = generator.makeSubject();
  params.composeFields.to = `"${name}" <${address}>`;
  params.composeFields.subject = subject;
  params.composeFields.body = `Hello ${name}!`;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  if (!composeWindow.composeEditorReady) {
    await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  }
  await SimpleTest.promiseFocus(composeWindow);

  return { composeWindow, subject };
}

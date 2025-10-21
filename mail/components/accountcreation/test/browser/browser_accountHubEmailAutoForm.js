/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let realName;
let manualConfigButton;
let email;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailAutoForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector("email-auto-form");
  realName = subview.querySelector("#realName");
  email = subview.querySelector("#email");
  manualConfigButton = subview.querySelector("#manualConfiguration");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_setState() {
  subview.setState();
  let userName = "";
  let focusedInput = realName;

  if ("@mozilla.org/userinfo;1" in Cc) {
    userName = Cc["@mozilla.org/userinfo;1"].getService(
      Ci.nsIUserInfo
    ).fullname;
    focusedInput = userName ? email : focusedInput;
  }

  Assert.equal(
    focusedInput,
    subview.ownerDocument.activeElement,
    "Correct input should be focused"
  );

  Assert.equal(realName.value, userName, "Name input value should be correct");
  Assert.equal(email.value, "", "Email input value should be empty");
});

add_task(async function test_resetState() {
  realName.value = "Name";
  email.value = "email@test.email";

  const invalidUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );

  subview.resetState();

  const inValid = await invalidUpdatedInput;
  let userName = "";

  if ("@mozilla.org/userinfo;1" in Cc) {
    userName = Cc["@mozilla.org/userinfo;1"].getService(
      Ci.nsIUserInfo
    ).fullname;
  }

  Assert.equal(realName.value, userName, "Name input value should be correct");
  Assert.equal(email.value, "", "Email input value should be empty");

  Assert.ok(
    !inValid.detail.completed,
    "Event should indicate the form is not complete"
  );
});

add_task(async function test_checkValidEmailForm() {
  subview.setState();
  EventUtils.synthesizeMouseAtCenter(email, {}, subview.ownerGlobal);
  // Windows 64 bit test builds need focus to be called on the input for
  // tests to pass.
  email.focus();

  let invalidUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => email.value === "test"
  );
  EventUtils.sendString("test", browser.contentWindow);
  let invalidUpdatedEvent = await invalidUpdatedInput;

  Assert.ok(
    !invalidUpdatedEvent.detail.completed,
    "Event should indicate the form is not complete"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(manualConfigButton),
    "Manual config button should be hidden"
  );
  Assert.equal(
    email.ariaInvalid,
    "true",
    "Email should have aria-invalid set to true"
  );

  realName.value = "";
  email.value = "";

  invalidUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => email.value === "test@test.com"
  );
  EventUtils.sendString("test@test.com", browser.contentWindow);
  invalidUpdatedEvent = await invalidUpdatedInput;

  Assert.ok(
    !invalidUpdatedEvent.detail.completed,
    "Event should indicate the form is not complete"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(manualConfigButton),
    "Manual config button should be hidden"
  );
  Assert.equal(
    email.ariaInvalid,
    "false",
    "Email should have aria-invalid set to false"
  );
  Assert.equal(
    realName.ariaInvalid,
    "true",
    "Name should have aria-invalid set to true"
  );

  realName.value = "Test Name";
  const validUpdatedInput = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );
  subview.checkValidEmailForm();

  const validUpdatedEvent = await validUpdatedInput;
  Assert.ok(
    validUpdatedEvent.detail.completed,
    "Event should indicate the form is complete"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigButton),
    "Manual config button should be visible"
  );
  Assert.equal(
    realName.ariaInvalid,
    "false",
    "Name should have aria-invalid set to false"
  );

  subview.resetState();
});

add_task(function test_captureState() {
  realName.value = "Test";
  email.value = "test@test.com";
  subview.checkValidEmailForm();

  Assert.deepEqual(
    subview.captureState(),
    {
      realName: "Test",
      email: "test@test.com",
    },
    "Should get the entered data in the captured state"
  );
  subview.resetState();
});

add_task(async function test_manualConfigEvent() {
  realName.value = "Test";
  email.value = "test@test.com";
  subview.checkValidEmailForm();

  Assert.ok(
    BrowserTestUtils.isVisible(manualConfigButton),
    "Manual config button should be visible"
  );
  const editConfigurationEvent = BrowserTestUtils.waitForEvent(
    subview,
    "edit-configuration"
  );

  EventUtils.synthesizeMouseAtCenter(
    manualConfigButton,
    {},
    subview.ownerGlobal
  );

  await editConfigurationEvent;
});

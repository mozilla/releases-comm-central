/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function checkABrowser(browser) {
  if (
    browser.ownerDocument.readyState != "complete" ||
    !browser.currentURI ||
    browser.currentURI?.spec == "about:blank"
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      false,
      url => url != "about:blank"
    );
  }

  const win = browser.ownerGlobal;
  const doc = browser.ownerDocument;

  // Date picker

  // Open the popup. Sometimes the click to open the date picker is ignored and
  // the test runs into a timeout. Adding a small delay here helps to prevent that.

  await new Promise(r => setTimeout(r, 250));
  info("Preparing to open the date picker.");
  const pickerPromise = BrowserTestUtils.waitForDateTimePickerPanelShown(
    win.top
  );

  await SpecialPowers.spawn(browser, [], function () {
    const input = content.document.querySelector(`input[type="date"]`);
    if (content.location.protocol == "mailbox:") {
      // Clicking doesn't open the pop-up in messages. Bug 1854293.
      content.document.notifyUserGestureActivation();
      input.showPicker();
    } else {
      EventUtils.synthesizeMouseAtCenter(
        input.openOrClosedShadowRoot.getElementById("calendar-button"),
        {},
        content
      );
    }
  });
  const picker = await pickerPromise;
  Assert.ok(!!picker, "Date picker was successfully opened");

  // Click in the middle of the picker. This should always land on a date and
  // close the picker.
  const frame = picker.querySelector("#dateTimePopupFrame");
  EventUtils.synthesizeMouseAtCenter(
    frame.contentDocument.querySelector(".days-view td"),
    {},
    frame.contentWindow
  );
  await BrowserTestUtils.waitForPopupEvent(picker, "hidden");

  // Check the date was assigned to the input.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.ok(
      content.document.querySelector(`input[type="date"]`).value,
      "date input should have a date value"
    );
  });

  // Select drop-down

  const menulist = win.top.document.getElementById("ContentSelectDropdown");

  // Click on the select control to open the popup.
  const selectPromise = BrowserTestUtils.waitForSelectPopupShown(win.top);
  await BrowserTestUtils.synthesizeMouseAtCenter("select", {}, browser);
  const menupopup = await selectPromise;

  Assert.equal(menulist.value, "0");
  Assert.equal(menupopup.childElementCount, 3);
  // Item values do not match the content document, but are 0-indexed.
  Assert.equal(menupopup.children[0].label, "");
  Assert.equal(menupopup.children[0].value, "0");
  Assert.equal(menupopup.children[1].label, "π");
  Assert.equal(menupopup.children[1].value, "1");
  Assert.equal(menupopup.children[2].label, "τ");
  Assert.equal(menupopup.children[2].value, "2");

  // Click the second option. This sets the value and closes the menulist.
  menupopup.activateItem(menupopup.children[1]);
  await BrowserTestUtils.waitForPopupEvent(menulist, "hidden");

  // Sometimes the next change doesn't happen soon enough.

  await new Promise(r => setTimeout(r, 1000));

  // Check the value was assigned to the control.
  await SpecialPowers.spawn(browser, [], () => {
    Assert.equal(content.document.querySelector("select").value, "3.141592654");
  });

  // Input auto-complete

  const popup = doc.getElementById(browser.getAttribute("autocompletepopup"));
  Assert.ok(popup, "auto-complete popup exists");

  // Click on the input box and type some letters to open the popup.
  const shownPromise = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  browser.focus();
  await SimpleTest.promiseFocus(browser);
  await SpecialPowers.spawn(browser, [], () => {
    const input = content.document.querySelector(`input[list="letters"]`);
    input.focus();
    EventUtils.synthesizeKey("e", {}, content);
    EventUtils.synthesizeKey("t", {}, content);
    EventUtils.synthesizeKey("a", {}, content);
    Assert.equal(input.value, "eta");
  });
  await shownPromise;

  // Allow the popup time to initialise.
  await new Promise(r => win.setTimeout(r, 500));

  const list = popup.querySelector("richlistbox");
  Assert.ok(list, "list added to popup");
  Assert.equal(list.itemCount, 4);
  Assert.equal(list.itemChildren[0].getAttribute("title"), "beta");
  Assert.equal(list.itemChildren[1].getAttribute("title"), "zeta");
  Assert.equal(list.itemChildren[2].getAttribute("title"), "eta");
  Assert.equal(list.itemChildren[3].getAttribute("title"), "theta");

  // Click the second option. This sets the value and closes the popup.
  EventUtils.synthesizeMouseAtCenter(list.itemChildren[1], {}, win);
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

  await SpecialPowers.spawn(browser, [], () => {
    // Check the value was assigned to the input.
    const input = content.document.querySelector(`input[list="letters"]`);
    Assert.equal(content.document.activeElement, input, "input has focus");
    Assert.equal(input.value, "zeta");

    // Type some more characters.
    // Check the space character isn't consumed by cmd_space.
    EventUtils.sendString(" function", content);
    Assert.equal(input.value, "zeta function");
  });

  // Check that a <details> element can be opened and closed by clicking or
  // pressing enter/space on its <summary>.
  await SpecialPowers.spawn(browser, [], () => {
    const details = content.document.querySelector("details");
    const summary = details.querySelector("summary");

    Assert.ok(!details.open, "details element should be closed initially");
    EventUtils.synthesizeMouseAtCenter(summary, {}, content);
    Assert.ok(details.open, "details element should open on click");
    EventUtils.synthesizeKey("VK_SPACE", {}, content);
    Assert.ok(!details.open, "details element should close on space key press");
    EventUtils.synthesizeKey("VK_RETURN", {}, content);
    Assert.ok(details.open, "details element should open on return key press");
  });
}

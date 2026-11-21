/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let doc;
let dialog;
let calendar;
let axeWatcher;
let createEditDialog;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser);
  await SimpleTest.promiseFocus(browser);
  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  calendar = createCalendar({ type: "memory" });
  cal.view.getCompositeCalendar(browser.contentWindow).defaultCalendar =
    calendar;
  axeWatcher = await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "The Description editor should pass accessibility checks.",
    specialPowers: SpecialPowers,
    autoFinish: false,
  });

  registerCleanupFunction(async () => {
    await axeWatcher?.finish();
    dialog?.close();
    createEditDialog?.close();
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);

    if (calendar) {
      CalendarTestUtils.removeCalendar(calendar);
    }
  });
});

/**
 * Opens Description and waits for the editable area to receive focus.
 *
 * @param {HTMLDialogElement} [eventDialog=dialog] - The open event dialog.
 * @param {Window} [dialogWindow=browser.contentWindow] - The window for
 *   Description navigation clicks.
 * @returns {Promise<{frame: HTMLIFrameElement, editorDoc: Document,
 *   input: HTMLDivElement, back: HTMLButtonElement}>} Resolves with the editor
 *   controls after the editable area receives focus.
 */
async function openEditor(
  eventDialog = dialog,
  dialogWindow = browser.contentWindow
) {
  const row = eventDialog.querySelector("#descriptionNavigationRow");
  const subview = eventDialog.querySelector(
    "calendar-event-description-subview"
  );

  EventUtils.synthesizeMouseAtCenter(
    row.shadowRoot.querySelector("button"),
    {},
    dialogWindow
  );

  const frame = subview.querySelector(".calendar-description-frame");

  Assert.ok(frame, "Description should mount an editor frame.");
  await TestUtils.waitForCondition(
    () =>
      frame.contentDocument?.querySelector(
        ".description-input[contenteditable]"
      ),
    "The Description frame should load Squire."
  );

  const editorDoc = frame.contentDocument;
  const input = editorDoc.querySelector(".description-input");
  const back = subview.shadowRoot.querySelector("button");

  Assert.ok(
    BrowserTestUtils.isVisible(subview),
    "Description should be visible."
  );
  await TestUtils.waitForCondition(
    () => editorDoc.activeElement == input,
    "Description should focus the editor."
  );

  return { frame, editorDoc, input, back };
}

add_task(async function test_formattingAndBack() {
  dialog.setCalendarEventRoute();
  const shown = await dialog.show();
  Assert.ok(shown, "The create dialog should open.");

  const { frame, editorDoc, input, back } = await openEditor();
  const editorWindow = frame.contentWindow;

  Assert.ok(
    !editorDoc.querySelector(".description-more"),
    "The Description toolbar should not have a More menu."
  );

  EventUtils.sendString("Description text", editorWindow);
  await TestUtils.waitForCondition(
    () => dialog.draft.description.includes("Description text"),
    "Typing should update the Description draft."
  );
  const selection = editorWindow.getSelection();
  selection.selectAllChildren(input.firstElementChild);
  const bold = editorDoc.querySelector('[data-format="bold"]');

  bold.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);

  await TestUtils.waitForCondition(
    () => dialog.draft.description.includes("<b>Description text</b>"),
    "Keyboard activation should apply bold to the selected text."
  );
  Assert.equal(
    selection.toString(),
    "Description text",
    "A draft update should retain the selection."
  );
  Assert.equal(
    bold.ariaPressed,
    "true",
    "The Bold button should expose its selected state."
  );
  const draft = dialog.draft.description;

  back.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(back, {}, browser.contentWindow);

  const row = dialog.querySelector("#descriptionNavigationRow");

  Assert.equal(
    row.shadowRoot.activeElement,
    row.shadowRoot.querySelector("button"),
    "Back should return focus to the Description navigation button."
  );
  Assert.equal(
    dialog.draft.description,
    draft,
    "Back should keep the serializable Description draft."
  );

  const reopened = await openEditor();

  Assert.equal(
    reopened.input.textContent,
    "Description text",
    "The editor should retain its text."
  );

  const position = dialog.getBoundingClientRect().toJSON();
  const line = reopened.editorDoc.createElement("div");

  line.textContent = "Long description ".repeat(1000);
  reopened.input.append(line);
  Assert.greater(
    reopened.input.scrollHeight,
    reopened.input.clientHeight,
    "Long descriptions should scroll within the editor."
  );
  Assert.deepEqual(
    dialog.getBoundingClientRect().toJSON(),
    position,
    "Long descriptions should preserve the dialog's size and position."
  );

  dialog.setCalendarEventRoute();
  const replaced = await dialog.show();
  Assert.ok(replaced, "The replacement route should become ready.");
  const replacement = await openEditor();

  Assert.equal(
    replacement.input.textContent,
    "",
    "The replacement route should start with an empty Description."
  );
  dialog.close();
});

add_task(async function test_modalLinkPopup() {
  dialog.setCalendarEventRoute();
  const shown = await dialog.show();
  Assert.ok(shown, "The create dialog should open.");

  const { frame, editorDoc, input } = await openEditor();
  const editorWindow = frame.contentWindow;
  const selection = editorWindow.getSelection();
  const toolbar = editorDoc.querySelector(".description-formatting");
  const link = toolbar.querySelector('[data-format="link"]');
  const bold = toolbar.querySelector('[data-format="bold"]');
  const popup = editorDoc.querySelector(".description-link-popup");
  const address = popup.querySelector("input");
  const text = "Link this text";

  EventUtils.sendString(text, editorWindow);
  selection.selectAllChildren(input.firstElementChild);
  EventUtils.synthesizeMouseAtCenter(link, {}, editorWindow);

  Assert.ok(popup.matches(":modal"), "The link popup should open as a modal.");
  Assert.equal(
    editorDoc.activeElement,
    address,
    "Opening the link popup should focus the address field."
  );

  for (const control of [input, bold]) {
    control.focus();
    Assert.equal(
      editorDoc.activeElement,
      address,
      "The link popup should block focus outside the popup in the editor."
    );
  }

  const canceled = BrowserTestUtils.waitForEvent(popup, "close");
  EventUtils.synthesizeKey("KEY_Escape", {}, editorWindow);
  await canceled;

  Assert.ok(!popup.open, "Escape should close the link popup.");
  Assert.ok(dialog.open, "Escape should keep the event dialog open.");
  Assert.equal(
    editorDoc.activeElement,
    input,
    "Focus should return to the editor."
  );
  Assert.equal(
    selection.toString(),
    text,
    "Cancel should keep the selected text."
  );

  EventUtils.synthesizeMouseAtCenter(link, {}, editorWindow);
  const url = "https://example.com/";
  EventUtils.sendString(url, editorWindow);
  const applied = BrowserTestUtils.waitForEvent(popup, "close");
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await applied;

  await TestUtils.waitForCondition(
    () => dialog.draft.description.includes(`href="${url}"`),
    "Applying the link should update the draft."
  );
  Assert.equal(
    input.querySelector("a")?.textContent,
    text,
    "Applying the link should use the originally selected text."
  );
  Assert.ok(!popup.open, "Applying the link should close the link popup.");
  Assert.equal(
    editorDoc.activeElement,
    input,
    "Focus should return to the editor."
  );

  dialog.close();
});

add_task(async function test_editorRendersSavedDescription() {
  const event = await createEvent({
    calendar,
    descriptionHTML:
      '<h2 id="squire-selection-start">Agenda</h2><pre id="squire-selection-end" style="text-align: right">Notes</pre><p><em aria-pressed="true" class="squire-image-resize-container" data-l10n-id="calendar-description-invalid-link">First</em><img src="bad"><a href="javascript:alert(1)">unsafe</a></p>',
  });

  dialog.setCalendarEventRoute({ calendarId: calendar.id, eventId: event.id });
  const shown = await dialog.show();

  Assert.ok(shown, "The stored event should open in edit mode.");
  const { frame, editorDoc, input } = await openEditor();
  const originalDescription = dialog.draft.description;

  Assert.ok(
    input.querySelector("h2"),
    "The editor should preserve the stored heading."
  );
  Assert.equal(
    input.querySelector("i")?.textContent,
    "First",
    "The editor should preserve italic text from the description."
  );
  Assert.ok(
    !input.querySelector("img, a[href]"),
    "The editor should exclude unsafe content."
  );
  const notes = input.querySelector("pre");

  Assert.ok(notes, "The editor should preserve the preformatted block.");
  Assert.equal(
    frame.contentWindow.getComputedStyle(notes).textAlign,
    "right",
    "The editor should apply the stored inline alignment."
  );
  Assert.ok(
    dialog.draft.description.includes("First"),
    "The draft should keep text that uses an editor control class."
  );

  const editor = input.closest("calendar-description-editor");

  editor.setDocument("<div>Another draft</div>");
  editor.setDocument(dialog.draft.description);
  Assert.equal(
    frame.contentWindow.getComputedStyle(input.querySelector("pre")).textAlign,
    "right",
    "The editor should restore the stored alignment of the preformatted block."
  );

  const selection = frame.contentWindow.getSelection();

  selection.selectAllChildren(input.querySelector("pre"));
  EventUtils.synthesizeMouseAtCenter(
    editorDoc.querySelector('[data-format="link"]'),
    {},
    frame.contentWindow
  );

  const linkForm = editorDoc.querySelector(".description-link-form");
  const address = linkForm.querySelector("input");

  address.value = "javascript:alert(1)";
  linkForm.requestSubmit();
  await TestUtils.waitForCondition(
    () => !address.validity.valid,
    "The link form should reject a script URL."
  );

  address.value = "tel:+15551234";
  address.dispatchEvent(
    new frame.contentWindow.Event("input", { bubbles: true })
  );
  linkForm.requestSubmit();
  await TestUtils.waitForCondition(
    () => dialog.draft.description.includes('href="tel:+15551234"'),
    "The link form should accept a telephone link allowed by Calendar."
  );

  const undo = editorDoc.querySelector('[data-format="undo"]');

  undo.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, frame.contentWindow);
  await TestUtils.waitForCondition(
    () => dialog.draft.description == originalDescription,
    "Undo should restore the original Description draft after editing a link."
  );
  Assert.equal(
    frame.contentWindow.getComputedStyle(input.querySelector("pre")).textAlign,
    "right",
    "Undo should preserve the stored alignment of the preformatted block."
  );
  Assert.ok(
    selection.isCollapsed,
    "Undo should restore the saved Description's initial caret."
  );

  dialog.close();
});

add_task(async function test_toolbarHistory() {
  dialog.setCalendarEventRoute();
  await dialog.show();

  const { frame, editorDoc, input } = await openEditor();
  const editorWindow = frame.contentWindow;
  const undo = editorDoc.querySelector('[data-format="undo"]');
  const redo = editorDoc.querySelector('[data-format="redo"]');
  const strike = editorDoc.querySelector('[data-format="strikethrough"]');

  Assert.ok(undo.disabled, "A new Description should have no change to undo.");
  Assert.ok(redo.disabled, "A new Description should have no change to redo.");
  await SimpleTest.promiseFocus(editorWindow);
  EventUtils.sendString("Review notes", editorWindow);
  await TestUtils.waitForCondition(
    () => !undo.disabled,
    "Typing should enable Undo."
  );

  const selection = editorWindow.getSelection();

  selection.selectAllChildren(input.firstElementChild);
  const unpressedBackground =
    editorWindow.getComputedStyle(strike).backgroundColor;

  strike.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await TestUtils.waitForCondition(
    () => strike.ariaPressed == "true" && !!input.querySelector("s"),
    "Strikethrough should apply to the selected text."
  );
  await TestUtils.waitForCondition(
    () =>
      editorWindow.getComputedStyle(strike).backgroundColor !=
      unpressedBackground,
    "Selected formatting should have a visible pressed background."
  );

  undo.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await TestUtils.waitForCondition(
    () => !input.querySelector("s") && !redo.disabled,
    "Undo should remove strikethrough and enable Redo."
  );
  Assert.equal(
    input.textContent,
    "Review notes",
    "Undo should preserve the Description text."
  );
  Assert.equal(
    selection.toString(),
    "Review notes",
    "Undo should restore the selected text."
  );
  Assert.equal(
    editorDoc.activeElement,
    input,
    "Undo should return focus to the editor."
  );
  Assert.ok(
    !input.querySelector("input"),
    "Undo should remove its temporary selection bookmarks."
  );

  redo.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await TestUtils.waitForCondition(
    () => !!input.querySelector("s") && redo.disabled,
    "Redo should restore strikethrough and consume the redo history."
  );
  Assert.equal(
    selection.toString(),
    "Review notes",
    "Redo should restore the selected text."
  );
  Assert.equal(
    editorDoc.activeElement,
    input,
    "Redo should return focus to the editor."
  );
  Assert.ok(
    !input.querySelector("input"),
    "Redo should remove its temporary selection bookmarks."
  );

  undo.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await TestUtils.waitForCondition(
    () => !input.querySelector("s"),
    "Undo should remove the restored strikethrough."
  );

  undo.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);
  await TestUtils.waitForCondition(
    () => undo.disabled && dialog.draft.description == "",
    "Undoing all changes should restore the empty Description draft."
  );
  Assert.ok(
    input.querySelector("div > br"),
    "The empty Description should retain an editable line."
  );
  Assert.ok(
    selection.isCollapsed,
    "The empty Description should have a caret."
  );
  Assert.ok(!redo.disabled, "Undoing all changes should keep Redo available.");

  EventUtils.sendString("New notes", editorWindow);
  await TestUtils.waitForCondition(
    () => dialog.draft.description.includes("New notes") && redo.disabled,
    "Typing after Undo should update the draft and discard Redo history."
  );

  input
    .closest("calendar-description-editor")
    .setDocument("<div>Replacement</div>");
  Assert.ok(undo.disabled, "Loading a new document should clear Undo history.");
  Assert.ok(redo.disabled, "Loading a new document should clear Redo history.");
  dialog.close();
});

add_task(async function test_descriptionEditorInCalendarTab() {
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.event.createEditDialog.enabled", true]],
  });
  await CalendarTestUtils.openCalendarTab(window);
  const event = await createEvent({
    calendar,
    descriptionHTML: "<div>Saved <b>review notes</b></div>",
  });
  await window.showCalendarEventCreateEditDialog(event);
  createEditDialog = document.getElementById("calendarEventCreateEditDialog");
  const row = createEditDialog.querySelector("#descriptionNavigationRow");
  const label = row.querySelector('[slot="label"]');
  const contentSlot = row.shadowRoot.querySelector('slot[name="content"]');
  const subview = createEditDialog.querySelector(
    "calendar-event-description-subview"
  );

  const [preview] = contentSlot.assignedElements();

  Assert.ok(
    preview,
    "The main dialog should show a saved Description preview."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(preview),
    "The saved Description preview should be visible before opening the editor."
  );
  Assert.equal(
    preview.textContent,
    "Saved review notes",
    "The preview should show the saved Description as plain text."
  );
  Assert.equal(
    document.l10n.getAttributes(label).id,
    "calendar-dialog-description-label",
    "A populated row should have the Description label."
  );

  EventUtils.synthesizeMouseAtCenter(
    row.shadowRoot.querySelector("button"),
    {},
    window
  );

  const frame = subview.querySelector(".calendar-description-frame");

  Assert.ok(frame, "The Description subview should have an editor frame.");
  await TestUtils.waitForCondition(
    () =>
      frame.contentDocument?.querySelector(
        ".description-input[contenteditable]"
      ),
    "The Description editor should have an editable text area."
  );
  const editorDoc = frame.contentDocument;
  const input = editorDoc.querySelector(".description-input");
  await TestUtils.waitForCondition(
    () => input.textContent == "Saved review notes",
    "The Description editor should show the saved text."
  );
  Assert.ok(
    input.querySelector("b"),
    "The Description editor should show the saved bold formatting."
  );
  Assert.greater(
    input.clientHeight,
    editorDoc.querySelector(".description-formatting").clientHeight,
    "The Description text area should be taller than the formatting toolbar."
  );
  Assert.greaterOrEqual(
    editorDoc.querySelector(".description-formatting").getBoundingClientRect()
      .top,
    0,
    "The toolbar should start at or below the top of the editor frame."
  );
  Assert.lessOrEqual(
    Math.round(input.getBoundingClientRect().bottom),
    editorDoc.documentElement.clientHeight,
    "The text area should end at or above the bottom of the editor frame."
  );
  await TestUtils.waitForCondition(
    () => editorDoc.activeElement == input,
    "The Description editor should receive focus after loading."
  );

  await SimpleTest.promiseFocus(frame.contentWindow);
  EventUtils.sendString("Updated ", frame.contentWindow);
  await TestUtils.waitForCondition(
    () => createEditDialog.draft.description.includes("Updated"),
    "The Description draft should include the text typed in the editor."
  );

  const back = subview.shadowRoot.querySelector("button");
  const backBounds = back.getBoundingClientRect();
  const containerBounds = createEditDialog.container.getBoundingClientRect();

  Assert.greaterOrEqual(
    backBounds.top,
    containerBounds.top,
    "The Back button should start at or below the Calendar container's top."
  );
  Assert.lessOrEqual(
    backBounds.bottom,
    containerBounds.bottom,
    "The Back button should end at or above the Calendar container's bottom."
  );

  EventUtils.synthesizeMouseAtCenter(back, {}, window);
  Assert.ok(
    BrowserTestUtils.isVisible(preview),
    "The Description preview should be visible after Back."
  );
  Assert.ok(
    preview.textContent.includes("Updated"),
    "The Description preview should show unsaved edits after Back."
  );

  EventUtils.synthesizeMouseAtCenter(
    row.shadowRoot.querySelector("button"),
    {},
    window
  );
  Assert.equal(
    subview.querySelector(".calendar-description-frame"),
    frame,
    "Reopening Description after Back should reuse the same editor frame."
  );
  await TestUtils.waitForCondition(
    () => editorDoc.activeElement == input,
    "Returning to Description should focus the retained editor input."
  );

  createEditDialog.close();
  await window.showCalendarEventCreateEditDialog();

  Assert.equal(
    contentSlot.assignedElements().length,
    0,
    "A new event should have no Description preview."
  );
  Assert.equal(
    document.l10n.getAttributes(label).id,
    "calendar-event-add-description",
    "An empty row should have the Add description label."
  );

  EventUtils.synthesizeMouseAtCenter(
    row.shadowRoot.querySelector("button"),
    {},
    window
  );
  const replacement = subview.querySelector(".calendar-description-frame");

  Assert.ok(replacement, "The new route should mount an editor frame.");
  Assert.notEqual(
    replacement,
    frame,
    "A new route should create a new editor session."
  );
  await TestUtils.waitForCondition(
    () =>
      replacement.contentDocument?.querySelector(
        ".description-input[contenteditable]"
      ),
    "The replacement editor should initialize for the new route."
  );
  Assert.equal(
    replacement.contentDocument.querySelector(".description-input").textContent,
    "",
    "A new event should not inherit the previous Description."
  );
  createEditDialog.close();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_saveFormattedDescription() {
  await SpecialPowers.pushPrefEnv({
    set: [["calendar.event.createEditDialog.enabled", true]],
  });
  await CalendarTestUtils.openCalendarTab(window);

  const event = await createEvent({ calendar });

  await window.showCalendarEventCreateEditDialog(event);
  createEditDialog = document.getElementById("calendarEventCreateEditDialog");

  Assert.deepEqual(
    createEditDialog.dirtySections,
    [],
    "Opening the event should leave the draft unchanged."
  );

  const { frame, editorDoc, input, back } = await openEditor(
    createEditDialog,
    window
  );
  const editorWindow = frame.contentWindow;
  const descriptionText = "Meeting agenda";

  await SimpleTest.promiseFocus(editorWindow);
  EventUtils.sendString(descriptionText, editorWindow);

  await TestUtils.waitForCondition(
    () => createEditDialog.draft.description.includes(descriptionText),
    "The Description draft should include the typed text."
  );

  const selection = editorWindow.getSelection();
  const bold = editorDoc.querySelector('[data-format="bold"]');

  selection.selectAllChildren(input.firstElementChild);
  bold.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, editorWindow);

  await TestUtils.waitForCondition(
    () =>
      createEditDialog.draft.description.includes(`<b>${descriptionText}</b>`),
    "The Description draft should include the text in bold."
  );

  back.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(back, {}, window);

  const saveButton = createEditDialog.querySelector(".calendar-event-save");

  Assert.deepEqual(
    createEditDialog.dirtySections,
    ["description"],
    "Only the Description should change before Save."
  );
  Assert.ok(
    BrowserTestUtils.isVisible(saveButton),
    "Save should be visible after returning to the main dialog."
  );
  Assert.ok(
    !saveButton.disabled,
    "Save should be enabled after editing only the Description."
  );

  const closed = BrowserTestUtils.waitForEvent(createEditDialog, "close");

  saveButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(saveButton, {}, window);
  await closed;

  const savedEvent = await calendar.getItem(event.id);

  Assert.ok(savedEvent, "Save should keep the edited event in its calendar.");
  await window.showCalendarEventCreateEditDialog(savedEvent);

  const { input: savedInput } = await openEditor(createEditDialog, window);

  Assert.equal(
    savedInput.textContent,
    descriptionText,
    "Reopening the event should show the saved Description text."
  );
  Assert.equal(
    savedInput.querySelector("b")?.textContent,
    descriptionText,
    "Reopening the event should show the saved text in bold."
  );

  createEditDialog.close();
  await SpecialPowers.popPrefEnv();
});

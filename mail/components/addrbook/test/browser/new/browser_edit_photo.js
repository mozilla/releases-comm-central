/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: Fix the UI so that we don't have to do this.
window.maximize();

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);
const personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;

let photo1Name, photo1Path;

async function inEditingMode() {
  let abWindow = getAddressBookWindow();
  await TestUtils.waitForCondition(
    () => abWindow.detailsPane.isEditing,
    "entering editing mode"
  );
}

async function notInEditingMode() {
  let abWindow = getAddressBookWindow();
  await TestUtils.waitForCondition(
    () => !abWindow.detailsPane.isEditing,
    "leaving editing mode"
  );
}

async function waitForDialogOpenState(state) {
  let abWindow = getAddressBookWindow();
  let dialog = abWindow.document.getElementById("photoDialog");
  await TestUtils.waitForCondition(
    () => dialog.open == state,
    "waiting for photo dialog to change state"
  );
  await new Promise(resolve => abWindow.setTimeout(resolve));
}

async function waitForPreviewChange() {
  let abWindow = getAddressBookWindow();
  let preview = abWindow.document.querySelector("#photoDialog svg > image");
  let oldValue = preview.getAttribute("href");
  await BrowserTestUtils.waitForEvent(
    preview,
    "load",
    false,
    () => preview.getAttribute("href") != oldValue
  );
  await new Promise(resolve => abWindow.requestAnimationFrame(resolve));
}

async function waitForPhotoChange() {
  let abWindow = getAddressBookWindow();
  let photo = abWindow.document.getElementById("photo");
  let dialog = abWindow.document.getElementById("photoDialog");
  let oldValue = photo.style.backgroundImage;
  await BrowserTestUtils.waitForMutationCondition(
    photo,
    { attributes: true },
    () => photo.style.backgroundImage != oldValue
  );
  await new Promise(resolve => abWindow.requestAnimationFrame(resolve));
  Assert.ok(!dialog.open, "dialog was closed when photo changed");
}

function dropFile(target, path) {
  let abWindow = getAddressBookWindow();
  let file = new FileUtils.File(getTestFilePath(path));

  let dataTransfer = new DataTransfer();
  dataTransfer.dropEffect = "copy";
  dataTransfer.mozSetDataAt("application/x-moz-file", file, 0);

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_COPY);
  dragService.getCurrentSession().dataTransfer = dataTransfer;

  EventUtils.synthesizeDragOver(
    target,
    target,
    [{ type: "application/x-moz-file", data: file }],
    "copy",
    abWindow
  );

  // This make sure that the fake dataTransfer has still the expected drop
  // effect after the synthesizeDragOver call.
  dataTransfer.dropEffect = "copy";

  EventUtils.synthesizeDropAfterDragOver(null, dataTransfer, target, abWindow, {
    _domDispatchOnly: true,
  });

  dragService.endDragSession(true);
}

function checkDialogElements({
  dropTargetClass = "",
  svgVisible = false,
  saveButtonVisible = false,
  saveButtonDisabled = false,
  discardButtonVisible = false,
}) {
  let abWindow = getAddressBookWindow();
  let dialog = abWindow.document.getElementById("photoDialog");
  let { saveButton, discardButton } = dialog;
  let dropTarget = dialog.querySelector("#photoDropTarget");
  let svg = dialog.querySelector("svg");
  Assert.equal(
    BrowserTestUtils.is_visible(dropTarget),
    !!dropTargetClass,
    "drop target visibility"
  );
  if (dropTargetClass) {
    Assert.stringContains(
      dropTarget.className,
      dropTargetClass,
      "drop target message"
    );
  }
  Assert.equal(BrowserTestUtils.is_visible(svg), svgVisible, "SVG visibility");
  Assert.equal(
    BrowserTestUtils.is_visible(saveButton),
    saveButtonVisible,
    "save button visibility"
  );
  Assert.equal(
    saveButton.disabled,
    saveButtonDisabled,
    "save button disabled state"
  );
  Assert.equal(
    BrowserTestUtils.is_visible(discardButton),
    discardButtonVisible,
    "discard button visibility"
  );
}

function setInputValues(changes) {
  let abWindow = getAddressBookWindow();

  for (let [key, value] of Object.entries(changes)) {
    abWindow.document.getElementById(key).select();
    if (value) {
      EventUtils.sendString(value);
    } else {
      EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
    }
  }
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
}

add_task(async function setUp() {
  await openAddressBookWindow();
  openDirectory(personalBook);
});

registerCleanupFunction(async function cleanUp() {
  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});

/** Create a new contact. We'll add a photo to this contact. */
add_task(async function test_add_photo() {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let saveEditButton = abDocument.getElementById("saveEditButton");
  let photo = abDocument.getElementById("photo");
  let dialog = abWindow.document.getElementById("photoDialog");
  let { saveButton } = dialog;

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // Open the photo dialog by clicking on the photo.

  Assert.equal(photo.style.backgroundImage, "", "no photo shown");
  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);

  checkDialogElements({
    dropTargetClass: "drop-target",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  // Drop a file on the photo dialog.

  let previewChangePromise = waitForPreviewChange();
  dropFile(dialog, "data/photo1.jpg");
  await previewChangePromise;

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
  });

  // Accept the photo dialog.

  let photoChangePromise = waitForPhotoChange();
  EventUtils.synthesizeMouseAtCenter(saveButton, {}, abWindow);
  await photoChangePromise;
  Assert.notEqual(photo.style.backgroundImage, "", "a photo is shown");

  // Save the contact and check the photo was saved.

  setInputValues({
    DisplayName: "Person with Photo 1",
  });
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  let [card] = personalBook.childCards;
  photo1Name = card.getProperty("PhotoName", "");
  Assert.ok(photo1Name, "PhotoName property saved on card");

  photo1Path = PathUtils.join(profileDir, "Photos", photo1Name);
  let photo1File = new FileUtils.File(photo1Path);
  Assert.ok(photo1File.exists(), "photo saved to disk");

  let image = new Image();
  let loadedPromise = BrowserTestUtils.waitForEvent(image, "load");
  image.src = Services.io.newFileURI(photo1File).spec;
  await loadedPromise;

  Assert.equal(image.naturalWidth, 300, "photo saved at correct width");
  Assert.equal(image.naturalHeight, 300, "photo saved at correct height");
});

/** Create another new contact. This time we'll add a photo, but discard it. */
add_task(async function test_dont_add_photo() {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let saveEditButton = abDocument.getElementById("saveEditButton");
  let photo = abDocument.getElementById("photo");
  let dialog = abWindow.document.getElementById("photoDialog");
  let { saveButton, cancelButton, discardButton } = dialog;
  let svg = dialog.querySelector("svg");

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // Drop a file on the photo.

  dropFile(photo, "data/photo2.jpg");
  await waitForDialogOpenState(true);
  await TestUtils.waitForCondition(() => BrowserTestUtils.is_visible(svg));

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
  });

  // Cancel the photo dialog.

  EventUtils.synthesizeMouseAtCenter(cancelButton, {}, abWindow);
  await waitForDialogOpenState(false);
  Assert.equal(photo.style.backgroundImage, "", "no photo shown");

  // Open the photo dialog by clicking on the photo.

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);

  checkDialogElements({
    dropTargetClass: "drop-target",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  // Drop a file on the photo dialog.

  let previewChangePromise = waitForPreviewChange();
  dropFile(dialog, "data/photo1.jpg");
  await previewChangePromise;

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
  });

  // Drop another file on the photo dialog.

  previewChangePromise = waitForPreviewChange();
  dropFile(dialog, "data/photo2.jpg");
  await previewChangePromise;

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
  });

  // Accept the photo dialog.

  let photoChangePromise = waitForPhotoChange();
  EventUtils.synthesizeMouseAtCenter(saveButton, {}, abWindow);
  await photoChangePromise;
  Assert.notEqual(photo.style.backgroundImage, "", "a photo is shown");

  // Open the photo dialog by clicking on the photo.

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
    discardButtonVisible: true,
  });

  // Click to discard the photo.

  photoChangePromise = waitForPhotoChange();
  EventUtils.synthesizeMouseAtCenter(discardButton, {}, abWindow);
  await photoChangePromise;

  // Open the photo dialog by clicking on the photo.

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);

  checkDialogElements({
    dropTargetClass: "drop-target",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  EventUtils.synthesizeMouseAtCenter(cancelButton, {}, abWindow);
  await waitForDialogOpenState(false);

  // Save the contact and check the photo was NOT saved.

  setInputValues({
    DisplayName: "Person with Photo 2",
  });
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  let [, card] = personalBook.childCards;
  Assert.equal(
    card.getProperty("PhotoName", "NO VALUE"),
    "NO VALUE",
    "PhotoName property not saved on card"
  );
});

/** Go back to the first contact and discard the photo. */
add_task(async function test_discard_photo() {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let cardsList = abDocument.getElementById("cards");
  let editButton = abDocument.getElementById("editButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");
  let photo = abDocument.getElementById("photo");
  let dialog = abWindow.document.getElementById("photoDialog");
  let { discardButton } = dialog;

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Open the photo dialog by clicking on the photo.

  Assert.stringContains(
    photo.style.backgroundImage,
    photo1Name,
    "saved photo shown"
  );

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);

  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
    discardButtonVisible: true,
  });

  // Click to discard the photo.

  let photoChangePromise = waitForPhotoChange();
  EventUtils.synthesizeMouseAtCenter(discardButton, {}, abWindow);
  await photoChangePromise;

  // Save the contact and check the photo was removed.

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  let [card] = personalBook.childCards;
  Assert.equal(
    card.getProperty("PhotoName", "NO VALUE"),
    "NO VALUE",
    "PhotoName property removed from card"
  );
  Assert.ok(
    !new FileUtils.File(photo1Path).exists(),
    "photo removed from disk"
  );
});

add_task(async function test_paste_url() {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let photo = abDocument.getElementById("photo");
  let dropTarget = abDocument.getElementById("photoDropTarget");

  let transfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  transfer.init(null);
  transfer.addDataFlavor("text/unicode");
  let wrapper = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );

  // Start a new contact and focus on the photo button.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  Assert.equal(photo.style.backgroundImage, "", "no photo shown");

  Assert.equal(abDocument.activeElement.id, "FirstName");
  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, abWindow);
  Assert.equal(abDocument.activeElement.id, "photoOverlay");

  // Paste a URL.

  let previewChangePromise = waitForPreviewChange();

  wrapper.data =
    "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/new/data/photo1.jpg";
  transfer.setTransferData("text/unicode", wrapper);
  Services.clipboard.setData(transfer, null, Ci.nsIClipboard.kGlobalClipboard);
  EventUtils.synthesizeKey("v", { accelKey: true }, abWindow);

  await waitForDialogOpenState(true);
  await previewChangePromise;
  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
    saveButtonDisabled: false,
  });

  // Close then reopen the dialog.

  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await waitForDialogOpenState(false);

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);
  checkDialogElements({
    dropTargetClass: "drop-target",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  // Paste a URL.

  previewChangePromise = waitForPreviewChange();

  wrapper.data =
    "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/new/data/photo2.jpg";
  transfer.setTransferData("text/unicode", wrapper);
  Services.clipboard.setData(transfer, null, Ci.nsIClipboard.kGlobalClipboard);
  EventUtils.synthesizeKey("v", { accelKey: true }, abWindow);

  await previewChangePromise;
  checkDialogElements({
    svgVisible: true,
    saveButtonVisible: true,
    saveButtonDisabled: false,
  });

  // Close then reopen the dialog.

  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await waitForDialogOpenState(false);

  EventUtils.synthesizeMouseAtCenter(photo, {}, abWindow);
  await waitForDialogOpenState(true);
  checkDialogElements({
    dropTargetClass: "drop-target",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  // Paste an invalid URL.

  wrapper.data =
    "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/new/data/fake.jpg";
  transfer.setTransferData("text/unicode", wrapper);
  Services.clipboard.setData(transfer, null, Ci.nsIClipboard.kGlobalClipboard);
  EventUtils.synthesizeKey("v", { accelKey: true }, abWindow);

  await TestUtils.waitForCondition(() =>
    dropTarget.classList.contains("drop-error")
  );

  checkDialogElements({
    dropTargetClass: "drop-error",
    saveButtonVisible: true,
    saveButtonDisabled: true,
  });

  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await waitForDialogOpenState(false);
});

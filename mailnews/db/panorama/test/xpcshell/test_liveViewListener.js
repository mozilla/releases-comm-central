/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests database changes are correctly propagated to LiveView listeners.
 * Or not propagated, if the listener is not interested in the change.
 */

const { ProfileCreator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ProfileCreator.sys.mjs"
);

const LiveView = Components.Constructor(
  "@mozilla.org/mailnews/live-view;1",
  "nsILiveView"
);

add_setup(async function () {
  const profile = new ProfileCreator(do_get_profile());
  const server = profile.addLocalServer();
  await server.rootFolder.addMailFolder("folderA");
  await server.rootFolder.addMailFolder("folderB");
  await server.rootFolder.addMailFolder("folderC");
  await installDBFromFile("db/messages.sql");
});

class LiveViewListener {
  #name;
  #liveView;
  constructor(name, initFunction, ...initFunctionArgs) {
    this.#name = name;
    this.#liveView = new LiveView();
    if (initFunction) {
      this.#liveView[initFunction](...initFunctionArgs);
    }
    this.#liveView.setListener(this);
  }
  assertNoChanges() {
    Assert.equal(
      this._addedMessage,
      undefined,
      `${this.#name}: _addedMessage should not be set`
    );
    Assert.equal(
      this._removedMessage,
      undefined,
      `${this.#name}: _removedMessage should not be set`
    );
    Assert.equal(
      this._change,
      undefined,
      `${this.#name}: _change should not be set`
    );
  }
  stopListening() {
    this.#liveView.clearListener();
  }

  onMessageAdded(message) {
    this.assertNoChanges();
    this._addedMessage = message;
  }
  onMessageRemoved(message) {
    this.assertNoChanges();
    this._removedMessage = message;
  }
  onMessageFlagsChanged(message, oldFlags) {
    this.assertNoChanges();
    this._change = { message, oldFlags };
  }
  onMessageTagsChanged(message, oldTags) {
    this.assertNoChanges();
    this._change = { message, oldTags };
  }
}

add_task(function testBasicAddRemove() {
  const earlierId = addMessage({
    folderId: 2,
    messageId: "earlier-message",
    date: "2024-12-31T12:31:00Z",
    flags: 1,
  });

  const listener = new LiveViewListener("all messages listener");

  const addedId = addMessage({
    folderId: 4,
    messageId: "added-message",
    date: "2025-01-14T07:20:00Z",
    tags: "$label4",
  });
  Assert.equal(listener._addedMessage.id, addedId);
  Assert.equal(listener._addedMessage.folderId, 4);
  Assert.equal(listener._addedMessage.messageId, "added-message");
  Assert.equal(
    listener._addedMessage.date.toISOString(),
    "2025-01-14T07:20:00.000Z"
  );
  Assert.equal(listener._addedMessage.sender, "sender");
  Assert.equal(listener._addedMessage.subject, "subject");
  Assert.equal(listener._addedMessage.flags, 0);
  Assert.equal(listener._addedMessage.tags, "$label4");
  delete listener._addedMessage;

  messageDB.removeMessage(earlierId);
  Assert.equal(listener._removedMessage.id, earlierId);
  Assert.equal(listener._removedMessage.folderId, 2);
  Assert.equal(listener._removedMessage.messageId, "earlier-message");
  Assert.equal(
    listener._removedMessage.date.toISOString(),
    "2024-12-31T12:31:00.000Z"
  );
  Assert.equal(listener._removedMessage.sender, "sender");
  Assert.equal(listener._removedMessage.subject, "subject");
  Assert.equal(listener._removedMessage.flags, 1);
  Assert.equal(listener._removedMessage.tags, "");
  delete listener._removedMessage;

  listener.stopListening();

  // If the listener was not cleared these calls would cause failures.
  const laterId = addMessage({ folderId: 3, messageId: "later-message" });
  messageDB.removeMessage(addedId);
  messageDB.removeMessage(laterId);

  listener.assertNoChanges();
});

add_task(async function testFlagsChange() {
  const listener = new LiveViewListener("all messages listener");
  const thisFolderListener = new LiveViewListener(
    "this folder listener",
    "initWithFolder",
    4
  );
  const otherFolderListener = new LiveViewListener(
    "other folder listener",
    "initWithFolder",
    2
  );

  const message = messageDB.getMessage(7);
  Assert.equal(message.flags, 0);

  message.flags = 1;
  Assert.equal(listener._change.message.id, 7);
  Assert.equal(listener._change.message.flags, 1);
  Assert.equal(listener._change.oldFlags, 0);
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 7);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();

  message.orFlags(4);
  Assert.equal(listener._change.message.id, 7);
  Assert.equal(listener._change.message.flags, 5);
  Assert.equal(listener._change.oldFlags, 1);
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 7);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();

  message.flags = 5;
  Assert.ok(!listener._change);
  Assert.ok(!thisFolderListener._change);
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();

  message.andFlags(4);
  Assert.equal(listener._change.message.id, 7);
  Assert.equal(listener._change.message.flags, 4);
  Assert.equal(listener._change.oldFlags, 5);
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 7);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();

  listener.stopListening();
  thisFolderListener.stopListening();
  otherFolderListener.stopListening();
});

add_task(async function testTagsChange() {
  const listener = new LiveViewListener("all messages listener");
  const thisFolderListener = new LiveViewListener(
    "this folder listener",
    "initWithFolder",
    4
  );
  const otherFolderListener = new LiveViewListener(
    "other folder listener",
    "initWithFolder",
    2
  );
  const label3Listener = new LiveViewListener(
    "$label3 listener",
    "initWithTag",
    "$label3"
  );
  const label5Listener = new LiveViewListener(
    "$label5 listener",
    "initWithTag",
    "$label5"
  );

  const message = messageDB.getMessage(8);
  Assert.equal(message.getStringProperty("keywords"), "$label1");

  // Add $label5 via setStringProperty.
  message.setStringProperty("keywords", "$label1 $label5");
  Assert.equal(listener._change.message.id, 8);
  Assert.equal(listener._change.message.tags, "$label1 $label5");
  Assert.equal(listener._change.oldTags, "$label1");
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 8);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();
  // Message does not have $label3.
  label3Listener.assertNoChanges();
  // Message gained $label5.
  Assert.equal(label5Listener._addedMessage.id, 8);
  delete label5Listener._addedMessage;

  // Remove $label5 via setStringProperty.
  message.setStringProperty("keywords", "$label1");
  Assert.equal(listener._change.message.id, 8);
  Assert.equal(listener._change.message.tags, "$label1");
  Assert.equal(listener._change.oldTags, "$label1 $label5");
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 8);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();
  // Message does not have $label3.
  label3Listener.assertNoChanges();
  // Message lost $label5.
  Assert.equal(label5Listener._removedMessage.id, 8);
  delete label5Listener._removedMessage;

  // Add $label3 via addKeywordsToMessages.
  message.folder.addKeywordsToMessages([message], "$label3");
  Assert.equal(listener._change.message.id, 8);
  Assert.equal(listener._change.message.tags, "$label1 $label3");
  Assert.equal(listener._change.oldTags, "$label1");
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 8);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();
  // Message gained $label3.
  Assert.equal(label3Listener._addedMessage.id, 8);
  delete label3Listener._addedMessage;
  // Message does not have $label5.
  label5Listener.assertNoChanges();

  // Remove $label3 via removeKeywordsFromMessages.
  message.folder.removeKeywordsFromMessages([message], "$label3");
  Assert.equal(listener._change.message.id, 8);
  Assert.equal(listener._change.message.tags, "$label1");
  Assert.equal(listener._change.oldTags, "$label1 $label3");
  delete listener._change;
  // Message is in this folder.
  Assert.equal(thisFolderListener._change.message.id, 8);
  delete thisFolderListener._change;
  // Message is not in other folder.
  otherFolderListener.assertNoChanges();
  // Message lost $label3.
  Assert.equal(label3Listener._removedMessage.id, 8);
  delete label3Listener._removedMessage;
  // Message does not have $label5.
  label5Listener.assertNoChanges();

  listener.stopListening();
  thisFolderListener.stopListening();
  otherFolderListener.stopListening();
  label3Listener.stopListening();
  label5Listener.stopListening();
});

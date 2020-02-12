/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an address book, once renamed, is not deleted when a sibling address book is deleted.
 */

var gAbListener;

function abListener() {}

abListener.prototype = {
  mReceived: 0,
  mDirectory: null,

  onItemAdded(aParentItem, aItem) {
    this.mReceived |= Ci.nsIAbListener.itemAdded;
    this.mDirectory = aItem;
    this.resolveEventPromise();
  },

  onItemRemoved(aParentItem, aItem) {
    this.mReceived |= Ci.nsIAbListener.directoryRemoved;
    this.mDirectory = aItem;
    this.resolveEventPromise();
  },

  onItemPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {
    this.mReceived |= Ci.nsIAbListener.itemChanged;
    this.mDirectory = aItem;
    this.resolveEventPromise();
  },

  reset() {
    this.mReceived = 0;
    this.mDirectory = null;
  },

  promiseEvent() {
    return new Promise(resolve => {
      this.mEventPromise = resolve;
    });
  },
  resolveEventPromise() {
    if (this.mEventPromise) {
      let resolve = this.mEventPromise;
      delete this.mEventPromise;
      resolve();
    }
  },
};

function addDirectory(dirName) {
  MailServices.ab.newAddressBook(dirName, "", kPABData.dirType);

  Assert.equal(gAbListener.mReceived, Ci.nsIAbListener.itemAdded);

  let newDirectory = gAbListener.mDirectory.QueryInterface(Ci.nsIAbDirectory);
  Assert.equal(newDirectory.dirName, dirName);

  gAbListener.reset();

  return newDirectory;
}

function renameDirectory(directory, newName) {
  directory.dirName = newName;

  Assert.equal(gAbListener.mReceived, Ci.nsIAbListener.itemChanged);
  Assert.equal(gAbListener.mDirectory, directory);

  gAbListener.reset();
}

async function removeDirectory(directory) {
  let deletePromise = gAbListener.promiseEvent();
  MailServices.ab.deleteAddressBook(directory.URI);
  await deletePromise;

  Assert.equal(gAbListener.mReceived, Ci.nsIAbListener.directoryRemoved);
  Assert.equal(
    gAbListener.mDirectory,
    directory.QueryInterface(Ci.nsIAbDirectory)
  );

  gAbListener.reset();
}

/**
 * Create 4 addressbooks (directories). Rename the second one and delete
 * the third one. Check if their names are still correct. (bug 745664)
 */
async function run_test() {
  gAbListener = new abListener();
  MailServices.ab.addAddressBookListener(gAbListener, Ci.nsIAbListener.all);
  registerCleanupFunction(function() {
    MailServices.ab.removeAddressBookListener(gAbListener);
  });

  let dirNames = ["testAb0", "testAb1", "testAb2", "testAb3"];
  let directories = [];

  for (let dirName of dirNames) {
    directories.push(addDirectory(dirName));
  }

  dirNames[1] = "newTestAb1";
  renameDirectory(directories[1], dirNames[1]);
  for (let dir in dirNames) {
    Assert.equal(dirNames[dir], directories[dir].dirName);
  }
  await removeDirectory(directories[2]);
  dirNames.splice(2, 1);
  directories.splice(2, 1);

  for (let dir in dirNames) {
    Assert.equal(dirNames[dir], directories[dir].dirName);
  }
}

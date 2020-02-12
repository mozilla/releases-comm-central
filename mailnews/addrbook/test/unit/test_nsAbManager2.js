/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsAbManager functions relating to add/delete directories and
 * getting the list of directories..
 */

var nsIAbDirectory = Ci.nsIAbDirectory;
var nsIAbListener = Ci.nsIAbListener;
var numListenerOptions = 4;

var gAblAll;
var gAblSingle = new Array(numListenerOptions);

function abL() {}

abL.prototype = {
  mReceived: 0,
  mDirectory: null,
  mAutoRemoveItem: false,

  onItemAdded(parentItem, item) {
    this.mReceived |= nsIAbListener.itemAdded;
    this.mDirectory = item;
    this.resolveEventPromise();
    if (this.mAutoRemoveItem) {
      MailServices.ab.removeAddressBookListener(this);
    }
  },
  onItemRemoved(parentItem, item) {
    this.mReceived |= nsIAbListener.directoryRemoved;
    this.mDirectory = item;
    this.resolveEventPromise();
    if (this.mAutoRemoveItem) {
      MailServices.ab.removeAddressBookListener(this);
    }
  },
  onItemPropertyChanged(item, property, oldValue, newValue) {
    this.mReceived |= nsIAbListener.itemChanged;
    this.mDirectory = item;
    this.resolveEventPromise();
    if (this.mAutoRemoveItem) {
      MailServices.ab.removeAddressBookListener(this);
    }
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

function checkDirs(aDirs, aDirArray) {
  // Don't modify the passed in array.
  var dirArray = aDirArray.concat();

  for (let dir of aDirs) {
    var loc = dirArray.indexOf(dir.URI);

    Assert.equal(MailServices.ab.getDirectory(dir.URI), dir);

    if (loc == -1) {
      do_throw(
        "Unexpected directory " + dir.URI + " found in address book list"
      );
    } else {
      dirArray[loc] = null;
    }
  }

  dirArray.forEach(function(value) {
    Assert.equal(value, null);
  });
}

function addDirectory(dirName) {
  // Add the directory
  MailServices.ab.newAddressBook(dirName, "", kPABData.dirType);

  // Check for correct notifications
  Assert.equal(gAblAll.mReceived, nsIAbListener.itemAdded);

  var newDirectory = gAblAll.mDirectory.QueryInterface(nsIAbDirectory);

  gAblAll.mReceived = 0;
  gAblAll.mDirectory = null;

  for (var i = 0; i < numListenerOptions; ++i) {
    if (1 << i == nsIAbListener.itemAdded) {
      Assert.equal(gAblSingle[i].mReceived, nsIAbListener.itemAdded);
      gAblSingle[i].mReceived = 0;
    } else {
      Assert.equal(gAblSingle[i].mReceived, 0);
    }
  }

  return newDirectory;
}

async function removeDirectory(directory) {
  // Remove the directory
  let deletePromise = gAblAll.promiseEvent();
  MailServices.ab.deleteAddressBook(directory.URI);
  await deletePromise;

  // Check correct notifications
  Assert.equal(gAblAll.mReceived, nsIAbListener.directoryRemoved);
  Assert.equal(gAblAll.mDirectory, directory);

  gAblAll.mReceived = 0;
  gAblAll.mDirectory = null;

  for (var i = 0; i < numListenerOptions; ++i) {
    if (1 << i == nsIAbListener.directoryRemoved) {
      Assert.equal(gAblSingle[i].mReceived, nsIAbListener.directoryRemoved);
      gAblSingle[i].mReceived = 0;
    } else {
      Assert.equal(gAblSingle[i].mReceived, 0);
    }
  }
}

async function run_test() {
  var i;

  // Set up listeners
  gAblAll = new abL();
  MailServices.ab.addAddressBookListener(gAblAll, nsIAbListener.all);

  for (i = 0; i < numListenerOptions; ++i) {
    gAblSingle[i] = new abL();
    MailServices.ab.addAddressBookListener(gAblSingle[i], 1 << i);
  }

  var expectedABs = [kPABData.URI, kCABData.URI];

  // Test - Check initial directories

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Add a directory

  var newDirectory1 = addDirectory("testAb1");

  // Test - Check new directory list
  expectedABs.push(newDirectory1.URI);

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Repeat for a second directory

  var newDirectory2 = addDirectory("testAb2");

  // Test - Check new directory list
  expectedABs.push(newDirectory2.URI);

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Remove a directory

  var pos = expectedABs.indexOf(newDirectory1.URI);

  expectedABs.splice(pos, 1);

  await removeDirectory(newDirectory1);
  newDirectory1 = null;

  // Test - Check new directory list

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Repeat the removal

  await removeDirectory(newDirectory2);
  newDirectory2 = null;

  expectedABs.pop();

  // Test - Check new directory list
  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Clear the listeners down

  MailServices.ab.removeAddressBookListener(gAblAll);

  for (i = 0; i < numListenerOptions; ++i) {
    MailServices.ab.removeAddressBookListener(gAblSingle[i]);
  }
}

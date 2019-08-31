/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of inherited folder properties
 */

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  var rootFolder = localAccountUtils.incomingServer.rootMsgFolder;

  // add subfolders to the inbox
  const subFolder11 = localAccountUtils.inboxFolder
    .createLocalSubfolder("subfolder11")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const subFolder12 = localAccountUtils.inboxFolder
    .createLocalSubfolder("subfolder12")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const subFolder21 = subFolder11.createLocalSubfolder("subfolder21");
  const subFolder22 = subFolder12.createLocalSubfolder("subfolder22");

  // add a global preference
  const propertyName = "iexist";
  const invalidName = "idontexist";
  const globalPref = "mail.server.default." + propertyName;
  const globalValue = "iAmGlobal";
  const folderValue = "iAmFolder";
  const folderValue2 = "iAmFolder2";
  const rootValue = "iAmRoot";
  Services.prefs.setCharPref(globalPref, globalValue);

  // test that the global preference is honored
  Assert.equal(
    rootFolder.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder22.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(rootFolder.getInheritedStringProperty(invalidName), null);
  Assert.equal(subFolder11.getInheritedStringProperty(invalidName), null);
  Assert.equal(subFolder22.getInheritedStringProperty(invalidName), null);

  // set a value on a subfolder and check
  subFolder11.setStringProperty(propertyName, folderValue);
  Assert.equal(
    rootFolder.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(
    subFolder12.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(
    subFolder22.getInheritedStringProperty(propertyName),
    globalValue
  );

  // set a root folder value and check
  localAccountUtils.incomingServer.setCharValue(propertyName, rootValue);
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), rootValue);

  // force an empty string
  subFolder12.setForcePropertyEmpty(propertyName, true);
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), "");
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), "");

  // reset a folder to allow inheritance
  subFolder12.setForcePropertyEmpty(propertyName, false);
  subFolder12.setStringProperty(propertyName, "");
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), rootValue);

  // force an empty string on the server
  localAccountUtils.incomingServer.setForcePropertyEmpty(propertyName, true);
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), "");
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), "");
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), "");

  // reset a server to allow inheritance from the global
  localAccountUtils.incomingServer.setCharValue(propertyName, "");
  localAccountUtils.incomingServer.setForcePropertyEmpty(propertyName, false);
  Assert.equal(
    rootFolder.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(
    subFolder12.getInheritedStringProperty(propertyName),
    globalValue
  );
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(
    subFolder22.getInheritedStringProperty(propertyName),
    globalValue
  );

  // check with all levels populated
  subFolder21.setStringProperty(propertyName, folderValue2);
  localAccountUtils.incomingServer.setCharValue(propertyName, rootValue);
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), rootValue);
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue2
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), rootValue);

  // clear the global value and the root value
  Services.prefs.clearUserPref(globalPref);
  localAccountUtils.incomingServer.setCharValue(propertyName, "");
  Assert.equal(rootFolder.getInheritedStringProperty(propertyName), null);
  Assert.equal(
    subFolder11.getInheritedStringProperty(propertyName),
    folderValue
  );
  Assert.equal(subFolder12.getInheritedStringProperty(propertyName), null);
  Assert.equal(
    subFolder21.getInheritedStringProperty(propertyName),
    folderValue2
  );
  Assert.equal(subFolder22.getInheritedStringProperty(propertyName), null);
}

const EXPORTED_SYMBOLS = ["TestMailImporter"];

function TestMailImporter() {}

TestMailImporter.prototype = {
  classID: Components.ID("{a81438ef-aca1-41a5-9b3a-3ccfbbe4f5e1}"),

  QueryInterface: ChromeUtils.generateQI(["nsIImportModule", "nsIImportMail"]),

  contractID: "@mozilla.org/import/test;1",

  _xpcom_categories: [
    {
      category: "mailnewsimport",
      entry: "{a81438ef-aca1-41a5-9b3a-3ccfbbe4f5e1}",
      value: "mail",
    },
  ],

  name: "Test mail import module",

  description: "Test module for mail import",

  supports: "mail",

  supportsUpgrade: true,

  GetImportInterface(type) {
    if (type != "mail") {
      return null;
    }
    let importService = Cc[
      "@mozilla.org/import/import-service;1"
    ].createInstance(Ci.nsIImportService);
    let genericInterface = importService.CreateNewGenericMail();
    genericInterface.SetData("mailInterface", this);
    let name = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    name.data = "TestMailImporter";
    genericInterface.SetData("name", name);
    return genericInterface;
  },

  GetDefaultLocation(location, found, userVerify) {
    found = false;
    userVerify = false;
  },

  _createMailboxDescriptor(path, name, depth) {
    let importService = Cc[
      "@mozilla.org/import/import-service;1"
    ].createInstance(Ci.nsIImportService);
    let descriptor = importService.CreateNewMailboxDescriptor();
    descriptor.size = 100;
    descriptor.depth = depth;
    descriptor.SetDisplayName(name);
    descriptor.file.initWithPath(path);

    return descriptor;
  },

  _collectMailboxesInDirectory(directory, depth) {
    let descriptor = this._createMailboxDescriptor(
      directory.path,
      directory.leafName,
      depth
    );
    let result = [descriptor];
    for (let entry of directory.directoryEntries) {
      if (entry.isDirectory()) {
        result.push(...this._collectMailboxesInDirectory(entry, depth + 1));
      }
    }
    return result;
  },

  findMailboxes(location) {
    return this._collectMailboxesInDirectory(location, 0);
  },

  ImportMailbox(source, destination, errorLog, successLog, fatalError) {
    this.progress = 0;
    let msgStore = destination.msgStore;

    for (let entry of source.directoryEntries) {
      if (!entry.isFile()) {
        continue;
      }

      let newMsgHdr = {};
      let reusable = {};
      let outputStream = msgStore.getNewMsgOutputStream(
        destination,
        newMsgHdr,
        reusable
      );

      let inputStream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      inputStream.init(entry, -1, -1, 0);
      let count = inputStream.available();
      while (count > 0) {
        let writtenBytes = outputStream.writeFrom(inputStream, count);
        count -= writtenBytes;
        if (count == 0) {
          count = inputStream.available();
        }
      }
      msgStore.finishNewMessage(outputStream, newMsgHdr);
      inputStream.close();
      outputStream.close();
    }
    this.progress = 100;
  },

  GetImportProgress() {
    return this.progress;
  },

  translateFolderName(folderName) {
    return folderName;
  },
};

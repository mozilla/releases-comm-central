var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

var gCid;

function MockWindowsRegKey(registryData) {
  this._registryData = registryData;
}

MockWindowsRegKey.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIWindowsRegKey"]),

  open(aRootKey, aRelPath, aMode) {
    if (!this._registryData[aRelPath]) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
    this._keyPath = aRelPath;
  },

  close() {},

  openChild(aRelPath, aMode) {
    if (
      !this._registryData[this._keyPath] ||
      !this._registryData[this._keyPath][aRelPath]
    ) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    const child = new MockWindowsRegKey({});
    const newKeyPath = this._keyPath + "\\" + aRelPath;
    child._keyPath = newKeyPath;
    child._registryData[newKeyPath] =
      this._registryData[this._keyPath][aRelPath];
    return child;
  },

  get childCount() {
    return Object.keys(this._registryData[this._keyPath]).length;
  },

  getChildName(aIndex) {
    const keys = Object.keys(this._registryData[this._keyPath]);
    const keyAtIndex = keys[aIndex];
    if (!keyAtIndex) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    return keyAtIndex;
  },

  _readValue(aName) {
    if (
      !this._registryData[this._keyPath] ||
      !this._registryData[this._keyPath][aName]
    ) {
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }

    return this._registryData[this._keyPath][aName];
  },

  readIntValue(aName) {
    return this._readValue(aName);
  },

  readStringValue(aName) {
    return this._readValue(aName);
  },
};

/* exported setup_mock_registry, teardown_mock_registry */
function setup_mock_registry(mockRegistry) {
  gCid = MockRegistrar.register(
    "@mozilla.org/windows-registry-key;1",
    MockWindowsRegKey,
    [mockRegistry]
  );
}

function teardown_mock_registry() {
  MockRegistrar.unregister(gCid);
}

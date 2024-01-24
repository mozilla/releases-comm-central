# XULStoreUtils

[XULStoreUtils](https://searchfox.org/comm-central/source/mail/modules/XULStoreUtils.sys.mjs) is a System Module that offers a consistent interface to interact
with [Services.xulStore](https://searchfox.org/mozilla-central/source/toolkit/components/xulstore/XULStore.cpp)

## Background

Even if you are directly using all the various methods offered by
`Services.xulStore`, that forces a lot of `document.url` repetition whenever
there is a need to store or fetch data. Furthermore, multiple inconsistent
approaches of using the XULStore have been introduced across the application
throughout the years. This interface is an attempt to clean things up by forcing
a single code patch and helper methods to reduce duplication and inconsistencies.

## Usage

Import the module:
```
const { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);
```

or through a lazy getter:
```
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  XULStoreUtils: "resource:///modules/XULStoreUtils.sys.mjs",
});
```

### Document URL

The `XULStoreUtils.sys.mjs` file comes with a predefined set of document URLs.
```
_url: url => {
    switch (url) {
        case "addressBook":
        return "about:addressbook";
    case "messenger":
        return "chrome://messenger/content/messenger.xhtml";
    default:
        console.debug(`Unkown xulStore document URL: ${url}`);
        return url;
    }
},
```

This is done to enable implementations to always reference the same URL across
files and methods, if needed, or a unique URL in case of standalone
implementations.

So instead of writing something like this across multiple files:
```
const modes = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "folderTree",
    "mode"
);

const isCompact = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "folderTree",
    "compact"
) == "true";
```

We can write:
```
const modes = XULStoreUtils.getValue("messenger", "folderTree", "mode");
const isCompact = XULStoreUtils.isItemCompact("messenger", "folderTree");
```

See all the methods of [XULStoreUtils](https://searchfox.org/comm-central/source/mail/modules/XULStoreUtils.sys.mjs) to learn which available endpoints can be used.

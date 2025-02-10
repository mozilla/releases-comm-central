/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

let gAccount, gFolders, gMessage;
add_setup(async () => {
  await Services.search.init();

  gAccount = createAccount();
  addIdentity(gAccount);
  gFolders = gAccount.incomingServer.rootFolder.subFolders;
  createMessages(gFolders[0], {
    count: 1,
    body: {
      contentType: "text/html",
      body: await IOUtils.readUTF8(getTestFilePath(`data/content.html`)),
    },
  });
  gMessage = [...gFolders[0].messages][0];

  document.getElementById("tabmail").currentAbout3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
    folderURI: gFolders[0].URI,
  });

  await ensure_table_view();
});

function imageBufferFromDataURI(encodedImageData) {
  const decodedImageData = atob(encodedImageData);
  return Uint8Array.from(decodedImageData, byte => byte.charCodeAt(0)).buffer;
}

add_task(async function test_root_icon() {
  const encodedImageData =
    "iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAC4klEQVRYhdWXLWzbQBSADQtDAwsHC1tUhUxqfL67lk2tdn+OJg0ODU0rLByqgqINBY6tmlbn7LMTJ5FaFVVBk1G0oUGjG2jT2Y7jxmmcbU/6iJ+f36fz+e5sGP9riCGm9hB37RG+scd4Yo/wsDXCZyIE2xuXsce4bY+wXkAsQtzYmExrfFgvkJkRbkzo1ehoxx5iXcgI/9iYUGt8WH9MqDXEcmNChmEYrRCf2SHWeYgQx3x0tLNRIeKQLTtEFyJEep4NTuhk8BC+yMrwEE3+iozo42d8gK7FAOkMsRiiN8QhW2ttSK5QTfRRV4QoymVeJMvPvDp7gCZigD613MN6yRFA3SWarow9QB9LCfG+NeF9qCtjAKOSQjCqVKhfVsiHEQ+grgx/lRGqUihAc1uL8EFD+KCRO+GrF4J61phcoRoPoEzkYhZYpykh5sMb7kOdIeY+jHKur4QI4Feh4AFX1nVeLxrAvQchGsBz5ls6wa2QdwcvIcE2863bTH79KOvsz/uUYJsp+J0pSzNlDckVqqVGUAF+n6uS7txcOl6wot4JVy70ufDLy4pWLUQVPE81pRI0mGe9oxLMHSeohHvMs/STUNaUK6vDPCvOyxMFDx4achehRDJmHnydnkPww5OFfLxrGIZBFDyYl4LpMzlTQFIP6AQx86w2UeYBccFpJrcKv5L9eGDtUAU6RIELqsB74uynjy/UBRF1gS5BTFxwQT1wTiXoUg9MH7m/3NZRRoi5IJytUbMgzv4Wc832+oQkiKgEehmyMkkpKsFkQV11QsRJL5rJYBLItQgRaUZEmnoZXsomz3vGiWw+I9KMF9SVFOqZEemZekli1jN3U/UOqhHHvC6oWWGElhfSpGdOk6+O9prdwvtLj5BjRsQxdRnot+Zeifpy/2/0stktKTRNLmbk0mwXyl8253fyojj+8rxOHNAhjjm5n0/5OOCGOKBzkrMO0Z75lvSAzKlrF32Z/3z8BqLAn+yMV7VhAAAAAElFTkSuQmCC";

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      name: "menus icons",
      permissions: ["menus"],
      browser_specific_settings: { gecko: { id: "menu-icons@mochi.test" } },
      icons: {
        18: "extension.png",
      },
    },

    files: {
      "extension.png": imageBufferFromDataURI(encodedImageData),
    },

    background() {
      const menuitemId = browser.menus.create(
        {
          id: "extensionMenu",
          title: "IconTest",
        },
        () => {
          browser.test.sendMessage("extensionMenuEntry ready");
        }
      );

      browser.menus.create(
        {
          id: "relativeUrl",
          title: "Entry with relative-url icon",
          parentId: menuitemId,
          icons: "extension.png",
        },
        () => {
          browser.test.sendMessage("relativeUrlIconMenuEntry ready");
        }
      );
      browser.menus.create(
        {
          id: "remoteUrl",
          title: "Entry with remote-url icon",
          parentId: menuitemId,
          icons:
            "http://mochi.test:8888/browser/comm/mail/components/extensions/test/browser/data/tb-logo.png",
        },
        () => {
          browser.test.sendMessage("remoteUrlIconMenuEntry ready");
        }
      );
      browser.menus.create(
        {
          id: "dataUrl",
          title: "Entry with data-url icon",
          parentId: menuitemId,
          icons:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAC4klEQVRYhdWXLWzbQBSADQtDAwsHC1tUhUxqfL67lk2tdn+OJg0ODU0rLByqgqINBY6tmlbn7LMTJ5FaFVVBk1G0oUGjG2jT2Y7jxmmcbU/6iJ+f36fz+e5sGP9riCGm9hB37RG+scd4Yo/wsDXCZyIE2xuXsce4bY+wXkAsQtzYmExrfFgvkJkRbkzo1ehoxx5iXcgI/9iYUGt8WH9MqDXEcmNChmEYrRCf2SHWeYgQx3x0tLNRIeKQLTtEFyJEep4NTuhk8BC+yMrwEE3+iozo42d8gK7FAOkMsRiiN8QhW2ttSK5QTfRRV4QoymVeJMvPvDp7gCZigD613MN6yRFA3SWarow9QB9LCfG+NeF9qCtjAKOSQjCqVKhfVsiHEQ+grgx/lRGqUihAc1uL8EFD+KCRO+GrF4J61phcoRoPoEzkYhZYpykh5sMb7kOdIeY+jHKur4QI4Feh4AFX1nVeLxrAvQchGsBz5ls6wa2QdwcvIcE2863bTH79KOvsz/uUYJsp+J0pSzNlDckVqqVGUAF+n6uS7txcOl6wot4JVy70ufDLy4pWLUQVPE81pRI0mGe9oxLMHSeohHvMs/STUNaUK6vDPCvOyxMFDx4achehRDJmHnydnkPww5OFfLxrGIZBFDyYl4LpMzlTQFIP6AQx86w2UeYBccFpJrcKv5L9eGDtUAU6RIELqsB74uynjy/UBRF1gS5BTFxwQT1wTiXoUg9MH7m/3NZRRoi5IJytUbMgzv4Wc832+oQkiKgEehmyMkkpKsFkQV11QsRJL5rJYBLItQgRaUZEmnoZXsomz3vGiWw+I9KMF9SVFOqZEemZekli1jN3U/UOqhHHvC6oWWGElhfSpGdOk6+O9prdwvtLj5BjRsQxdRnot+Zeifpy/2/0stktKTRNLmbk0mwXyl8253fyojj+8rxOHNAhjjm5n0/5OOCGOKBzkrMO0Z75lvSAzKlrF32Z/3z8BqLAn+yMV7VhAAAAAElFTkSuQmCC",
        },
        () => {
          browser.test.sendMessage("dataUrlIconMenuEntry ready");
        }
      );
    },
  });

  await extension.startup();
  await Promise.all([
    extension.awaitMessage("extensionMenuEntry ready"),
    extension.awaitMessage("relativeUrlIconMenuEntry ready"),
    extension.awaitMessage("remoteUrlIconMenuEntry ready"),
    extension.awaitMessage("dataUrlIconMenuEntry ready"),
  ]);

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  const threadTree = about3Pane.document.getElementById("threadTree");
  const menu = about3Pane.document.getElementById("mailContext");
  threadTree.selectedIndex = 0;

  // Open the context menu of the thread pane.
  await openMenuPopup(menu, threadTree.getRowAtIndex(0), {
    type: "contextmenu",
  });

  // Verify and open the extension menu.
  const extensionMenu = menu.querySelector(
    "#menu-icons_mochi_test-menuitem-_extensionMenu"
  );
  Assert.ok(extensionMenu, "The extension menu entry should exist.");
  Assert.equal(
    extensionMenu.image,
    `moz-extension://${extension.uuid}/extension.png`,
    "The icon of the extension menu should be correct"
  );
  await openSubMenuPopup(extensionMenu);

  // Check icon which was specifed as a relative url.
  const relativeUrlMenuEntry = menu.querySelector(
    "#menu-icons_mochi_test-menuitem-_relativeUrl"
  );
  Assert.ok(
    relativeUrlMenuEntry,
    "The menu with the relative-url icon should exists"
  );
  Assert.equal(
    relativeUrlMenuEntry.image,
    `moz-extension://${extension.uuid}/extension.png`,
    "The relative-url icon should be correct"
  );

  // Check icon which was specifed as a remote url.
  const remoteUrlMenuEntry = menu.querySelector(
    "#menu-icons_mochi_test-menuitem-_remoteUrl"
  );
  Assert.ok(
    remoteUrlMenuEntry,
    "The menu with the remote-url icon should exists"
  );
  Assert.ok(
    remoteUrlMenuEntry.image.startsWith(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAATAAAABUCAMAAAAyN5s5AAAC91BMVEVMaXErLDVPU1wYFx1OT1RPT1RNT1MTExoFB"
    ),
    "The remote-url icon should be correct"
  );

  // Check icon which was specifed as a data url.
  const dataUrlMenuEntry = menu.querySelector(
    "#menu-icons_mochi_test-menuitem-_dataUrl"
  );
  Assert.ok(dataUrlMenuEntry, "The menu with the data-url icon should exists");
  Assert.equal(
    dataUrlMenuEntry.image,
    `data:image/png;base64,${encodedImageData}`,
    "The data-url icon should be correct"
  );

  await closeMenuPopup(menu);
  await extension.unload();
});

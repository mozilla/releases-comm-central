/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);

add_task(async function () {
  const url = getRootDirectory(gTestPath) + "files/autoTreeView.xhtml";
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", { url });

  registerCleanupFunction(function () {
    Services.xulStore.removeDocument(url);
    tabmail.closeTab(tab);
  });

  await BrowserTestUtils.browserLoaded(tab.browser, false, url);
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately. Probably something to do
  // with it being the first test in a folder.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));

  let win = tab.browser.contentWindow;
  let doc = tab.browser.contentDocument;
  let l10n = doc.l10n;
  let tree = doc.getElementById("autoTree");
  let table = tree.querySelector("table");

  // First we'll check that the header was constructed correctly.

  let headerRow = table.tHead.rows[0];
  Assert.equal(headerRow.childElementCount, 7);

  let headerButtons;
  function updateHeaderButtons() {
    headerButtons = headerRow.querySelectorAll(
      `th[is="tree-view-table-header-cell"] > div > button`
    );
  }
  function checkHeaderLabels(expectedOrder) {
    updateHeaderButtons();
    Assert.equal(headerButtons.length, expectedOrder.length);
    for (let i = 0; i < expectedOrder.length; i++) {
      Assert.deepEqual(l10n.getAttributes(headerButtons[i]), {
        id: `${expectedOrder[i]}-header`,
        args: null,
      });
    }
  }
  function checkHeaderVisibility(expectedVisible) {
    updateHeaderButtons();
    for (let i = 0; i < expectedVisible.length; i++) {
      Assert.equal(
        BrowserTestUtils.isVisible(headerButtons[i]),
        !!expectedVisible[i]
      );
      if (typeof expectedVisible[i] == "number") {
        Assert.equal(headerButtons[i].clientWidth, expectedVisible[i] - 1);
      }
    }
  }
  checkHeaderLabels([
    "colour",
    "continent",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, true, false, false, false, true]);

  // Now the column picker.

  let pickerButton = headerRow.lastElementChild.querySelector("button");
  let pickerPopup = headerRow.lastElementChild.querySelector("menupopup");
  EventUtils.synthesizeMouseAtCenter(pickerButton, {}, win);
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");

  let pickerItems;
  function updatePickerItems() {
    pickerItems = pickerPopup.querySelectorAll("menuitem");
  }
  function checkPickerLabels(expectedOrder) {
    updatePickerItems();
    Assert.equal(pickerItems.length, expectedOrder.length + 1);
    for (let i = 0; i < expectedOrder.length; i++) {
      Assert.equal(pickerItems[i].value, expectedOrder[i]);
      Assert.deepEqual(l10n.getAttributes(pickerItems[i]), {
        id: `${expectedOrder[i]}-menuitem`,
        args: null,
      });
    }
    Assert.deepEqual(l10n.getAttributes(pickerItems[expectedOrder.length]), {
      id: "tree-list-view-column-picker-restore-default-columns",
      args: null,
    });
  }
  function checkPickerState(expectedChecked) {
    updatePickerItems();
    for (let i = 0; i < expectedChecked.length; i++) {
      Assert.equal(
        pickerItems[i].getAttribute("checked"),
        expectedChecked[i] ? "true" : null
      );
      Assert.equal(
        pickerItems[i].disabled,
        ["colour", "selected"].includes(pickerItems[i].value)
      );
    }
  }
  checkPickerLabels([
    "colour",
    "continent",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkPickerState([true, true, false, false, false, true]);
  pickerPopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");

  // Check that the table body was filled correctly.

  function checkTableRows(expectedContent) {
    const tableRows = table.tBodies[1].rows;
    Assert.equal(tableRows.length, 7);

    const colourColumn = expectedContent[0].findIndex(c =>
      ["red", "orange", "yellow", "green", "blue", "indigo", "violet"].includes(
        c
      )
    );
    const continentColumn = expectedContent[0].findIndex(c =>
      [
        "north america",
        "south america",
        "antarctica",
        "australia",
        "asia",
        "europe",
        "africa",
      ].includes(c)
    );
    const checkboxColumn = expectedContent[0].findIndex(c => c === null);
    Assert.equal(checkboxColumn, 5);
    for (let i = 0; i < 7; i++) {
      Assert.deepEqual(
        Array.from(tableRows[i].cells, c => c.textContent),
        expectedContent[i].map(c => c ?? "")
      );
      Assert.deepEqual(
        Array.from(tableRows[i].cells, c => c.hidden),
        expectedContent[i].map(c => c === "")
      );

      // Cells in the colour column should contain an image element.
      const colourCell = tableRows[i].cells[colourColumn];
      Assert.equal(colourCell.childElementCount, 1);
      const colourCellInner = colourCell.firstElementChild;
      Assert.ok(colourCellInner.matches("div.container"));
      Assert.equal(colourCellInner.childElementCount, 2);
      Assert.ok(colourCellInner.firstElementChild.matches("img.icon"));
      Assert.ok(colourCellInner.lastElementChild.matches("div"));

      // The row containing "antarctica" has the property "uninhabited".
      // The continent column is sometimes hidden, so check against "yellow"
      // instead, which is in the row and not hidden during this test.
      Assert.equal(
        tableRows[i].dataset.properties,
        expectedContent[i].includes("yellow")
          ? "yellow uninhabited"
          : expectedContent[i][colourColumn]
      );

      // Cells in the continent column should contain a twisty button. For all
      // rows except the one containing "australia", it should be hidden.
      // Twisty behaviour is tested in browser_treeView.js.
      if (continentColumn > -1) {
        const continentCell = tableRows[i].cells[continentColumn];
        Assert.equal(continentCell.childElementCount, 1);
        const continentCellInner = continentCell.firstElementChild;
        Assert.ok(continentCellInner.matches("div.container"));
        Assert.equal(continentCellInner.childElementCount, 2);
        const [twisty, text] = continentCellInner.children;
        Assert.ok(twisty.matches("button.twisty"));
        Assert.ok(text.matches("div"));

        if (expectedContent[i][continentColumn] == "australia") {
          Assert.ok(BrowserTestUtils.isVisible(twisty));
        } else {
          Assert.ok(BrowserTestUtils.isHidden(twisty));
        }
      }

      const checkboxCell = tableRows[i].cells[checkboxColumn];
      Assert.equal(checkboxCell.childElementCount, 1);
      Assert.ok(checkboxCell.children[0].matches('input[type="checkbox"]'));
    }
  }
  async function checkTableRowsA11y(expectedColumns, expectedTitles) {
    await doc.l10n.translateFragment(table);
    const tableRows = table.tBodies[1].rows;
    Assert.equal(tableRows.length, 7);
    for (let i = 0; i < 7; i++) {
      Assert.deepEqual(
        Array.from(tableRows[i].cells, c => c.getAttribute("aria-label")),
        expectedColumns
      );
      Assert.deepEqual(
        Array.from(tableRows[i].cells, c => c.title),
        expectedTitles[i]
      );
    }
  }
  checkTableRows([
    ["red", "north america", "", "", "", null],
    ["orange", "south america", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["blue", "asia", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["violet", "africa", "", "", "", null],
  ]);
  await checkTableRowsA11y(
    ["Colour", "Continent", null, null, null, null],
    [
      ["The sky is red", "north america", "", "", "", ""],
      ["The sky is orange", "south america", "", "", "", ""],
      ["The sky is yellow", "antarctica", "", "", "", ""],
      ["The sky is green", "australia", "", "", "", ""],
      ["The sky is blue", "asia", "", "", "", ""],
      ["The sky is indigo", "europe", "", "", "", ""],
      ["The sky is violet", "africa", "", "", "", ""],
    ]
  );

  // Okay, everything is set up correctly. Let's try sorting.

  EventUtils.synthesizeMouseAtCenter(tree.getRowAtIndex(0), {}, win);

  function checkHeaderSortClasses(sortColumnIndex, sortDirection) {
    updateHeaderButtons();
    const sorting = headerRow.querySelectorAll("button.sorting");
    const ascending = headerRow.querySelectorAll("button.ascending");
    const descending = headerRow.querySelectorAll("button.descending");
    if (sortColumnIndex === undefined) {
      Assert.equal(sorting.length, 0);
    } else {
      Assert.equal(sorting.length, 1);
      Assert.equal(sorting[0], headerButtons[sortColumnIndex]);
    }
    if (sortDirection === "ascending") {
      Assert.equal(ascending.length, 1);
      Assert.equal(ascending[0], headerButtons[sortColumnIndex]);
    } else {
      Assert.equal(ascending.length, 0);
    }
    if (sortDirection === "descending") {
      Assert.equal(descending.length, 1);
      Assert.equal(descending[0], headerButtons[sortColumnIndex]);
    } else {
      Assert.equal(descending.length, 0);
    }
  }
  function checkPersistedValue(key, expectedValue) {
    Assert.equal(
      Services.xulStore.getValue(url, "autoTree", key),
      expectedValue
    );
  }
  checkHeaderSortClasses();
  checkPersistedValue("sortColumn", "");
  checkPersistedValue("sortDirection", "");

  EventUtils.synthesizeMouseAtCenter(headerButtons[1], {}, win);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["violet", "africa", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
    ["blue", "asia", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["orange", "south america", "", "", "", null],
  ]);
  checkHeaderSortClasses(1, "ascending");
  checkPersistedValue("sortColumn", "continent");
  checkPersistedValue("sortDirection", "ascending");

  EventUtils.synthesizeMouseAtCenter(headerButtons[1], {}, win);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["orange", "south america", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["blue", "asia", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
    ["violet", "africa", "", "", "", null],
  ]);
  checkHeaderSortClasses(1, "descending");
  checkPersistedValue("sortColumn", "continent");
  checkPersistedValue("sortDirection", "descending");

  EventUtils.synthesizeMouseAtCenter(headerButtons[0], {}, win);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "asia", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["orange", "south america", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["violet", "africa", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
  ]);
  checkHeaderSortClasses(0, "ascending");
  checkPersistedValue("sortColumn", "colour");
  checkPersistedValue("sortDirection", "ascending");

  EventUtils.synthesizeMouseAtCenter(headerButtons[0], {}, win);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["yellow", "antarctica", "", "", "", null],
    ["violet", "africa", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["orange", "south america", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["blue", "asia", "", "", "", null],
  ]);
  checkHeaderSortClasses(0, "descending");
  checkPersistedValue("sortColumn", "colour");
  checkPersistedValue("sortDirection", "descending");

  EventUtils.synthesizeMouseAtCenter(headerButtons[0], {}, win);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "asia", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["orange", "south america", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["violet", "africa", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
  ]);
  checkHeaderSortClasses(0, "ascending");
  checkPersistedValue("sortColumn", "colour");
  checkPersistedValue("sortDirection", "ascending");

  // Add a column.

  checkPersistedValue("columns", "");

  async function toggleColumn(columnID, expectedOrder, expectedChecked) {
    EventUtils.synthesizeMouseAtCenter(pickerButton, {}, win);
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");
    checkPickerLabels(expectedOrder);
    checkPickerState(expectedChecked);

    const pickerItem = pickerPopup.querySelector(
      `menuitem[value="${columnID}"]`
    );
    const visible = pickerItem.getAttribute("checked") === "true";
    pickerPopup.activateItem(pickerItem);
    pickerPopup.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");

    if (visible) {
      await TestUtils.waitForCondition(() =>
        BrowserTestUtils.isHidden(headerRow.querySelector(`#${columnID}`))
      );
    } else {
      await TestUtils.waitForCondition(() =>
        BrowserTestUtils.isVisible(headerRow.querySelector(`#${columnID}`))
      );
    }
  }
  await toggleColumn(
    "wonder",
    ["colour", "continent", "sin", "wonder", "dwarf", "selected"],
    [true, true, false, false, false, true]
  );
  checkHeaderVisibility([150, true, false, true, false, true]);
  checkPersistedValue(
    "columns",
    "colour,continent,sin:hidden,wonder,dwarf:hidden,selected"
  );
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "asia", "", "temple of artemis", "", null],
    ["green", "australia", "", "mausoleum of halicarnassus", "", null],
    ["indigo", "europe", "", "statue of zeus", "", null],
    ["orange", "south america", "", "colossus of rhodes", "", null],
    ["red", "north america", "", "pyramid of giza", "", null],
    ["violet", "africa", "", "gardens of babylon", "", null],
    ["yellow", "antarctica", "", "lighthouse of alexandria", "", null],
  ]);
  await checkTableRowsA11y(
    ["Colour", "Continent", null, null, null, null],
    [
      ["The sky is blue", "asia", "", "temple of artemis", "", ""],
      [
        "The sky is green",
        "australia",
        "",
        "mausoleum of halicarnassus",
        "",
        "",
      ],
      ["The sky is indigo", "europe", "", "statue of zeus", "", ""],
      ["The sky is orange", "south america", "", "colossus of rhodes", "", ""],
      ["The sky is red", "north america", "", "pyramid of giza", "", ""],
      ["The sky is violet", "africa", "", "gardens of babylon", "", ""],
      [
        "The sky is yellow",
        "antarctica",
        "",
        "lighthouse of alexandria",
        "",
        "",
      ],
    ]
  );

  // Now the "fun" stuff, rearranging columns.

  function dragColumn(fromIndex, toIndex) {
    const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
      Ci.nsIDragService
    );
    dragService.startDragSessionForTests(
      win,
      Ci.nsIDragService.DRAGDROP_ACTION_NONE
    );

    const fromRect = headerButtons[fromIndex].getBoundingClientRect();
    const fromX = fromRect.x + fromRect.width / 2;
    const fromY = fromRect.y + fromRect.height / 2;

    const toRect = headerButtons[toIndex].getBoundingClientRect();
    const toX = toRect.x + toRect.width / 2;
    const toY = toRect.y + toRect.height / 2;

    const [, dataTransfer] = EventUtils.synthesizeDragOver(
      headerButtons[fromIndex],
      headerRow,
      null,
      null,
      win,
      win,
      { clientX: fromX, clientY: fromY, _domDispatchOnly: true }
    );

    EventUtils.sendDragEvent(
      {
        type: "dragover",
        clientX: toX,
        clientY: toY,
        dataTransfer,
        _domDispatchOnly: true,
      },
      headerRow,
      win
    );

    EventUtils.synthesizeDropAfterDragOver(
      false,
      dataTransfer,
      headerRow,
      win,
      {
        clientX: toX,
        clientY: toY,
        _domDispatchOnly: true,
      }
    );

    headerRow.dispatchEvent(new CustomEvent("dragend", { bubbles: true }));
    dragService.getCurrentSession().endDragSession(true);
  }
  dragColumn(0, 1); // Drag colour to between continent and wonder.

  checkHeaderLabels([
    "continent",
    "colour",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([true, 150, false, true, false]);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["asia", "blue", "", "temple of artemis", "", null],
    ["australia", "green", "", "mausoleum of halicarnassus", "", null],
    ["europe", "indigo", "", "statue of zeus", "", null],
    ["south america", "orange", "", "colossus of rhodes", "", null],
    ["north america", "red", "", "pyramid of giza", "", null],
    ["africa", "violet", "", "gardens of babylon", "", null],
    ["antarctica", "yellow", "", "lighthouse of alexandria", "", null],
  ]);
  await checkTableRowsA11y(
    ["Continent", "Colour", null, null, null, null],
    [
      ["asia", "The sky is blue", "", "temple of artemis", "", ""],
      [
        "australia",
        "The sky is green",
        "",
        "mausoleum of halicarnassus",
        "",
        "",
      ],
      ["europe", "The sky is indigo", "", "statue of zeus", "", ""],
      ["south america", "The sky is orange", "", "colossus of rhodes", "", ""],
      ["north america", "The sky is red", "", "pyramid of giza", "", ""],
      ["africa", "The sky is violet", "", "gardens of babylon", "", ""],
      [
        "antarctica",
        "The sky is yellow",
        "",
        "lighthouse of alexandria",
        "",
        "",
      ],
    ]
  );
  checkPersistedValue(
    "columns",
    "continent,colour,sin:hidden,wonder,dwarf:hidden,selected"
  );

  dragColumn(1, 0); // Drag colour back to first.

  checkHeaderLabels([
    "colour",
    "continent",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, true, false, true, false, true]);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "asia", "", "temple of artemis", "", null],
    ["green", "australia", "", "mausoleum of halicarnassus", "", null],
    ["indigo", "europe", "", "statue of zeus", "", null],
    ["orange", "south america", "", "colossus of rhodes", "", null],
    ["red", "north america", "", "pyramid of giza", "", null],
    ["violet", "africa", "", "gardens of babylon", "", null],
    ["yellow", "antarctica", "", "lighthouse of alexandria", "", null],
  ]);
  checkPersistedValue(
    "columns",
    "colour,continent,sin:hidden,wonder,dwarf:hidden,selected"
  );

  dragColumn(1, 3); // Drag continent to last.

  checkHeaderLabels([
    "colour",
    "sin",
    "wonder",
    "continent",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, false, true, true, false, true]);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "", "temple of artemis", "asia", "", null],
    ["green", "", "mausoleum of halicarnassus", "australia", "", null],
    ["indigo", "", "statue of zeus", "europe", "", null],
    ["orange", "", "colossus of rhodes", "south america", "", null],
    ["red", "", "pyramid of giza", "north america", "", null],
    ["violet", "", "gardens of babylon", "africa", "", null],
    ["yellow", "", "lighthouse of alexandria", "antarctica", "", null],
  ]);
  checkPersistedValue(
    "columns",
    "colour,sin:hidden,wonder,continent,dwarf:hidden,selected"
  );

  await toggleColumn(
    "continent",
    ["colour", "sin", "wonder", "continent", "dwarf", "selected"],
    [true, false, true, true, false, true]
  );
  checkHeaderLabels([
    "colour",
    "sin",
    "wonder",
    "continent",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, false, true, false, false, true]);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "", "temple of artemis", "", "", null],
    ["green", "", "mausoleum of halicarnassus", "", "", null],
    ["indigo", "", "statue of zeus", "", "", null],
    ["orange", "", "colossus of rhodes", "", "", null],
    ["red", "", "pyramid of giza", "", "", null],
    ["violet", "", "gardens of babylon", "", "", null],
    ["yellow", "", "lighthouse of alexandria", "", "", null],
  ]);
  checkPersistedValue(
    "columns",
    "colour,sin:hidden,wonder,continent:hidden,dwarf:hidden,selected"
  );

  await toggleColumn(
    "continent",
    ["colour", "sin", "wonder", "continent", "dwarf", "selected"],
    [true, false, true, false, false, true]
  ); // Have the continents drifted?
  checkHeaderLabels([
    "colour",
    "sin",
    "wonder",
    "continent",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, false, true, true, false, true]);
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "", "temple of artemis", "asia", "", null],
    ["green", "", "mausoleum of halicarnassus", "australia", "", null],
    ["indigo", "", "statue of zeus", "europe", "", null],
    ["orange", "", "colossus of rhodes", "south america", "", null],
    ["red", "", "pyramid of giza", "north america", "", null],
    ["violet", "", "gardens of babylon", "africa", "", null],
    ["yellow", "", "lighthouse of alexandria", "antarctica", "", null],
  ]);
  checkPersistedValue(
    "columns",
    "colour,sin:hidden,wonder,continent,dwarf:hidden,selected"
  );

  // Resize columns.

  async function resizeColumn(index, change) {
    const cell = headerButtons[index].closest("th");
    const splitter = cell.querySelector(`hr[is="pane-splitter"]`);
    const splitterRect = splitter.getBoundingClientRect();

    const widthBefore = cell.clientWidth;
    const x = splitterRect.x + splitterRect.width / 2;
    const y = splitterRect.y + splitterRect.height / 2;
    const step = change / 4;

    EventUtils.synthesizeMouseAtPoint(
      x,
      y,
      { type: "mousedown", buttons: 1 },
      win
    );
    for (let i = 1; i <= 4; i++) {
      EventUtils.synthesizeMouseAtPoint(
        x + step * i,
        y,
        { type: "mousemove", buttons: 1 },
        win
      );
      Assert.equal(cell.clientWidth, widthBefore + step * i);
      await new Promise(r => win.requestAnimationFrame(r));
    }
    EventUtils.synthesizeMouseAtPoint(
      x + change,
      y,
      { type: "mouseup", buttons: 1 },
      win
    );
  }
  const widthBefore = headerButtons[2].closest("th").clientWidth;
  await resizeColumn(2, 20);
  checkHeaderVisibility([150, false, widthBefore + 20, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour,sin:hidden,wonder:${widthBefore + 20},continent,dwarf:hidden,selected`
  );

  await resizeColumn(2, -60);
  checkHeaderVisibility([150, false, widthBefore - 40, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour,sin:hidden,wonder:${widthBefore - 40},continent,dwarf:hidden,selected`
  );

  await resizeColumn(0, 32);
  checkHeaderVisibility([182, false, widthBefore - 40, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour:182,sin:hidden,wonder:${widthBefore - 40},continent,dwarf:hidden,selected`
  );

  // Resizing a column back to the starting size won't forget the width.
  await resizeColumn(2, 40);
  checkHeaderVisibility([182, false, widthBefore, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour:182,sin:hidden,wonder:${widthBefore},continent,dwarf:hidden,selected`
  );

  // Unless there's a default width.
  await resizeColumn(0, -32);
  checkHeaderVisibility([150, false, widthBefore, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour,sin:hidden,wonder:${widthBefore},continent,dwarf:hidden,selected`
  );

  // Hide a resized column.
  await toggleColumn(
    "wonder",
    ["colour", "sin", "wonder", "continent", "dwarf", "selected"],
    [true, false, true, true, false, true]
  );
  checkHeaderVisibility([150, false, false, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour,sin:hidden,wonder:${widthBefore}:hidden,continent,dwarf:hidden,selected`
  );

  // Show it again and check the size was restored.
  await toggleColumn(
    "wonder",
    ["colour", "sin", "wonder", "continent", "dwarf", "selected"],
    [true, false, false, true, false, true]
  );
  checkHeaderVisibility([150, false, widthBefore, true, false, true]);
  checkPersistedValue(
    "columns",
    `colour,sin:hidden,wonder:${widthBefore},continent,dwarf:hidden,selected`
  );

  // Restore columns.

  const restoreEvent = BrowserTestUtils.waitForEvent(
    document.body,
    "restore-columns",
    true
  );
  EventUtils.synthesizeMouseAtCenter(pickerButton, {}, win);
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");
  checkPickerLabels([
    "colour",
    "sin",
    "wonder",
    "continent",
    "dwarf",
    "selected",
  ]);
  checkPickerState([true, false, true, true, false, true]);
  pickerPopup.activateItem(pickerPopup.querySelector("#restoreColumnOrder"));
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");
  await restoreEvent;

  checkPersistedValue("columns", "");
  checkHeaderLabels([
    "colour",
    "continent",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkHeaderVisibility([150, true, false, false, false, true]);
  checkPersistedValue("sortColumn", "colour");
  checkPersistedValue("sortDirection", "ascending");
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  checkTableRows([
    ["blue", "asia", "", "", "", null],
    ["green", "australia", "", "", "", null],
    ["indigo", "europe", "", "", "", null],
    ["orange", "south america", "", "", "", null],
    ["red", "north america", "", "", "", null],
    ["violet", "africa", "", "", "", null],
    ["yellow", "antarctica", "", "", "", null],
  ]);

  EventUtils.synthesizeMouseAtCenter(pickerButton, {}, win);
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");
  checkPickerLabels([
    "colour",
    "continent",
    "sin",
    "wonder",
    "dwarf",
    "selected",
  ]);
  checkPickerState([true, true, false, false, false, true]);
  pickerPopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");

  // Alright, we've checked we can save a bunch of things. Let's check we can
  // restore them.

  Services.xulStore.removeDocument(url);
  Services.xulStore.setValue(
    url,
    "autoTree",
    "columns",
    "continent:300,dwarf:150:hidden,sin:100,wonder:hidden,colour:80,selected"
  );
  Services.xulStore.setValue(url, "autoTree", "sortColumn", "sin");
  Services.xulStore.setValue(url, "autoTree", "sortDirection", "descending");
  tab.browser.reload();
  await BrowserTestUtils.browserLoaded(tab.browser);
  await new Promise(resolve =>
    tab.browser.contentWindow.requestAnimationFrame(resolve)
  );

  win = tab.browser.contentWindow;
  doc = tab.browser.contentDocument;
  l10n = doc.l10n;
  tree = doc.getElementById("autoTree");
  table = tree.querySelector("table");
  headerRow = table.tHead.rows[0];
  pickerButton = headerRow.lastElementChild.querySelector("button");
  pickerPopup = headerRow.lastElementChild.querySelector("menupopup");

  checkHeaderLabels([
    "continent",
    "dwarf",
    "sin",
    "wonder",
    "colour",
    "selected",
  ]);
  // Width of colour column not used.
  checkHeaderVisibility([300, false, 100, false, true, true]);
  checkTableRows([
    ["antarctica", "", "wrath", "", "yellow", null],
    ["africa", "", "sloth", "", "violet", null],
    ["north america", "", "pride", "", "red", null],
    ["asia", "", "lust", "", "blue", null],
    ["south america", "", "greed", "", "orange", null],
    ["europe", "", "gluttony", "", "indigo", null],
    ["australia", "", "envy", "", "green", null],
  ]);

  await toggleColumn(
    "continent",
    ["continent", "dwarf", "sin", "wonder", "colour", "selected"],
    [true, false, true, false, true, true]
  );
  // Width of colour column not used.
  checkHeaderVisibility([false, false, 100, false, true, true]);
  checkPersistedValue(
    "columns",
    "continent:300:hidden,dwarf:150:hidden,sin:100,wonder:hidden,colour:80,selected"
  );

  await toggleColumn(
    "dwarf",
    ["continent", "dwarf", "sin", "wonder", "colour", "selected"],
    [false, false, true, false, true, true]
  );
  // Width of colour column not used.
  checkHeaderVisibility([false, 150, 100, false, true, true]);
  checkPersistedValue(
    "columns",
    "continent:300:hidden,dwarf:150,sin:100,wonder:hidden,colour:80,selected"
  );

  await dragColumn(4, 1);
  checkHeaderLabels([
    "continent",
    "colour",
    "dwarf",
    "sin",
    "wonder",
    "selected",
  ]);
  // Width of sin column not used.
  checkHeaderVisibility([false, 80, 150, true, false, true]);
  checkPersistedValue(
    "columns",
    "continent:300:hidden,colour:80,dwarf:150,sin:100,wonder:hidden,selected"
  );

  // Check that the widget responds to changes in UI density.

  function checkDensity(expectedRowHeight) {
    const tableRows = table.tBodies[1].rows;
    for (let i = 0; i < 7; i++) {
      Assert.equal(tableRows[0].clientHeight, expectedRowHeight);
    }
  }

  checkDensity(22);
  UIDensity.registerWindow(win);
  UIDensity.setMode(UIDensity.MODE_TOUCH);
  checkDensity(32);
  UIDensity.setMode(UIDensity.MODE_COMPACT);
  checkDensity(18);
  UIDensity.setMode(UIDensity.MODE_NORMAL);
  checkDensity(22);

  // Try to change the columns after they've been set. This should fail.

  Assert.throws(
    () => (tree.defaultColumns = [{}]),
    /set only once/,
    "setting columns a second time should fail"
  );

  // Create a new widget and try to set up some bad columns. This should fail.

  const newTree = doc.createElement("auto-tree-view");
  Assert.throws(
    () => (newTree.defaultColumns = [{}]),
    /must have IDs/,
    "setting a column without an ID should fail"
  );
  Assert.throws(
    () => (newTree.defaultColumns = [{ id: "autoTree" }]),
    /unique within the document/,
    "setting a column ID that's already used should fail"
  );
  Assert.throws(
    () => (newTree.defaultColumns = [{ id: "column!" }]),
    /only safe characters/,
    "setting a column ID with an unsafe character should fail"
  );
  Assert.throws(
    () => (newTree.defaultColumns = [{ id: " column" }]),
    /only safe characters/,
    "setting a column ID with white space should fail"
  );
});

add_task(async function test_contact_facet_sorting() {

  let tabmail = document.getElementById("tabmail");
  let searchInput = document.getElementById("searchInput");

  searchInput.value = "test";
  searchInput.doCommand();

  await TestUtils.waitForCondition(() =>
    tabmail.tabInfo.some(tab => tab.mode.name === "glodaFacet")
  );

  let facetTab = tabmail.tabInfo.find(tab => tab.mode.name === "glodaFacet");
  let browser = facetTab.browser;

  await BrowserTestUtils.browserLoaded(browser);

  await SpecialPowers.spawn(browser, [], () => {
    let sortSelect = content.document.getElementById("facet-sort-mode");
    sortSelect.value = "frequency";
    sortSelect.dispatchEvent(new content.Event("change", { bubbles: true }));
  });

  let contactGroups = await SpecialPowers.spawn(browser, [], () => {
    let involvesFacet = content.wrappedJSObject.FacetContext.faceters.find(
      f => f.attrDef.attributeName === "involves"
    );
    return involvesFacet.orderedGroups.map(g => ({
      name: g.value?._contact?._name || g.value?._name || "",
      count: g.groupCount,
    }));
  });

  // Assert that the list is in descending frequency order
  for (let i = 1; i < contactGroups.length; i++) {
    ok(
      contactGroups[i - 1].count >= contactGroups[i].count,
      `Group "${contactGroups[i - 1].name}" (${contactGroups[i - 1].count}) should have >= messages than "${contactGroups[i].name}" (${contactGroups[i].count})`
    );
  }
});
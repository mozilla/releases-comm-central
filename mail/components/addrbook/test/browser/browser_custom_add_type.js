add_task(async function testCustomLabel() {
 let abWindow = await openAddressBookWindow();
 let newContactBtn = abWindow.document.getElementById("booksPaneCreateContact");
 newContactBtn.click();


 let editEl = abWindow.document.querySelector("vcard-edit");
 let typeDropdown = editEl.querySelector("select.vcard-type-selection");


 // Simulate selection of 'custom'
 typeDropdown.value = "custom";
 typeDropdown.dispatchEvent(new Event("change", { bubbles: true }));


});

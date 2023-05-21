/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test TB can be set as default calendar app.
 */

/**
 * Set TB as default calendar app.
 */
add_setup(function () {
  let shellSvc = Cc["@mozilla.org/mail/shell-service;1"].getService(Ci.nsIShellService);
  shellSvc.setDefaultClient(false, shellSvc.CALENDAR);
  ok(shellSvc.isDefaultClient(false, shellSvc.CALENDAR), "setDefaultClient works");
});

/**
 * Test when opening an ics attachment, TB should be shown as an option.
 */
add_task(async function test_ics_attachment() {
  let file = new FileUtils.File(getTestFilePath("data/message-containing-event.eml"));
  let msgWindow = await openMessageFromFile(file);
  let aboutMessage = msgWindow.document.getElementById("messageBrowser").contentWindow;
  let promise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://mozapps/content/downloads/unknownContentType.xhtml",
    {
      async callback(dialogWindow) {
        ok(true, "unknownContentType dialog opened");
        let dialogElement = dialogWindow.document.querySelector("dialog");
        let acceptButton = dialogElement.getButton("accept");
        return new Promise(resolve => {
          let observer = new MutationObserver(mutationList => {
            mutationList.forEach(async mutation => {
              if (mutation.attributeName == "disabled" && !acceptButton.disabled) {
                is(acceptButton.disabled, false, "Accept button enabled");
                if (AppConstants.platform != "macosx") {
                  let bundle = Services.strings.createBundle(
                    "chrome://branding/locale/brand.properties"
                  );
                  let name = bundle.GetStringFromName("brandShortName");
                  // macOS requires extra step in Finder to set TB as default calendar app.
                  ok(
                    dialogWindow.document.getElementById("openHandler").label.includes(name),
                    `${name} is the default calendar app`
                  );
                }

                // Should really click acceptButton and test
                // calender-ics-file-dialog is opened. But on local, a new TB
                // instance is started and this test will fail.
                dialogElement.getButton("cancel").click();
                resolve();
              }
            });
          });
          observer.observe(acceptButton, { attributes: true });
        });
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    {},
    aboutMessage
  );
  await promise;

  await BrowserTestUtils.closeWindow(msgWindow);
});

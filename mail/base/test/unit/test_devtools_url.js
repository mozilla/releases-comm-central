/**
 * This test checks for the URL of the developer tools toolbox. If it fails,
 * then the code for opening the toolbox has likely changed, and the code in
 * MailGlue that observes command-line-startup will not be working properly.
 */

Cu.importGlobalProperties(["fetch"]);
var { MailGlue } = ChromeUtils.import("resource:///modules/MailGlue.jsm");

add_task(async () => {
  const expectedURL = `"${MailGlue.BROWSER_TOOLBOX_WINDOW_URL}"`;
  const containingFile =
    "resource://devtools/client/framework/browser-toolbox/Launcher.sys.mjs";

  const response = await fetch(containingFile);
  const text = await response.text();

  Assert.ok(
    text.includes(expectedURL),
    `Expected to find ${expectedURL} in ${containingFile}.`
  );
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

/**
 * Populates the "Chat" section of the troubleshooting information page with
 * the chat accounts.
 */
function populateChatSection() {
  let table = document.getElementById("chat-table");
  let rowTmpl = document.getElementById("chat-table-row-template");
  let dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "long",
  });
  let formatDebugMessage = dbgMsg => {
    let m = dbgMsg.message;
    let time = new Date(m.timeStamp);
    time = dateTimeFormatter.format(time);
    let level = dbgMsg.logLevel;
    if (!level) {
      return "(" + m.errorMessage + ")";
    }
    if (level == dbgMsg.LEVEL_ERROR) {
      level = "ERROR";
    } else if (level == dbgMsg.LEVEL_WARNING) {
      level = "WARN.";
    } else if (level == dbgMsg.LEVEL_LOG) {
      level = "LOG  ";
    } else {
      level = "DEBUG";
    }
    return (
      "[" +
      time +
      "] " +
      level +
      " (@ " +
      m.sourceLine +
      " " +
      m.sourceName +
      ":" +
      m.lineNumber +
      ")\n" +
      m.errorMessage
    );
  };

  let chatAccounts = IMServices.accounts.getAccounts();
  if (!chatAccounts.length) {
    return;
  }
  table.querySelector("tbody").append(
    ...chatAccounts.map(account => {
      const row = rowTmpl.content.cloneNode(true).querySelector("tr");
      row.cells[0].textContent = account.id;
      row.cells[1].textContent = account.protocol.id;
      row.cells[2].textContent = account.name;
      row.cells[3].addEventListener("click", () => {
        const text = account
          .getDebugMessages()
          .map(formatDebugMessage)
          .join("\n");
        navigator.clipboard.writeText(text);
      });
      return row;
    })
  );
}

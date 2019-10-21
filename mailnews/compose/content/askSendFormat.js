/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gParam = null;

document.addEventListener("dialogaccept", Send);

/**
 * This dialog should be opened with arguments like e.g.
 * {action: nsIMsgCompSendFormat.AskUser, convertible: nsIMsgCompConvertible.Yes}
 */
function Startup() {
  gParam = window.arguments[0];

  const msgCompSendFormat = Ci.nsIMsgCompSendFormat;
  const msgCompConvertible = Ci.nsIMsgCompConvertible;

  // Select the node that needs to be updated.
  let mailSendFormatExplanation = document.getElementById(
    "mailSendFormatExplanation"
  );
  let icon = document.getElementById("convertDefault");

  let bundle = document.getElementById("askSendFormatStringBundle");
  let convertibleAltering = bundle.getString("convertibleAltering");
  let convertibleNo = bundle.getString("convertibleNo");
  let convertibleYes = bundle.getString("convertibleYes");

  // If the user hits the close box, we will abort.
  gParam.abort = true;

  switch (gParam.convertible) {
    case msgCompConvertible.Altering:
      mailSendFormatExplanation.textContent = convertibleAltering;
      icon.className = "question-icon";
      break;
    case msgCompConvertible.No:
      mailSendFormatExplanation.textContent = convertibleNo;
      icon.className = "alert-icon";
      break;
    default:
      // msgCompConvertible.Yes
      mailSendFormatExplanation.textContent = convertibleYes;
      icon.className = "message-icon";
      break;
  }

  // Set the default radio array value and recommendation.
  let group = document.getElementById("mailDefaultHTMLAction");
  if (gParam.action != msgCompSendFormat.AskUser) {
    group.value = gParam.action;
    group.selectedItem.label += " " + bundle.getString("recommended");
  }

  setTimeout(() => {
    window.sizeToContent();
  }, 80);
}

function Send() {
  // gParam.action should be an integer for when it is returned to MsgComposeCommands.js
  gParam.action = parseInt(
    document.getElementById("mailDefaultHTMLAction").value
  );
  gParam.abort = false;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/CrashReports.jsm");

/**
 * Get list of crashes and show 5 most recent.*/

var kCrashesMaxCount = 5;

function populateCrashesSection() {
  let reportURL;
  try {
    reportURL = Services.prefs.getCharPref("breakpad.reportURL");
    // Ignore any non http/https urls
    if (!/^https?:/i.test(reportURL))
      reportURL = null;
  }
  catch (e) { }
  if (!reportURL) {
    let noConfig = document.getElementById("crashes-noConfig")
    noConfig.style.display = "block";
    noConfig.classList.remove("no-copy");
    return;
  }
  else {
    let allReports = document.getElementById("crashes-allReports")
    allReports.style.display = "block";
    allReports.classList.remove("no-copy");
  }

  let reports = CrashReports.getReports();
  let reportsSubmitted = [];
  let reportsPendingCount = 0;
  for (let report of reports)
  {
    if (!report.pending)
    {
      reportsSubmitted.push(report);
      if (reportsSubmitted.length == kCrashesMaxCount)
        break;
    }
    else
    {
      reportsPendingCount++;
    }
  }

  let dateFormat = Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
                             .getService(Components.interfaces.nsIScriptableDateFormat);
  let crashesBody = document.getElementById("crashes-tbody");
  for (let report of reportsSubmitted)
  {
    let tr = document.createElement("tr");
    let cellCrashLink = document.createElement("td");
    let anchor = document.createElement("a");
    anchor.setAttribute("href", reportURL + report.id);
    anchor.textContent = report.id;
    cellCrashLink.appendChild(anchor);
    tr.appendChild(cellCrashLink);
    let dateSubmitted = new Date(report.date);
    let cellDate = document.createElement("td");
    cellDate.textContent = dateFormat.FormatDate("", dateFormat.dateFormatShort,
                                                 dateSubmitted.getFullYear(),
                                                 dateSubmitted.getMonth() + 1,
                                                 dateSubmitted.getDate());
    tr.appendChild(cellDate);
    crashesBody.appendChild(tr);
  }
}

/**
 * Returns a plaintext representation of extension data.
 */

function getCrashesText(aIndent) {
  let crashesData = "";
  let recentCrashesSubmitted = document.querySelectorAll("#crashes-tbody > tr");
  for (let i = 0; i < recentCrashesSubmitted.length; i++)
  {
    let tds = recentCrashesSubmitted.item(i).querySelectorAll("td");
    crashesData += aIndent.repeat(2) + tds.item(0).firstChild.href +
                   " (" + tds.item(1).textContent + ")\n";
  }
  return crashesData;
}

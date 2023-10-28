/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  schema: "resource:///modules/policies/schema.sys.mjs",
});

function col(text, className) {
  const column = document.createElement("td");
  if (className) {
    column.classList.add(className);
  }
  const content = document.createTextNode(text);
  column.appendChild(content);
  return column;
}

function addMissingColumns() {
  const table = document.getElementById("activeContent");
  let maxColumns = 0;

  // count the number of columns per row and set the max number of columns
  for (let i = 0, length = table.rows.length; i < length; i++) {
    if (maxColumns < table.rows[i].cells.length) {
      maxColumns = table.rows[i].cells.length;
    }
  }

  // add the missing columns
  for (let i = 0, length = table.rows.length; i < length; i++) {
    const rowLength = table.rows[i].cells.length;

    if (rowLength < maxColumns) {
      let missingColumns = maxColumns - rowLength;

      while (missingColumns > 0) {
        table.rows[i].insertCell();
        missingColumns--;
      }
    }
  }
}

/*
 * This function generates the Active Policies content to be displayed by calling
 * a recursive function called generatePolicy() according to the policy schema.
 */

function generateActivePolicies(data) {
  const new_cont = document.getElementById("activeContent");
  new_cont.classList.add("active-policies");

  let policy_count = 0;

  for (const policyName in data) {
    const color_class = ++policy_count % 2 === 0 ? "even" : "odd";

    if (lazy.schema.properties[policyName].type == "array") {
      for (const count in data[policyName]) {
        const isFirstRow = count == 0;
        const isLastRow = count == data[policyName].length - 1;
        const row = document.createElement("tr");
        row.classList.add(color_class);
        row.appendChild(col(isFirstRow ? policyName : ""));
        generatePolicy(
          data[policyName][count],
          row,
          1,
          new_cont,
          isLastRow,
          data[policyName].length > 1
        );
      }
    } else if (lazy.schema.properties[policyName].type == "object") {
      let count = 0;
      for (const obj in data[policyName]) {
        const isFirstRow = count == 0;
        const isLastRow = count == Object.keys(data[policyName]).length - 1;
        const row = document.createElement("tr");
        row.classList.add(color_class);
        row.appendChild(col(isFirstRow ? policyName : ""));
        row.appendChild(col(obj));
        generatePolicy(
          data[policyName][obj],
          row,
          2,
          new_cont,
          isLastRow,
          true
        );
        count++;
      }
    } else {
      const row = document.createElement("tr");
      row.appendChild(col(policyName));
      row.appendChild(col(JSON.stringify(data[policyName])));
      row.classList.add(color_class, "last_row");
      new_cont.appendChild(row);
    }
  }

  if (policy_count < 1) {
    const current_tab = document.querySelector(".active");
    if (Services.policies.status == Services.policies.ACTIVE) {
      current_tab.classList.add("no-specified-policies");
    } else {
      current_tab.classList.add("inactive-service");
    }
  }

  addMissingColumns();
}

/*
 * This is a helper recursive function that iterates levels of each
 * policy and formats the content to be displayed accordingly.
 */

function generatePolicy(data, row, depth, new_cont, islast, arr_sep = false) {
  const color_class = row.classList.contains("odd") ? "odd" : "even";

  if (Array.isArray(data)) {
    for (const count in data) {
      if (count == 0) {
        if (count == data.length - 1) {
          generatePolicy(
            data[count],
            row,
            depth + 1,
            new_cont,
            islast ? islast : false,
            true
          );
        } else {
          generatePolicy(data[count], row, depth + 1, new_cont, false, false);
        }
      } else if (count == data.length - 1) {
        const last_row = document.createElement("tr");
        last_row.classList.add(color_class, "arr_sep");

        for (let i = 0; i < depth; i++) {
          last_row.appendChild(col(""));
        }

        generatePolicy(
          data[count],
          last_row,
          depth + 1,
          new_cont,
          islast ? islast : false,
          arr_sep
        );
      } else {
        const new_row = document.createElement("tr");
        new_row.classList.add(color_class);

        for (let i = 0; i < depth; i++) {
          new_row.appendChild(col(""));
        }

        generatePolicy(data[count], new_row, depth + 1, new_cont, false, false);
      }
    }
  } else if (typeof data == "object" && Object.keys(data).length > 0) {
    let count = 0;
    for (const obj in data) {
      if (count == 0) {
        row.appendChild(col(obj));
        if (count == Object.keys(data).length - 1) {
          generatePolicy(
            data[obj],
            row,
            depth + 1,
            new_cont,
            islast ? islast : false,
            arr_sep
          );
        } else {
          generatePolicy(data[obj], row, depth + 1, new_cont, false, false);
        }
      } else if (count == Object.keys(data).length - 1) {
        const last_row = document.createElement("tr");
        for (let i = 0; i < depth; i++) {
          last_row.appendChild(col(""));
        }

        last_row.appendChild(col(obj));
        last_row.classList.add(color_class);

        if (arr_sep) {
          last_row.classList.add("arr_sep");
        }

        generatePolicy(
          data[obj],
          last_row,
          depth + 1,
          new_cont,
          islast ? islast : false,
          false
        );
      } else {
        const new_row = document.createElement("tr");
        new_row.classList.add(color_class);

        for (let i = 0; i < depth; i++) {
          new_row.appendChild(col(""));
        }

        new_row.appendChild(col(obj));
        generatePolicy(data[obj], new_row, depth + 1, new_cont, false, false);
      }
      count++;
    }
  } else {
    row.appendChild(col(JSON.stringify(data)));

    if (arr_sep) {
      row.classList.add("arr_sep");
    }
    if (islast) {
      row.classList.add("last_row");
    }
    new_cont.appendChild(row);
  }
}

function generateErrors() {
  const consoleStorage = Cc["@mozilla.org/consoleAPI-storage;1"];
  const storage = consoleStorage.getService(Ci.nsIConsoleAPIStorage);
  const consoleEvents = storage.getEvents();
  const prefixes = [
    "Enterprise Policies",
    "JsonSchemaValidator.jsm",
    "Policies.jsm",
    "GPOParser.jsm",
    "Enterprise Policies Child",
    "BookmarksPolicies.jsm",
    "ProxyPolicies.jsm",
    "WebsiteFilter Policy",
    "macOSPoliciesParser.jsm",
  ];

  const new_cont = document.getElementById("errorsContent");
  new_cont.classList.add("errors");

  let flag = false;
  for (const err of consoleEvents) {
    if (prefixes.includes(err.prefix)) {
      flag = true;
      const row = document.createElement("tr");
      row.appendChild(col(err.arguments[0]));
      new_cont.appendChild(row);
    }
  }
  if (!flag) {
    const errors_tab = document.getElementById("category-errors");
    errors_tab.style.display = "none";
  }
}

function generateDocumentation() {
  const new_cont = document.getElementById("documentationContent");
  new_cont.setAttribute("id", "documentationContent");

  // map specific policies to a different string ID, to allow updates to
  // existing descriptions
  const string_mapping = {
    BackgroundAppUpdate: "BackgroundAppUpdate2",
    Certificates: "CertificatesDescription",
  };

  for (const policyName in lazy.schema.properties) {
    const main_tbody = document.createElement("tbody");
    main_tbody.classList.add("collapsible");
    main_tbody.addEventListener("click", function () {
      const content = this.nextElementSibling;
      content.classList.toggle("content");
    });
    const row = document.createElement("tr");
    row.appendChild(col(policyName));
    const descriptionColumn = col("");
    const stringID = string_mapping[policyName] || policyName;
    descriptionColumn.setAttribute("data-l10n-id", `policy-${stringID}`);
    row.appendChild(descriptionColumn);
    main_tbody.appendChild(row);
    const sec_tbody = document.createElement("tbody");
    sec_tbody.classList.add("content");
    sec_tbody.classList.add("content-style");
    const schema_row = document.createElement("tr");
    if (lazy.schema.properties[policyName].properties) {
      const column = col(
        JSON.stringify(lazy.schema.properties[policyName].properties, null, 1),
        "schema"
      );
      column.colSpan = "2";
      schema_row.appendChild(column);
      sec_tbody.appendChild(schema_row);
    } else if (lazy.schema.properties[policyName].items) {
      const column = col(
        JSON.stringify(lazy.schema.properties[policyName], null, 1),
        "schema"
      );
      column.colSpan = "2";
      schema_row.appendChild(column);
      sec_tbody.appendChild(schema_row);
    } else {
      let column = col(
        "type: " + lazy.schema.properties[policyName].type,
        "schema"
      );
      column.colSpan = "2";
      schema_row.appendChild(column);
      sec_tbody.appendChild(schema_row);
      if (lazy.schema.properties[policyName].enum) {
        const enum_row = document.createElement("tr");
        column = col(
          "enum: " +
            JSON.stringify(lazy.schema.properties[policyName].enum, null, 1),
          "schema"
        );
        column.colSpan = "2";
        enum_row.appendChild(column);
        sec_tbody.appendChild(enum_row);
      }
    }
    new_cont.appendChild(main_tbody);
    new_cont.appendChild(sec_tbody);
  }
}

let gInited = false;
function init() {
  if (gInited) {
    return;
  }
  gInited = true;

  const data = Services.policies.getActivePolicies();
  generateActivePolicies(data);
  generateErrors();
  generateDocumentation();

  // Event delegation on #categories element
  const menu = document.getElementById("categories");
  for (const category of menu.children) {
    category.addEventListener("click", () => show(category));
  }

  if (location.hash) {
    const sectionButton = document.getElementById(
      "category-" + location.hash.substring(1)
    );
    if (sectionButton) {
      sectionButton.click();
    }
  }

  window.addEventListener("hashchange", function () {
    if (location.hash) {
      const sectionButton = document.getElementById(
        "category-" + location.hash.substring(1)
      );
      sectionButton.click();
    }
  });
}

function show(button) {
  const current_tab = document.querySelector(".active");
  const category = button.getAttribute("id").substring("category-".length);
  const content = document.getElementById(category);
  if (current_tab == content) {
    return;
  }
  saveScrollPosition(current_tab.id);
  current_tab.classList.remove("active");
  current_tab.hidden = true;
  content.classList.add("active");
  content.hidden = false;

  const current_button = document.querySelector("[selected=true]");
  current_button.removeAttribute("selected");
  button.setAttribute("selected", "true");

  const title = document.getElementById("sectionTitle");
  title.textContent = button.children[1].textContent;
  location.hash = category;
  restoreScrollPosition(category);
}

const scrollPositions = {};
function saveScrollPosition(category) {
  const mainContent = document.querySelector(".main-content");
  scrollPositions[category] = mainContent.scrollTop;
}

function restoreScrollPosition(category) {
  const scrollY = scrollPositions[category] || 0;
  const mainContent = document.querySelector(".main-content");
  mainContent.scrollTo(0, scrollY);
}

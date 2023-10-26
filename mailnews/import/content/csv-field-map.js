/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { exportAttributes } = ChromeUtils.import(
  "resource:///modules/AddrBookUtils.jsm"
);

/**
 * A component to config the mapping between CSV fields and address book fields.
 * For each CSV field, there is a <select> with address book fields as options.
 * If an address book field is selected for one CSV field, it can't be used for
 * another CSV field.
 */
class CsvFieldMap extends HTMLElement {
  /** Render the first two rows from the source CSV data. */
  DATA_ROWS_LIMIT = 2;

  /** @type {string[]} - The indexes of target address book fields. */
  get value() {
    return [...this._elTbody.querySelectorAll("select")].map(
      select => select.value
    );
  }

  /** @type {string[][]} - An array of rows, each row is an array of columns. */
  set data(rows) {
    this._init();
    this._rows = rows.slice(0, this.DATA_ROWS_LIMIT);
    this._render();
  }

  /**
   * Init internal states.
   */
  _init() {
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/importMsgs.properties"
    );
    this._supportedFields = [];
    for (const [, stringId] of exportAttributes) {
      if (stringId) {
        this._supportedFields.push(bundle.GetStringFromID(stringId));
      }
    }
    // Create an index array ["0", "1", "2", ..., "<length -1>"].
    this._allFieldIndexes = Array.from({
      length: this._supportedFields.length,
    }).map((_, index) => index.toString());
  }

  /**
   * Init <option> list for all <select> elements.
   */
  _initSelectOptions() {
    let fields;
    let fieldIndexes = Services.prefs.getCharPref("mail.import.csv.fields", "");
    if (fieldIndexes) {
      // If the user has done CSV importing before, show the same field mapping.
      fieldIndexes = fieldIndexes.split(",");
      fields = fieldIndexes.map(i => (i == "" ? i : this._supportedFields[+i]));
    } else {
      // Show the same field orders as in an exported CSV file.
      fields = this._supportedFields;
      fieldIndexes = this._allFieldIndexes;
    }

    let i = 0;
    for (const select of this.querySelectorAll("select")) {
      if (fields[i]) {
        const option = document.createElement("option");
        option.value = fieldIndexes[i];
        option.textContent = fields[i];
        select.add(option);
      } else {
        select.disabled = true;
        select
          .closest("tr")
          .querySelector("input[type=checkbox]").checked = false;
      }
      i++;
    }

    this._updateSelectOptions();
  }

  /**
   * When a <select> is disabled, we remove all its options. This function is to
   * add all available options back.
   *
   * @param {HTMLSelectElement} select - The <select> element.
   */
  _enableSelect(select) {
    const selects = [...this._elTbody.querySelectorAll("select")];
    const selectedFieldIndexes = selects.map(select => select.value);
    const availableFieldIndexes = this._allFieldIndexes.filter(
      index => !selectedFieldIndexes.includes(index)
    );
    for (let i = 0; i < availableFieldIndexes.length; i++) {
      const option = document.createElement("option");
      option.value = availableFieldIndexes[i];
      option.textContent = this._supportedFields[option.value];
      select.add(option);
    }
  }

  /**
   * Update the options of all <select> elements. The result is if an option is
   * selected by a <select>, this option should no longer be shown as an option
   * for other <select>.
   *
   * @param {HTMLSelectElement} [changedSelect] - This param is present only
   * when an option is selected, we don't need to update the options of this
   * <select> element.
   */
  _updateSelectOptions(changedSelect) {
    const selects = [...this._elTbody.querySelectorAll("select")];
    const selectedFieldIndexes = selects.map(select => select.value);
    const availableFieldIndexes = this._allFieldIndexes.filter(
      index => !selectedFieldIndexes.includes(index)
    );

    for (const select of selects) {
      if (select.disabled || select == changedSelect) {
        continue;
      }
      for (let i = select.options.length - 1; i >= 0; i--) {
        // Remove unselected options first.
        if (i != select.selectedIndex) {
          select.remove(i);
        }
      }
      for (let i = 0; i < availableFieldIndexes.length; i++) {
        // Add all available options.
        const option = document.createElement("option");
        option.value = availableFieldIndexes[i];
        option.textContent = this._supportedFields[option.value];
        select.add(option);
      }
    }
  }

  /**
   * Handle the change event of <select> and <input type="checkbox">.
   */
  _bindEvents() {
    this._elTbody.addEventListener("change", e => {
      const el = e.target;
      if (el.tagName == "select") {
        this._updateSelectOptions(el);
      } else if (el.tagName == "input" && el.type == "checkbox") {
        const select = el.closest("tr").querySelector("select");
        select.disabled = !el.checked;
        if (select.disabled) {
          // Because it's disabled, remove all the options.
          for (let i = select.options.length - 1; i >= 0; i--) {
            select.remove(i);
          }
        } else {
          this._enableSelect(select);
        }
        this._updateSelectOptions();
      }
    });
  }

  /**
   * Render the table structure.
   */
  async _renderLayout() {
    this.innerHTML = "";
    const [
      firstRowContainsHeaders,
      sourceField,
      sourceFirstRecord,
      sourceSecondRecord,
      targetField,
    ] = await document.l10n.formatValues([
      "csv-first-row-contains-headers",
      "csv-source-field",
      "csv-source-first-record",
      "csv-source-second-record",
      "csv-target-field",
    ]);

    const label = document.createElement("label");
    label.className = "toggle-container-with-text";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Services.prefs.getBoolPref(
      "mail.import.csv.skipfirstrow",
      true
    );
    const labelText = document.createElement("span");
    labelText.textContent = firstRowContainsHeaders;
    label.appendChild(checkbox);
    label.appendChild(labelText);
    this.appendChild(label);

    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    const headers = [];
    for (const colName of [sourceField, sourceFirstRecord, targetField, ""]) {
      const th = document.createElement("th");
      th.textContent = colName;
      tr.appendChild(th);
      headers.push(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    this._elTbody = document.createElement("tbody");
    table.appendChild(this._elTbody);

    this.appendChild(table);
    this._bindEvents();

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        headers[0].textContent = sourceField;
        headers[1].textContent = sourceFirstRecord;
      } else {
        headers[0].textContent = sourceFirstRecord;
        headers[1].textContent = sourceSecondRecord;
      }
      Services.prefs.setBoolPref(
        "mail.import.csv.skipfirstrow",
        checkbox.checked
      );
    });
  }

  /**
   * Render the table content. Each row contains four columns:
   *   Source field | Source Data | Address book field | <checkbox>
   */
  _renderTable() {
    const colCount = this._rows[0].length;
    for (let i = 0; i < colCount; i++) {
      const tr = document.createElement("tr");

      // Render the source field name and source data.
      for (let j = 0; j < this.DATA_ROWS_LIMIT; j++) {
        const td = document.createElement("td");
        td.textContent = this._rows[j]?.[i] || "";
        tr.appendChild(td);
      }

      // Render a <select> for target field name.
      let td = document.createElement("td");
      const select = document.createElement("select");
      td.appendChild(select);
      tr.appendChild(td);

      // Render a checkbox.
      td = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      td.appendChild(checkbox);
      tr.appendChild(td);

      this._elTbody.appendChild(tr);
    }

    this._initSelectOptions();
  }

  /**
   * Render the table layout and content.
   */
  async _render() {
    await this._renderLayout();
    this._renderTable();
  }
}

customElements.define("csv-field-map", CsvFieldMap);

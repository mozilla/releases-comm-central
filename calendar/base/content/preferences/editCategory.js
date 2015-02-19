/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

// Global variable, set to true if the user has picked a custom color.
var customColorSelected = false;

/**
 * Load Handler, called when the edit category dialog is loaded
 */
function editCategoryLoad() {
    let color = window.arguments[1] || cal.hashColor(window.arguments[0]);
    let hasColor = (window.arguments[1] != null);
    document.getElementById("categoryName").value = window.arguments[0];
    document.getElementById("categoryColor").value = color;
    document.getElementById("useColor").checked = hasColor;
    customColorSelected = hasColor;
    document.title = window.arguments[2];

    toggleColor();
}

/**
 * Handler function to be called when the category dialog is accepted and
 * the opener should further process the selected name and color
 */
function doOK() {
    let color = document.getElementById("useColor").checked ?
                document.getElementById("categoryColor").value :
                null;

    let categoryName = document.getElementById("categoryName").value;
    window.opener.gCategoriesPane.saveCategory(categoryName, color);
    return true;
}

/**
 * Handler function to be called when the category name changed
 */
function categoryNameChanged() {
    let newValue = document.getElementById("categoryName").value;

    // The user removed the category name, assign the color automatically again.
    if (newValue == "") {
        customColorSelected = false;
    }

    if (!customColorSelected && document.getElementById('useColor').checked) {
        // Color is wanted, choose the color based on the category name's hash.
        document.getElementById("categoryColor").value = cal.hashColor(newValue);
    }
}

/**
 * Handler function to be called when the color picker's color has been changed.
 */
function colorPickerChanged() {
    document.getElementById('useColor').checked = true;
    customColorSelected = true;
}

/**
 * Handler called when the use color checkbox is toggled.
 */
function toggleColor() {
    let useColor = document.getElementById('useColor').checked;
    let categoryColor = document.getElementById('categoryColor');

    if (useColor) {
        categoryColor.setAttribute("type", "color");
        if (toggleColor.lastColor) {
            categoryColor.value = toggleColor.lastColor;
        }
    } else {
        categoryColor.setAttribute("type", "button");
        toggleColor.lastColor = categoryColor.value;
        categoryColor.value = "";
    }
}

/**
 * Click handler for the color picker. Turns the button back into a colorpicker
 * when clicked.
 */
function clickColor() {
    let categoryColor = document.getElementById('categoryColor');
    if (categoryColor.getAttribute("type") == "button") {
        colorPickerChanged();
        toggleColor();
        categoryColor.click();
    }
}

/**
 * Call the function after the given timeout, resetting the timer if delay is
 * called again with the same function.
 *
 * @param timeout   The timeout interval.
 * @param func      The function to call after the timeout.
 */
function delay(timeout, func) {
    if (func.timer) {
      clearTimeout(func.timer);
    }
    func.timer = setTimeout(func, timeout);
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * A category name and colors stored as plain values in Redux.
 *
 * @typedef {object} CalendarEventCategoryOption
 * @property {string} name - The category name.
 * @property {string} color - A background color in `#RRGGBB` form, or an empty
 *   string to use the neutral CSS color.
 * @property {string} textColor - A text color for the background, or an empty
 *   string to use the neutral CSS color.
 */

/**
 * Returns a category name and colors without writing preferences.
 * If the configured or fallback color is invalid, returns empty color strings.
 *
 * @param {string} categoryName - The category name.
 * @param {string} [fallback=""] - The color used when no color is configured.
 * @returns {CalendarEventCategoryOption} The name, background, and text color.
 */
export function getCategoryOption(categoryName, fallback = "") {
  // Color preference keys use the CSS-safe form of the category name.
  const key = cal.view.formatStringForCSSRule(categoryName);
  const color = Services.prefs.getStringPref(
    `calendar.category.color.${key}`,
    fallback
  );
  // The contrast helper expects six-digit RGB colors.
  const usableColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "";

  return {
    name: categoryName,
    color: usableColor,
    textColor: usableColor ? cal.view.getContrastingTextColor(usableColor) : "",
  };
}

/**
 * Returns unique category choices sorted for the current locale, without
 * changing preferences. If no names are configured, uses translated defaults.
 * Saved event categories are loaded separately and can include other names.
 *
 * @returns {Promise<CalendarEventCategoryOption[]>} Resolves to sorted choices
 *   after any default names have been translated.
 */
export async function loadCategoryOptions() {
  const configuredNames = Services.prefs.getStringPref(
    "calendar.categories.names",
    null
  );

  // Read names directly because cal.category.fromPrefs() writes defaults.
  // stringToArray() preserves escaped commas in category names.
  const names = cal.category.stringToArray(
    configuredNames ||
      (await new Localization(["calendar/categories.ftl"]).formatValue(
        "categories2"
      ))
  );

  // Default names use Calendar's palette when no color preference exists.
  // Configured names without a color keep the neutral CSS colors.
  return [...new Set(names)]
    .sort(new Intl.Collator().compare)
    .map(categoryName =>
      getCategoryOption(
        categoryName,
        !configuredNames ? cal.view.hashColor(categoryName) : ""
      )
    );
}

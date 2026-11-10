/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fileURLToPath } from "node:url";

/**
 * Adds the Fluent decorators to the Storybook preview.
 *
 * @param {string[]} [entry=[]] - Registered preview modules.
 * @returns {string[]} The preview modules, including the Fluent decorators.
 */
export function previewAnnotations(entry = []) {
  return [
    ...entry,
    fileURLToPath(import.meta.resolve("./preset/preview.mjs")),
  ];
}

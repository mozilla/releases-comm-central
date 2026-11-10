/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DOMLocalization } from "@fluent/dom";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import { addons } from "storybook/preview-api";
import { PSEUDO_STRATEGY_TRANSFORMS } from "./l10n-pseudo.mjs";
import {
  FLUENT_SET_STRINGS,
  UPDATE_STRATEGY_EVENT,
  STRATEGY_DEFAULT,
  PSEUDO_STRATEGIES,
} from "./addon-fluent/constants.mjs";

const loadedResources = new Map();
const fluentResources = import.meta.glob(
  [
    "../../../../../toolkit/locales/en-US/toolkit/**/*.ftl",
    "../../../locales/en-US/messenger/**/*.ftl",
    "../../../branding/nightly/locales/en-US/**/*.ftl",
    "../../../../calendar/locales/en-US/calendar/**/*.ftl",
    "../../../../chat/locales/en-US/**/*.ftl",
  ],
  { query: "?raw", import: "default" }
);
const resourceRoots = {
  toolkit: "../../../../../toolkit/locales/en-US/",
  messenger: "../../../locales/en-US/",
  branding: "../../../branding/nightly/locales/en-US/",
  calendar: "../../../../calendar/locales/en-US/",
  chat: "../../../../chat/locales/en-US/",
};
let currentStrategy;
const storybookBundle = new FluentBundle("en-US", {
  transform(str) {
    if (currentStrategy in PSEUDO_STRATEGY_TRANSFORMS) {
      return PSEUDO_STRATEGY_TRANSFORMS[currentStrategy](str);
    }
    return str;
  },
});

// Listen for update events from addon-fluent.
const channel = addons.getChannel();
channel.on(UPDATE_STRATEGY_EVENT, updatePseudoStrategy);
channel.on(FLUENT_SET_STRINGS, ftlContents => {
  const resource = new FluentResource(ftlContents);
  for (const message of resource.body) {
    const existingMessage = storybookBundle.getMessage(message.id);
    existingMessage.value = message.value;
    existingMessage.attributes = message.attributes;
  }
  document.l10n.translateRoots();
});

/**
 * Updates "currentStrategy" when the selected pseudo localization strategy
 * changes, which in turn changes the transform used by the Fluent bundle.
 *
 * @param {string} strategy
 *  Pseudo localization strategy. Can be "default", "accented", or "bidi".
 */
function updatePseudoStrategy(strategy = STRATEGY_DEFAULT) {
  if (strategy !== currentStrategy && PSEUDO_STRATEGIES.includes(strategy)) {
    currentStrategy = strategy;
    document.l10n.translateRoots();
  }
}

class WrappedDOMLocalization extends DOMLocalization {
  constructor(resources) {
    Promise.all(resources.map(file =>insertFTLIfNeeded(file)))
      .then(() => this.translateRoots());
    super(resources, generateBundles);
  }
}

export function connectFluent() {
  document.l10n = new DOMLocalization([], generateBundles);
  document.l10n.connectRoot(document.documentElement);
  document.l10n.translateRoots();
  window.DOMLocalization = WrappedDOMLocalization;
}

function* generateBundles() {
  yield* [storybookBundle];
}

/**
 * Loads a Fluent resource into the Storybook bundle.
 *
 * @param {string} fileName - Logical resource name, such as "chat/accounts.ftl".
 * @returns {Promise<void>} Resolves when the bundle contains the resource.
 *   DOM translation can still be running.
 * @throws {Error} Rejects if the resource is unknown or cannot be loaded.
 */
export async function insertFTLIfNeeded(fileName) {
  if (loadedResources.has(fileName)) {
    return;
  }

  const [root, ...rest] = fileName.split("/");
  // Branding and Chat files live directly in their locale roots.
  const resourceName =
    root === "branding" || root === "chat" ? rest.join("/") : fileName;
  const loadResource = fluentResources[`${resourceRoots[root]}${resourceName}`];

  if (!loadResource) {
    throw new Error(`Unknown Fluent resource: ${fileName}`);
  }

  const ftlContents = await loadResource();

  if (loadedResources.has(fileName)) {
    // Seems possible we've attempted to load this twice before the first call
    // resolves, so once the first load is complete we can abandon the others.
    return;
  }

  provideFluent(ftlContents, fileName);
}

export function provideFluent(ftlContents, fileName) {
  const ftlResource = new FluentResource(ftlContents);
  storybookBundle.addResource(ftlResource);
  if (fileName) {
    loadedResources.set(fileName, ftlResource);
  }
  document.l10n.translateRoots();
  return ftlResource;
}

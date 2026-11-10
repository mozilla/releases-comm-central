/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global content */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Assert: "resource://testing-common/Assert.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

const AXE_SOURCE_URL = "resource://testing-common/mail/axe.min.js";
const AXE_WATCHERS_PROPERTY = "__tbAxeMutationWatchers";
const DEFAULT_THROTTLE_MS = 10;
const DEFAULT_AXE_OPTIONS = {
  preload: {
    // Axe preloads all supported assets when any preload-dependent rule runs.
    // The default enabled preload rule only needs media metadata; avoiding
    // CSSOM preloading keeps chrome/file stylesheets out of axe's XHR parser.
    assets: ["media"],
  },
};
const CONTENT_BROWSER_DEFAULT_AXE_OPTIONS = {
  ...DEFAULT_AXE_OPTIONS,
  rules: {
    // Content tabs in browser tests often host partial documents or focused
    // fixtures, so they should not be required to define page-level landmarks.
    "landmark-one-main": { enabled: false },
    region: { enabled: false },
  },
};

let axeSourcePromise;
let axeWatcherCount = 0;
const axeWindowProperties = new WeakMap();
const shadowEventDocuments = new WeakMap();
const SYSTEM_COLOR_PAIRS = new Map([
  ["accentcolortext", "accentcolor"],
  ["buttontext", "buttonface"],
  ["canvastext", "canvas"],
  ["fieldtext", "field"],
  ["highlighttext", "highlight"],
  ["marktext", "mark"],
  ["selecteditemtext", "selecteditem"],
  ["linktext", "canvas"],
  ["visitedtext", "canvas"],
  ["activetext", "canvas"],
  ["-moz-dialogtext", "-moz-dialog"],
]);

/**
 * Returns an element's parent across slots and open shadow roots.
 *
 * @param {Element} element - The child element.
 * @returns {Element|null} The parent in the composed tree.
 */
function getColorParent(element) {
  return (
    element.assignedSlot ??
    element.parentElement ??
    element.getRootNode().host ??
    null
  );
}

/**
 * Returns a declared color after CSS variable substitution and inheritance.
 *
 * @param {Element} element - The element whose color is needed.
 * @param {string} property - The color property to trace.
 * @param {object} inspector - The privileged InspectorUtils namespace.
 * @returns {{keyword: string, element: Element}|null} The raw color and its source.
 */
function getDeclaredColor(element, property, inspector) {
  let value = "";

  // Matching declarations are ordered for the normal cascade. Do not infer
  // important, animation, or reset precedence from that order.
  for (const rule of inspector.getMatchingCSSRules(element)) {
    const style = rule.style;

    if (!style || style.getPropertyValue("all")) {
      return null;
    }

    const declaration = style.getPropertyValue(property);
    const priority = style.getPropertyPriority(property);

    if (priority) {
      return null;
    }

    const backgroundShorthand =
      property == "background-color"
        ? style.getPropertyValue("background")
        : "";
    const hasUnresolvedBackground =
      Boolean(backgroundShorthand) && !declaration;

    if (hasUnresolvedBackground) {
      return null;
    }

    if (!declaration) {
      continue;
    }

    const isDynamicDeclaration = [
      "animations",
      "transitions",
      "smil",
      "position-fallback",
    ].includes(rule.declarationOrigin);

    if (isDynamicDeclaration) {
      return null;
    }

    const substitutedValue =
      inspector.getSubstitutedValue(declaration, element) ?? declaration;

    value = substitutedValue.trim().toLowerCase();

    if (!value || ["revert", "revert-layer"].includes(value)) {
      return null;
    }
  }

  const isInheritedProperty = ["color", "-webkit-text-fill-color"].includes(
    property
  );
  const inheritsCurrentColor = property == "color" && value == "currentcolor";
  const usesInheritedValue = !value || value == "unset" || inheritsCurrentColor;
  const inherits =
    value == "inherit" || (isInheritedProperty && usesInheritedValue);

  if (!inherits) {
    return value ? { keyword: value, element } : null;
  }

  const parent = getColorParent(element);

  if (parent) {
    return getDeclaredColor(parent, property, inspector);
  }

  return property == "-webkit-text-fill-color"
    ? { keyword: "currentcolor", element }
    : null;
}

/**
 * Returns whether colors are opaque and equal in the same RGB color space.
 *
 * @param {object|null} first - The first InspectorUtils RGBA value.
 * @param {object|null} second - The second InspectorUtils RGBA value.
 * @returns {boolean} Whether both colors have the same opaque RGB value.
 */
function sameOpaqueColor(first, second) {
  return (
    first?.a == 1 &&
    second?.a == 1 &&
    first.r == second.r &&
    first.g == second.g &&
    first.b == second.b
  );
}

/**
 * Returns an opaque system text color and its declared source.
 *
 * @param {Element} element - The element being evaluated by axe.
 * @param {Window} win - The owning window.
 * @param {object} inspector - The privileged InspectorUtils namespace.
 * @returns {{color: object, source: {keyword: string, element: Element}}|null}
 *   The computed text color and its declared source.
 */
function getForegroundColor(element, win, inspector) {
  const source = getDeclaredColor(element, "color", inspector);

  if (!source || !SYSTEM_COLOR_PAIRS.has(source.keyword)) {
    return null;
  }

  const fill = getDeclaredColor(element, "-webkit-text-fill-color", inspector);

  if (!fill || !["currentcolor", "initial"].includes(fill.keyword)) {
    return null;
  }

  const style = win.getComputedStyle(element);
  const color = inspector.colorToRGBA(style.color);
  const isOpaque = color?.a == 1;

  return isOpaque ? { color, source } : null;
}

/**
 * Returns whether an element has effects that can change the visible colors.
 *
 * @param {Element} element - The element to check.
 * @param {Window} win - The owning window.
 * @param {CSSStyleProperties} style - The element's computed style.
 * @returns {boolean} Whether style effects or generated content can change colors.
 */
function hasColorEffects(element, win, style) {
  const hasTransparency = style.opacity != "1";

  if (hasTransparency) {
    return true;
  }

  const hasFilterOrBlending =
    style.filter != "none" ||
    style.backdropFilter != "none" ||
    style.mixBlendMode != "normal";

  if (hasFilterOrBlending) {
    return true;
  }

  const hasImageOrShadow =
    style.backgroundImage != "none" ||
    style.textShadow != "none" ||
    style.boxShadow.includes("inset");

  if (hasImageOrShadow) {
    return true;
  }

  const textStrokeWidth = parseFloat(
    style.getPropertyValue("-webkit-text-stroke-width")
  );

  if (textStrokeWidth > 0) {
    return true;
  }

  for (const pseudo of ["::before", "::after"]) {
    const pseudoContent = win.getComputedStyle(element, pseudo).content;
    const hasGeneratedContent =
      pseudoContent != "none" && pseudoContent != "normal";

    if (hasGeneratedContent) {
      return true;
    }
  }

  return false;
}

/**
 * Returns an opaque background and its source when no effects change the colors.
 *
 * @param {Element} element - The element being evaluated by axe.
 * @param {Window} win - The owning window.
 * @param {object} inspector - The privileged InspectorUtils namespace.
 * @returns {{color: object, source: {keyword: string, element: Element}}|null}
 *   The computed background color and its declared source.
 */
function getBackgroundColor(element, win, inspector) {
  let background = null;
  let backgroundSource = null;

  for (let ancestor = element; ancestor; ancestor = getColorParent(ancestor)) {
    const style = win.getComputedStyle(ancestor);

    if (hasColorEffects(ancestor, win, style)) {
      return null;
    }

    // Check ancestor effects even after finding the opaque background.
    if (background) {
      continue;
    }

    const color = inspector.colorToRGBA(style.backgroundColor);
    const alpha = color?.a;
    const isTransparent = alpha == 0;
    const isOpaque = alpha == 1;

    if (!isTransparent && !isOpaque) {
      return null;
    }

    if (isTransparent) {
      continue;
    }

    background = color;
    backgroundSource = getDeclaredColor(
      ancestor,
      "background-color",
      inspector
    );
  }

  return backgroundSource
    ? { color: background, source: backgroundSource }
    : null;
}

/**
 * Captures a matched system pair without effects that change the visible colors.
 *
 * @param {Element} element - The element being evaluated by axe.
 * @param {Window} win - The owning window.
 * @param {object} inspector - The privileged InspectorUtils namespace.
 * @returns {{foreground: object, background: object}|null} Computed opaque colors.
 */
function captureSystemColors(element, win, inspector) {
  const foreground = getForegroundColor(element, win, inspector);

  if (!foreground) {
    return null;
  }

  const background = getBackgroundColor(element, win, inspector);

  if (!background) {
    return null;
  }

  const expectedBackgroundKeyword = SYSTEM_COLOR_PAIRS.get(
    foreground.source.keyword
  );
  const hasMatchingSystemColors =
    background.source.keyword == expectedBackgroundKeyword;

  if (!hasMatchingSystemColors) {
    return null;
  }

  const targetColorScheme = win.getComputedStyle(element).colorScheme;

  // Inherited system colors keep the source element's color scheme.
  const foregroundColorScheme = win.getComputedStyle(
    foreground.source.element
  ).colorScheme;

  if (foregroundColorScheme != targetColorScheme) {
    return null;
  }

  const backgroundColorScheme = win.getComputedStyle(
    background.source.element
  ).colorScheme;

  if (backgroundColorScheme != targetColorScheme) {
    return null;
  }

  return { foreground: foreground.color, background: background.color };
}

/**
 * Runs axe and removes only failures evaluated with a matched system-color pair.
 * Keeps the original contrast check result until its measured colors are verified.
 *
 * @param {Window} win - The window containing axe and the scan context.
 * @param {object|string|Element} context - The axe scan context.
 * @param {object} axeOptions - The axe run options.
 * @returns {Promise<object>} The results with proven system-color failures removed.
 * @internal
 */
export async function runAxeWithSystemColors(win, context, axeOptions) {
  const axe = win.axe;

  // TODO: Keep failures from custom evaluators if tests replace this check.
  const contrastRule = axe.utils.getRule("color-contrast");
  const contrastCheck = contrastRule._audit.checks["color-contrast"];
  const originalEvaluate = contrastCheck.evaluate;
  const inspector = Cu.unwaiveXrays(win).InspectorUtils;

  // The bundled rule evaluates each element once.
  // TODO: Track samples by rule if tests reuse this check in custom rules.
  const samples = new WeakMap();

  function evaluateWithSystemColors(element, ...args) {
    const result = originalEvaluate.call(this, element, ...args);

    if (result !== false) {
      return result;
    }

    // Read provenance in the same synchronous call as the failing evaluation.
    // Styles after axe.run resolves cannot establish what the scan evaluated.
    try {
      const colors = captureSystemColors(element, win, inspector);

      if (colors) {
        samples.set(element, colors);
      }
    } catch {
      // If a style or inspector API cannot be read, keep the failure.
    }

    return result;
  }

  /**
   * Returns whether a contrast failure should stay in the report.
   *
   * @param {object} node - The axe contrast result node.
   * @returns {boolean} Whether to keep the contrast failure.
   */
  function shouldKeepContrastFailure(node) {
    if (node.target.length != 1) {
      return true;
    }

    try {
      // shadowSelect is a pinned vendored utility for axe selector chains.
      // Cross-frame targets and unresolved elements receive no exception.
      const element = axe.utils.shadowSelect(node.target[0]);
      const capturedColors = samples.get(element);

      if (!capturedColors) {
        return true;
      }

      const data = node.any[0].data;
      const capturedForeground = capturedColors.foreground;
      const recordedForeground = inspector.colorToRGBA(data.fgColor);
      const foregroundMatches = sameOpaqueColor(
        capturedForeground,
        recordedForeground
      );

      if (!foregroundMatches) {
        return true;
      }

      const capturedBackground = capturedColors.background;
      const recordedBackground = inspector.colorToRGBA(data.bgColor);
      const backgroundMatches = sameOpaqueColor(
        capturedBackground,
        recordedBackground
      );

      return !backgroundMatches;
    } catch {
      return true;
    }
  }

  // Axe rejects overlapping runs in the same window; callers must await scans.
  contrastCheck.evaluate = evaluateWithSystemColors;

  try {
    const results = await axe.run(context, axeOptions);

    results.violations = results.violations.filter(violation => {
      if (violation.id != "color-contrast") {
        return true;
      }

      violation.nodes = violation.nodes.filter(shouldKeepContrastFailure);

      return violation.nodes.length > 0;
    });

    return results;
  } finally {
    contrastCheck.evaluate = originalEvaluate;
  }
}

/**
 * Get the active build conditions that should disable axe checks.
 *
 * @returns {Array<string>} Active skip reasons.
 */
function getAxeSkipReasons() {
  const reasons = [];
  if (AppConstants.DEBUG) {
    reasons.push("debug");
  }
  if (AppConstants.ASAN) {
    reasons.push("asan");
  }
  if (AppConstants.TSAN) {
    reasons.push("tsan");
  }
  if (AppConstants.MOZ_CODE_COVERAGE) {
    reasons.push("ccov");
  }
  return reasons;
}

/**
 * Check whether axe checks should be skipped for the current build.
 *
 * @returns {boolean} True when axe checks should not run.
 */
function shouldSkipAxeChecks() {
  return getAxeSkipReasons().length > 0;
}

/**
 * Build empty axe results for a skipped check.
 *
 * @returns {object} axe.run-shaped results with skip metadata.
 */
function makeSkippedAxeResults() {
  return {
    incomplete: [],
    inapplicable: [],
    passes: [],
    skipped: true,
    skippedReason: getAxeSkipReasons().join(", "),
    violations: [],
  };
}

/**
 * Build an empty mutation watcher report for a skipped check.
 *
 * @param {string} id Watcher id.
 *
 * @returns {object} Watcher report with skip metadata.
 */
function makeSkippedWatcherReport(id) {
  return {
    errors: [],
    failures: [],
    id,
    mutationCount: 0,
    runCount: 0,
    skipped: true,
    skippedReason: getAxeSkipReasons().join(", "),
  };
}

/**
 * Build a no-op mutation watcher for builds where axe checks are skipped.
 *
 * @param {string} id Watcher id.
 * @param {string} message Default assertion message.
 *
 * @returns {object} Watcher with id, flush(), and finish().
 */
function makeSkippedWatcher(id, message) {
  return {
    /**
     * Return a skipped final report and optionally assert it.
     *
     * @param {object} [finishOptions] Finish options.
     * @param {boolean} [finishOptions.assert=true] Whether to assert no watcher violations.
     * @param {string} [finishOptions.message] Assertion message.
     *
     * @returns {Promise<object>} Skipped watcher report.
     */
    async finish({ assert = true, message: finishMessage = message } = {}) {
      const report = makeSkippedWatcherReport(id);
      if (assert) {
        assertNoAxeMutationObserverViolations(report, finishMessage);
      }
      return report;
    },
    /**
     * Return the current skipped report.
     *
     * @returns {Promise<object>} Skipped watcher report.
     */
    async flush() {
      return makeSkippedWatcherReport(id);
    },
    id,
  };
}

/**
 * Resolve the SpecialPowers object to use for content-process work.
 *
 * @param {object} specialPowers Explicit SpecialPowers object passed by the caller.
 * @param {object} owner Browser or window object that may expose SpecialPowers.
 *
 * @returns {object} A SpecialPowers object with spawn support.
 */
function getSpecialPowers(specialPowers, owner) {
  const powers =
    specialPowers ??
    owner?.SpecialPowers ??
    owner?.ownerGlobal?.SpecialPowers ??
    globalThis.SpecialPowers;
  if (!powers?.spawn) {
    throw new Error(
      "AxeHelpers requires SpecialPowers.spawn. Pass a reference to SpecialPowers if the test harness global cannot be resolved automatically."
    );
  }
  return powers;
}

/**
 * Read the vendored axe-core bundle source.
 *
 * @returns {Promise<string>} The axe-core script source.
 */
async function getAxeSource() {
  const channel = lazy.NetUtil.newChannel({
    uri: AXE_SOURCE_URL,
    loadUsingSystemPrincipal: true,
  });
  const inputStream = channel.open();
  const scriptableStream = Cc[
    "@mozilla.org/scriptableinputstream;1"
  ].createInstance(Ci.nsIScriptableInputStream);

  try {
    scriptableStream.init(inputStream);
    let source = "";
    while (scriptableStream.available()) {
      source += scriptableStream.read(4096);
    }
    axeSourcePromise ??= Promise.resolve(source);
  } finally {
    scriptableStream.close();
    inputStream.close();
  }

  return axeSourcePromise;
}

/**
 * Clone axe results into plain serializable objects.
 *
 * @param {object} results Results returned by axe.run.
 *
 * @returns {object} A JSON-serializable copy of the results.
 */
function normalizeResults(results) {
  return structuredClone(results);
}

/**
 * Mark a chrome window as actively using the injected axe property.
 *
 * @param {Window} win Chrome window that may have preserved axe state.
 *
 * @returns {boolean} True if the window has preserved axe state to restore later.
 */
function acquireAxeWindowProperty(win) {
  const state = axeWindowProperties.get(win);
  if (!state) {
    return false;
  }
  state.users++;
  return true;
}

/**
 * Restore the previous chrome window axe property once all users finish.
 *
 * @param {Window} win Chrome window whose axe property should be released.
 */
function restoreAxeWindowProperty(win) {
  const state = axeWindowProperties.get(win);
  if (!state) {
    return;
  }

  state.users--;
  if (state.users > 0) {
    return;
  }

  if (state.descriptor) {
    Object.defineProperty(win, "axe", state.descriptor);
  } else {
    delete win.axe;
  }
  axeWindowProperties.delete(win);
}

/**
 * Waits for Fluent localization to finish translating a chrome document.
 *
 * @param {Window} win Chrome window containing the document to wait for.
 * @param {object} [options] Localization wait options.
 * @param {boolean} [options.forceTranslation=true] Whether to translate all roots.
 *
 * @returns {Promise<void>}
 */
async function waitForFluent(win, { forceTranslation = true } = {}) {
  const doc = win.document;
  const l10n = doc?.l10n;

  if (!l10n) {
    return;
  }

  if (l10n.ready?.then) {
    await l10n.ready;
  }
  if (forceTranslation && typeof l10n.translateRoots == "function") {
    await l10n.translateRoots();
  }

  while (!forceTranslation && doc.hasPendingL10nMutations) {
    await new Promise(resolve =>
      doc.addEventListener("L10nMutationsFinished", resolve, { once: true })
    );
  }

  await new Promise(win.requestAnimationFrame);
}

/**
 * Merge caller axe options with defaults.
 *
 * @param {object} [axeOptions={}] axe.run options from the caller.
 * @param {object} [defaultOptions=DEFAULT_AXE_OPTIONS] Default axe options.
 *
 * @returns {object} axe.run options with defaults applied.
 */
function getAxeOptions(axeOptions = {}, defaultOptions = DEFAULT_AXE_OPTIONS) {
  const rules = {
    ...(defaultOptions.rules ?? {}),
    ...(axeOptions.rules ?? {}),
  };
  const mergedOptions = {
    ...defaultOptions,
    ...axeOptions,
  };
  if (Object.keys(rules).length) {
    mergedOptions.rules = rules;
  }
  return mergedOptions;
}

/**
 * Merge caller axe options with content-browser defaults.
 *
 * @param {object} [axeOptions={}] axe.run options from the caller.
 *
 * @returns {object} axe.run options with content-browser default rules applied.
 */
function getContentBrowserAxeOptions(axeOptions = {}) {
  return getAxeOptions(axeOptions, CONTENT_BROWSER_DEFAULT_AXE_OPTIONS);
}

/**
 * Generate a unique id for an axe mutation watcher.
 *
 * @returns {string}
 */
function nextWatcherId() {
  axeWatcherCount++;
  return `tb-axe-${Date.now()}-${axeWatcherCount}`;
}

/**
 * Check whether an object owns a property directly.
 *
 * @param {object} object Object to inspect.
 * @param {string} property Property name to check.
 *
 * @returns {boolean}
 */
function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

/**
 * Register a watcher finish callback with the active test cleanup hook.
 *
 * @param {Function} finish Function that stops the watcher and asserts its final report.
 * @param {boolean} autoFinish Whether cleanup should be registered.
 * @param {object} owner Browser or window object that may expose cleanup hooks.
 * @param {object} specialPowers SpecialPowers object that may expose SimpleTest cleanup hooks.
 */
function maybeRegisterCleanup(finish, autoFinish, owner, specialPowers) {
  if (!autoFinish) {
    return;
  }

  const cleanupFunction =
    owner?.registerCleanupFunction ??
    owner?.ownerGlobal?.registerCleanupFunction ??
    owner?.SpecialPowers?.SimpleTest?.registerCleanupFunction?.bind(
      owner.SpecialPowers.SimpleTest
    ) ??
    owner?.ownerGlobal?.SpecialPowers?.SimpleTest?.registerCleanupFunction?.bind(
      owner.ownerGlobal.SpecialPowers.SimpleTest
    ) ??
    specialPowers?.SimpleTest?.registerCleanupFunction?.bind(
      specialPowers.SimpleTest
    ) ??
    globalThis.registerCleanupFunction;
  if (typeof cleanupFunction == "function") {
    cleanupFunction(async () => finish());
  }
}

/**
 * Inject axe-core into a content browser.
 *
 * @param {Element} targetBrowser A browser element.
 * @param {object} [options]
 * @param {boolean} [options.force=false] Re-inject axe even when the content window already has axe.
 * @param {object} [options.specialPowers] SpecialPowers object to use. Defaults to the test global.
 *
 * @returns {Promise<string>}
 *   The injected axe-core version.
 */
export async function injectAxe(
  targetBrowser,
  { force = false, specialPowers } = {}
) {
  const source = await getAxeSource();
  return getSpecialPowers(specialPowers, targetBrowser).spawn(
    targetBrowser,
    [{ force, source }],
    async data => {
      const win = content.wrappedJSObject;
      if (data.force || !win.axe?.run) {
        win.eval(data.source);
      }
      if (!win.axe?.run) {
        throw new Error("axe-core did not load.");
      }
      return win.axe.version;
    }
  );
}

/**
 * Run axe-core against a content browser.
 *
 * @param {Element} targetBrowser A browser element.
 * @param {object} [options]
 * @param {object|string|null} [options.context=null] axe.run context. Defaults to the content document.
 * @param {object} [options.axeOptions] axe.run options.
 * @param {object} [options.specialPowers] SpecialPowers object to use. Defaults to the test global.
 *
 * @returns {Promise<object>} axe.run results.
 */
export async function runAxe(
  targetBrowser,
  { context = null, axeOptions = {}, specialPowers } = {}
) {
  if (shouldSkipAxeChecks()) {
    return makeSkippedAxeResults();
  }

  const source = await getAxeSource();
  const mergedAxeOptions = getContentBrowserAxeOptions(axeOptions);
  return getSpecialPowers(specialPowers, targetBrowser).spawn(
    targetBrowser,
    [{ axeOptions: mergedAxeOptions, context, source }],
    async data => {
      // SpecialPowers.spawn recreates the callback in a separate sandbox.
      // Import this module there because the sandbox cannot access the
      // outer module's functions.
      const { runAxeWithSystemColors: runContentAxe } =
        ChromeUtils.importESModule(
          "resource://testing-common/mail/AxeHelpers.sys.mjs"
        );
      const win = content.wrappedJSObject;
      if (!win.axe?.run) {
        win.eval(data.source);
      }
      if (!win.axe?.run) {
        throw new Error("axe-core did not load.");
      }

      /**
       * Wait for Fluent localization to finish translating the content document.
       *
       * @returns {Promise<void>}
       */
      async function waitForAxeFluent() {
        const l10n = win.document?.l10n;
        if (!l10n) {
          return;
        }

        if (l10n.ready?.then) {
          await l10n.ready;
        }
        if (typeof l10n.translateRoots == "function") {
          await l10n.translateRoots();
        }
        await new Promise(resolve =>
          win.requestAnimationFrame(() => resolve())
        );
      }

      await waitForAxeFluent();
      const results = await runContentAxe(
        win,
        data.context ?? win.document,
        data.axeOptions
      );
      return win.structuredClone(results);
    }
  );
}

/**
 * Inject axe-core into a chrome window.
 *
 * @param {Window} win A chrome window.
 * @param {object} [options]
 * @param {boolean} [options.force=false] Re-inject axe even when the window already has axe.
 *
 * @returns {Promise<string>} The injected axe-core version.
 */
export async function injectAxeIntoWindow(win, { force = false } = {}) {
  if (force || !win.axe?.run) {
    if (!axeWindowProperties.has(win)) {
      axeWindowProperties.set(win, {
        descriptor: Object.getOwnPropertyDescriptor(win, "axe"),
        users: 0,
      });
    }

    Services.scriptloader.loadSubScript(AXE_SOURCE_URL, win);
    const descriptor = Object.getOwnPropertyDescriptor(win, "axe");
    if (descriptor && descriptor.enumerable) {
      Object.defineProperty(win, "axe", {
        configurable: true,
        enumerable: false,
        writable: descriptor.writable ?? true,
        value: win.axe,
      });
    }
  }
  if (!win.axe?.run) {
    throw new Error("axe-core did not load.");
  }
  return win.axe.version;
}

/**
 * Run axe-core against a chrome window.
 *
 * @param {Window} win A chrome window.
 * @param {object} [options]
 * @param {object|string|Element|null} [options.context=null] axe.run context. Defaults to the window document.
 * @param {object} [options.axeOptions] axe.run options.
 * @param {boolean} [options.force=false] Re-inject axe even when the window already has axe.
 *
 * @returns {Promise<object>} axe.run results.
 */
export async function runAxeInWindow(
  win,
  { context = null, axeOptions = {}, force = false } = {}
) {
  if (shouldSkipAxeChecks()) {
    return makeSkippedAxeResults();
  }

  await injectAxeIntoWindow(win, { force });
  const mergedAxeOptions = getAxeOptions(axeOptions);
  const shouldRestoreAxe = acquireAxeWindowProperty(win);
  try {
    await waitForFluent(win);
    const results = await runAxeWithSystemColors(
      win,
      context ?? win.document,
      mergedAxeOptions
    );
    return normalizeResults(results);
  } finally {
    if (shouldRestoreAxe) {
      restoreAxeWindowProperty(win);
    }
  }
}

/**
 * Format axe violations into assertion failure text.
 *
 * @param {Array<object>} [violations=[]] axe violations to format.
 *
 * @returns {string} Human-readable violation details.
 */
export function formatAxeViolations(violations = []) {
  return violations
    .map(violation => {
      const impact = violation.impact ? ` [${violation.impact}]` : "";
      const nodes = violation.nodes
        .map(node => node.target.join(", "))
        .join("; ");
      return `${violation.id}${impact}: ${violation.help}\n  ${violation.helpUrl}\n  Targets: ${nodes}`;
    })
    .join("\n\n");
}

/**
 * Assert that axe results contain no violations.
 *
 * @param {object} results axe.run results.
 * @param {string} [message="No axe accessibility violations"] Assertion message.
 */
export function assertNoAxeViolations(
  results,
  message = "No axe accessibility violations"
) {
  const violations = results?.violations ?? [];
  const formattedViolations = formatAxeViolations(violations);
  lazy.Assert.equal(
    violations.length,
    0,
    formattedViolations ? `${message}\n${formattedViolations}` : message
  );
}

/**
 * Run axe-core against a content browser and assert no violations were found.
 *
 * @param {Element} targetBrowser A browser element.
 * @param {object} [options] Options accepted by runAxe.
 * @param {string} [options.message] Assertion message.
 *
 * @returns {Promise<object>} axe.run results.
 */
export async function checkAxe(targetBrowser, { message, ...options } = {}) {
  const results = await runAxe(targetBrowser, options);
  assertNoAxeViolations(results, message);
  return results;
}

/**
 * Run axe-core against a chrome window and assert no violations were found.
 *
 * @param {Window} win  A chrome window.
 * @param {object} [options] Options accepted by runAxeInWindow.
 * @param {string} [options.message] Assertion message.
 *
 * @returns {Promise<object>} axe.run results.
 */
export async function checkAxeInWindow(win, { message, ...options } = {}) {
  const results = await runAxeInWindow(win, options);
  assertNoAxeViolations(results, message);
  return results;
}

/**
 * Resolve MutationObserver options for axe mutation watchers.
 *
 * @param {object} [options={}] Watcher options.
 *
 * @returns {object} MutationObserver options.
 */
function getMutationObserverOptions(options = {}) {
  return (
    options.mutationObserverOptions ?? {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    }
  );
}

/**
 * Observes mutations in a container and its open shadow roots.
 *
 * Exported so the content watcher can load this helper inside its spawned task.
 * The caller must call disconnect() before releasing the watched document.
 *
 * @param {Window} win - Privileged window reference for event registration.
 * @param {Element} container - Container whose mutations trigger checks.
 * @param {object} options - MutationObserver options from the caller.
 * @param {function(number): void} onMutation - Receives the mutation count.
 * @returns {{disconnect: function(): void}} Observation cleanup handle.
 */
export function observeAxeMutations(win, container, options, onMutation) {
  win = Cu.unwaiveXrays(win);
  container = Cu.unwaiveXrays(container);
  const doc = win.document;
  const roots = new Set();
  // Discover inserted hosts even when the caller only requests attribute or
  // text changes. Filter these discovery-only records before scheduling axe.
  const observationOptions = options.subtree
    ? { ...options, childList: true }
    : options;
  let stopped = false;

  /**
   * Returns whether a node belongs to the container through open shadow roots.
   *
   * @param {Node} node - Node to check.
   * @returns {boolean} Whether the node is in the observed scope.
   */
  function contains(node) {
    while (node) {
      if (node == container || (options.subtree && container.contains(node))) {
        return true;
      }

      const root = node.getRootNode();

      if (!options.subtree || !root.host || root.mode != "open") {
        return false;
      }

      node = root.host;
    }

    return false;
  }

  /**
   * Adds observations for open roots in a newly discovered subtree.
   *
   * @param {Node} node - Subtree to inspect.
   */
  function discover(node) {
    if (
      !options.subtree ||
      (node.nodeType != node.ELEMENT_NODE && !node.host)
    ) {
      return;
    }

    const root = node.shadowRoot;

    if (root) {
      if (!roots.has(root)) {
        roots.add(root);
        observer.observe(root, observationOptions);
      }

      discover(root);
    }

    for (const child of node.children) {
      discover(child);
    }
  }

  const observer = new win.MutationObserver(mutations => {
    if (stopped) {
      return;
    }

    const relevant = mutations.filter(mutation => contains(mutation.target));

    for (const mutation of relevant) {
      for (const node of mutation.addedNodes) {
        discover(node);
      }
    }

    const requested = relevant.filter(
      mutation => mutation.type != "childList" || options.childList
    );

    if (requested.length) {
      onMutation(requested.length);
    }
  });

  // Validate the caller's options before adding discovery observations.
  observer.observe(container, options);
  observer.observe(container, observationOptions);
  discover(container);

  // Attaching a shadow root does not produce a childList mutation. Gecko's
  // privileged event also covers attachments made without calling a JS wrapper.
  function onShadowRootAttached(event) {
    // The target can be retargeted to an outer host for nested shadow roots.
    const host = event.originalTarget;

    if (!options.subtree || stopped || !host.shadowRoot || !contains(host)) {
      return;
    }

    discover(host);

    // Discover the root even if the caller excludes structural changes.
    if (!options.childList) {
      return;
    }

    onMutation(1);
  }

  const eventTarget = win.docShell.chromeEventHandler ?? win;

  try {
    eventTarget.addEventListener(
      "shadowrootattached",
      onShadowRootAttached,
      true
    );
  } catch (error) {
    observer.disconnect();

    throw error;
  }

  let documentState = shadowEventDocuments.get(doc);

  if (!documentState) {
    documentState = {
      enabled: doc.devToolsAnonymousAndShadowEventsEnabled,
      users: 0,
    };
    shadowEventDocuments.set(doc, documentState);
    doc.devToolsAnonymousAndShadowEventsEnabled = true;
  }

  documentState.users++;

  return {
    disconnect() {
      if (stopped) {
        return;
      }

      stopped = true;
      observer.disconnect();
      roots.clear();

      eventTarget.removeEventListener(
        "shadowrootattached",
        onShadowRootAttached,
        true
      );

      documentState.users--;

      if (!documentState.users) {
        doc.devToolsAnonymousAndShadowEventsEnabled = documentState.enabled;
        shadowEventDocuments.delete(doc);
      }
    },
  };
}

/**
 * Resolve the throttle interval for axe mutation watchers.
 *
 * @param {object} [options={}] Watcher options.
 *
 * @returns {number} Minimum milliseconds between scheduled axe runs.
 */
function getThrottleMs(options = {}) {
  return options.throttleMs ?? DEFAULT_THROTTLE_MS;
}

/**
 * Build serializable startup data for a content-browser watcher.
 *
 * @param {object} options Watcher options.
 * @param {string} id Watcher id.
 *
 * @returns {object} Data that can be passed to SpecialPowers.spawn.
 */
function makeWatcherStartData(options, id) {
  return {
    axeOptions: getContentBrowserAxeOptions(options.axeOptions),
    container: hasOwn(options, "container") ? options.container : null,
    context: hasOwn(options, "context") ? options.context : null,
    hasContainer: hasOwn(options, "container"),
    hasContext: hasOwn(options, "context"),
    id,
    mutationObserverOptions: getMutationObserverOptions(options),
    throttleMs: getThrottleMs(options),
    watchersProperty: AXE_WATCHERS_PROPERTY,
  };
}

/**
 * Format unique axe mutation watcher violations.
 *
 * @param {object} report Watcher report returned by flush() or finish().
 *
 * @returns {Array<string>} Formatted violation entries.
 */
function formatWatcherViolationEntries(report) {
  const entries = new Map();

  for (const failure of report.failures ?? []) {
    for (const violation of failure.violations ?? []) {
      const nodes = violation.nodes?.length
        ? violation.nodes
        : [{ target: ["<document>"] }];
      for (const node of nodes) {
        const target = node.target?.join(", ") ?? "<document>";
        const key = `${violation.id}\0${target}`;
        let entry = entries.get(key);
        if (!entry) {
          entry = {
            firstRun: failure.run,
            help: violation.help,
            helpUrl: violation.helpUrl,
            id: violation.id,
            impact: violation.impact,
            mutationCount: failure.mutationCount,
            reason: failure.reason,
            seenCount: 0,
            target,
          };
          entries.set(key, entry);
        }
        entry.seenCount++;
      }
    }
  }

  return Array.from(entries.values()).map(entry => {
    const impact = entry.impact ? ` [${entry.impact}]` : "";
    const seen =
      entry.seenCount == 1 ? "" : `\n  Seen in ${entry.seenCount} axe runs.`;
    return `Run ${entry.firstRun} (${entry.reason}, ${entry.mutationCount} mutations): ${entry.id}${impact}: ${entry.help}\n  ${entry.helpUrl}\n  Target: ${entry.target}${seen}`;
  });
}

/**
 * Format errors and violations from an axe mutation watcher report.
 *
 * @param {object} report Watcher report returned by flush() or finish().
 *
 * @returns {string} Human-readable report details.
 */
export function formatAxeMutationObserverReport(report) {
  const sections = [];

  for (const error of report.errors ?? []) {
    const stack = error.stack ? `\n${error.stack}` : "";
    sections.push(
      `Run ${error.run} (${error.reason}, ${error.mutationCount} mutations) threw: ${error.message}${stack}`
    );
  }

  sections.push(...formatWatcherViolationEntries(report));

  return sections.join("\n\n");
}

/**
 * Assert that an axe mutation watcher report contains no errors or violations.
 *
 * @param {object} report Watcher report returned by flush() or finish().
 * @param {string} [message] Assertion message.
 */
export function assertNoAxeMutationObserverViolations(
  report,
  message = "No axe accessibility violations while watching DOM mutations"
) {
  const errorCount = report.errors?.length ?? 0;
  const violationCount = formatWatcherViolationEntries(report).length;
  const formattedReport = formatAxeMutationObserverReport(report);
  lazy.Assert.equal(
    errorCount + violationCount,
    0,
    formattedReport ? `${message}\n${formattedReport}` : message
  );
}

/**
 * Start watching content-browser DOM mutations and run axe after changes.
 *
 * The returned watcher auto-finishes at test cleanup by default. Call finish()
 * earlier when a watched browser will navigate or close before cleanup.
 *
 * @param {Element} targetBrowser A browser element.
 * @param {object} [options]
 * @param {string} [options.container] Selector for the content node to observe. Defaults to the document body.
 * @param {object|string|null} [options.context] axe.run context. Defaults to the observed container, or the document.
 * @param {object} [options.axeOptions] axe.run options.
 * @param {number} [options.throttleMs=10] Minimum time between axe runs while mutations continue.
 * @param {object} [options.mutationObserverOptions] MutationObserver options.
 * @param {boolean} [options.autoFinish=true] Register finish() as a cleanup function.
 * @param {string} [options.message] Assertion message used by finish().
 * @param {object} [options.specialPowers] SpecialPowers object to use. Defaults to the test global.
 *
 * @returns {Promise<object>} Watcher with id, flush(), and finish().
 */
export async function startAxeMutationObserver(targetBrowser, options = {}) {
  if (shouldSkipAxeChecks()) {
    return makeSkippedWatcher(options.id ?? nextWatcherId(), options.message);
  }

  const specialPowers = getSpecialPowers(options.specialPowers, targetBrowser);
  const id = options.id ?? nextWatcherId();
  const startData = makeWatcherStartData(options, id);

  await injectAxe(targetBrowser, { specialPowers });
  await specialPowers.spawn(targetBrowser, [startData], async watcherData => {
    const win = content.wrappedJSObject;
    if (!win.axe?.run) {
      throw new Error("axe-core did not load.");
    }

    /**
     * Copy watcher state into a serializable report.
     *
     * @param {object} state
     *   Content-process watcher state.
     *
     * @returns {object}
     *   Serializable watcher report.
     */
    function summarize(state) {
      return win.structuredClone({
        errors: state.errors,
        failures: state.failures,
        id: state.id,
        mutationCount: state.mutationCount,
        runCount: state.runCount,
      });
    }

    /**
     * Resolve the content node to observe for mutations.
     *
     * @returns {Element} Node to observe.
     */
    function resolveObservedNode() {
      let candidate = null;
      if (watcherData.hasContainer) {
        candidate = watcherData.container;
      } else if (
        watcherData.hasContext &&
        typeof watcherData.context == "string"
      ) {
        candidate = watcherData.context;
      }
      if (!candidate) {
        return win.document.body ?? win.document.documentElement;
      }
      if (typeof candidate != "string") {
        throw new Error(
          "Axe mutation observer container must be a selector string for content browsers."
        );
      }

      const node = win.document.querySelector(candidate);
      if (!node) {
        throw new Error(
          `Axe mutation observer container not found: ${candidate}`
        );
      }
      return node;
    }

    /**
     * Waits for pending Fluent translations without starting new mutations.
     *
     * @returns {Promise<void>}
     */
    async function waitForWatcherFluent() {
      const doc = content.document;
      const l10n = doc.l10n;

      if (!l10n) {
        return;
      }

      if (l10n.ready?.then) {
        await l10n.ready;
      }

      // Forcing translation would make this watcher trigger another check.
      while (doc.hasPendingL10nMutations) {
        await new Promise(resolve =>
          doc.addEventListener("L10nMutationsFinished", resolve, { once: true })
        );
      }

      await new Promise(resolve => win.requestAnimationFrame(() => resolve()));
    }

    let runContext = null;
    if (watcherData.hasContext) {
      runContext = watcherData.context;
    } else if (watcherData.hasContainer) {
      runContext = watcherData.container;
    }
    const watchers =
      win[watcherData.watchersProperty] ??
      Object.defineProperty(win, watcherData.watchersProperty, {
        configurable: true,
        value: Object.create(null),
      })[watcherData.watchersProperty];

    if (watchers[watcherData.id]) {
      throw new Error(
        `Axe mutation observer already exists: ${watcherData.id}`
      );
    }

    const state = {
      errors: [],
      failures: [],
      id: watcherData.id,
      lastRunAt: 0,
      mutationCount: 0,
      needsRun: false,
      observer: null,
      pendingReason: "mutation",
      runCount: 0,
      running: null,
      scheduledReason: "mutation",
      stopped: false,
      timer: 0,
    };

    /**
     * Run axe, or queue a follow-up run if one is already active.
     *
     * @param {string} reason Reason for this axe run.
     *
     * @returns {Promise<void>}
     */
    state.run = async reason => {
      if (state.running) {
        state.needsRun = true;
        state.pendingReason = reason;
        return state.running;
      }

      state.running = (async () => {
        state.lastRunAt = win.Date.now();
        state.runCount++;
        try {
          await waitForWatcherFluent();
          const results = await runContentAxe(
            win,
            runContext ?? win.document.body ?? win.document.documentElement,
            watcherData.axeOptions
          );
          const normalizedResults = win.structuredClone(results);
          if (normalizedResults.violations?.length) {
            state.failures.push({
              mutationCount: state.mutationCount,
              reason,
              run: state.runCount,
              violations: normalizedResults.violations,
            });
          }
        } catch (error) {
          state.errors.push({
            message: String(error.message || error),
            mutationCount: state.mutationCount,
            reason,
            run: state.runCount,
            stack: String(error.stack || ""),
          });
        }
      })();

      await state.running;
      state.running = null;

      if (state.needsRun && !state.stopped) {
        const pendingReason = state.pendingReason;
        state.needsRun = false;
        state.schedule(pendingReason);
      }
      return undefined;
    };

    /**
     * Schedule an axe run according to the watcher throttle interval.
     *
     * @param {string} reason Reason for the scheduled axe run.
     */
    state.schedule = reason => {
      if (state.stopped) {
        return;
      }
      state.scheduledReason = reason;
      if (state.timer) {
        return;
      }
      const elapsed = state.lastRunAt ? win.Date.now() - state.lastRunAt : 0;
      const delay = state.lastRunAt
        ? Math.max(0, watcherData.throttleMs - elapsed)
        : 0;
      if (delay == 0) {
        state.run(state.scheduledReason);
        return;
      }
      state.timer = win.setTimeout(() => {
        state.timer = 0;
        state.run(state.scheduledReason);
      }, delay);
    };

    /**
     * Run any pending checks immediately and return the current report.
     *
     * @param {string} reason Reason to record for the flush run.
     *
     * @returns {Promise<object>} Serializable watcher report.
     */
    state.flush = async reason => {
      win.clearTimeout(state.timer);
      state.timer = 0;
      if (state.running) {
        await state.running;
      }
      win.clearTimeout(state.timer);
      state.timer = 0;
      state.needsRun = false;
      await state.run(reason);
      return summarize(state);
    };

    /**
     * Stop observing mutations, run a final check, and return the report.
     *
     * @returns {Promise<object>} Serializable watcher report.
     */
    state.finish = async () => {
      state.stopped = true;
      win.clearTimeout(state.timer);
      state.timer = 0;
      state.observer.disconnect();
      if (state.running) {
        await state.running;
      }
      await state.run("finish");
      return summarize(state);
    };

    // SpecialPowers.spawn recreates the callback in a separate sandbox.
    // Import this module there because the sandbox cannot access the
    // outer module's functions.
    const {
      observeAxeMutations: observeContentMutations,
      runAxeWithSystemColors: runContentAxe,
    } = ChromeUtils.importESModule(
      "resource://testing-common/mail/AxeHelpers.sys.mjs"
    );

    state.observer = observeContentMutations(
      content,
      resolveObservedNode(),
      watcherData.mutationObserverOptions,
      count => {
        state.mutationCount += count;
        state.schedule("mutation");
      }
    );

    watchers[watcherData.id] = state;

    await state.run("initial");
  });

  let finished = false;
  let finalReport = null;
  const watcher = {
    /**
     * Stop watching mutations and optionally assert the final report.
     *
     * @param {object} [finishOptions] Finish options.
     * @param {boolean} [finishOptions.assert=true] Whether to assert no watcher violations.
     * @param {string} [finishOptions.message] Assertion message.
     *
     * @returns {Promise<object>} Final watcher report.
     */
    async finish({ assert = true, message = options.message } = {}) {
      if (!finished) {
        finished = true;
        finalReport = await specialPowers.spawn(
          targetBrowser,
          [{ id, watchersProperty: AXE_WATCHERS_PROPERTY }],
          async watcherData => {
            const watchers =
              content.wrappedJSObject[watcherData.watchersProperty];
            const state = watchers?.[watcherData.id];
            if (!state) {
              throw new Error(
                `Axe mutation observer was not found: ${watcherData.id}`
              );
            }
            const report = await state.finish();
            delete watchers[watcherData.id];
            return report;
          }
        );
      }
      if (assert) {
        assertNoAxeMutationObserverViolations(finalReport, message);
      }
      return finalReport;
    },
    /**
     * Run pending checks immediately and return the current report.
     *
     * @returns {Promise<object>} Current watcher report.
     */
    async flush() {
      if (finished) {
        return finalReport;
      }
      return specialPowers.spawn(
        targetBrowser,
        [{ id, watchersProperty: AXE_WATCHERS_PROPERTY }],
        async watcherData => {
          const watchers =
            content.wrappedJSObject[watcherData.watchersProperty];
          const state = watchers?.[watcherData.id];
          if (!state) {
            throw new Error(
              `Axe mutation observer was not found: ${watcherData.id}`
            );
          }
          return state.flush("flush");
        }
      );
    },
    id,
  };

  maybeRegisterCleanup(
    watcher.finish,
    options.autoFinish ?? true,
    targetBrowser,
    specialPowers
  );
  return watcher;
}

/**
 * Resolve the chrome-window node to observe for mutations.
 *
 * @param {Window} win Chrome window containing the observed document.
 * @param {object} options Watcher options.
 *
 * @returns {Element} Node to observe.
 */
function resolveWindowObservedNode(win, options) {
  let candidate = null;
  if (hasOwn(options, "container")) {
    candidate = options.container;
  } else if (hasOwn(options, "context") && typeof options.context == "string") {
    candidate = options.context;
  }
  if (!candidate) {
    return win.document.documentElement;
  }
  if (typeof candidate == "string") {
    const node = win.document.querySelector(candidate);
    if (!node) {
      throw new Error(
        `Axe mutation observer container not found: ${candidate}`
      );
    }
    return node;
  }
  return candidate;
}

/**
 * Copy chrome-window watcher state into a serializable report.
 *
 * @param {object} state Watcher state.
 *
 * @returns {object} Serializable watcher report.
 */
function makeWindowWatcherReport(state) {
  return normalizeResults({
    errors: state.errors,
    failures: state.failures,
    id: state.id,
    mutationCount: state.mutationCount,
    runCount: state.runCount,
  });
}

/**
 * Start watching chrome-window DOM mutations and run axe after changes.
 *
 * The returned watcher auto-finishes at test cleanup by default. Call finish()
 * earlier when a watched window will close before cleanup.
 *
 * @param {Window} win A chrome window.
 * @param {object} [options]
 * @param {Element|string} [options.container] Element or selector to observe. Defaults to the document root.
 * @param {object|string|Element|null} [options.context] axe.run context. Defaults to the observed container, or the document.
 * @param {object} [options.axeOptions] axe.run options.
 * @param {number} [options.throttleMs=10] Minimum time between axe runs while mutations continue.
 * @param {object} [options.mutationObserverOptions] MutationObserver options.
 * @param {boolean} [options.autoFinish=true] Register finish() as a cleanup function.
 * @param {string} [options.message] Assertion message used by finish().
 *
 * @returns {Promise<object>} Watcher with id, flush(), and finish().
 */
export async function startAxeMutationObserverInWindow(win, options = {}) {
  if (shouldSkipAxeChecks()) {
    return makeSkippedWatcher(options.id ?? nextWatcherId(), options.message);
  }

  const id = options.id ?? nextWatcherId();
  await injectAxeIntoWindow(win);
  const axeOptions = getAxeOptions(options.axeOptions);
  const shouldRestoreAxe = acquireAxeWindowProperty(win);

  let runContext = null;
  if (hasOwn(options, "context")) {
    runContext = options.context;
  } else if (hasOwn(options, "container")) {
    runContext = options.container;
  }
  const state = {
    errors: [],
    failures: [],
    id,
    lastRunAt: 0,
    mutationCount: 0,
    needsRun: false,
    observer: null,
    pendingReason: "mutation",
    runCount: 0,
    running: null,
    scheduledReason: "mutation",
    stopped: false,
    timer: 0,
  };

  /**
   * Run axe, or queue a follow-up run if one is already active.
   *
   * @param {string} reason Reason for this axe run.
   *
   * @returns {Promise<void>}
   */
  state.run = async reason => {
    if (state.running) {
      state.needsRun = true;
      state.pendingReason = reason;
      return state.running;
    }

    state.running = (async () => {
      state.lastRunAt = win.Date.now();
      state.runCount++;
      try {
        // Forcing translation would make this watcher trigger another check.
        await waitForFluent(win, { forceTranslation: false });
        const results = await runAxeWithSystemColors(
          win,
          runContext ?? win.document,
          axeOptions
        );
        const normalizedResults = normalizeResults(results);
        if (normalizedResults.violations?.length) {
          state.failures.push({
            mutationCount: state.mutationCount,
            reason,
            run: state.runCount,
            violations: normalizedResults.violations,
          });
        }
      } catch (error) {
        state.errors.push({
          message: String(error.message || error),
          mutationCount: state.mutationCount,
          reason,
          run: state.runCount,
          stack: String(error.stack || ""),
        });
      }
    })();

    await state.running;
    state.running = null;

    if (state.needsRun && !state.stopped) {
      const pendingReason = state.pendingReason;
      state.needsRun = false;
      state.schedule(pendingReason);
    }
    return undefined;
  };

  /**
   * Schedule an axe run according to the watcher throttle interval.
   *
   * @param {string} reason Reason for the scheduled axe run.
   */
  state.schedule = reason => {
    if (state.stopped) {
      return;
    }
    state.scheduledReason = reason;
    if (state.timer) {
      return;
    }
    const elapsed = state.lastRunAt ? win.Date.now() - state.lastRunAt : 0;
    const delay = state.lastRunAt
      ? Math.max(0, getThrottleMs(options) - elapsed)
      : 0;
    if (delay == 0) {
      state.run(state.scheduledReason);
      return;
    }
    state.timer = win.setTimeout(() => {
      state.timer = 0;
      state.run(state.scheduledReason);
    }, delay);
  };

  state.observer = observeAxeMutations(
    win,
    resolveWindowObservedNode(win, options),
    getMutationObserverOptions(options),
    count => {
      state.mutationCount += count;
      state.schedule("mutation");
    }
  );

  await state.run("initial");

  let finished = false;
  let finalReport = null;
  const watcher = {
    /**
     * Stop watching mutations and optionally assert the final report.
     *
     * @param {object} [finishOptions] Finish options.
     * @param {boolean} [finishOptions.assert=true] Whether to assert no watcher violations.
     * @param {string} [finishOptions.message] Assertion message.
     *
     * @returns {Promise<object>} Final watcher report.
     */
    async finish({ assert = true, message = options.message } = {}) {
      if (!finished) {
        finished = true;
        state.stopped = true;
        win.clearTimeout(state.timer);
        state.timer = 0;
        state.observer.disconnect();
        if (state.running) {
          await state.running;
        }
        try {
          await state.run("finish");
          finalReport = makeWindowWatcherReport(state);
        } finally {
          if (shouldRestoreAxe) {
            restoreAxeWindowProperty(win);
          }
        }
      }
      if (assert) {
        assertNoAxeMutationObserverViolations(finalReport, message);
      }
      return finalReport;
    },
    /**
     * Run pending checks immediately and return the current report.
     *
     * @returns {Promise<object>} Current watcher report.
     */
    async flush() {
      if (finished) {
        return finalReport;
      }
      win.clearTimeout(state.timer);
      state.timer = 0;
      if (state.running) {
        await state.running;
      }
      win.clearTimeout(state.timer);
      state.timer = 0;
      state.needsRun = false;
      await state.run("flush");
      return makeWindowWatcherReport(state);
    },
    id,
  };

  maybeRegisterCleanup(
    watcher.finish,
    options.autoFinish ?? true,
    win,
    options.specialPowers
  );
  return watcher;
}

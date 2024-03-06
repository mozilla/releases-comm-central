"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UnstableValue = exports.ServerControlledNamespacedValue = exports.NamespacedValue = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/*
Copyright 2021 - 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Represents a simple Matrix namespaced value. This will assume that if a stable prefix
 * is provided that the stable prefix should be used when representing the identifier.
 */
class NamespacedValue {
  // Stable is optional, but one of the two parameters is required, hence the weird-looking types.
  // Goal is to to have developers explicitly say there is no stable value (if applicable).

  constructor(stable, unstable) {
    this.stable = stable;
    this.unstable = unstable;
    if (!this.unstable && !this.stable) {
      throw new Error("One of stable or unstable values must be supplied");
    }
  }
  get name() {
    if (this.stable) {
      return this.stable;
    }
    return this.unstable;
  }
  get altName() {
    if (!this.stable) {
      return null;
    }
    return this.unstable;
  }
  get names() {
    const names = [this.name];
    const altName = this.altName;
    if (altName) names.push(altName);
    return names;
  }
  matches(val) {
    return this.name === val || this.altName === val;
  }

  // this desperately wants https://github.com/microsoft/TypeScript/pull/26349 at the top level of the class
  // so we can instantiate `NamespacedValue<string, _, _>` as a default type for that namespace.
  findIn(obj) {
    let val = undefined;
    if (this.name) {
      val = obj?.[this.name];
    }
    if (!val && this.altName) {
      val = obj?.[this.altName];
    }
    return val;
  }
  includedIn(arr) {
    let included = false;
    if (this.name) {
      included = arr.includes(this.name);
    }
    if (!included && this.altName) {
      included = arr.includes(this.altName);
    }
    return included;
  }
}
exports.NamespacedValue = NamespacedValue;
class ServerControlledNamespacedValue extends NamespacedValue {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "preferUnstable", false);
  }
  setPreferUnstable(preferUnstable) {
    this.preferUnstable = preferUnstable;
  }
  get name() {
    if (this.stable && !this.preferUnstable) {
      return this.stable;
    }
    return this.unstable;
  }
}

/**
 * Represents a namespaced value which prioritizes the unstable value over the stable
 * value.
 */
exports.ServerControlledNamespacedValue = ServerControlledNamespacedValue;
class UnstableValue extends NamespacedValue {
  // Note: Constructor difference is that `unstable` is *required*.
  constructor(stable, unstable) {
    super(stable, unstable);
    if (!this.unstable) {
      throw new Error("Unstable value must be supplied");
    }
  }
  get name() {
    return this.unstable;
  }
  get altName() {
    return this.stable;
  }
}
exports.UnstableValue = UnstableValue;
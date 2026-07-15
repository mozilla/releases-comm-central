//#region \0rolldown/runtime.js
(function() {
	try {
		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
		e.SENTRY_RELEASE = { id: "dc25092aee8a66b8f0868046d641f9fd9dcc8ff0" };
		e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = function(e) {
			for (var n = 1; n < arguments.length; n++) {
				var a = arguments[n];
				if (null != a) for (var t in a) a.hasOwnProperty(t) && (e[t] = a[t]);
			}
			return e;
		}({}, e._sentryModuleMetadata[new e.Error().stack], {
			"version": "2.0.5",
			"appHost": "background"
		});
		var n = new e.Error().stack;
		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "b12e4cbb-5889-4f21-bf09-542f1fa6188f", e._sentryDebugIdIdentifier = "sentry-dbid-b12e4cbb-5889-4f21-bf09-542f1fa6188f");
	} catch (e) {}
})();
var __create$2 = Object.create;
var __defProp$2 = Object.defineProperty;
var __getOwnPropDesc$2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames$2 = Object.getOwnPropertyNames;
var __getProtoOf$2 = Object.getPrototypeOf;
var __hasOwnProp$2 = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp$2(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp$2(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
var __copyProps$2 = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames$2(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp$2.call(to, key) && key !== except) __defProp$2(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc$2(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM$2 = (mod, isNodeMode, target) => (target = mod != null ? __create$2(__getProtoOf$2(mod)) : {}, __copyProps$2(isNodeMode || !mod || !mod.__esModule ? __defProp$2(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, { get: (a, b) => (typeof require !== "undefined" ? require : a)[b] }) : x)(function(x) {
	if (typeof require !== "undefined") return require.apply(this, arguments);
	throw Error("Calling `require` for \"" + x + "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.");
});
//#endregion
//#region src/lib/logger.ts
var version = "2.0.5";
var LOG_LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3
};
var originalConsole = { ...console };
var originalLog = originalConsole.log;
var originalWarn = originalConsole.warn;
var originalError = originalConsole.error;
var getConfiguredLevel = () => {
	return LOG_LEVELS.warn;
};
var shouldLog = (messageLevel) => {
	const configuredLevel = getConfiguredLevel();
	return LOG_LEVELS[messageLevel] >= configuredLevel;
};
console.debug = (...args) => {
	if (shouldLog("debug")) originalLog(`[${version}]`, ...args);
};
console.log = (...args) => {
	if (shouldLog("info")) originalLog(`[${version}]`, ...args);
};
console.info = (...args) => {
	if (shouldLog("info")) originalLog(`[${version}]`, ...args);
};
console.warn = (...args) => {
	if (shouldLog("warn")) originalWarn(`[${version}]`, ...args);
};
console.error = (...args) => {
	if (shouldLog("error")) originalError(`[${version}]`, ...args);
};
//#endregion
//#region ../../node_modules/.pnpm/pretty-bytes@6.1.1/node_modules/pretty-bytes/index.js
var BYTE_UNITS = [
	"B",
	"kB",
	"MB",
	"GB",
	"TB",
	"PB",
	"EB",
	"ZB",
	"YB"
];
var BIBYTE_UNITS = [
	"B",
	"KiB",
	"MiB",
	"GiB",
	"TiB",
	"PiB",
	"EiB",
	"ZiB",
	"YiB"
];
var BIT_UNITS = [
	"b",
	"kbit",
	"Mbit",
	"Gbit",
	"Tbit",
	"Pbit",
	"Ebit",
	"Zbit",
	"Ybit"
];
var BIBIT_UNITS = [
	"b",
	"kibit",
	"Mibit",
	"Gibit",
	"Tibit",
	"Pibit",
	"Eibit",
	"Zibit",
	"Yibit"
];
var toLocaleString = (number, locale, options) => {
	let result = number;
	if (typeof locale === "string" || Array.isArray(locale)) result = number.toLocaleString(locale, options);
	else if (locale === true || options !== void 0) result = number.toLocaleString(void 0, options);
	return result;
};
function prettyBytes(number, options) {
	if (!Number.isFinite(number)) throw new TypeError(`Expected a finite number, got ${typeof number}: ${number}`);
	options = {
		bits: false,
		binary: false,
		space: true,
		...options
	};
	const UNITS = options.bits ? options.binary ? BIBIT_UNITS : BIT_UNITS : options.binary ? BIBYTE_UNITS : BYTE_UNITS;
	const separator = options.space ? " " : "";
	if (options.signed && number === 0) return ` 0${separator}${UNITS[0]}`;
	const isNegative = number < 0;
	const prefix = isNegative ? "-" : options.signed ? "+" : "";
	if (isNegative) number = -number;
	let localeOptions;
	if (options.minimumFractionDigits !== void 0) localeOptions = { minimumFractionDigits: options.minimumFractionDigits };
	if (options.maximumFractionDigits !== void 0) localeOptions = {
		maximumFractionDigits: options.maximumFractionDigits,
		...localeOptions
	};
	if (number < 1) return prefix + toLocaleString(number, options.locale, localeOptions) + separator + UNITS[0];
	const exponent = Math.min(Math.floor(options.binary ? Math.log(number) / Math.log(1024) : Math.log10(number) / 3), UNITS.length - 1);
	number /= (options.binary ? 1024 : 1e3) ** exponent;
	if (!localeOptions) number = number.toPrecision(3);
	const numberString = toLocaleString(Number(number), options.locale, localeOptions);
	const unit = UNITS[exponent];
	return prefix + numberString + separator + unit;
}
//#endregion
//#region ../send/frontend/src/lib/const.ts
var CONTAINER_TYPE = {
	CONVERSATION: "CONVERSATION",
	FOLDER: "FOLDER"
};
var POPUP_READY = "POPUP_READY";
var FILE_LIST = "FILE_LIST";
var ALL_UPLOADS_COMPLETE = "ALL_UPLOADS_COMPLETE";
var ALL_UPLOADS_ABORTED = "ALL_UPLOADS_ABORTED";
var ONE_MB_IN_BYTES = 1e3 * 1e3;
var MAX_FILE_SIZE_HUMAN_READABLE = prettyBytes(ONE_MB_IN_BYTES * 1e3 * 20);
var SPLIT_SIZE = 100 * ONE_MB_IN_BYTES;
var PING = "TB/PING";
var BRIDGE_PING = "APP/PING";
var OIDC_USER = "TB/OIDC_USER";
var OIDC_TOKEN = "TB/OIDC_TOKEN";
var SIGN_IN = "SIGN_IN";
var SIGN_OUT = "SIGN_OUT";
var SIGN_IN_COMPLETE = "SIGN_IN_COMPLETE";
var SEND_MESSAGE_TO_BRIDGE = "SEND_MESSAGE_TO_BRIDGE";
var GET_LOGIN_STATE = "GET_LOGIN_STATE";
var LOGIN_STATE_RESPONSE = "LOGIN_STATE_RESPONSE";
var FORCE_CLOSE_WINDOW = "FORCE_CLOSE_WINDOW";
var OPEN_MANAGEMENT_PAGE = "OPEN_MANAGEMENT_PAGE";
var STORAGE_KEY_AUTH = "STORAGE_KEY_AUTH";
var PENDING_ADDON_TOKEN = "tbpro-pending-addon-token";
var GET_PENDING_ADDON_TOKEN = "TB/GET_PENDING_ADDON_TOKEN";
var PENDING_ADDON_TOKEN_RESPONSE = "TB/PENDING_ADDON_TOKEN_RESPONSE";
var GET_TELEMETRY_STATE = "TB/GET_TELEMETRY_STATE";
var TELEMETRY_STATE_RESPONSE = "TB/TELEMETRY_STATE_RESPONSE";
var TELEMETRY_STATE_CHANGED = "TB/TELEMETRY_STATE_CHANGED";
//#endregion
//#region ../../node_modules/.pnpm/@vue+shared@3.5.33/node_modules/@vue/shared/dist/shared.esm-bundler.js
/**
* @vue/shared v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
	const map = /* @__PURE__ */ Object.create(null);
	for (const key of str.split(",")) map[key] = 1;
	return (val) => val in map;
}
var EMPTY_OBJ = {};
var NOOP = () => {};
var extend = Object.assign;
var remove = (arr, el) => {
	const i = arr.indexOf(el);
	if (i > -1) arr.splice(i, 1);
};
var hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
var isArray = Array.isArray;
var isMap = (val) => toTypeString(val) === "[object Map]";
var isSet = (val) => toTypeString(val) === "[object Set]";
var isFunction$1 = (val) => typeof val === "function";
var isString = (val) => typeof val === "string";
var isSymbol = (val) => typeof val === "symbol";
var isObject$1 = (val) => val !== null && typeof val === "object";
var isPromise = (val) => {
	return (isObject$1(val) || isFunction$1(val)) && isFunction$1(val.then) && isFunction$1(val.catch);
};
var objectToString$1 = Object.prototype.toString;
var toTypeString = (value) => objectToString$1.call(value);
var toRawType = (value) => {
	return toTypeString(value).slice(8, -1);
};
var isPlainObject$2 = (val) => toTypeString(val) === "[object Object]";
var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
var hasChanged = (value, oldValue) => !Object.is(value, oldValue);
var def = (obj, key, value, writable = false) => {
	Object.defineProperty(obj, key, {
		configurable: true,
		enumerable: false,
		writable,
		value
	});
};
var _globalThis;
var getGlobalThis = () => {
	return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
//#endregion
//#region ../../node_modules/.pnpm/@vue+reactivity@3.5.33/node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
/**
* @vue/reactivity v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
var activeEffectScope;
var EffectScope = class {
	constructor(detached = false) {
		this.detached = detached;
		/**
		* @internal
		*/
		this._active = true;
		/**
		* @internal track `on` calls, allow `on` call multiple times
		*/
		this._on = 0;
		/**
		* @internal
		*/
		this.effects = [];
		/**
		* @internal
		*/
		this.cleanups = [];
		this._isPaused = false;
		this.__v_skip = true;
		this.parent = activeEffectScope;
		if (!detached && activeEffectScope) this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
	}
	get active() {
		return this._active;
	}
	pause() {
		if (this._active) {
			this._isPaused = true;
			let i, l;
			if (this.scopes) for (i = 0, l = this.scopes.length; i < l; i++) this.scopes[i].pause();
			for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].pause();
		}
	}
	/**
	* Resumes the effect scope, including all child scopes and effects.
	*/
	resume() {
		if (this._active) {
			if (this._isPaused) {
				this._isPaused = false;
				let i, l;
				if (this.scopes) for (i = 0, l = this.scopes.length; i < l; i++) this.scopes[i].resume();
				for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].resume();
			}
		}
	}
	run(fn) {
		if (this._active) {
			const currentEffectScope = activeEffectScope;
			try {
				activeEffectScope = this;
				return fn();
			} finally {
				activeEffectScope = currentEffectScope;
			}
		}
	}
	/**
	* This should only be called on non-detached scopes
	* @internal
	*/
	on() {
		if (++this._on === 1) {
			this.prevScope = activeEffectScope;
			activeEffectScope = this;
		}
	}
	/**
	* This should only be called on non-detached scopes
	* @internal
	*/
	off() {
		if (this._on > 0 && --this._on === 0) {
			if (activeEffectScope === this) activeEffectScope = this.prevScope;
			else {
				let current = activeEffectScope;
				while (current) {
					if (current.prevScope === this) {
						current.prevScope = this.prevScope;
						break;
					}
					current = current.prevScope;
				}
			}
			this.prevScope = void 0;
		}
	}
	stop(fromParent) {
		if (this._active) {
			this._active = false;
			let i, l;
			for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].stop();
			this.effects.length = 0;
			for (i = 0, l = this.cleanups.length; i < l; i++) this.cleanups[i]();
			this.cleanups.length = 0;
			if (this.scopes) {
				for (i = 0, l = this.scopes.length; i < l; i++) this.scopes[i].stop(true);
				this.scopes.length = 0;
			}
			if (!this.detached && this.parent && !fromParent) {
				const last = this.parent.scopes.pop();
				if (last && last !== this) {
					this.parent.scopes[this.index] = last;
					last.index = this.index;
				}
			}
			this.parent = void 0;
		}
	}
};
function effectScope(detached) {
	return new EffectScope(detached);
}
function getCurrentScope$1() {
	return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
	if (activeEffectScope) activeEffectScope.cleanups.push(fn);
}
var activeSub;
var pausedQueueEffects = /* @__PURE__ */ new WeakSet();
var ReactiveEffect = class {
	constructor(fn) {
		this.fn = fn;
		/**
		* @internal
		*/
		this.deps = void 0;
		/**
		* @internal
		*/
		this.depsTail = void 0;
		/**
		* @internal
		*/
		this.flags = 5;
		/**
		* @internal
		*/
		this.next = void 0;
		/**
		* @internal
		*/
		this.cleanup = void 0;
		this.scheduler = void 0;
		if (activeEffectScope && activeEffectScope.active) activeEffectScope.effects.push(this);
	}
	pause() {
		this.flags |= 64;
	}
	resume() {
		if (this.flags & 64) {
			this.flags &= -65;
			if (pausedQueueEffects.has(this)) {
				pausedQueueEffects.delete(this);
				this.trigger();
			}
		}
	}
	/**
	* @internal
	*/
	notify() {
		if (this.flags & 2 && !(this.flags & 32)) return;
		if (!(this.flags & 8)) batch(this);
	}
	run() {
		if (!(this.flags & 1)) return this.fn();
		this.flags |= 2;
		cleanupEffect(this);
		prepareDeps(this);
		const prevEffect = activeSub;
		const prevShouldTrack = shouldTrack;
		activeSub = this;
		shouldTrack = true;
		try {
			return this.fn();
		} finally {
			cleanupDeps(this);
			activeSub = prevEffect;
			shouldTrack = prevShouldTrack;
			this.flags &= -3;
		}
	}
	stop() {
		if (this.flags & 1) {
			for (let link = this.deps; link; link = link.nextDep) removeSub(link);
			this.deps = this.depsTail = void 0;
			cleanupEffect(this);
			this.onStop && this.onStop();
			this.flags &= -2;
		}
	}
	trigger() {
		if (this.flags & 64) pausedQueueEffects.add(this);
		else if (this.scheduler) this.scheduler();
		else this.runIfDirty();
	}
	/**
	* @internal
	*/
	runIfDirty() {
		if (isDirty(this)) this.run();
	}
	get dirty() {
		return isDirty(this);
	}
};
var batchDepth = 0;
var batchedSub;
var batchedComputed;
function batch(sub, isComputed = false) {
	sub.flags |= 8;
	if (isComputed) {
		sub.next = batchedComputed;
		batchedComputed = sub;
		return;
	}
	sub.next = batchedSub;
	batchedSub = sub;
}
function startBatch() {
	batchDepth++;
}
function endBatch() {
	if (--batchDepth > 0) return;
	if (batchedComputed) {
		let e = batchedComputed;
		batchedComputed = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			e = next;
		}
	}
	let error;
	while (batchedSub) {
		let e = batchedSub;
		batchedSub = void 0;
		while (e) {
			const next = e.next;
			e.next = void 0;
			e.flags &= -9;
			if (e.flags & 1) try {
				e.trigger();
			} catch (err) {
				if (!error) error = err;
			}
			e = next;
		}
	}
	if (error) throw error;
}
function prepareDeps(sub) {
	for (let link = sub.deps; link; link = link.nextDep) {
		link.version = -1;
		link.prevActiveLink = link.dep.activeLink;
		link.dep.activeLink = link;
	}
}
function cleanupDeps(sub) {
	let head;
	let tail = sub.depsTail;
	let link = tail;
	while (link) {
		const prev = link.prevDep;
		if (link.version === -1) {
			if (link === tail) tail = prev;
			removeSub(link);
			removeDep(link);
		} else head = link;
		link.dep.activeLink = link.prevActiveLink;
		link.prevActiveLink = void 0;
		link = prev;
	}
	sub.deps = head;
	sub.depsTail = tail;
}
function isDirty(sub) {
	for (let link = sub.deps; link; link = link.nextDep) if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) return true;
	if (sub._dirty) return true;
	return false;
}
function refreshComputed(computed) {
	if (computed.flags & 4 && !(computed.flags & 16)) return;
	computed.flags &= -17;
	if (computed.globalVersion === globalVersion) return;
	computed.globalVersion = globalVersion;
	if (!computed.isSSR && computed.flags & 128 && (!computed.deps && !computed._dirty || !isDirty(computed))) return;
	computed.flags |= 2;
	const dep = computed.dep;
	const prevSub = activeSub;
	const prevShouldTrack = shouldTrack;
	activeSub = computed;
	shouldTrack = true;
	try {
		prepareDeps(computed);
		const value = computed.fn(computed._value);
		if (dep.version === 0 || hasChanged(value, computed._value)) {
			computed.flags |= 128;
			computed._value = value;
			dep.version++;
		}
	} catch (err) {
		dep.version++;
		throw err;
	} finally {
		activeSub = prevSub;
		shouldTrack = prevShouldTrack;
		cleanupDeps(computed);
		computed.flags &= -3;
	}
}
function removeSub(link, soft = false) {
	const { dep, prevSub, nextSub } = link;
	if (prevSub) {
		prevSub.nextSub = nextSub;
		link.prevSub = void 0;
	}
	if (nextSub) {
		nextSub.prevSub = prevSub;
		link.nextSub = void 0;
	}
	if (dep.subs === link) {
		dep.subs = prevSub;
		if (!prevSub && dep.computed) {
			dep.computed.flags &= -5;
			for (let l = dep.computed.deps; l; l = l.nextDep) removeSub(l, true);
		}
	}
	if (!soft && !--dep.sc && dep.map) dep.map.delete(dep.key);
}
function removeDep(link) {
	const { prevDep, nextDep } = link;
	if (prevDep) {
		prevDep.nextDep = nextDep;
		link.prevDep = void 0;
	}
	if (nextDep) {
		nextDep.prevDep = prevDep;
		link.nextDep = void 0;
	}
}
var shouldTrack = true;
var trackStack = [];
function pauseTracking() {
	trackStack.push(shouldTrack);
	shouldTrack = false;
}
function resetTracking() {
	const last = trackStack.pop();
	shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
	const { cleanup } = e;
	e.cleanup = void 0;
	if (cleanup) {
		const prevSub = activeSub;
		activeSub = void 0;
		try {
			cleanup();
		} finally {
			activeSub = prevSub;
		}
	}
}
var globalVersion = 0;
var Link = class {
	constructor(sub, dep) {
		this.sub = sub;
		this.dep = dep;
		this.version = dep.version;
		this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
	}
};
var Dep = class {
	constructor(computed) {
		this.computed = computed;
		this.version = 0;
		/**
		* Link between this dep and the current active effect
		*/
		this.activeLink = void 0;
		/**
		* Doubly linked list representing the subscribing effects (tail)
		*/
		this.subs = void 0;
		/**
		* For object property deps cleanup
		*/
		this.map = void 0;
		this.key = void 0;
		/**
		* Subscriber counter
		*/
		this.sc = 0;
		/**
		* @internal
		*/
		this.__v_skip = true;
	}
	track(debugInfo) {
		if (!activeSub || !shouldTrack || activeSub === this.computed) return;
		let link = this.activeLink;
		if (link === void 0 || link.sub !== activeSub) {
			link = this.activeLink = new Link(activeSub, this);
			if (!activeSub.deps) activeSub.deps = activeSub.depsTail = link;
			else {
				link.prevDep = activeSub.depsTail;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
			}
			addSub(link);
		} else if (link.version === -1) {
			link.version = this.version;
			if (link.nextDep) {
				const next = link.nextDep;
				next.prevDep = link.prevDep;
				if (link.prevDep) link.prevDep.nextDep = next;
				link.prevDep = activeSub.depsTail;
				link.nextDep = void 0;
				activeSub.depsTail.nextDep = link;
				activeSub.depsTail = link;
				if (activeSub.deps === link) activeSub.deps = next;
			}
		}
		return link;
	}
	trigger(debugInfo) {
		this.version++;
		globalVersion++;
		this.notify(debugInfo);
	}
	notify(debugInfo) {
		startBatch();
		try {
			for (let link = this.subs; link; link = link.prevSub) if (link.sub.notify()) link.sub.dep.notify();
		} finally {
			endBatch();
		}
	}
};
function addSub(link) {
	link.dep.sc++;
	if (link.sub.flags & 4) {
		const computed = link.dep.computed;
		if (computed && !link.dep.subs) {
			computed.flags |= 20;
			for (let l = computed.deps; l; l = l.nextDep) addSub(l);
		}
		const currentTail = link.dep.subs;
		if (currentTail !== link) {
			link.prevSub = currentTail;
			if (currentTail) currentTail.nextSub = link;
		}
		link.dep.subs = link;
	}
}
var targetMap = /* @__PURE__ */ new WeakMap();
var ITERATE_KEY = /* @__PURE__ */ Symbol("");
var MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
var ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
function track(target, type, key) {
	if (shouldTrack && activeSub) {
		let depsMap = targetMap.get(target);
		if (!depsMap) targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
		let dep = depsMap.get(key);
		if (!dep) {
			depsMap.set(key, dep = new Dep());
			dep.map = depsMap;
			dep.key = key;
		}
		dep.track();
	}
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
	const depsMap = targetMap.get(target);
	if (!depsMap) {
		globalVersion++;
		return;
	}
	const run = (dep) => {
		if (dep) dep.trigger();
	};
	startBatch();
	if (type === "clear") depsMap.forEach(run);
	else {
		const targetIsArray = isArray(target);
		const isArrayIndex = targetIsArray && isIntegerKey(key);
		if (targetIsArray && key === "length") {
			const newLength = Number(newValue);
			depsMap.forEach((dep, key2) => {
				if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) run(dep);
			});
		} else {
			if (key !== void 0 || depsMap.has(void 0)) run(depsMap.get(key));
			if (isArrayIndex) run(depsMap.get(ARRAY_ITERATE_KEY));
			switch (type) {
				case "add":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					} else if (isArrayIndex) run(depsMap.get("length"));
					break;
				case "delete":
					if (!targetIsArray) {
						run(depsMap.get(ITERATE_KEY));
						if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
					}
					break;
				case "set":
					if (isMap(target)) run(depsMap.get(ITERATE_KEY));
					break;
			}
		}
	}
	endBatch();
}
function getDepFromReactive(object, key) {
	const depMap = targetMap.get(object);
	return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
	const raw = /* @__PURE__ */ toRaw(array);
	if (raw === array) return raw;
	track(raw, "iterate", ARRAY_ITERATE_KEY);
	return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
	track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
	return arr;
}
function toWrapped(target, item) {
	if (/* @__PURE__ */ isReadonly(target)) return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
	return toReactive(item);
}
var arrayInstrumentations = {
	__proto__: null,
	[Symbol.iterator]() {
		return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
	},
	concat(...args) {
		return reactiveReadArray(this).concat(...args.map((x) => isArray(x) ? reactiveReadArray(x) : x));
	},
	entries() {
		return iterator(this, "entries", (value) => {
			value[1] = toWrapped(this, value[1]);
			return value;
		});
	},
	every(fn, thisArg) {
		return apply(this, "every", fn, thisArg, void 0, arguments);
	},
	filter(fn, thisArg) {
		return apply(this, "filter", fn, thisArg, (v) => v.map((item) => toWrapped(this, item)), arguments);
	},
	find(fn, thisArg) {
		return apply(this, "find", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findIndex(fn, thisArg) {
		return apply(this, "findIndex", fn, thisArg, void 0, arguments);
	},
	findLast(fn, thisArg) {
		return apply(this, "findLast", fn, thisArg, (item) => toWrapped(this, item), arguments);
	},
	findLastIndex(fn, thisArg) {
		return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
	},
	forEach(fn, thisArg) {
		return apply(this, "forEach", fn, thisArg, void 0, arguments);
	},
	includes(...args) {
		return searchProxy(this, "includes", args);
	},
	indexOf(...args) {
		return searchProxy(this, "indexOf", args);
	},
	join(separator) {
		return reactiveReadArray(this).join(separator);
	},
	lastIndexOf(...args) {
		return searchProxy(this, "lastIndexOf", args);
	},
	map(fn, thisArg) {
		return apply(this, "map", fn, thisArg, void 0, arguments);
	},
	pop() {
		return noTracking(this, "pop");
	},
	push(...args) {
		return noTracking(this, "push", args);
	},
	reduce(fn, ...args) {
		return reduce(this, "reduce", fn, args);
	},
	reduceRight(fn, ...args) {
		return reduce(this, "reduceRight", fn, args);
	},
	shift() {
		return noTracking(this, "shift");
	},
	some(fn, thisArg) {
		return apply(this, "some", fn, thisArg, void 0, arguments);
	},
	splice(...args) {
		return noTracking(this, "splice", args);
	},
	toReversed() {
		return reactiveReadArray(this).toReversed();
	},
	toSorted(comparer) {
		return reactiveReadArray(this).toSorted(comparer);
	},
	toSpliced(...args) {
		return reactiveReadArray(this).toSpliced(...args);
	},
	unshift(...args) {
		return noTracking(this, "unshift", args);
	},
	values() {
		return iterator(this, "values", (item) => toWrapped(this, item));
	}
};
function iterator(self, method, wrapValue) {
	const arr = shallowReadArray(self);
	const iter = arr[method]();
	if (arr !== self && !/* @__PURE__ */ isShallow(self)) {
		iter._next = iter.next;
		iter.next = () => {
			const result = iter._next();
			if (!result.done) result.value = wrapValue(result.value);
			return result;
		};
	}
	return iter;
}
var arrayProto = Array.prototype;
function apply(self, method, fn, thisArg, wrappedRetFn, args) {
	const arr = shallowReadArray(self);
	const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
	const methodFn = arr[method];
	if (methodFn !== arrayProto[method]) {
		const result2 = methodFn.apply(self, args);
		return needsWrap ? toReactive(result2) : result2;
	}
	let wrappedFn = fn;
	if (arr !== self) {
		if (needsWrap) wrappedFn = function(item, index) {
			return fn.call(this, toWrapped(self, item), index, self);
		};
		else if (fn.length > 2) wrappedFn = function(item, index) {
			return fn.call(this, item, index, self);
		};
	}
	const result = methodFn.call(arr, wrappedFn, thisArg);
	return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self, method, fn, args) {
	const arr = shallowReadArray(self);
	const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
	let wrappedFn = fn;
	let wrapInitialAccumulator = false;
	if (arr !== self) {
		if (needsWrap) {
			wrapInitialAccumulator = args.length === 0;
			wrappedFn = function(acc, item, index) {
				if (wrapInitialAccumulator) {
					wrapInitialAccumulator = false;
					acc = toWrapped(self, acc);
				}
				return fn.call(this, acc, toWrapped(self, item), index, self);
			};
		} else if (fn.length > 3) wrappedFn = function(acc, item, index) {
			return fn.call(this, acc, item, index, self);
		};
	}
	const result = arr[method](wrappedFn, ...args);
	return wrapInitialAccumulator ? toWrapped(self, result) : result;
}
function searchProxy(self, method, args) {
	const arr = /* @__PURE__ */ toRaw(self);
	track(arr, "iterate", ARRAY_ITERATE_KEY);
	const res = arr[method](...args);
	if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
		args[0] = /* @__PURE__ */ toRaw(args[0]);
		return arr[method](...args);
	}
	return res;
}
function noTracking(self, method, args = []) {
	pauseTracking();
	startBatch();
	const res = (/* @__PURE__ */ toRaw(self))[method].apply(self, args);
	endBatch();
	resetTracking();
	return res;
}
var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
var builtInSymbols = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol));
function hasOwnProperty(key) {
	if (!isSymbol(key)) key = String(key);
	const obj = /* @__PURE__ */ toRaw(this);
	track(obj, "has", key);
	return obj.hasOwnProperty(key);
}
var BaseReactiveHandler = class {
	constructor(_isReadonly = false, _isShallow = false) {
		this._isReadonly = _isReadonly;
		this._isShallow = _isShallow;
	}
	get(target, key, receiver) {
		if (key === "__v_skip") return target["__v_skip"];
		const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_isShallow") return isShallow2;
		else if (key === "__v_raw") {
			if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) return target;
			return;
		}
		const targetIsArray = isArray(target);
		if (!isReadonly2) {
			let fn;
			if (targetIsArray && (fn = arrayInstrumentations[key])) return fn;
			if (key === "hasOwnProperty") return hasOwnProperty;
		}
		const res = Reflect.get(target, key, /* @__PURE__ */ isRef(target) ? target : receiver);
		if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) return res;
		if (!isReadonly2) track(target, "get", key);
		if (isShallow2) return res;
		if (/* @__PURE__ */ isRef(res)) {
			const value = targetIsArray && isIntegerKey(key) ? res : res.value;
			return isReadonly2 && isObject$1(value) ? /* @__PURE__ */ readonly(value) : value;
		}
		if (isObject$1(res)) return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
		return res;
	}
};
var MutableReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(false, isShallow2);
	}
	set(target, key, value, receiver) {
		let oldValue = target[key];
		const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
		if (!this._isShallow) {
			const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
			if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
				oldValue = /* @__PURE__ */ toRaw(oldValue);
				value = /* @__PURE__ */ toRaw(value);
			}
			if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) if (isOldValueReadonly) return true;
			else {
				oldValue.value = value;
				return true;
			}
		}
		const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
		const result = Reflect.set(target, key, value, /* @__PURE__ */ isRef(target) ? target : receiver);
		if (target === /* @__PURE__ */ toRaw(receiver)) {
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
		}
		return result;
	}
	deleteProperty(target, key) {
		const hadKey = hasOwn(target, key);
		const oldValue = target[key];
		const result = Reflect.deleteProperty(target, key);
		if (result && hadKey) trigger(target, "delete", key, void 0, oldValue);
		return result;
	}
	has(target, key) {
		const result = Reflect.has(target, key);
		if (!isSymbol(key) || !builtInSymbols.has(key)) track(target, "has", key);
		return result;
	}
	ownKeys(target) {
		track(target, "iterate", isArray(target) ? "length" : ITERATE_KEY);
		return Reflect.ownKeys(target);
	}
};
var ReadonlyReactiveHandler = class extends BaseReactiveHandler {
	constructor(isShallow2 = false) {
		super(true, isShallow2);
	}
	set(target, key) {
		return true;
	}
	deleteProperty(target, key) {
		return true;
	}
};
var mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
var readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
var toShallow = (value) => value;
var getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
	return function(...args) {
		const target = this["__v_raw"];
		const rawTarget = /* @__PURE__ */ toRaw(target);
		const targetIsMap = isMap(rawTarget);
		const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
		const isKeyOnly = method === "keys" && targetIsMap;
		const innerIterator = target[method](...args);
		const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
		!isReadonly2 && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
		return extend(Object.create(innerIterator), { next() {
			const { value, done } = innerIterator.next();
			return done ? {
				value,
				done
			} : {
				value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
				done
			};
		} });
	};
}
function createReadonlyMethod(type) {
	return function(...args) {
		return type === "delete" ? false : type === "clear" ? void 0 : this;
	};
}
function createInstrumentations(readonly, shallow) {
	const instrumentations = {
		get(key) {
			const target = this["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const rawKey = /* @__PURE__ */ toRaw(key);
			if (!readonly) {
				if (hasChanged(key, rawKey)) track(rawTarget, "get", key);
				track(rawTarget, "get", rawKey);
			}
			const { has } = getProto(rawTarget);
			const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
			if (has.call(rawTarget, key)) return wrap(target.get(key));
			else if (has.call(rawTarget, rawKey)) return wrap(target.get(rawKey));
			else if (target !== rawTarget) target.get(key);
		},
		get size() {
			const target = this["__v_raw"];
			!readonly && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
			return target.size;
		},
		has(key) {
			const target = this["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const rawKey = /* @__PURE__ */ toRaw(key);
			if (!readonly) {
				if (hasChanged(key, rawKey)) track(rawTarget, "has", key);
				track(rawTarget, "has", rawKey);
			}
			return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
		},
		forEach(callback, thisArg) {
			const observed = this;
			const target = observed["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
			!readonly && track(rawTarget, "iterate", ITERATE_KEY);
			return target.forEach((value, key) => {
				return callback.call(thisArg, wrap(value), wrap(key), observed);
			});
		}
	};
	extend(instrumentations, readonly ? {
		add: createReadonlyMethod("add"),
		set: createReadonlyMethod("set"),
		delete: createReadonlyMethod("delete"),
		clear: createReadonlyMethod("clear")
	} : {
		add(value) {
			const target = /* @__PURE__ */ toRaw(this);
			const proto = getProto(target);
			const rawValue = /* @__PURE__ */ toRaw(value);
			const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
			if (!(proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue))) {
				target.add(valueToAdd);
				trigger(target, "add", valueToAdd, valueToAdd);
			}
			return this;
		},
		set(key, value) {
			if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) value = /* @__PURE__ */ toRaw(value);
			const target = /* @__PURE__ */ toRaw(this);
			const { has, get } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = /* @__PURE__ */ toRaw(key);
				hadKey = has.call(target, key);
			}
			const oldValue = get.call(target, key);
			target.set(key, value);
			if (!hadKey) trigger(target, "add", key, value);
			else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
			return this;
		},
		delete(key) {
			const target = /* @__PURE__ */ toRaw(this);
			const { has, get } = getProto(target);
			let hadKey = has.call(target, key);
			if (!hadKey) {
				key = /* @__PURE__ */ toRaw(key);
				hadKey = has.call(target, key);
			}
			const oldValue = get ? get.call(target, key) : void 0;
			const result = target.delete(key);
			if (hadKey) trigger(target, "delete", key, void 0, oldValue);
			return result;
		},
		clear() {
			const target = /* @__PURE__ */ toRaw(this);
			const hadItems = target.size !== 0;
			const oldTarget = void 0;
			const result = target.clear();
			if (hadItems) trigger(target, "clear", void 0, void 0, oldTarget);
			return result;
		}
	});
	[
		"keys",
		"values",
		"entries",
		Symbol.iterator
	].forEach((method) => {
		instrumentations[method] = createIterableMethod(method, readonly, shallow);
	});
	return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
	const instrumentations = createInstrumentations(isReadonly2, shallow);
	return (target, key, receiver) => {
		if (key === "__v_isReactive") return !isReadonly2;
		else if (key === "__v_isReadonly") return isReadonly2;
		else if (key === "__v_raw") return target;
		return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
	};
}
var mutableCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, false) };
var readonlyCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(true, false) };
var reactiveMap = /* @__PURE__ */ new WeakMap();
var shallowReactiveMap = /* @__PURE__ */ new WeakMap();
var readonlyMap = /* @__PURE__ */ new WeakMap();
var shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
	switch (rawType) {
		case "Object":
		case "Array": return 1;
		case "Map":
		case "Set":
		case "WeakMap":
		case "WeakSet": return 2;
		default: return 0;
	}
}
function getTargetType(value) {
	return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
	if (/* @__PURE__ */ isReadonly(target)) return target;
	return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
	return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
	if (!isObject$1(target)) return target;
	if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) return target;
	const targetType = getTargetType(target);
	if (targetType === 0) return target;
	const existingProxy = proxyMap.get(target);
	if (existingProxy) return existingProxy;
	const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
	proxyMap.set(target, proxy);
	return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
	if (/* @__PURE__ */ isReadonly(value)) return /* @__PURE__ */ isReactive(value["__v_raw"]);
	return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
	return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
	return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
	return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
	const raw = observed && observed["__v_raw"];
	return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
	if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) def(value, "__v_skip", true);
	return value;
}
var toReactive = (value) => isObject$1(value) ? /* @__PURE__ */ reactive(value) : value;
var toReadonly = (value) => isObject$1(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
	return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
	return createRef(value, false);
}
function createRef(rawValue, shallow) {
	if (/* @__PURE__ */ isRef(rawValue)) return rawValue;
	return new RefImpl(rawValue, shallow);
}
var RefImpl = class {
	constructor(value, isShallow2) {
		this.dep = new Dep();
		this["__v_isRef"] = true;
		this["__v_isShallow"] = false;
		this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
		this._value = isShallow2 ? value : toReactive(value);
		this["__v_isShallow"] = isShallow2;
	}
	get value() {
		this.dep.track();
		return this._value;
	}
	set value(newValue) {
		const oldValue = this._rawValue;
		const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
		newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
		if (hasChanged(newValue, oldValue)) {
			this._rawValue = newValue;
			this._value = useDirectValue ? newValue : toReactive(newValue);
			this.dep.trigger();
		}
	}
};
function unref(ref2) {
	return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
// @__NO_SIDE_EFFECTS__
function toRefs(object) {
	const ret = isArray(object) ? new Array(object.length) : {};
	for (const key in object) ret[key] = propertyToRef(object, key);
	return ret;
}
var ObjectRefImpl = class {
	constructor(_object, key, _defaultValue) {
		this._object = _object;
		this._defaultValue = _defaultValue;
		this["__v_isRef"] = true;
		this._value = void 0;
		this._key = isSymbol(key) ? key : String(key);
		this._raw = /* @__PURE__ */ toRaw(_object);
		let shallow = true;
		let obj = _object;
		if (!isArray(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) do
			shallow = !/* @__PURE__ */ isProxy(obj) || /* @__PURE__ */ isShallow(obj);
		while (shallow && (obj = obj["__v_raw"]));
		this._shallow = shallow;
	}
	get value() {
		let val = this._object[this._key];
		if (this._shallow) val = unref(val);
		return this._value = val === void 0 ? this._defaultValue : val;
	}
	set value(newVal) {
		if (this._shallow && /* @__PURE__ */ isRef(this._raw[this._key])) {
			const nestedRef = this._object[this._key];
			if (/* @__PURE__ */ isRef(nestedRef)) {
				nestedRef.value = newVal;
				return;
			}
		}
		this._object[this._key] = newVal;
	}
	get dep() {
		return getDepFromReactive(this._raw, this._key);
	}
};
function propertyToRef(source, key, defaultValue) {
	return new ObjectRefImpl(source, key, defaultValue);
}
var ComputedRefImpl = class {
	constructor(fn, setter, isSSR) {
		this.fn = fn;
		this.setter = setter;
		/**
		* @internal
		*/
		this._value = void 0;
		/**
		* @internal
		*/
		this.dep = new Dep(this);
		/**
		* @internal
		*/
		this.__v_isRef = true;
		/**
		* @internal
		*/
		this.deps = void 0;
		/**
		* @internal
		*/
		this.depsTail = void 0;
		/**
		* @internal
		*/
		this.flags = 16;
		/**
		* @internal
		*/
		this.globalVersion = globalVersion - 1;
		/**
		* @internal
		*/
		this.next = void 0;
		this.effect = this;
		this["__v_isReadonly"] = !setter;
		this.isSSR = isSSR;
	}
	/**
	* @internal
	*/
	notify() {
		this.flags |= 16;
		if (!(this.flags & 8) && activeSub !== this) {
			batch(this, true);
			return true;
		}
	}
	get value() {
		const link = this.dep.track();
		refreshComputed(this);
		if (link) link.version = this.dep.version;
		return this._value;
	}
	set value(newValue) {
		if (this.setter) this.setter(newValue);
	}
};
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
	let getter;
	let setter;
	if (isFunction$1(getterOrOptions)) getter = getterOrOptions;
	else {
		getter = getterOrOptions.get;
		setter = getterOrOptions.set;
	}
	return new ComputedRefImpl(getter, setter, isSSR);
}
var INITIAL_WATCHER_VALUE = {};
var cleanupMap = /* @__PURE__ */ new WeakMap();
var activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
	if (owner) {
		let cleanups = cleanupMap.get(owner);
		if (!cleanups) cleanupMap.set(owner, cleanups = []);
		cleanups.push(cleanupFn);
	}
}
function watch$1(source, cb, options = EMPTY_OBJ) {
	const { immediate, deep, once, scheduler, augmentJob, call } = options;
	const reactiveGetter = (source2) => {
		if (deep) return source2;
		if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0) return traverse(source2, 1);
		return traverse(source2);
	};
	let effect;
	let getter;
	let cleanup;
	let boundCleanup;
	let forceTrigger = false;
	let isMultiSource = false;
	if (/* @__PURE__ */ isRef(source)) {
		getter = () => source.value;
		forceTrigger = /* @__PURE__ */ isShallow(source);
	} else if (/* @__PURE__ */ isReactive(source)) {
		getter = () => reactiveGetter(source);
		forceTrigger = true;
	} else if (isArray(source)) {
		isMultiSource = true;
		forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
		getter = () => source.map((s) => {
			if (/* @__PURE__ */ isRef(s)) return s.value;
			else if (/* @__PURE__ */ isReactive(s)) return reactiveGetter(s);
			else if (isFunction$1(s)) return call ? call(s, 2) : s();
		});
	} else if (isFunction$1(source)) if (cb) getter = call ? () => call(source, 2) : source;
	else getter = () => {
		if (cleanup) {
			pauseTracking();
			try {
				cleanup();
			} finally {
				resetTracking();
			}
		}
		const currentEffect = activeWatcher;
		activeWatcher = effect;
		try {
			return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
		} finally {
			activeWatcher = currentEffect;
		}
	};
	else getter = NOOP;
	if (cb && deep) {
		const baseGetter = getter;
		const depth = deep === true ? Infinity : deep;
		getter = () => traverse(baseGetter(), depth);
	}
	const scope = getCurrentScope$1();
	const watchHandle = () => {
		effect.stop();
		if (scope && scope.active) remove(scope.effects, effect);
	};
	if (once && cb) {
		const _cb = cb;
		cb = (...args) => {
			_cb(...args);
			watchHandle();
		};
	}
	let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
	const job = (immediateFirstRun) => {
		if (!(effect.flags & 1) || !effect.dirty && !immediateFirstRun) return;
		if (cb) {
			const newValue = effect.run();
			if (deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
				if (cleanup) cleanup();
				const currentWatcher = activeWatcher;
				activeWatcher = effect;
				try {
					const args = [
						newValue,
						oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
						boundCleanup
					];
					oldValue = newValue;
					call ? call(cb, 3, args) : cb(...args);
				} finally {
					activeWatcher = currentWatcher;
				}
			}
		} else effect.run();
	};
	if (augmentJob) augmentJob(job);
	effect = new ReactiveEffect(getter);
	effect.scheduler = scheduler ? () => scheduler(job, false) : job;
	boundCleanup = (fn) => onWatcherCleanup(fn, false, effect);
	cleanup = effect.onStop = () => {
		const cleanups = cleanupMap.get(effect);
		if (cleanups) {
			if (call) call(cleanups, 4);
			else for (const cleanup2 of cleanups) cleanup2();
			cleanupMap.delete(effect);
		}
	};
	if (cb) if (immediate) job(true);
	else oldValue = effect.run();
	else if (scheduler) scheduler(job.bind(null, true), true);
	else effect.run();
	watchHandle.pause = effect.pause.bind(effect);
	watchHandle.resume = effect.resume.bind(effect);
	watchHandle.stop = watchHandle;
	return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
	if (depth <= 0 || !isObject$1(value) || value["__v_skip"]) return value;
	seen = seen || /* @__PURE__ */ new Map();
	if ((seen.get(value) || 0) >= depth) return value;
	seen.set(value, depth);
	depth--;
	if (/* @__PURE__ */ isRef(value)) traverse(value.value, depth, seen);
	else if (isArray(value)) for (let i = 0; i < value.length; i++) traverse(value[i], depth, seen);
	else if (isSet(value) || isMap(value)) value.forEach((v) => {
		traverse(v, depth, seen);
	});
	else if (isPlainObject$2(value)) {
		for (const key in value) traverse(value[key], depth, seen);
		for (const key of Object.getOwnPropertySymbols(value)) if (Object.prototype.propertyIsEnumerable.call(value, key)) traverse(value[key], depth, seen);
	}
	return value;
}
//#endregion
//#region ../../node_modules/.pnpm/@vue+runtime-core@3.5.33/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
/**
* @vue/runtime-core v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
function callWithErrorHandling(fn, instance, type, args) {
	try {
		return args ? fn(...args) : fn();
	} catch (err) {
		handleError(err, instance, type);
	}
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
	if (isFunction$1(fn)) {
		const res = callWithErrorHandling(fn, instance, type, args);
		if (res && isPromise(res)) res.catch((err) => {
			handleError(err, instance, type);
		});
		return res;
	}
	if (isArray(fn)) {
		const values = [];
		for (let i = 0; i < fn.length; i++) values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
		return values;
	}
}
function handleError(err, instance, type, throwInDev = true) {
	const contextVNode = instance ? instance.vnode : null;
	const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
	if (instance) {
		let cur = instance.parent;
		const exposedInstance = instance.proxy;
		const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
		while (cur) {
			const errorCapturedHooks = cur.ec;
			if (errorCapturedHooks) {
				for (let i = 0; i < errorCapturedHooks.length; i++) if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) return;
			}
			cur = cur.parent;
		}
		if (errorHandler) {
			pauseTracking();
			callWithErrorHandling(errorHandler, null, 10, [
				err,
				exposedInstance,
				errorInfo
			]);
			resetTracking();
			return;
		}
	}
	logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
	if (throwInProd) throw err;
	else console.error(err);
}
var queue = [];
var flushIndex = -1;
var pendingPostFlushCbs = [];
var activePostFlushCbs = null;
var postFlushIndex = 0;
var resolvedPromise = /* @__PURE__ */ Promise.resolve();
var currentFlushPromise = null;
function nextTick(fn) {
	const p = currentFlushPromise || resolvedPromise;
	return fn ? p.then(this ? fn.bind(this) : fn) : p;
}
function findInsertionIndex(id) {
	let start = flushIndex + 1;
	let end = queue.length;
	while (start < end) {
		const middle = start + end >>> 1;
		const middleJob = queue[middle];
		const middleJobId = getId(middleJob);
		if (middleJobId < id || middleJobId === id && middleJob.flags & 2) start = middle + 1;
		else end = middle;
	}
	return start;
}
function queueJob(job) {
	if (!(job.flags & 1)) {
		const jobId = getId(job);
		const lastJob = queue[queue.length - 1];
		if (!lastJob || !(job.flags & 2) && jobId >= getId(lastJob)) queue.push(job);
		else queue.splice(findInsertionIndex(jobId), 0, job);
		job.flags |= 1;
		queueFlush();
	}
}
function queueFlush() {
	if (!currentFlushPromise) currentFlushPromise = resolvedPromise.then(flushJobs);
}
function queuePostFlushCb(cb) {
	if (!isArray(cb)) {
		if (activePostFlushCbs && cb.id === -1) activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
		else if (!(cb.flags & 1)) {
			pendingPostFlushCbs.push(cb);
			cb.flags |= 1;
		}
	} else pendingPostFlushCbs.push(...cb);
	queueFlush();
}
function flushPostFlushCbs(seen) {
	if (pendingPostFlushCbs.length) {
		const deduped = [...new Set(pendingPostFlushCbs)].sort((a, b) => getId(a) - getId(b));
		pendingPostFlushCbs.length = 0;
		if (activePostFlushCbs) {
			activePostFlushCbs.push(...deduped);
			return;
		}
		activePostFlushCbs = deduped;
		for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
			const cb = activePostFlushCbs[postFlushIndex];
			if (cb.flags & 4) cb.flags &= -2;
			if (!(cb.flags & 8)) cb();
			cb.flags &= -2;
		}
		activePostFlushCbs = null;
		postFlushIndex = 0;
	}
}
var getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
	try {
		for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
			const job = queue[flushIndex];
			if (job && !(job.flags & 8)) {
				if (job.flags & 4) job.flags &= -2;
				callWithErrorHandling(job, job.i, job.i ? 15 : 14);
				if (!(job.flags & 4)) job.flags &= -2;
			}
		}
	} finally {
		for (; flushIndex < queue.length; flushIndex++) {
			const job = queue[flushIndex];
			if (job) job.flags &= -2;
		}
		flushIndex = -1;
		queue.length = 0;
		flushPostFlushCbs(seen);
		currentFlushPromise = null;
		if (queue.length || pendingPostFlushCbs.length) flushJobs(seen);
	}
}
var currentRenderingInstance = null;
function inject(key, defaultValue, treatDefaultAsFactory = false) {
	const instance = getCurrentInstance();
	if (instance || currentApp) {
		let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
		if (provides && key in provides) return provides[key];
		else if (arguments.length > 1) return treatDefaultAsFactory && isFunction$1(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
	}
}
function hasInjectionContext() {
	return !!(getCurrentInstance() || currentApp);
}
var ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
var useSSRContext = () => {
	{
		const ctx = inject(ssrContextKey);
		if (!ctx) {}
		return ctx;
	}
};
function watch(source, cb, options) {
	return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
	const { immediate, deep, flush, once } = options;
	const baseWatchOptions = extend({}, options);
	const runsImmediately = cb && immediate || !cb && flush !== "post";
	let ssrCleanup;
	if (isInSSRComponentSetup) {
		if (flush === "sync") {
			const ctx = useSSRContext();
			ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
		} else if (!runsImmediately) {
			const watchStopHandle = () => {};
			watchStopHandle.stop = NOOP;
			watchStopHandle.resume = NOOP;
			watchStopHandle.pause = NOOP;
			return watchStopHandle;
		}
	}
	const instance = currentInstance;
	baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
	let isPre = false;
	if (flush === "post") baseWatchOptions.scheduler = (job) => {
		queuePostRenderEffect(job, instance && instance.suspense);
	};
	else if (flush !== "sync") {
		isPre = true;
		baseWatchOptions.scheduler = (job, isFirstRun) => {
			if (isFirstRun) job();
			else queueJob(job);
		};
	}
	baseWatchOptions.augmentJob = (job) => {
		if (cb) job.flags |= 4;
		if (isPre) {
			job.flags |= 2;
			if (instance) {
				job.id = instance.uid;
				job.i = instance;
			}
		}
	};
	const watchHandle = watch$1(source, cb, baseWatchOptions);
	if (isInSSRComponentSetup) {
		if (ssrCleanup) ssrCleanup.push(watchHandle);
		else if (runsImmediately) watchHandle();
	}
	return watchHandle;
}
getGlobalThis().requestIdleCallback;
getGlobalThis().cancelIdleCallback;
function injectHook(type, hook, target = currentInstance, prepend = false) {
	if (target) {
		const hooks = target[type] || (target[type] = []);
		const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
			pauseTracking();
			const reset = setCurrentInstance(target);
			const res = callWithAsyncErrorHandling(hook, target, type, args);
			reset();
			resetTracking();
			return res;
		});
		if (prepend) hooks.unshift(wrappedHook);
		else hooks.push(wrappedHook);
		return wrappedHook;
	}
}
var createHook = (lifecycle) => (hook, target = currentInstance) => {
	if (!isInSSRComponentSetup || lifecycle === "sp") injectHook(lifecycle, (...args) => hook(...args), target);
};
var onMounted = createHook("m");
var currentApp = null;
var queuePostRenderEffect = queueEffectWithSuspense;
function queueEffectWithSuspense(fn, suspense) {
	if (suspense && suspense.pendingBranch) if (isArray(fn)) suspense.effects.push(...fn);
	else suspense.effects.push(fn);
	else queuePostFlushCb(fn);
}
var currentInstance = null;
var getCurrentInstance = () => currentInstance || currentRenderingInstance;
var internalSetCurrentInstance;
{
	const g = getGlobalThis();
	const registerGlobalSetter = (key, setter) => {
		let setters;
		if (!(setters = g[key])) setters = g[key] = [];
		setters.push(setter);
		return (v) => {
			if (setters.length > 1) setters.forEach((set) => set(v));
			else setters[0](v);
		};
	};
	internalSetCurrentInstance = registerGlobalSetter(`__VUE_INSTANCE_SETTERS__`, (v) => currentInstance = v);
	registerGlobalSetter(`__VUE_SSR_SETTERS__`, (v) => isInSSRComponentSetup = v);
}
var setCurrentInstance = (instance) => {
	const prev = currentInstance;
	internalSetCurrentInstance(instance);
	instance.scope.on();
	return () => {
		instance.scope.off();
		internalSetCurrentInstance(prev);
	};
};
var isInSSRComponentSetup = false;
var computed = (getterOrOptions, debugOptions) => {
	return /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
};
//#endregion
//#region ../../node_modules/.pnpm/@vue+devtools-api@6.6.4/node_modules/@vue/devtools-api/lib/esm/env.js
function getDevtoolsGlobalHook() {
	return getTarget().__VUE_DEVTOOLS_GLOBAL_HOOK__;
}
function getTarget() {
	return typeof navigator !== "undefined" && typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : {};
}
var isProxyAvailable = typeof Proxy === "function";
//#endregion
//#region ../../node_modules/.pnpm/@vue+devtools-api@6.6.4/node_modules/@vue/devtools-api/lib/esm/const.js
var HOOK_SETUP = "devtools-plugin:setup";
var HOOK_PLUGIN_SETTINGS_SET = "plugin:settings:set";
//#endregion
//#region ../../node_modules/.pnpm/@vue+devtools-api@6.6.4/node_modules/@vue/devtools-api/lib/esm/time.js
var supported;
var perf;
function isPerformanceSupported() {
	var _a;
	if (supported !== void 0) return supported;
	if (typeof window !== "undefined" && window.performance) {
		supported = true;
		perf = window.performance;
	} else if (typeof globalThis !== "undefined" && ((_a = globalThis.perf_hooks) === null || _a === void 0 ? void 0 : _a.performance)) {
		supported = true;
		perf = globalThis.perf_hooks.performance;
	} else supported = false;
	return supported;
}
function now() {
	return isPerformanceSupported() ? perf.now() : Date.now();
}
//#endregion
//#region ../../node_modules/.pnpm/@vue+devtools-api@6.6.4/node_modules/@vue/devtools-api/lib/esm/proxy.js
var ApiProxy = class {
	constructor(plugin, hook) {
		this.target = null;
		this.targetQueue = [];
		this.onQueue = [];
		this.plugin = plugin;
		this.hook = hook;
		const defaultSettings = {};
		if (plugin.settings) for (const id in plugin.settings) defaultSettings[id] = plugin.settings[id].defaultValue;
		const localSettingsSaveId = `__vue-devtools-plugin-settings__${plugin.id}`;
		let currentSettings = Object.assign({}, defaultSettings);
		try {
			const raw = localStorage.getItem(localSettingsSaveId);
			const data = JSON.parse(raw);
			Object.assign(currentSettings, data);
		} catch (e) {}
		this.fallbacks = {
			getSettings() {
				return currentSettings;
			},
			setSettings(value) {
				try {
					localStorage.setItem(localSettingsSaveId, JSON.stringify(value));
				} catch (e) {}
				currentSettings = value;
			},
			now() {
				return now();
			}
		};
		if (hook) hook.on(HOOK_PLUGIN_SETTINGS_SET, (pluginId, value) => {
			if (pluginId === this.plugin.id) this.fallbacks.setSettings(value);
		});
		this.proxiedOn = new Proxy({}, { get: (_target, prop) => {
			if (this.target) return this.target.on[prop];
			else return (...args) => {
				this.onQueue.push({
					method: prop,
					args
				});
			};
		} });
		this.proxiedTarget = new Proxy({}, { get: (_target, prop) => {
			if (this.target) return this.target[prop];
			else if (prop === "on") return this.proxiedOn;
			else if (Object.keys(this.fallbacks).includes(prop)) return (...args) => {
				this.targetQueue.push({
					method: prop,
					args,
					resolve: () => {}
				});
				return this.fallbacks[prop](...args);
			};
			else return (...args) => {
				return new Promise((resolve) => {
					this.targetQueue.push({
						method: prop,
						args,
						resolve
					});
				});
			};
		} });
	}
	async setRealTarget(target) {
		this.target = target;
		for (const item of this.onQueue) this.target.on[item.method](...item.args);
		for (const item of this.targetQueue) item.resolve(await this.target[item.method](...item.args));
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@vue+devtools-api@6.6.4/node_modules/@vue/devtools-api/lib/esm/index.js
function setupDevtoolsPlugin(pluginDescriptor, setupFn) {
	const descriptor = pluginDescriptor;
	const target = getTarget();
	const hook = getDevtoolsGlobalHook();
	const enableProxy = isProxyAvailable && descriptor.enableEarlyProxy;
	if (hook && (target.__VUE_DEVTOOLS_PLUGIN_API_AVAILABLE__ || !enableProxy)) hook.emit(HOOK_SETUP, pluginDescriptor, setupFn);
	else {
		const proxy = enableProxy ? new ApiProxy(descriptor, hook) : null;
		(target.__VUE_DEVTOOLS_PLUGINS__ = target.__VUE_DEVTOOLS_PLUGINS__ || []).push({
			pluginDescriptor: descriptor,
			setupFn,
			proxy
		});
		if (proxy) setupFn(proxy.proxiedTarget);
	}
}
//#endregion
//#region ../../node_modules/.pnpm/pinia@2.3.1_typescript@5.9.3_vue@3.5.33_typescript@5.9.3_/node_modules/pinia/dist/pinia.mjs
/*!
* pinia v2.3.1
* (c) 2025 Eduardo San Martin Morote
* @license MIT
*/
/**
* setActivePinia must be called to handle SSR at the top of functions like
* `fetch`, `setup`, `serverPrefetch` and others
*/
var activePinia;
/**
* Sets or unsets the active pinia. Used in SSR and internally when calling
* actions and getters
*
* @param pinia - Pinia instance
*/
var setActivePinia = (pinia) => activePinia = pinia;
var piniaSymbol = Symbol();
function isPlainObject$1(o) {
	return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
/**
* Possible types for SubscriptionCallback
*/
var MutationType;
(function(MutationType) {
	/**
	* Direct mutation of the state:
	*
	* - `store.name = 'new name'`
	* - `store.$state.name = 'new name'`
	* - `store.list.push('new item')`
	*/
	MutationType["direct"] = "direct";
	/**
	* Mutated the state with `$patch` and an object
	*
	* - `store.$patch({ name: 'newName' })`
	*/
	MutationType["patchObject"] = "patch object";
	/**
	* Mutated the state with `$patch` and a function
	*
	* - `store.$patch(state => state.name = 'newName')`
	*/
	MutationType["patchFunction"] = "patch function";
})(MutationType || (MutationType = {}));
var IS_CLIENT = typeof window !== "undefined";
var _global = /*#__PURE__*/ (() => typeof window === "object" && window.window === window ? window : typeof self === "object" && self.self === self ? self : typeof global === "object" && global.global === global ? global : typeof globalThis === "object" ? globalThis : { HTMLElement: null })();
function bom(blob, { autoBom = false } = {}) {
	if (autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) return new Blob([String.fromCharCode(65279), blob], { type: blob.type });
	return blob;
}
function download(url, name, opts) {
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url);
	xhr.responseType = "blob";
	xhr.onload = function() {
		saveAs(xhr.response, name, opts);
	};
	xhr.onerror = function() {
		console.error("could not download file");
	};
	xhr.send();
}
function corsEnabled(url) {
	const xhr = new XMLHttpRequest();
	xhr.open("HEAD", url, false);
	try {
		xhr.send();
	} catch (e) {}
	return xhr.status >= 200 && xhr.status <= 299;
}
function click(node) {
	try {
		node.dispatchEvent(new MouseEvent("click"));
	} catch (e) {
		const evt = document.createEvent("MouseEvents");
		evt.initMouseEvent("click", true, true, window, 0, 0, 0, 80, 20, false, false, false, false, 0, null);
		node.dispatchEvent(evt);
	}
}
var _navigator = typeof navigator === "object" ? navigator : { userAgent: "" };
var isMacOSWebView = /*#__PURE__*/ (() => /Macintosh/.test(_navigator.userAgent) && /AppleWebKit/.test(_navigator.userAgent) && !/Safari/.test(_navigator.userAgent))();
var saveAs = !IS_CLIENT ? () => {} : typeof HTMLAnchorElement !== "undefined" && "download" in HTMLAnchorElement.prototype && !isMacOSWebView ? downloadSaveAs : "msSaveOrOpenBlob" in _navigator ? msSaveAs : fileSaverSaveAs;
function downloadSaveAs(blob, name = "download", opts) {
	const a = document.createElement("a");
	a.download = name;
	a.rel = "noopener";
	if (typeof blob === "string") {
		a.href = blob;
		if (a.origin !== location.origin) if (corsEnabled(a.href)) download(blob, name, opts);
		else {
			a.target = "_blank";
			click(a);
		}
		else click(a);
	} else {
		a.href = URL.createObjectURL(blob);
		setTimeout(function() {
			URL.revokeObjectURL(a.href);
		}, 4e4);
		setTimeout(function() {
			click(a);
		}, 0);
	}
}
function msSaveAs(blob, name = "download", opts) {
	if (typeof blob === "string") if (corsEnabled(blob)) download(blob, name, opts);
	else {
		const a = document.createElement("a");
		a.href = blob;
		a.target = "_blank";
		setTimeout(function() {
			click(a);
		});
	}
	else navigator.msSaveOrOpenBlob(bom(blob, opts), name);
}
function fileSaverSaveAs(blob, name, opts, popup) {
	popup = popup || open("", "_blank");
	if (popup) popup.document.title = popup.document.body.innerText = "downloading...";
	if (typeof blob === "string") return download(blob, name, opts);
	const force = blob.type === "application/octet-stream";
	const isSafari = /constructor/i.test(String(_global.HTMLElement)) || "safari" in _global;
	const isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);
	if ((isChromeIOS || force && isSafari || isMacOSWebView) && typeof FileReader !== "undefined") {
		const reader = new FileReader();
		reader.onloadend = function() {
			let url = reader.result;
			if (typeof url !== "string") {
				popup = null;
				throw new Error("Wrong reader.result type");
			}
			url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, "data:attachment/file;");
			if (popup) popup.location.href = url;
			else location.assign(url);
			popup = null;
		};
		reader.readAsDataURL(blob);
	} else {
		const url = URL.createObjectURL(blob);
		if (popup) popup.location.assign(url);
		else location.href = url;
		popup = null;
		setTimeout(function() {
			URL.revokeObjectURL(url);
		}, 4e4);
	}
}
/**
* Shows a toast or console.log
*
* @param message - message to log
* @param type - different color of the tooltip
*/
function toastMessage(message, type) {
	const piniaMessage = "🍍 " + message;
	if (typeof __VUE_DEVTOOLS_TOAST__ === "function") __VUE_DEVTOOLS_TOAST__(piniaMessage, type);
	else if (type === "error") console.error(piniaMessage);
	else if (type === "warn") console.warn(piniaMessage);
	else console.log(piniaMessage);
}
function isPinia(o) {
	return "_a" in o && "install" in o;
}
/**
* This file contain devtools actions, they are not Pinia actions.
*/
function checkClipboardAccess() {
	if (!("clipboard" in navigator)) {
		toastMessage(`Your browser doesn't support the Clipboard API`, "error");
		return true;
	}
}
function checkNotFocusedError(error) {
	if (error instanceof Error && error.message.toLowerCase().includes("document is not focused")) {
		toastMessage("You need to activate the \"Emulate a focused page\" setting in the \"Rendering\" panel of devtools.", "warn");
		return true;
	}
	return false;
}
async function actionGlobalCopyState(pinia) {
	if (checkClipboardAccess()) return;
	try {
		await navigator.clipboard.writeText(JSON.stringify(pinia.state.value));
		toastMessage("Global state copied to clipboard.");
	} catch (error) {
		if (checkNotFocusedError(error)) return;
		toastMessage(`Failed to serialize the state. Check the console for more details.`, "error");
		console.error(error);
	}
}
async function actionGlobalPasteState(pinia) {
	if (checkClipboardAccess()) return;
	try {
		loadStoresState(pinia, JSON.parse(await navigator.clipboard.readText()));
		toastMessage("Global state pasted from clipboard.");
	} catch (error) {
		if (checkNotFocusedError(error)) return;
		toastMessage(`Failed to deserialize the state from clipboard. Check the console for more details.`, "error");
		console.error(error);
	}
}
async function actionGlobalSaveState(pinia) {
	try {
		saveAs(new Blob([JSON.stringify(pinia.state.value)], { type: "text/plain;charset=utf-8" }), "pinia-state.json");
	} catch (error) {
		toastMessage(`Failed to export the state as JSON. Check the console for more details.`, "error");
		console.error(error);
	}
}
var fileInput;
function getFileOpener() {
	if (!fileInput) {
		fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.accept = ".json";
	}
	function openFile() {
		return new Promise((resolve, reject) => {
			fileInput.onchange = async () => {
				const files = fileInput.files;
				if (!files) return resolve(null);
				const file = files.item(0);
				if (!file) return resolve(null);
				return resolve({
					text: await file.text(),
					file
				});
			};
			fileInput.oncancel = () => resolve(null);
			fileInput.onerror = reject;
			fileInput.click();
		});
	}
	return openFile;
}
async function actionGlobalOpenStateFile(pinia) {
	try {
		const result = await getFileOpener()();
		if (!result) return;
		const { text, file } = result;
		loadStoresState(pinia, JSON.parse(text));
		toastMessage(`Global state imported from "${file.name}".`);
	} catch (error) {
		toastMessage(`Failed to import the state from JSON. Check the console for more details.`, "error");
		console.error(error);
	}
}
function loadStoresState(pinia, state) {
	for (const key in state) {
		const storeState = pinia.state.value[key];
		if (storeState) Object.assign(storeState, state[key]);
		else pinia.state.value[key] = state[key];
	}
}
function formatDisplay(display) {
	return { _custom: { display } };
}
var PINIA_ROOT_LABEL = "🍍 Pinia (root)";
var PINIA_ROOT_ID = "_root";
function formatStoreForInspectorTree(store) {
	return isPinia(store) ? {
		id: PINIA_ROOT_ID,
		label: PINIA_ROOT_LABEL
	} : {
		id: store.$id,
		label: store.$id
	};
}
function formatStoreForInspectorState(store) {
	if (isPinia(store)) {
		const storeNames = Array.from(store._s.keys());
		const storeMap = store._s;
		return {
			state: storeNames.map((storeId) => ({
				editable: true,
				key: storeId,
				value: store.state.value[storeId]
			})),
			getters: storeNames.filter((id) => storeMap.get(id)._getters).map((id) => {
				const store = storeMap.get(id);
				return {
					editable: false,
					key: id,
					value: store._getters.reduce((getters, key) => {
						getters[key] = store[key];
						return getters;
					}, {})
				};
			})
		};
	}
	const state = { state: Object.keys(store.$state).map((key) => ({
		editable: true,
		key,
		value: store.$state[key]
	})) };
	if (store._getters && store._getters.length) state.getters = store._getters.map((getterName) => ({
		editable: false,
		key: getterName,
		value: store[getterName]
	}));
	if (store._customProperties.size) state.customProperties = Array.from(store._customProperties).map((key) => ({
		editable: true,
		key,
		value: store[key]
	}));
	return state;
}
function formatEventData(events) {
	if (!events) return {};
	if (Array.isArray(events)) return events.reduce((data, event) => {
		data.keys.push(event.key);
		data.operations.push(event.type);
		data.oldValue[event.key] = event.oldValue;
		data.newValue[event.key] = event.newValue;
		return data;
	}, {
		oldValue: {},
		keys: [],
		operations: [],
		newValue: {}
	});
	else return {
		operation: formatDisplay(events.type),
		key: formatDisplay(events.key),
		oldValue: events.oldValue,
		newValue: events.newValue
	};
}
function formatMutationType(type) {
	switch (type) {
		case MutationType.direct: return "mutation";
		case MutationType.patchFunction: return "$patch";
		case MutationType.patchObject: return "$patch";
		default: return "unknown";
	}
}
var isTimelineActive = true;
var componentStateTypes = [];
var MUTATIONS_LAYER_ID = "pinia:mutations";
var INSPECTOR_ID = "pinia";
var { assign: assign$1 } = Object;
/**
* Gets the displayed name of a store in devtools
*
* @param id - id of the store
* @returns a formatted string
*/
var getStoreType = (id) => "🍍 " + id;
/**
* Add the pinia plugin without any store. Allows displaying a Pinia plugin tab
* as soon as it is added to the application.
*
* @param app - Vue application
* @param pinia - pinia instance
*/
function registerPiniaDevtools(app, pinia) {
	setupDevtoolsPlugin({
		id: "dev.esm.pinia",
		label: "Pinia 🍍",
		logo: "https://pinia.vuejs.org/logo.svg",
		packageName: "pinia",
		homepage: "https://pinia.vuejs.org",
		componentStateTypes,
		app
	}, (api) => {
		if (typeof api.now !== "function") toastMessage("You seem to be using an outdated version of Vue Devtools. Are you still using the Beta release instead of the stable one? You can find the links at https://devtools.vuejs.org/guide/installation.html.");
		api.addTimelineLayer({
			id: MUTATIONS_LAYER_ID,
			label: `Pinia 🍍`,
			color: 15064968
		});
		api.addInspector({
			id: INSPECTOR_ID,
			label: "Pinia 🍍",
			icon: "storage",
			treeFilterPlaceholder: "Search stores",
			actions: [
				{
					icon: "content_copy",
					action: () => {
						actionGlobalCopyState(pinia);
					},
					tooltip: "Serialize and copy the state"
				},
				{
					icon: "content_paste",
					action: async () => {
						await actionGlobalPasteState(pinia);
						api.sendInspectorTree(INSPECTOR_ID);
						api.sendInspectorState(INSPECTOR_ID);
					},
					tooltip: "Replace the state with the content of your clipboard"
				},
				{
					icon: "save",
					action: () => {
						actionGlobalSaveState(pinia);
					},
					tooltip: "Save the state as a JSON file"
				},
				{
					icon: "folder_open",
					action: async () => {
						await actionGlobalOpenStateFile(pinia);
						api.sendInspectorTree(INSPECTOR_ID);
						api.sendInspectorState(INSPECTOR_ID);
					},
					tooltip: "Import the state from a JSON file"
				}
			],
			nodeActions: [{
				icon: "restore",
				tooltip: "Reset the state (with \"$reset\")",
				action: (nodeId) => {
					const store = pinia._s.get(nodeId);
					if (!store) toastMessage(`Cannot reset "${nodeId}" store because it wasn't found.`, "warn");
					else if (typeof store.$reset !== "function") toastMessage(`Cannot reset "${nodeId}" store because it doesn't have a "$reset" method implemented.`, "warn");
					else {
						store.$reset();
						toastMessage(`Store "${nodeId}" reset.`);
					}
				}
			}]
		});
		api.on.inspectComponent((payload, ctx) => {
			const proxy = payload.componentInstance && payload.componentInstance.proxy;
			if (proxy && proxy._pStores) {
				const piniaStores = payload.componentInstance.proxy._pStores;
				Object.values(piniaStores).forEach((store) => {
					payload.instanceData.state.push({
						type: getStoreType(store.$id),
						key: "state",
						editable: true,
						value: store._isOptionsAPI ? { _custom: {
							value: /* @__PURE__ */ toRaw(store.$state),
							actions: [{
								icon: "restore",
								tooltip: "Reset the state of this store",
								action: () => store.$reset()
							}]
						} } : Object.keys(store.$state).reduce((state, key) => {
							state[key] = store.$state[key];
							return state;
						}, {})
					});
					if (store._getters && store._getters.length) payload.instanceData.state.push({
						type: getStoreType(store.$id),
						key: "getters",
						editable: false,
						value: store._getters.reduce((getters, key) => {
							try {
								getters[key] = store[key];
							} catch (error) {
								getters[key] = error;
							}
							return getters;
						}, {})
					});
				});
			}
		});
		api.on.getInspectorTree((payload) => {
			if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
				let stores = [pinia];
				stores = stores.concat(Array.from(pinia._s.values()));
				payload.rootNodes = (payload.filter ? stores.filter((store) => "$id" in store ? store.$id.toLowerCase().includes(payload.filter.toLowerCase()) : PINIA_ROOT_LABEL.toLowerCase().includes(payload.filter.toLowerCase())) : stores).map(formatStoreForInspectorTree);
			}
		});
		globalThis.$pinia = pinia;
		api.on.getInspectorState((payload) => {
			if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
				const inspectedStore = payload.nodeId === PINIA_ROOT_ID ? pinia : pinia._s.get(payload.nodeId);
				if (!inspectedStore) return;
				if (inspectedStore) {
					if (payload.nodeId !== PINIA_ROOT_ID) globalThis.$store = /* @__PURE__ */ toRaw(inspectedStore);
					payload.state = formatStoreForInspectorState(inspectedStore);
				}
			}
		});
		api.on.editInspectorState((payload, ctx) => {
			if (payload.app === app && payload.inspectorId === INSPECTOR_ID) {
				const inspectedStore = payload.nodeId === PINIA_ROOT_ID ? pinia : pinia._s.get(payload.nodeId);
				if (!inspectedStore) return toastMessage(`store "${payload.nodeId}" not found`, "error");
				const { path } = payload;
				if (!isPinia(inspectedStore)) {
					if (path.length !== 1 || !inspectedStore._customProperties.has(path[0]) || path[0] in inspectedStore.$state) path.unshift("$state");
				} else path.unshift("state");
				isTimelineActive = false;
				payload.set(inspectedStore, path, payload.state.value);
				isTimelineActive = true;
			}
		});
		api.on.editComponentState((payload) => {
			if (payload.type.startsWith("🍍")) {
				const storeId = payload.type.replace(/^🍍\s*/, "");
				const store = pinia._s.get(storeId);
				if (!store) return toastMessage(`store "${storeId}" not found`, "error");
				const { path } = payload;
				if (path[0] !== "state") return toastMessage(`Invalid path for store "${storeId}":\n${path}\nOnly state can be modified.`);
				path[0] = "$state";
				isTimelineActive = false;
				payload.set(store, path, payload.state.value);
				isTimelineActive = true;
			}
		});
	});
}
function addStoreToDevtools(app, store) {
	if (!componentStateTypes.includes(getStoreType(store.$id))) componentStateTypes.push(getStoreType(store.$id));
	setupDevtoolsPlugin({
		id: "dev.esm.pinia",
		label: "Pinia 🍍",
		logo: "https://pinia.vuejs.org/logo.svg",
		packageName: "pinia",
		homepage: "https://pinia.vuejs.org",
		componentStateTypes,
		app,
		settings: { logStoreChanges: {
			label: "Notify about new/deleted stores",
			type: "boolean",
			defaultValue: true
		} }
	}, (api) => {
		const now = typeof api.now === "function" ? api.now.bind(api) : Date.now;
		store.$onAction(({ after, onError, name, args }) => {
			const groupId = runningActionId++;
			api.addTimelineEvent({
				layerId: MUTATIONS_LAYER_ID,
				event: {
					time: now(),
					title: "🛫 " + name,
					subtitle: "start",
					data: {
						store: formatDisplay(store.$id),
						action: formatDisplay(name),
						args
					},
					groupId
				}
			});
			after((result) => {
				activeAction = void 0;
				api.addTimelineEvent({
					layerId: MUTATIONS_LAYER_ID,
					event: {
						time: now(),
						title: "🛬 " + name,
						subtitle: "end",
						data: {
							store: formatDisplay(store.$id),
							action: formatDisplay(name),
							args,
							result
						},
						groupId
					}
				});
			});
			onError((error) => {
				activeAction = void 0;
				api.addTimelineEvent({
					layerId: MUTATIONS_LAYER_ID,
					event: {
						time: now(),
						logType: "error",
						title: "💥 " + name,
						subtitle: "end",
						data: {
							store: formatDisplay(store.$id),
							action: formatDisplay(name),
							args,
							error
						},
						groupId
					}
				});
			});
		}, true);
		store._customProperties.forEach((name) => {
			watch(() => unref(store[name]), (newValue, oldValue) => {
				api.notifyComponentUpdate();
				api.sendInspectorState(INSPECTOR_ID);
				if (isTimelineActive) api.addTimelineEvent({
					layerId: MUTATIONS_LAYER_ID,
					event: {
						time: now(),
						title: "Change",
						subtitle: name,
						data: {
							newValue,
							oldValue
						},
						groupId: activeAction
					}
				});
			}, { deep: true });
		});
		store.$subscribe(({ events, type }, state) => {
			api.notifyComponentUpdate();
			api.sendInspectorState(INSPECTOR_ID);
			if (!isTimelineActive) return;
			const eventData = {
				time: now(),
				title: formatMutationType(type),
				data: assign$1({ store: formatDisplay(store.$id) }, formatEventData(events)),
				groupId: activeAction
			};
			if (type === MutationType.patchFunction) eventData.subtitle = "⤵️";
			else if (type === MutationType.patchObject) eventData.subtitle = "🧩";
			else if (events && !Array.isArray(events)) eventData.subtitle = events.type;
			if (events) eventData.data["rawEvent(s)"] = { _custom: {
				display: "DebuggerEvent",
				type: "object",
				tooltip: "raw DebuggerEvent[]",
				value: events
			} };
			api.addTimelineEvent({
				layerId: MUTATIONS_LAYER_ID,
				event: eventData
			});
		}, {
			detached: true,
			flush: "sync"
		});
		const hotUpdate = store._hotUpdate;
		store._hotUpdate = markRaw((newStore) => {
			hotUpdate(newStore);
			api.addTimelineEvent({
				layerId: MUTATIONS_LAYER_ID,
				event: {
					time: now(),
					title: "🔥 " + store.$id,
					subtitle: "HMR update",
					data: {
						store: formatDisplay(store.$id),
						info: formatDisplay(`HMR update`)
					}
				}
			});
			api.notifyComponentUpdate();
			api.sendInspectorTree(INSPECTOR_ID);
			api.sendInspectorState(INSPECTOR_ID);
		});
		const { $dispose } = store;
		store.$dispose = () => {
			$dispose();
			api.notifyComponentUpdate();
			api.sendInspectorTree(INSPECTOR_ID);
			api.sendInspectorState(INSPECTOR_ID);
			api.getSettings().logStoreChanges && toastMessage(`Disposed "${store.$id}" store 🗑`);
		};
		api.notifyComponentUpdate();
		api.sendInspectorTree(INSPECTOR_ID);
		api.sendInspectorState(INSPECTOR_ID);
		api.getSettings().logStoreChanges && toastMessage(`"${store.$id}" store installed 🆕`);
	});
}
var runningActionId = 0;
var activeAction;
/**
* Patches a store to enable action grouping in devtools by wrapping the store with a Proxy that is passed as the
* context of all actions, allowing us to set `runningAction` on each access and effectively associating any state
* mutation to the action.
*
* @param store - store to patch
* @param actionNames - list of actionst to patch
*/
function patchActionForGrouping(store, actionNames, wrapWithProxy) {
	const actions = actionNames.reduce((storeActions, actionName) => {
		storeActions[actionName] = (/* @__PURE__ */ toRaw(store))[actionName];
		return storeActions;
	}, {});
	for (const actionName in actions) store[actionName] = function() {
		const _actionId = runningActionId;
		const trackedStore = wrapWithProxy ? new Proxy(store, {
			get(...args) {
				activeAction = _actionId;
				return Reflect.get(...args);
			},
			set(...args) {
				activeAction = _actionId;
				return Reflect.set(...args);
			}
		}) : store;
		activeAction = _actionId;
		const retValue = actions[actionName].apply(trackedStore, arguments);
		activeAction = void 0;
		return retValue;
	};
}
/**
* pinia.use(devtoolsPlugin)
*/
function devtoolsPlugin({ app, store, options }) {
	if (store.$id.startsWith("__hot:")) return;
	store._isOptionsAPI = !!options.state;
	if (!store._p._testing) {
		patchActionForGrouping(store, Object.keys(options.actions), store._isOptionsAPI);
		const originalHotUpdate = store._hotUpdate;
		(/* @__PURE__ */ toRaw(store))._hotUpdate = function(newStore) {
			originalHotUpdate.apply(this, arguments);
			patchActionForGrouping(store, Object.keys(newStore._hmrPayload.actions), !!store._isOptionsAPI);
		};
	}
	addStoreToDevtools(app, store);
}
/**
* Creates a Pinia instance to be used by the application
*/
function createPinia() {
	const scope = effectScope(true);
	const state = scope.run(() => /* @__PURE__ */ ref({}));
	let _p = [];
	let toBeInstalled = [];
	const pinia = markRaw({
		install(app) {
			setActivePinia(pinia);
			pinia._a = app;
			app.provide(piniaSymbol, pinia);
			app.config.globalProperties.$pinia = pinia;
			/* istanbul ignore else */
			if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && IS_CLIENT) registerPiniaDevtools(app, pinia);
			toBeInstalled.forEach((plugin) => _p.push(plugin));
			toBeInstalled = [];
		},
		use(plugin) {
			if (!this._a && true) toBeInstalled.push(plugin);
			else _p.push(plugin);
			return this;
		},
		_p,
		_a: null,
		_e: scope,
		_s: /* @__PURE__ */ new Map(),
		state
	});
	if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && IS_CLIENT && typeof Proxy !== "undefined") pinia.use(devtoolsPlugin);
	return pinia;
}
var noop$2 = () => {};
function addSubscription(subscriptions, callback, detached, onCleanup = noop$2) {
	subscriptions.push(callback);
	const removeSubscription = () => {
		const idx = subscriptions.indexOf(callback);
		if (idx > -1) {
			subscriptions.splice(idx, 1);
			onCleanup();
		}
	};
	if (!detached && getCurrentScope$1()) onScopeDispose(removeSubscription);
	return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
	subscriptions.slice().forEach((callback) => {
		callback(...args);
	});
}
var fallbackRunWithContext = (fn) => fn();
/**
* Marks a function as an action for `$onAction`
* @internal
*/
var ACTION_MARKER = Symbol();
/**
* Action name symbol. Allows to add a name to an action after defining it
* @internal
*/
var ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
	if (target instanceof Map && patchToApply instanceof Map) patchToApply.forEach((value, key) => target.set(key, value));
	else if (target instanceof Set && patchToApply instanceof Set) patchToApply.forEach(target.add, target);
	for (const key in patchToApply) {
		if (!patchToApply.hasOwnProperty(key)) continue;
		const subPatch = patchToApply[key];
		const targetValue = target[key];
		if (isPlainObject$1(targetValue) && isPlainObject$1(subPatch) && target.hasOwnProperty(key) && !/* @__PURE__ */ isRef(subPatch) && !/* @__PURE__ */ isReactive(subPatch)) target[key] = mergeReactiveObjects(targetValue, subPatch);
		else target[key] = subPatch;
	}
	return target;
}
var skipHydrateSymbol = Symbol();
/**
* Returns whether a value should be hydrated
*
* @param obj - target variable
* @returns true if `obj` should be hydrated
*/
function shouldHydrate(obj) {
	return !isPlainObject$1(obj) || !obj.hasOwnProperty(skipHydrateSymbol);
}
var { assign } = Object;
function isComputed(o) {
	return !!(/* @__PURE__ */ isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia, hot) {
	const { state, actions, getters } = options;
	const initialState = pinia.state.value[id];
	let store;
	function setup() {
		if (!initialState && true) pinia.state.value[id] = state ? state() : {};
		return assign(/* @__PURE__ */ toRefs(pinia.state.value[id]), actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
			computedGetters[name] = markRaw(computed(() => {
				setActivePinia(pinia);
				const store = pinia._s.get(id);
				return getters[name].call(store, store);
			}));
			return computedGetters;
		}, {}));
	}
	store = createSetupStore(id, setup, options, pinia, hot, true);
	return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
	let scope;
	const optionsForPlugin = assign({ actions: {} }, options);
	const $subscribeOptions = { deep: true };
	let isListening;
	let isSyncListening;
	let subscriptions = [];
	let actionSubscriptions = [];
	let debuggerEvents;
	const initialState = pinia.state.value[$id];
	if (!isOptionsStore && !initialState && true) pinia.state.value[$id] = {};
	const hotState = /* @__PURE__ */ ref({});
	let activeListener;
	function $patch(partialStateOrMutator) {
		let subscriptionMutation;
		isListening = isSyncListening = false;
		if (typeof partialStateOrMutator === "function") {
			partialStateOrMutator(pinia.state.value[$id]);
			subscriptionMutation = {
				type: MutationType.patchFunction,
				storeId: $id,
				events: debuggerEvents
			};
		} else {
			mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
			subscriptionMutation = {
				type: MutationType.patchObject,
				payload: partialStateOrMutator,
				storeId: $id,
				events: debuggerEvents
			};
		}
		const myListenerId = activeListener = Symbol();
		nextTick().then(() => {
			if (activeListener === myListenerId) isListening = true;
		});
		isSyncListening = true;
		triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
	}
	const $reset = isOptionsStore ? function $reset() {
		const { state } = options;
		const newState = state ? state() : {};
		this.$patch(($state) => {
			assign($state, newState);
		});
	} : noop$2;
	function $dispose() {
		scope.stop();
		subscriptions = [];
		actionSubscriptions = [];
		pinia._s.delete($id);
	}
	/**
	* Helper that wraps function so it can be tracked with $onAction
	* @param fn - action to wrap
	* @param name - name of the action
	*/
	const action = (fn, name = "") => {
		if (ACTION_MARKER in fn) {
			fn[ACTION_NAME] = name;
			return fn;
		}
		const wrappedAction = function() {
			setActivePinia(pinia);
			const args = Array.from(arguments);
			const afterCallbackList = [];
			const onErrorCallbackList = [];
			function after(callback) {
				afterCallbackList.push(callback);
			}
			function onError(callback) {
				onErrorCallbackList.push(callback);
			}
			triggerSubscriptions(actionSubscriptions, {
				args,
				name: wrappedAction[ACTION_NAME],
				store,
				after,
				onError
			});
			let ret;
			try {
				ret = fn.apply(this && this.$id === $id ? this : store, args);
			} catch (error) {
				triggerSubscriptions(onErrorCallbackList, error);
				throw error;
			}
			if (ret instanceof Promise) return ret.then((value) => {
				triggerSubscriptions(afterCallbackList, value);
				return value;
			}).catch((error) => {
				triggerSubscriptions(onErrorCallbackList, error);
				return Promise.reject(error);
			});
			triggerSubscriptions(afterCallbackList, ret);
			return ret;
		};
		wrappedAction[ACTION_MARKER] = true;
		wrappedAction[ACTION_NAME] = name;
		return wrappedAction;
	};
	const _hmrPayload = /*#__PURE__*/ markRaw({
		actions: {},
		getters: {},
		state: [],
		hotState
	});
	const partialStore = {
		_p: pinia,
		$id,
		$onAction: addSubscription.bind(null, actionSubscriptions),
		$patch,
		$reset,
		$subscribe(callback, options = {}) {
			const removeSubscription = addSubscription(subscriptions, callback, options.detached, () => stopWatcher());
			const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state) => {
				if (options.flush === "sync" ? isSyncListening : isListening) callback({
					storeId: $id,
					type: MutationType.direct,
					events: debuggerEvents
				}, state);
			}, assign({}, $subscribeOptions, options)));
			return removeSubscription;
		},
		$dispose
	};
	const store = /* @__PURE__ */ reactive(typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && IS_CLIENT ? assign({
		_hmrPayload,
		_customProperties: markRaw(/* @__PURE__ */ new Set())
	}, partialStore) : partialStore);
	pinia._s.set($id, store);
	const setupStore = (pinia._a && pinia._a.runWithContext || fallbackRunWithContext)(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
	for (const key in setupStore) {
		const prop = setupStore[key];
		if (/* @__PURE__ */ isRef(prop) && !isComputed(prop) || /* @__PURE__ */ isReactive(prop)) {
			if (!isOptionsStore) {
				if (initialState && shouldHydrate(prop)) if (/* @__PURE__ */ isRef(prop)) prop.value = initialState[key];
				else mergeReactiveObjects(prop, initialState[key]);
				pinia.state.value[$id][key] = prop;
			}
		} else if (typeof prop === "function") {
			setupStore[key] = action(prop, key);
			optionsForPlugin.actions[key] = prop;
		}
	}
	assign(store, setupStore);
	assign(/* @__PURE__ */ toRaw(store), setupStore);
	Object.defineProperty(store, "$state", {
		get: () => pinia.state.value[$id],
		set: (state) => {
			$patch(($state) => {
				assign($state, state);
			});
		}
	});
	if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && IS_CLIENT) {
		const nonEnumerable = {
			writable: true,
			configurable: true,
			enumerable: false
		};
		[
			"_p",
			"_hmrPayload",
			"_getters",
			"_customProperties"
		].forEach((p) => {
			Object.defineProperty(store, p, assign({ value: store[p] }, nonEnumerable));
		});
	}
	pinia._p.forEach((extender) => {
		/* istanbul ignore else */
		if (typeof __VUE_PROD_DEVTOOLS__ !== "undefined" && __VUE_PROD_DEVTOOLS__ && IS_CLIENT) {
			const extensions = scope.run(() => extender({
				store,
				app: pinia._a,
				pinia,
				options: optionsForPlugin
			}));
			Object.keys(extensions || {}).forEach((key) => store._customProperties.add(key));
			assign(store, extensions);
		} else assign(store, scope.run(() => extender({
			store,
			app: pinia._a,
			pinia,
			options: optionsForPlugin
		})));
	});
	if (initialState && isOptionsStore && options.hydrate) options.hydrate(store.$state, initialState);
	isListening = true;
	isSyncListening = true;
	return store;
}
/*! #__NO_SIDE_EFFECTS__ */
function defineStore(idOrOptions, setup, setupOptions) {
	let id;
	let options;
	const isSetupStore = typeof setup === "function";
	if (typeof idOrOptions === "string") {
		id = idOrOptions;
		options = isSetupStore ? setupOptions : setup;
	} else {
		options = idOrOptions;
		id = idOrOptions.id;
	}
	function useStore(pinia, hot) {
		const hasContext = hasInjectionContext();
		pinia = pinia || (hasContext ? inject(piniaSymbol, null) : null);
		if (pinia) setActivePinia(pinia);
		pinia = activePinia;
		if (!pinia._s.has(id)) if (isSetupStore) createSetupStore(id, setup, options, pinia);
		else createOptionsStore(id, options, pinia);
		return pinia._s.get(id);
	}
	useStore.$id = id;
	return useStore;
}
//#endregion
//#region ../send/frontend/src/lib/clientConfig.ts
function isClientExecution() {
	try {
		return true;
	} catch (error) {
		throw new Error("This code is running on server, it should be executed only on client");
	}
}
isClientExecution();
isClientExecution();
var getEnvName = () => {
	isClientExecution();
	const base_url = "https://send.tb.pro";
	if (base_url.includes("send.tb.pro")) return "production";
	if (base_url.includes("send-stage.tb.pro")) return "staging";
	if (base_url.includes("localhost")) return "development";
};
//#endregion
//#region ../send/frontend/src/apps/send/stores/config-store.ts
var useConfigStore = defineStore("config", () => {
	const environmentName = getEnvName();
	const isProd = environmentName === "production";
	const isStaging = environmentName === "staging";
	const isDev = environmentName === "development";
	const isThunderbirdHost = computed(() => {
		return navigator.userAgent.includes("Thunderbird");
	});
	/**
	* Check if the URL is a moz-extension:// URL
	* This is the case for addons/extensions running inside Thunderbird
	*/
	const isExtension = computed(() => {
		return location.href.includes("moz-extension:");
	});
	/**
	* Checks if the name if the app is 'addon'
	* This is helpful to differentiate between the web app and the addon
	*/
	const isTbproExtension = computed(() => {
		return true;
	});
	const _serverUrl = /* @__PURE__ */ ref("https://send-backend.tb.pro");
	const _isPublicLogin = /* @__PURE__ */ ref(false);
	const serverUrl = computed(() => _serverUrl.value);
	const isPublicLogin = computed(() => _isPublicLogin.value);
	function setServerUrl(url) {
		_serverUrl.value = url;
	}
	function getAddonId() {
		const runtimeId = typeof browser !== "undefined" ? browser?.runtime?.id : void 0;
		if (runtimeId) return `ext-${runtimeId}`;
		if (serverUrl.value.includes("send-backend.tb.pro")) return "ext-tbpro-add-on@thunderbird.net";
		else return "ext-tbpro-addon-stage@thunderbird.net";
	}
	async function openManagementPage() {}
	return {
		isProd,
		isStaging,
		isDev,
		serverUrl,
		setServerUrl,
		isPublicLogin,
		isExtension,
		isTbproExtension,
		isThunderbirdHost,
		getAddonId,
		openManagementPage
	};
});
//#endregion
//#region ../send/frontend/src/apps/common/constants.ts
var BASE_URL = "https://send.tb.pro";
var APPOINTMENT_URL = `https://appointment${!BASE_URL.includes("send.tb.pro") ? "-stage" : ""}.tb.pro/`;
//#endregion
//#region ../send/frontend/src/lib/streams.ts
var DEFAULT_CHUNK_SIZE = 1024 * 64;
function readableToTransformController(controller, overrides) {
	return {
		enqueue: controller.enqueue.bind(controller),
		error: controller.error.bind(controller),
		terminate: () => {},
		desiredSize: controller.desiredSize,
		...overrides
	};
}
function transformStream(readable, transformer, oncancel) {
	try {
		return readable.pipeThrough(new TransformStream(transformer));
	} catch (e) {
		const reader = readable.getReader();
		return new ReadableStream({
			start(controller) {
				if (transformer.start) return transformer.start(readableToTransformController(controller));
			},
			async pull(controller) {
				let enqueued = false;
				while (!enqueued) {
					const data = await reader.read();
					if (data.done) {
						if (transformer.flush) await transformer.flush(readableToTransformController(controller));
						return controller.close();
					}
					await transformer.transform(data.value, readableToTransformController(controller, { enqueue(d) {
						enqueued = true;
						controller.enqueue(d);
					} }));
				}
			},
			cancel(reason) {
				readable.cancel(reason);
				if (oncancel) oncancel(reason);
			}
		});
	}
}
var BlobStreamController = class {
	constructor(blob, size) {
		this.blob = blob;
		this.index = 0;
		this.chunkSize = size || DEFAULT_CHUNK_SIZE;
	}
	pull(controller) {
		return new Promise((resolve, reject) => {
			const bytesLeft = this.blob.size - this.index;
			if (bytesLeft <= 0) {
				controller.close();
				return resolve();
			}
			const size = Math.min(this.chunkSize, bytesLeft);
			const slice = this.blob.slice(this.index, this.index + size);
			const reader = new FileReader();
			reader.onload = () => {
				if (reader.result instanceof ArrayBuffer) {
					controller.enqueue(new Uint8Array(reader.result));
					resolve();
				}
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(slice);
			this.index += size;
		});
	}
};
function blobStream(blob, size) {
	return new ReadableStream(new BlobStreamController(blob, size));
}
//#endregion
//#region ../../node_modules/.pnpm/base64-js@1.5.1/node_modules/base64-js/index.js
var require_base64_js = /* @__PURE__ */ __commonJSMin(((exports) => {
	exports.byteLength = byteLength;
	exports.toByteArray = toByteArray;
	exports.fromByteArray = fromByteArray;
	var lookup = [];
	var revLookup = [];
	var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
	var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	for (var i = 0, len = code.length; i < len; ++i) {
		lookup[i] = code[i];
		revLookup[code.charCodeAt(i)] = i;
	}
	revLookup["-".charCodeAt(0)] = 62;
	revLookup["_".charCodeAt(0)] = 63;
	function getLens(b64) {
		var len = b64.length;
		if (len % 4 > 0) throw new Error("Invalid string. Length must be a multiple of 4");
		var validLen = b64.indexOf("=");
		if (validLen === -1) validLen = len;
		var placeHoldersLen = validLen === len ? 0 : 4 - validLen % 4;
		return [validLen, placeHoldersLen];
	}
	function byteLength(b64) {
		var lens = getLens(b64);
		var validLen = lens[0];
		var placeHoldersLen = lens[1];
		return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
	}
	function _byteLength(b64, validLen, placeHoldersLen) {
		return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
	}
	function toByteArray(b64) {
		var tmp;
		var lens = getLens(b64);
		var validLen = lens[0];
		var placeHoldersLen = lens[1];
		var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
		var curByte = 0;
		var len = placeHoldersLen > 0 ? validLen - 4 : validLen;
		var i;
		for (i = 0; i < len; i += 4) {
			tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
			arr[curByte++] = tmp >> 16 & 255;
			arr[curByte++] = tmp >> 8 & 255;
			arr[curByte++] = tmp & 255;
		}
		if (placeHoldersLen === 2) {
			tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
			arr[curByte++] = tmp & 255;
		}
		if (placeHoldersLen === 1) {
			tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
			arr[curByte++] = tmp >> 8 & 255;
			arr[curByte++] = tmp & 255;
		}
		return arr;
	}
	function tripletToBase64(num) {
		return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
	}
	function encodeChunk(uint8, start, end) {
		var tmp;
		var output = [];
		for (var i = start; i < end; i += 3) {
			tmp = (uint8[i] << 16 & 16711680) + (uint8[i + 1] << 8 & 65280) + (uint8[i + 2] & 255);
			output.push(tripletToBase64(tmp));
		}
		return output.join("");
	}
	function fromByteArray(uint8) {
		var tmp;
		var len = uint8.length;
		var extraBytes = len % 3;
		var parts = [];
		var maxChunkLength = 16383;
		for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
		if (extraBytes === 1) {
			tmp = uint8[len - 1];
			parts.push(lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "==");
		} else if (extraBytes === 2) {
			tmp = (uint8[len - 2] << 8) + uint8[len - 1];
			parts.push(lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "=");
		}
		return parts.join("");
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/ieee754@1.2.1/node_modules/ieee754/index.js
var require_ieee754 = /* @__PURE__ */ __commonJSMin(((exports) => {
	/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
	exports.read = function(buffer, offset, isLE, mLen, nBytes) {
		var e, m;
		var eLen = nBytes * 8 - mLen - 1;
		var eMax = (1 << eLen) - 1;
		var eBias = eMax >> 1;
		var nBits = -7;
		var i = isLE ? nBytes - 1 : 0;
		var d = isLE ? -1 : 1;
		var s = buffer[offset + i];
		i += d;
		e = s & (1 << -nBits) - 1;
		s >>= -nBits;
		nBits += eLen;
		for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);
		m = e & (1 << -nBits) - 1;
		e >>= -nBits;
		nBits += mLen;
		for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);
		if (e === 0) e = 1 - eBias;
		else if (e === eMax) return m ? NaN : (s ? -1 : 1) * Infinity;
		else {
			m = m + Math.pow(2, mLen);
			e = e - eBias;
		}
		return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
	};
	exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
		var e, m, c;
		var eLen = nBytes * 8 - mLen - 1;
		var eMax = (1 << eLen) - 1;
		var eBias = eMax >> 1;
		var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
		var i = isLE ? 0 : nBytes - 1;
		var d = isLE ? 1 : -1;
		var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
		value = Math.abs(value);
		if (isNaN(value) || value === Infinity) {
			m = isNaN(value) ? 1 : 0;
			e = eMax;
		} else {
			e = Math.floor(Math.log(value) / Math.LN2);
			if (value * (c = Math.pow(2, -e)) < 1) {
				e--;
				c *= 2;
			}
			if (e + eBias >= 1) value += rt / c;
			else value += rt * Math.pow(2, 1 - eBias);
			if (value * c >= 2) {
				e++;
				c /= 2;
			}
			if (e + eBias >= eMax) {
				m = 0;
				e = eMax;
			} else if (e + eBias >= 1) {
				m = (value * c - 1) * Math.pow(2, mLen);
				e = e + eBias;
			} else {
				m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
				e = 0;
			}
		}
		for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8);
		e = e << mLen | m;
		eLen += mLen;
		for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8);
		buffer[offset + i - d] |= s * 128;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/buffer@6.0.3/node_modules/buffer/index.js
/*!
* The buffer module from node.js, for the browser.
*
* @author   Feross Aboukhadijeh <https://feross.org>
* @license  MIT
*/
var require_buffer = /* @__PURE__ */ __commonJSMin(((exports) => {
	var base64 = require_base64_js();
	var ieee754 = require_ieee754();
	var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
	exports.Buffer = Buffer;
	exports.SlowBuffer = SlowBuffer;
	exports.INSPECT_MAX_BYTES = 50;
	var K_MAX_LENGTH = 2147483647;
	exports.kMaxLength = K_MAX_LENGTH;
	/**
	* If `Buffer.TYPED_ARRAY_SUPPORT`:
	*   === true    Use Uint8Array implementation (fastest)
	*   === false   Print warning and recommend using `buffer` v4.x which has an Object
	*               implementation (most compatible, even IE6)
	*
	* Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
	* Opera 11.6+, iOS 4.2+.
	*
	* We report that the browser does not support typed arrays if the are not subclassable
	* using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
	* (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
	* for __proto__ and has a buggy typed array implementation.
	*/
	Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();
	if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.");
	function typedArraySupport() {
		try {
			const arr = new Uint8Array(1);
			const proto = { foo: function() {
				return 42;
			} };
			Object.setPrototypeOf(proto, Uint8Array.prototype);
			Object.setPrototypeOf(arr, proto);
			return arr.foo() === 42;
		} catch (e) {
			return false;
		}
	}
	Object.defineProperty(Buffer.prototype, "parent", {
		enumerable: true,
		get: function() {
			if (!Buffer.isBuffer(this)) return void 0;
			return this.buffer;
		}
	});
	Object.defineProperty(Buffer.prototype, "offset", {
		enumerable: true,
		get: function() {
			if (!Buffer.isBuffer(this)) return void 0;
			return this.byteOffset;
		}
	});
	function createBuffer(length) {
		if (length > K_MAX_LENGTH) throw new RangeError("The value \"" + length + "\" is invalid for option \"size\"");
		const buf = new Uint8Array(length);
		Object.setPrototypeOf(buf, Buffer.prototype);
		return buf;
	}
	/**
	* The Buffer constructor returns instances of `Uint8Array` that have their
	* prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
	* `Uint8Array`, so the returned instances will have all the node `Buffer` methods
	* and the `Uint8Array` methods. Square bracket notation works as expected -- it
	* returns a single octet.
	*
	* The `Uint8Array` prototype remains unmodified.
	*/
	function Buffer(arg, encodingOrOffset, length) {
		if (typeof arg === "number") {
			if (typeof encodingOrOffset === "string") throw new TypeError("The \"string\" argument must be of type string. Received type number");
			return allocUnsafe(arg);
		}
		return from(arg, encodingOrOffset, length);
	}
	Buffer.poolSize = 8192;
	function from(value, encodingOrOffset, length) {
		if (typeof value === "string") return fromString(value, encodingOrOffset);
		if (ArrayBuffer.isView(value)) return fromArrayView(value);
		if (value == null) throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value);
		if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) return fromArrayBuffer(value, encodingOrOffset, length);
		if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) return fromArrayBuffer(value, encodingOrOffset, length);
		if (typeof value === "number") throw new TypeError("The \"value\" argument must not be of type number. Received type number");
		const valueOf = value.valueOf && value.valueOf();
		if (valueOf != null && valueOf !== value) return Buffer.from(valueOf, encodingOrOffset, length);
		const b = fromObject(value);
		if (b) return b;
		if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") return Buffer.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
		throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value);
	}
	/**
	* Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
	* if value is a number.
	* Buffer.from(str[, encoding])
	* Buffer.from(array)
	* Buffer.from(buffer)
	* Buffer.from(arrayBuffer[, byteOffset[, length]])
	**/
	Buffer.from = function(value, encodingOrOffset, length) {
		return from(value, encodingOrOffset, length);
	};
	Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
	Object.setPrototypeOf(Buffer, Uint8Array);
	function assertSize(size) {
		if (typeof size !== "number") throw new TypeError("\"size\" argument must be of type number");
		else if (size < 0) throw new RangeError("The value \"" + size + "\" is invalid for option \"size\"");
	}
	function alloc(size, fill, encoding) {
		assertSize(size);
		if (size <= 0) return createBuffer(size);
		if (fill !== void 0) return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
		return createBuffer(size);
	}
	/**
	* Creates a new filled Buffer instance.
	* alloc(size[, fill[, encoding]])
	**/
	Buffer.alloc = function(size, fill, encoding) {
		return alloc(size, fill, encoding);
	};
	function allocUnsafe(size) {
		assertSize(size);
		return createBuffer(size < 0 ? 0 : checked(size) | 0);
	}
	/**
	* Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
	* */
	Buffer.allocUnsafe = function(size) {
		return allocUnsafe(size);
	};
	/**
	* Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
	*/
	Buffer.allocUnsafeSlow = function(size) {
		return allocUnsafe(size);
	};
	function fromString(string, encoding) {
		if (typeof encoding !== "string" || encoding === "") encoding = "utf8";
		if (!Buffer.isEncoding(encoding)) throw new TypeError("Unknown encoding: " + encoding);
		const length = byteLength(string, encoding) | 0;
		let buf = createBuffer(length);
		const actual = buf.write(string, encoding);
		if (actual !== length) buf = buf.slice(0, actual);
		return buf;
	}
	function fromArrayLike(array) {
		const length = array.length < 0 ? 0 : checked(array.length) | 0;
		const buf = createBuffer(length);
		for (let i = 0; i < length; i += 1) buf[i] = array[i] & 255;
		return buf;
	}
	function fromArrayView(arrayView) {
		if (isInstance(arrayView, Uint8Array)) {
			const copy = new Uint8Array(arrayView);
			return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
		}
		return fromArrayLike(arrayView);
	}
	function fromArrayBuffer(array, byteOffset, length) {
		if (byteOffset < 0 || array.byteLength < byteOffset) throw new RangeError("\"offset\" is outside of buffer bounds");
		if (array.byteLength < byteOffset + (length || 0)) throw new RangeError("\"length\" is outside of buffer bounds");
		let buf;
		if (byteOffset === void 0 && length === void 0) buf = new Uint8Array(array);
		else if (length === void 0) buf = new Uint8Array(array, byteOffset);
		else buf = new Uint8Array(array, byteOffset, length);
		Object.setPrototypeOf(buf, Buffer.prototype);
		return buf;
	}
	function fromObject(obj) {
		if (Buffer.isBuffer(obj)) {
			const len = checked(obj.length) | 0;
			const buf = createBuffer(len);
			if (buf.length === 0) return buf;
			obj.copy(buf, 0, 0, len);
			return buf;
		}
		if (obj.length !== void 0) {
			if (typeof obj.length !== "number" || numberIsNaN(obj.length)) return createBuffer(0);
			return fromArrayLike(obj);
		}
		if (obj.type === "Buffer" && Array.isArray(obj.data)) return fromArrayLike(obj.data);
	}
	function checked(length) {
		if (length >= K_MAX_LENGTH) throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
		return length | 0;
	}
	function SlowBuffer(length) {
		if (+length != length) length = 0;
		return Buffer.alloc(+length);
	}
	Buffer.isBuffer = function isBuffer(b) {
		return b != null && b._isBuffer === true && b !== Buffer.prototype;
	};
	Buffer.compare = function compare(a, b) {
		if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength);
		if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength);
		if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) throw new TypeError("The \"buf1\", \"buf2\" arguments must be one of type Buffer or Uint8Array");
		if (a === b) return 0;
		let x = a.length;
		let y = b.length;
		for (let i = 0, len = Math.min(x, y); i < len; ++i) if (a[i] !== b[i]) {
			x = a[i];
			y = b[i];
			break;
		}
		if (x < y) return -1;
		if (y < x) return 1;
		return 0;
	};
	Buffer.isEncoding = function isEncoding(encoding) {
		switch (String(encoding).toLowerCase()) {
			case "hex":
			case "utf8":
			case "utf-8":
			case "ascii":
			case "latin1":
			case "binary":
			case "base64":
			case "ucs2":
			case "ucs-2":
			case "utf16le":
			case "utf-16le": return true;
			default: return false;
		}
	};
	Buffer.concat = function concat(list, length) {
		if (!Array.isArray(list)) throw new TypeError("\"list\" argument must be an Array of Buffers");
		if (list.length === 0) return Buffer.alloc(0);
		let i;
		if (length === void 0) {
			length = 0;
			for (i = 0; i < list.length; ++i) length += list[i].length;
		}
		const buffer = Buffer.allocUnsafe(length);
		let pos = 0;
		for (i = 0; i < list.length; ++i) {
			let buf = list[i];
			if (isInstance(buf, Uint8Array)) if (pos + buf.length > buffer.length) {
				if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
				buf.copy(buffer, pos);
			} else Uint8Array.prototype.set.call(buffer, buf, pos);
			else if (!Buffer.isBuffer(buf)) throw new TypeError("\"list\" argument must be an Array of Buffers");
			else buf.copy(buffer, pos);
			pos += buf.length;
		}
		return buffer;
	};
	function byteLength(string, encoding) {
		if (Buffer.isBuffer(string)) return string.length;
		if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) return string.byteLength;
		if (typeof string !== "string") throw new TypeError("The \"string\" argument must be one of type string, Buffer, or ArrayBuffer. Received type " + typeof string);
		const len = string.length;
		const mustMatch = arguments.length > 2 && arguments[2] === true;
		if (!mustMatch && len === 0) return 0;
		let loweredCase = false;
		for (;;) switch (encoding) {
			case "ascii":
			case "latin1":
			case "binary": return len;
			case "utf8":
			case "utf-8": return utf8ToBytes(string).length;
			case "ucs2":
			case "ucs-2":
			case "utf16le":
			case "utf-16le": return len * 2;
			case "hex": return len >>> 1;
			case "base64": return base64ToBytes(string).length;
			default:
				if (loweredCase) return mustMatch ? -1 : utf8ToBytes(string).length;
				encoding = ("" + encoding).toLowerCase();
				loweredCase = true;
		}
	}
	Buffer.byteLength = byteLength;
	function slowToString(encoding, start, end) {
		let loweredCase = false;
		if (start === void 0 || start < 0) start = 0;
		if (start > this.length) return "";
		if (end === void 0 || end > this.length) end = this.length;
		if (end <= 0) return "";
		end >>>= 0;
		start >>>= 0;
		if (end <= start) return "";
		if (!encoding) encoding = "utf8";
		while (true) switch (encoding) {
			case "hex": return hexSlice(this, start, end);
			case "utf8":
			case "utf-8": return utf8Slice(this, start, end);
			case "ascii": return asciiSlice(this, start, end);
			case "latin1":
			case "binary": return latin1Slice(this, start, end);
			case "base64": return base64Slice(this, start, end);
			case "ucs2":
			case "ucs-2":
			case "utf16le":
			case "utf-16le": return utf16leSlice(this, start, end);
			default:
				if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
				encoding = (encoding + "").toLowerCase();
				loweredCase = true;
		}
	}
	Buffer.prototype._isBuffer = true;
	function swap(b, n, m) {
		const i = b[n];
		b[n] = b[m];
		b[m] = i;
	}
	Buffer.prototype.swap16 = function swap16() {
		const len = this.length;
		if (len % 2 !== 0) throw new RangeError("Buffer size must be a multiple of 16-bits");
		for (let i = 0; i < len; i += 2) swap(this, i, i + 1);
		return this;
	};
	Buffer.prototype.swap32 = function swap32() {
		const len = this.length;
		if (len % 4 !== 0) throw new RangeError("Buffer size must be a multiple of 32-bits");
		for (let i = 0; i < len; i += 4) {
			swap(this, i, i + 3);
			swap(this, i + 1, i + 2);
		}
		return this;
	};
	Buffer.prototype.swap64 = function swap64() {
		const len = this.length;
		if (len % 8 !== 0) throw new RangeError("Buffer size must be a multiple of 64-bits");
		for (let i = 0; i < len; i += 8) {
			swap(this, i, i + 7);
			swap(this, i + 1, i + 6);
			swap(this, i + 2, i + 5);
			swap(this, i + 3, i + 4);
		}
		return this;
	};
	Buffer.prototype.toString = function toString() {
		const length = this.length;
		if (length === 0) return "";
		if (arguments.length === 0) return utf8Slice(this, 0, length);
		return slowToString.apply(this, arguments);
	};
	Buffer.prototype.toLocaleString = Buffer.prototype.toString;
	Buffer.prototype.equals = function equals(b) {
		if (!Buffer.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
		if (this === b) return true;
		return Buffer.compare(this, b) === 0;
	};
	Buffer.prototype.inspect = function inspect() {
		let str = "";
		const max = exports.INSPECT_MAX_BYTES;
		str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
		if (this.length > max) str += " ... ";
		return "<Buffer " + str + ">";
	};
	if (customInspectSymbol) Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect;
	Buffer.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
		if (isInstance(target, Uint8Array)) target = Buffer.from(target, target.offset, target.byteLength);
		if (!Buffer.isBuffer(target)) throw new TypeError("The \"target\" argument must be one of type Buffer or Uint8Array. Received type " + typeof target);
		if (start === void 0) start = 0;
		if (end === void 0) end = target ? target.length : 0;
		if (thisStart === void 0) thisStart = 0;
		if (thisEnd === void 0) thisEnd = this.length;
		if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) throw new RangeError("out of range index");
		if (thisStart >= thisEnd && start >= end) return 0;
		if (thisStart >= thisEnd) return -1;
		if (start >= end) return 1;
		start >>>= 0;
		end >>>= 0;
		thisStart >>>= 0;
		thisEnd >>>= 0;
		if (this === target) return 0;
		let x = thisEnd - thisStart;
		let y = end - start;
		const len = Math.min(x, y);
		const thisCopy = this.slice(thisStart, thisEnd);
		const targetCopy = target.slice(start, end);
		for (let i = 0; i < len; ++i) if (thisCopy[i] !== targetCopy[i]) {
			x = thisCopy[i];
			y = targetCopy[i];
			break;
		}
		if (x < y) return -1;
		if (y < x) return 1;
		return 0;
	};
	function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
		if (buffer.length === 0) return -1;
		if (typeof byteOffset === "string") {
			encoding = byteOffset;
			byteOffset = 0;
		} else if (byteOffset > 2147483647) byteOffset = 2147483647;
		else if (byteOffset < -2147483648) byteOffset = -2147483648;
		byteOffset = +byteOffset;
		if (numberIsNaN(byteOffset)) byteOffset = dir ? 0 : buffer.length - 1;
		if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
		if (byteOffset >= buffer.length) if (dir) return -1;
		else byteOffset = buffer.length - 1;
		else if (byteOffset < 0) if (dir) byteOffset = 0;
		else return -1;
		if (typeof val === "string") val = Buffer.from(val, encoding);
		if (Buffer.isBuffer(val)) {
			if (val.length === 0) return -1;
			return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
		} else if (typeof val === "number") {
			val = val & 255;
			if (typeof Uint8Array.prototype.indexOf === "function") if (dir) return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
			else return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
			return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
		}
		throw new TypeError("val must be string, number or Buffer");
	}
	function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
		let indexSize = 1;
		let arrLength = arr.length;
		let valLength = val.length;
		if (encoding !== void 0) {
			encoding = String(encoding).toLowerCase();
			if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
				if (arr.length < 2 || val.length < 2) return -1;
				indexSize = 2;
				arrLength /= 2;
				valLength /= 2;
				byteOffset /= 2;
			}
		}
		function read(buf, i) {
			if (indexSize === 1) return buf[i];
			else return buf.readUInt16BE(i * indexSize);
		}
		let i;
		if (dir) {
			let foundIndex = -1;
			for (i = byteOffset; i < arrLength; i++) if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
				if (foundIndex === -1) foundIndex = i;
				if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
			} else {
				if (foundIndex !== -1) i -= i - foundIndex;
				foundIndex = -1;
			}
		} else {
			if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
			for (i = byteOffset; i >= 0; i--) {
				let found = true;
				for (let j = 0; j < valLength; j++) if (read(arr, i + j) !== read(val, j)) {
					found = false;
					break;
				}
				if (found) return i;
			}
		}
		return -1;
	}
	Buffer.prototype.includes = function includes(val, byteOffset, encoding) {
		return this.indexOf(val, byteOffset, encoding) !== -1;
	};
	Buffer.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
		return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
	};
	Buffer.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
		return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
	};
	function hexWrite(buf, string, offset, length) {
		offset = Number(offset) || 0;
		const remaining = buf.length - offset;
		if (!length) length = remaining;
		else {
			length = Number(length);
			if (length > remaining) length = remaining;
		}
		const strLen = string.length;
		if (length > strLen / 2) length = strLen / 2;
		let i;
		for (i = 0; i < length; ++i) {
			const parsed = parseInt(string.substr(i * 2, 2), 16);
			if (numberIsNaN(parsed)) return i;
			buf[offset + i] = parsed;
		}
		return i;
	}
	function utf8Write(buf, string, offset, length) {
		return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
	}
	function asciiWrite(buf, string, offset, length) {
		return blitBuffer(asciiToBytes(string), buf, offset, length);
	}
	function base64Write(buf, string, offset, length) {
		return blitBuffer(base64ToBytes(string), buf, offset, length);
	}
	function ucs2Write(buf, string, offset, length) {
		return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
	}
	Buffer.prototype.write = function write(string, offset, length, encoding) {
		if (offset === void 0) {
			encoding = "utf8";
			length = this.length;
			offset = 0;
		} else if (length === void 0 && typeof offset === "string") {
			encoding = offset;
			length = this.length;
			offset = 0;
		} else if (isFinite(offset)) {
			offset = offset >>> 0;
			if (isFinite(length)) {
				length = length >>> 0;
				if (encoding === void 0) encoding = "utf8";
			} else {
				encoding = length;
				length = void 0;
			}
		} else throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");
		const remaining = this.length - offset;
		if (length === void 0 || length > remaining) length = remaining;
		if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) throw new RangeError("Attempt to write outside buffer bounds");
		if (!encoding) encoding = "utf8";
		let loweredCase = false;
		for (;;) switch (encoding) {
			case "hex": return hexWrite(this, string, offset, length);
			case "utf8":
			case "utf-8": return utf8Write(this, string, offset, length);
			case "ascii":
			case "latin1":
			case "binary": return asciiWrite(this, string, offset, length);
			case "base64": return base64Write(this, string, offset, length);
			case "ucs2":
			case "ucs-2":
			case "utf16le":
			case "utf-16le": return ucs2Write(this, string, offset, length);
			default:
				if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
				encoding = ("" + encoding).toLowerCase();
				loweredCase = true;
		}
	};
	Buffer.prototype.toJSON = function toJSON() {
		return {
			type: "Buffer",
			data: Array.prototype.slice.call(this._arr || this, 0)
		};
	};
	function base64Slice(buf, start, end) {
		if (start === 0 && end === buf.length) return base64.fromByteArray(buf);
		else return base64.fromByteArray(buf.slice(start, end));
	}
	function utf8Slice(buf, start, end) {
		end = Math.min(buf.length, end);
		const res = [];
		let i = start;
		while (i < end) {
			const firstByte = buf[i];
			let codePoint = null;
			let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
			if (i + bytesPerSequence <= end) {
				let secondByte, thirdByte, fourthByte, tempCodePoint;
				switch (bytesPerSequence) {
					case 1:
						if (firstByte < 128) codePoint = firstByte;
						break;
					case 2:
						secondByte = buf[i + 1];
						if ((secondByte & 192) === 128) {
							tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
							if (tempCodePoint > 127) codePoint = tempCodePoint;
						}
						break;
					case 3:
						secondByte = buf[i + 1];
						thirdByte = buf[i + 2];
						if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
							tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
							if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) codePoint = tempCodePoint;
						}
						break;
					case 4:
						secondByte = buf[i + 1];
						thirdByte = buf[i + 2];
						fourthByte = buf[i + 3];
						if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
							tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
							if (tempCodePoint > 65535 && tempCodePoint < 1114112) codePoint = tempCodePoint;
						}
				}
			}
			if (codePoint === null) {
				codePoint = 65533;
				bytesPerSequence = 1;
			} else if (codePoint > 65535) {
				codePoint -= 65536;
				res.push(codePoint >>> 10 & 1023 | 55296);
				codePoint = 56320 | codePoint & 1023;
			}
			res.push(codePoint);
			i += bytesPerSequence;
		}
		return decodeCodePointsArray(res);
	}
	var MAX_ARGUMENTS_LENGTH = 4096;
	function decodeCodePointsArray(codePoints) {
		const len = codePoints.length;
		if (len <= MAX_ARGUMENTS_LENGTH) return String.fromCharCode.apply(String, codePoints);
		let res = "";
		let i = 0;
		while (i < len) res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH));
		return res;
	}
	function asciiSlice(buf, start, end) {
		let ret = "";
		end = Math.min(buf.length, end);
		for (let i = start; i < end; ++i) ret += String.fromCharCode(buf[i] & 127);
		return ret;
	}
	function latin1Slice(buf, start, end) {
		let ret = "";
		end = Math.min(buf.length, end);
		for (let i = start; i < end; ++i) ret += String.fromCharCode(buf[i]);
		return ret;
	}
	function hexSlice(buf, start, end) {
		const len = buf.length;
		if (!start || start < 0) start = 0;
		if (!end || end < 0 || end > len) end = len;
		let out = "";
		for (let i = start; i < end; ++i) out += hexSliceLookupTable[buf[i]];
		return out;
	}
	function utf16leSlice(buf, start, end) {
		const bytes = buf.slice(start, end);
		let res = "";
		for (let i = 0; i < bytes.length - 1; i += 2) res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
		return res;
	}
	Buffer.prototype.slice = function slice(start, end) {
		const len = this.length;
		start = ~~start;
		end = end === void 0 ? len : ~~end;
		if (start < 0) {
			start += len;
			if (start < 0) start = 0;
		} else if (start > len) start = len;
		if (end < 0) {
			end += len;
			if (end < 0) end = 0;
		} else if (end > len) end = len;
		if (end < start) end = start;
		const newBuf = this.subarray(start, end);
		Object.setPrototypeOf(newBuf, Buffer.prototype);
		return newBuf;
	};
	function checkOffset(offset, ext, length) {
		if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
		if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
	}
	Buffer.prototype.readUintLE = Buffer.prototype.readUIntLE = function readUIntLE(offset, byteLength, noAssert) {
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) checkOffset(offset, byteLength, this.length);
		let val = this[offset];
		let mul = 1;
		let i = 0;
		while (++i < byteLength && (mul *= 256)) val += this[offset + i] * mul;
		return val;
	};
	Buffer.prototype.readUintBE = Buffer.prototype.readUIntBE = function readUIntBE(offset, byteLength, noAssert) {
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) checkOffset(offset, byteLength, this.length);
		let val = this[offset + --byteLength];
		let mul = 1;
		while (byteLength > 0 && (mul *= 256)) val += this[offset + --byteLength] * mul;
		return val;
	};
	Buffer.prototype.readUint8 = Buffer.prototype.readUInt8 = function readUInt8(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 1, this.length);
		return this[offset];
	};
	Buffer.prototype.readUint16LE = Buffer.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 2, this.length);
		return this[offset] | this[offset + 1] << 8;
	};
	Buffer.prototype.readUint16BE = Buffer.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 2, this.length);
		return this[offset] << 8 | this[offset + 1];
	};
	Buffer.prototype.readUint32LE = Buffer.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
	};
	Buffer.prototype.readUint32BE = Buffer.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
	};
	Buffer.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
		offset = offset >>> 0;
		validateNumber(offset, "offset");
		const first = this[offset];
		const last = this[offset + 7];
		if (first === void 0 || last === void 0) boundsError(offset, this.length - 8);
		const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
		const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
		return BigInt(lo) + (BigInt(hi) << BigInt(32));
	});
	Buffer.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
		offset = offset >>> 0;
		validateNumber(offset, "offset");
		const first = this[offset];
		const last = this[offset + 7];
		if (first === void 0 || last === void 0) boundsError(offset, this.length - 8);
		const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
		const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
		return (BigInt(hi) << BigInt(32)) + BigInt(lo);
	});
	Buffer.prototype.readIntLE = function readIntLE(offset, byteLength, noAssert) {
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) checkOffset(offset, byteLength, this.length);
		let val = this[offset];
		let mul = 1;
		let i = 0;
		while (++i < byteLength && (mul *= 256)) val += this[offset + i] * mul;
		mul *= 128;
		if (val >= mul) val -= Math.pow(2, 8 * byteLength);
		return val;
	};
	Buffer.prototype.readIntBE = function readIntBE(offset, byteLength, noAssert) {
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) checkOffset(offset, byteLength, this.length);
		let i = byteLength;
		let mul = 1;
		let val = this[offset + --i];
		while (i > 0 && (mul *= 256)) val += this[offset + --i] * mul;
		mul *= 128;
		if (val >= mul) val -= Math.pow(2, 8 * byteLength);
		return val;
	};
	Buffer.prototype.readInt8 = function readInt8(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 1, this.length);
		if (!(this[offset] & 128)) return this[offset];
		return (255 - this[offset] + 1) * -1;
	};
	Buffer.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 2, this.length);
		const val = this[offset] | this[offset + 1] << 8;
		return val & 32768 ? val | 4294901760 : val;
	};
	Buffer.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 2, this.length);
		const val = this[offset + 1] | this[offset] << 8;
		return val & 32768 ? val | 4294901760 : val;
	};
	Buffer.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
	};
	Buffer.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
	};
	Buffer.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
		offset = offset >>> 0;
		validateNumber(offset, "offset");
		const first = this[offset];
		const last = this[offset + 7];
		if (first === void 0 || last === void 0) boundsError(offset, this.length - 8);
		const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
		return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
	});
	Buffer.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
		offset = offset >>> 0;
		validateNumber(offset, "offset");
		const first = this[offset];
		const last = this[offset + 7];
		if (first === void 0 || last === void 0) boundsError(offset, this.length - 8);
		const val = (first << 24) + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
		return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
	});
	Buffer.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return ieee754.read(this, offset, true, 23, 4);
	};
	Buffer.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 4, this.length);
		return ieee754.read(this, offset, false, 23, 4);
	};
	Buffer.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 8, this.length);
		return ieee754.read(this, offset, true, 52, 8);
	};
	Buffer.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
		offset = offset >>> 0;
		if (!noAssert) checkOffset(offset, 8, this.length);
		return ieee754.read(this, offset, false, 52, 8);
	};
	function checkInt(buf, value, offset, ext, max, min) {
		if (!Buffer.isBuffer(buf)) throw new TypeError("\"buffer\" argument must be a Buffer instance");
		if (value > max || value < min) throw new RangeError("\"value\" argument is out of bounds");
		if (offset + ext > buf.length) throw new RangeError("Index out of range");
	}
	Buffer.prototype.writeUintLE = Buffer.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength, noAssert) {
		value = +value;
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) {
			const maxBytes = Math.pow(2, 8 * byteLength) - 1;
			checkInt(this, value, offset, byteLength, maxBytes, 0);
		}
		let mul = 1;
		let i = 0;
		this[offset] = value & 255;
		while (++i < byteLength && (mul *= 256)) this[offset + i] = value / mul & 255;
		return offset + byteLength;
	};
	Buffer.prototype.writeUintBE = Buffer.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength, noAssert) {
		value = +value;
		offset = offset >>> 0;
		byteLength = byteLength >>> 0;
		if (!noAssert) {
			const maxBytes = Math.pow(2, 8 * byteLength) - 1;
			checkInt(this, value, offset, byteLength, maxBytes, 0);
		}
		let i = byteLength - 1;
		let mul = 1;
		this[offset + i] = value & 255;
		while (--i >= 0 && (mul *= 256)) this[offset + i] = value / mul & 255;
		return offset + byteLength;
	};
	Buffer.prototype.writeUint8 = Buffer.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
		this[offset] = value & 255;
		return offset + 1;
	};
	Buffer.prototype.writeUint16LE = Buffer.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
		this[offset] = value & 255;
		this[offset + 1] = value >>> 8;
		return offset + 2;
	};
	Buffer.prototype.writeUint16BE = Buffer.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
		this[offset] = value >>> 8;
		this[offset + 1] = value & 255;
		return offset + 2;
	};
	Buffer.prototype.writeUint32LE = Buffer.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
		this[offset + 3] = value >>> 24;
		this[offset + 2] = value >>> 16;
		this[offset + 1] = value >>> 8;
		this[offset] = value & 255;
		return offset + 4;
	};
	Buffer.prototype.writeUint32BE = Buffer.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
		this[offset] = value >>> 24;
		this[offset + 1] = value >>> 16;
		this[offset + 2] = value >>> 8;
		this[offset + 3] = value & 255;
		return offset + 4;
	};
	function wrtBigUInt64LE(buf, value, offset, min, max) {
		checkIntBI(value, min, max, buf, offset, 7);
		let lo = Number(value & BigInt(4294967295));
		buf[offset++] = lo;
		lo = lo >> 8;
		buf[offset++] = lo;
		lo = lo >> 8;
		buf[offset++] = lo;
		lo = lo >> 8;
		buf[offset++] = lo;
		let hi = Number(value >> BigInt(32) & BigInt(4294967295));
		buf[offset++] = hi;
		hi = hi >> 8;
		buf[offset++] = hi;
		hi = hi >> 8;
		buf[offset++] = hi;
		hi = hi >> 8;
		buf[offset++] = hi;
		return offset;
	}
	function wrtBigUInt64BE(buf, value, offset, min, max) {
		checkIntBI(value, min, max, buf, offset, 7);
		let lo = Number(value & BigInt(4294967295));
		buf[offset + 7] = lo;
		lo = lo >> 8;
		buf[offset + 6] = lo;
		lo = lo >> 8;
		buf[offset + 5] = lo;
		lo = lo >> 8;
		buf[offset + 4] = lo;
		let hi = Number(value >> BigInt(32) & BigInt(4294967295));
		buf[offset + 3] = hi;
		hi = hi >> 8;
		buf[offset + 2] = hi;
		hi = hi >> 8;
		buf[offset + 1] = hi;
		hi = hi >> 8;
		buf[offset] = hi;
		return offset + 8;
	}
	Buffer.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
		return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
	});
	Buffer.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
		return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
	});
	Buffer.prototype.writeIntLE = function writeIntLE(value, offset, byteLength, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) {
			const limit = Math.pow(2, 8 * byteLength - 1);
			checkInt(this, value, offset, byteLength, limit - 1, -limit);
		}
		let i = 0;
		let mul = 1;
		let sub = 0;
		this[offset] = value & 255;
		while (++i < byteLength && (mul *= 256)) {
			if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) sub = 1;
			this[offset + i] = (value / mul >> 0) - sub & 255;
		}
		return offset + byteLength;
	};
	Buffer.prototype.writeIntBE = function writeIntBE(value, offset, byteLength, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) {
			const limit = Math.pow(2, 8 * byteLength - 1);
			checkInt(this, value, offset, byteLength, limit - 1, -limit);
		}
		let i = byteLength - 1;
		let mul = 1;
		let sub = 0;
		this[offset + i] = value & 255;
		while (--i >= 0 && (mul *= 256)) {
			if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) sub = 1;
			this[offset + i] = (value / mul >> 0) - sub & 255;
		}
		return offset + byteLength;
	};
	Buffer.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
		if (value < 0) value = 255 + value + 1;
		this[offset] = value & 255;
		return offset + 1;
	};
	Buffer.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
		this[offset] = value & 255;
		this[offset + 1] = value >>> 8;
		return offset + 2;
	};
	Buffer.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
		this[offset] = value >>> 8;
		this[offset + 1] = value & 255;
		return offset + 2;
	};
	Buffer.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
		this[offset] = value & 255;
		this[offset + 1] = value >>> 8;
		this[offset + 2] = value >>> 16;
		this[offset + 3] = value >>> 24;
		return offset + 4;
	};
	Buffer.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
		if (value < 0) value = 4294967295 + value + 1;
		this[offset] = value >>> 24;
		this[offset + 1] = value >>> 16;
		this[offset + 2] = value >>> 8;
		this[offset + 3] = value & 255;
		return offset + 4;
	};
	Buffer.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
		return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
	});
	Buffer.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
		return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
	});
	function checkIEEE754(buf, value, offset, ext, max, min) {
		if (offset + ext > buf.length) throw new RangeError("Index out of range");
		if (offset < 0) throw new RangeError("Index out of range");
	}
	function writeFloat(buf, value, offset, littleEndian, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
		ieee754.write(buf, value, offset, littleEndian, 23, 4);
		return offset + 4;
	}
	Buffer.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
		return writeFloat(this, value, offset, true, noAssert);
	};
	Buffer.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
		return writeFloat(this, value, offset, false, noAssert);
	};
	function writeDouble(buf, value, offset, littleEndian, noAssert) {
		value = +value;
		offset = offset >>> 0;
		if (!noAssert) checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
		ieee754.write(buf, value, offset, littleEndian, 52, 8);
		return offset + 8;
	}
	Buffer.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
		return writeDouble(this, value, offset, true, noAssert);
	};
	Buffer.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
		return writeDouble(this, value, offset, false, noAssert);
	};
	Buffer.prototype.copy = function copy(target, targetStart, start, end) {
		if (!Buffer.isBuffer(target)) throw new TypeError("argument should be a Buffer");
		if (!start) start = 0;
		if (!end && end !== 0) end = this.length;
		if (targetStart >= target.length) targetStart = target.length;
		if (!targetStart) targetStart = 0;
		if (end > 0 && end < start) end = start;
		if (end === start) return 0;
		if (target.length === 0 || this.length === 0) return 0;
		if (targetStart < 0) throw new RangeError("targetStart out of bounds");
		if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
		if (end < 0) throw new RangeError("sourceEnd out of bounds");
		if (end > this.length) end = this.length;
		if (target.length - targetStart < end - start) end = target.length - targetStart + start;
		const len = end - start;
		if (this === target && typeof Uint8Array.prototype.copyWithin === "function") this.copyWithin(targetStart, start, end);
		else Uint8Array.prototype.set.call(target, this.subarray(start, end), targetStart);
		return len;
	};
	Buffer.prototype.fill = function fill(val, start, end, encoding) {
		if (typeof val === "string") {
			if (typeof start === "string") {
				encoding = start;
				start = 0;
				end = this.length;
			} else if (typeof end === "string") {
				encoding = end;
				end = this.length;
			}
			if (encoding !== void 0 && typeof encoding !== "string") throw new TypeError("encoding must be a string");
			if (typeof encoding === "string" && !Buffer.isEncoding(encoding)) throw new TypeError("Unknown encoding: " + encoding);
			if (val.length === 1) {
				const code = val.charCodeAt(0);
				if (encoding === "utf8" && code < 128 || encoding === "latin1") val = code;
			}
		} else if (typeof val === "number") val = val & 255;
		else if (typeof val === "boolean") val = Number(val);
		if (start < 0 || this.length < start || this.length < end) throw new RangeError("Out of range index");
		if (end <= start) return this;
		start = start >>> 0;
		end = end === void 0 ? this.length : end >>> 0;
		if (!val) val = 0;
		let i;
		if (typeof val === "number") for (i = start; i < end; ++i) this[i] = val;
		else {
			const bytes = Buffer.isBuffer(val) ? val : Buffer.from(val, encoding);
			const len = bytes.length;
			if (len === 0) throw new TypeError("The value \"" + val + "\" is invalid for argument \"value\"");
			for (i = 0; i < end - start; ++i) this[i + start] = bytes[i % len];
		}
		return this;
	};
	var errors = {};
	function E(sym, getMessage, Base) {
		errors[sym] = class NodeError extends Base {
			constructor() {
				super();
				Object.defineProperty(this, "message", {
					value: getMessage.apply(this, arguments),
					writable: true,
					configurable: true
				});
				this.name = `${this.name} [${sym}]`;
				this.stack;
				delete this.name;
			}
			get code() {
				return sym;
			}
			set code(value) {
				Object.defineProperty(this, "code", {
					configurable: true,
					enumerable: true,
					value,
					writable: true
				});
			}
			toString() {
				return `${this.name} [${sym}]: ${this.message}`;
			}
		};
	}
	E("ERR_BUFFER_OUT_OF_BOUNDS", function(name) {
		if (name) return `${name} is outside of buffer bounds`;
		return "Attempt to access memory outside buffer bounds";
	}, RangeError);
	E("ERR_INVALID_ARG_TYPE", function(name, actual) {
		return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
	}, TypeError);
	E("ERR_OUT_OF_RANGE", function(str, range, input) {
		let msg = `The value of "${str}" is out of range.`;
		let received = input;
		if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) received = addNumericalSeparator(String(input));
		else if (typeof input === "bigint") {
			received = String(input);
			if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) received = addNumericalSeparator(received);
			received += "n";
		}
		msg += ` It must be ${range}. Received ${received}`;
		return msg;
	}, RangeError);
	function addNumericalSeparator(val) {
		let res = "";
		let i = val.length;
		const start = val[0] === "-" ? 1 : 0;
		for (; i >= start + 4; i -= 3) res = `_${val.slice(i - 3, i)}${res}`;
		return `${val.slice(0, i)}${res}`;
	}
	function checkBounds(buf, offset, byteLength) {
		validateNumber(offset, "offset");
		if (buf[offset] === void 0 || buf[offset + byteLength] === void 0) boundsError(offset, buf.length - (byteLength + 1));
	}
	function checkIntBI(value, min, max, buf, offset, byteLength) {
		if (value > max || value < min) {
			const n = typeof min === "bigint" ? "n" : "";
			let range;
			if (byteLength > 3) if (min === 0 || min === BigInt(0)) range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
			else range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength + 1) * 8 - 1}${n}`;
			else range = `>= ${min}${n} and <= ${max}${n}`;
			throw new errors.ERR_OUT_OF_RANGE("value", range, value);
		}
		checkBounds(buf, offset, byteLength);
	}
	function validateNumber(value, name) {
		if (typeof value !== "number") throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
	}
	function boundsError(value, length, type) {
		if (Math.floor(value) !== value) {
			validateNumber(value, type);
			throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
		}
		if (length < 0) throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
		throw new errors.ERR_OUT_OF_RANGE(type || "offset", `>= ${type ? 1 : 0} and <= ${length}`, value);
	}
	var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
	function base64clean(str) {
		str = str.split("=")[0];
		str = str.trim().replace(INVALID_BASE64_RE, "");
		if (str.length < 2) return "";
		while (str.length % 4 !== 0) str = str + "=";
		return str;
	}
	function utf8ToBytes(string, units) {
		units = units || Infinity;
		let codePoint;
		const length = string.length;
		let leadSurrogate = null;
		const bytes = [];
		for (let i = 0; i < length; ++i) {
			codePoint = string.charCodeAt(i);
			if (codePoint > 55295 && codePoint < 57344) {
				if (!leadSurrogate) {
					if (codePoint > 56319) {
						if ((units -= 3) > -1) bytes.push(239, 191, 189);
						continue;
					} else if (i + 1 === length) {
						if ((units -= 3) > -1) bytes.push(239, 191, 189);
						continue;
					}
					leadSurrogate = codePoint;
					continue;
				}
				if (codePoint < 56320) {
					if ((units -= 3) > -1) bytes.push(239, 191, 189);
					leadSurrogate = codePoint;
					continue;
				}
				codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
			} else if (leadSurrogate) {
				if ((units -= 3) > -1) bytes.push(239, 191, 189);
			}
			leadSurrogate = null;
			if (codePoint < 128) {
				if ((units -= 1) < 0) break;
				bytes.push(codePoint);
			} else if (codePoint < 2048) {
				if ((units -= 2) < 0) break;
				bytes.push(codePoint >> 6 | 192, codePoint & 63 | 128);
			} else if (codePoint < 65536) {
				if ((units -= 3) < 0) break;
				bytes.push(codePoint >> 12 | 224, codePoint >> 6 & 63 | 128, codePoint & 63 | 128);
			} else if (codePoint < 1114112) {
				if ((units -= 4) < 0) break;
				bytes.push(codePoint >> 18 | 240, codePoint >> 12 & 63 | 128, codePoint >> 6 & 63 | 128, codePoint & 63 | 128);
			} else throw new Error("Invalid code point");
		}
		return bytes;
	}
	function asciiToBytes(str) {
		const byteArray = [];
		for (let i = 0; i < str.length; ++i) byteArray.push(str.charCodeAt(i) & 255);
		return byteArray;
	}
	function utf16leToBytes(str, units) {
		let c, hi, lo;
		const byteArray = [];
		for (let i = 0; i < str.length; ++i) {
			if ((units -= 2) < 0) break;
			c = str.charCodeAt(i);
			hi = c >> 8;
			lo = c % 256;
			byteArray.push(lo);
			byteArray.push(hi);
		}
		return byteArray;
	}
	function base64ToBytes(str) {
		return base64.toByteArray(base64clean(str));
	}
	function blitBuffer(src, dst, offset, length) {
		let i;
		for (i = 0; i < length; ++i) {
			if (i + offset >= dst.length || i >= src.length) break;
			dst[i + offset] = src[i];
		}
		return i;
	}
	function isInstance(obj, type) {
		return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
	}
	function numberIsNaN(obj) {
		return obj !== obj;
	}
	var hexSliceLookupTable = (function() {
		const alphabet = "0123456789abcdef";
		const table = new Array(256);
		for (let i = 0; i < 16; ++i) {
			const i16 = i * 16;
			for (let j = 0; j < 16; ++j) table[i16 + j] = alphabet[i] + alphabet[j];
		}
		return table;
	})();
	function defineBigIntMethod(fn) {
		return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
	}
	function BufferBigIntNotDefined() {
		throw new Error("BigInt not supported");
	}
}));
//#endregion
//#region ../../node_modules/.pnpm/global@4.4.0/node_modules/global/window.js
var require_window = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var win;
	if (typeof window !== "undefined") win = window;
	else if (typeof global !== "undefined") win = global;
	else if (typeof self !== "undefined") win = self;
	else win = {};
	module.exports = win;
}));
//#endregion
//#region __vite-browser-external
var require___vite_browser_external = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {};
}));
//#endregion
//#region ../../node_modules/.pnpm/get-random-values@3.0.0/node_modules/get-random-values/index.js
var require_get_random_values = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var window = require_window();
	var nodeCrypto = require___vite_browser_external();
	/**
	* @template {ArrayBufferView | null} T
	* @param {T} buf
	* @returns {T}
	*/
	function getRandomValues(buf) {
		if (window.crypto && window.crypto.getRandomValues) return window.crypto.getRandomValues(buf);
		if (typeof window.msCrypto === "object" && typeof window.msCrypto.getRandomValues === "function") return window.msCrypto.getRandomValues(buf);
		if (nodeCrypto.randomBytes) {
			if (!(buf instanceof Uint8Array)) throw new TypeError("expected Uint8Array");
			if (buf.length > 65536) {
				var e = /* @__PURE__ */ new Error();
				e.code = 22;
				e.message = "Failed to execute 'getRandomValues' on 'Crypto': The ArrayBufferView's byte length (" + buf.length + ") exceeds the number of bytes of entropy available via this API (65536).";
				e.name = "QuotaExceededError";
				throw e;
			}
			var bytes = nodeCrypto.randomBytes(buf.length);
			buf.set(bytes);
			return buf;
		} else throw new Error("No secure random number generator available.");
	}
	module.exports = getRandomValues;
}));
//#endregion
//#region ../send/frontend/src/lib/ece.ts
var import_buffer = require_buffer();
var import_get_random_values = /* @__PURE__ */ __toESM$2(require_get_random_values(), 1);
var NONCE_LENGTH = 12;
var TAG_LENGTH = 16;
var KEY_LENGTH = 16;
var MODE_ENCRYPT = "encrypt";
var MODE_DECRYPT = "decrypt";
var ECE_RECORD_SIZE = 1024 * 64;
function generateSalt(len) {
	const randSalt = new Uint8Array(len);
	(0, import_get_random_values.default)(randSalt);
	return randSalt.buffer;
}
var ECETransformer = class {
	constructor(mode, ikm, rs, salt) {
		this.mode = mode;
		this.prevChunk;
		this.seq = 0;
		this.firstchunk = true;
		this.rs = rs;
		this.key = ikm;
		this.salt = salt;
	}
	async generateNonceBase() {
		const base = await window.crypto.subtle.exportKey("raw", this.key);
		const exported = new Uint8Array(base);
		return import_buffer.Buffer.from(exported.slice(0, NONCE_LENGTH));
	}
	generateNonce(seq) {
		if (seq > 4294967295) throw new Error("record sequence number exceeds limit");
		const nonce = import_buffer.Buffer.from(this.nonceBase);
		const xor = (nonce.readUIntBE(nonce.length - 4, 4) ^ seq) >>> 0;
		nonce.writeUIntBE(xor, nonce.length - 4, 4);
		return nonce;
	}
	pad(data, isLast) {
		const len = data.length;
		if (len + TAG_LENGTH >= this.rs) throw new Error("data too large for record size");
		if (isLast) {
			const padding = import_buffer.Buffer.alloc(1);
			padding.writeUInt8(2, 0);
			return import_buffer.Buffer.concat([data, padding]);
		} else {
			const padding = import_buffer.Buffer.alloc(this.rs - len - TAG_LENGTH);
			padding.fill(0);
			padding.writeUInt8(1, 0);
			return import_buffer.Buffer.concat([data, padding]);
		}
	}
	unpad(data, isLast) {
		for (let i = data.length - 1; i >= 0; i--) if (data[i]) {
			if (isLast) {
				if (data[i] !== 2) throw new Error("delimiter of final record is not 2");
			} else if (data[i] !== 1) throw new Error("delimiter of not final record is not 1");
			return data.slice(0, i);
		}
		throw new Error("no delimiter found");
	}
	createHeader() {
		const nums = import_buffer.Buffer.alloc(5);
		nums.writeUIntBE(this.rs, 0, 4);
		nums.writeUIntBE(0, 4, 1);
		return import_buffer.Buffer.concat([import_buffer.Buffer.from(this.salt), nums]);
	}
	readHeader(buffer) {
		if (buffer.length < 21) throw new Error("chunk too small for reading header");
		const header = {};
		header.salt = buffer.buffer.slice(0, KEY_LENGTH);
		header.rs = buffer.readUIntBE(KEY_LENGTH, 4);
		header.length = buffer.readUInt8(20) + KEY_LENGTH + 5;
		return header;
	}
	async encryptRecord(buffer, seq, isLast) {
		const nonce = this.generateNonce(seq);
		const encrypted = await crypto.subtle.encrypt({
			name: "AES-GCM",
			iv: nonce
		}, this.key, this.pad(buffer, isLast));
		return import_buffer.Buffer.from(encrypted);
	}
	async decryptRecord(buffer, seq, isLast) {
		const nonce = this.generateNonce(seq);
		const data = await crypto.subtle.decrypt({
			name: "AES-GCM",
			iv: nonce,
			tagLength: 128
		}, this.key, buffer);
		return this.unpad(import_buffer.Buffer.from(data), isLast);
	}
	async start(controller) {
		if (this.mode === MODE_ENCRYPT) {
			this.nonceBase = await this.generateNonceBase();
			controller.enqueue(this.createHeader());
		} else if (this.mode !== MODE_DECRYPT) throw new Error("mode must be either encrypt or decrypt");
	}
	async transformPrevChunk(isLast, controller) {
		if (this.mode === MODE_ENCRYPT) {
			controller.enqueue(await this.encryptRecord(this.prevChunk, this.seq, isLast));
			this.seq++;
		} else {
			if (this.seq === 0) {
				const header = this.readHeader(this.prevChunk);
				this.salt = header.salt;
				this.rs = header.rs;
				this.nonceBase = await this.generateNonceBase();
			} else controller.enqueue(await this.decryptRecord(this.prevChunk, this.seq - 1, isLast));
			this.seq++;
		}
	}
	async transform(chunk, controller) {
		if (!this.firstchunk) await this.transformPrevChunk(false, controller);
		this.firstchunk = false;
		this.prevChunk = import_buffer.Buffer.from(chunk.buffer);
	}
	async flush(controller) {
		if (this.prevChunk) await this.transformPrevChunk(true, controller);
	}
};
var StreamSlicer = class {
	constructor(rs, mode) {
		this.mode = mode;
		this.rs = rs;
		this.chunkSize = mode === MODE_ENCRYPT ? rs - 17 : 21;
		this.partialChunk = new Uint8Array(this.chunkSize);
		this.offset = 0;
	}
	send(buf, controller) {
		controller.enqueue(buf);
		if (this.chunkSize === 21 && this.mode === MODE_DECRYPT) this.chunkSize = this.rs;
		this.partialChunk = new Uint8Array(this.chunkSize);
		this.offset = 0;
	}
	transform(chunk, controller) {
		let i = 0;
		if (this.offset > 0) {
			const len = Math.min(chunk.byteLength, this.chunkSize - this.offset);
			this.partialChunk.set(chunk.slice(0, len), this.offset);
			this.offset += len;
			i += len;
			if (this.offset === this.chunkSize) this.send(this.partialChunk, controller);
		}
		while (i < chunk.byteLength) {
			const remainingBytes = chunk.byteLength - i;
			if (remainingBytes >= this.chunkSize) {
				const record = chunk.slice(i, i + this.chunkSize);
				i += this.chunkSize;
				this.send(record, controller);
			} else {
				const end = chunk.slice(i, i + remainingBytes);
				i += end.byteLength;
				this.partialChunk.set(end);
				this.offset = end.byteLength;
			}
		}
	}
	flush(controller) {
		if (this.offset > 0) controller.enqueue(this.partialChunk.slice(0, this.offset));
	}
};
function encryptStream(input, key, rs = ECE_RECORD_SIZE, salt = generateSalt(KEY_LENGTH)) {
	const mode = "encrypt";
	return transformStream(transformStream(input, new StreamSlicer(rs, mode)), new ECETransformer(mode, key, rs, salt));
}
function decryptStream(input, key, rs = ECE_RECORD_SIZE) {
	const mode = "decrypt";
	return transformStream(transformStream(input, new StreamSlicer(rs, mode)), new ECETransformer(mode, key, rs));
}
//#endregion
//#region ../send/frontend/src/apps/send/const.js
/**
* Enum for Initialization codes. Non-zero values indicate an error.
* @readonly
* @enum {number}
*/
var INIT_ERRORS = {
	NONE: 0,
	NO_USER: 1,
	NO_KEYCHAIN: 2,
	COULD_NOT_CREATE_DEFAULT_FOLDER: 3
};
//#endregion
//#region ../send/frontend/src/lib/storage/LocalStorage.ts
var LocalStorageAdapter = class {
	constructor() {}
	keys() {
		const keys = [];
		for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
		return keys;
	}
	get(key) {
		const val = localStorage.getItem(key);
		if (!val) return null;
		return JSON.parse(val);
	}
	set(key, val) {
		const value = JSON.stringify(val);
		localStorage.setItem(key, value);
	}
	remove(id) {
		localStorage.removeItem(id);
	}
	clear() {
		console.log(`clearing localStorage`);
		localStorage.clear();
	}
};
//#endregion
//#region ../send/frontend/src/lib/storage/index.ts
var Storage = class {
	constructor(Adapter = LocalStorageAdapter) {
		this.USER_KEY = "lb/user";
		this.OTHER_KEYS_KEY = "lb/keys";
		this.RSA_KEYS_KEY = "lb/rsa";
		this.PASS_PHRASE = "lb/passphrase";
		this.adapter = new Adapter();
	}
	async storeUser(userObj) {
		this.adapter.set(this.USER_KEY, { ...userObj });
	}
	async getUserFromLocalStorage() {
		return this.adapter.get(this.USER_KEY);
	}
	async storeKeys(keysObj) {
		this.adapter.set(this.OTHER_KEYS_KEY, { ...keysObj });
	}
	async storePassPhrase(passPhrase) {
		this.adapter.set(this.PASS_PHRASE, { passPhrase });
	}
	getPassPhrase() {
		return this.adapter.get(this.PASS_PHRASE)?.passPhrase || "";
	}
	async loadKeys() {
		return this.adapter.get(this.OTHER_KEYS_KEY);
	}
	async storeKeypair(keypair) {
		this.adapter.set(this.RSA_KEYS_KEY, { ...keypair });
	}
	async loadKeypair() {
		return this.adapter.get(this.RSA_KEYS_KEY);
	}
	async clear() {
		return this.adapter.clear();
	}
	async export() {
		return {
			user: await this.getUserFromLocalStorage(),
			keypair: await this.loadKeypair(),
			keys: await this.loadKeys()
		};
	}
};
//#endregion
//#region ../send/frontend/src/lib/bridgePassphrase.ts
/**
* Pull a passphrase shared from the web app via the token bridge into the
* keychain.
*
* The web app (running in a browser tab) posts SEND_MESSAGE_TO_BRIDGE; the
* add-on background stores its value in browser.storage.local under that key
* (see background.ts). This moves that staged value into the keychain — i.e.
* localStorage['lb/passphrase'], which every moz-extension page (background,
* popup, management) shares — and clears the staged copy so it is consumed once.
*
* Runs only in an extension context where browser.storage.local exists; it is a
* no-op in a plain web page (where `browser` is undefined). Safe to call from
* any context that is about to restore keys, so the popup and background don't
* depend on the management page having run the transfer first.
*
* @returns true if a bridged passphrase was found and stored, false otherwise.
*/
async function pullBridgedPassphrase(keychain) {
	if (typeof browser === "undefined" || !browser?.storage?.local) return false;
	try {
		const passphrase = (await browser.storage.local.get(SEND_MESSAGE_TO_BRIDGE))?.[SEND_MESSAGE_TO_BRIDGE];
		if (!passphrase) return false;
		await keychain.storePassPhrase(passphrase);
		await browser.storage.local.remove(SEND_MESSAGE_TO_BRIDGE);
		console.log("✅ Pulled bridged passphrase into the keychain");
		return true;
	} catch (error) {
		console.error("Error pulling bridged passphrase:", error);
		return false;
	}
}
//#endregion
//#region ../send/frontend/src/lib/keychain.ts
var import___vite_browser_external = /* @__PURE__ */ __toESM$2(require___vite_browser_external(), 1);
var SALT_LENGTH = 128;
var crypto$1 = import___vite_browser_external.default;
try {
	crypto$1 = window.crypto;
} catch (e) {}
async function generateAesGcmKey() {
	try {
		return await crypto$1.subtle.generateKey({
			name: "AES-GCM",
			length: 256
		}, true, ["encrypt", "decrypt"]);
	} catch (err) {
		console.error(err);
	}
}
var Content = class {
	async generateKey() {
		return await generateAesGcmKey();
	}
};
var Container = class {
	async generateContainerKey() {
		try {
			return await crypto$1.subtle.generateKey({
				name: "AES-KW",
				length: 256
			}, true, ["wrapKey", "unwrapKey"]);
		} catch (err) {
			console.error(err);
		}
	}
	async wrapContentKey(key, wrappingKey) {
		const wrappedKey = await crypto$1.subtle.wrapKey("raw", key, wrappingKey, "AES-KW");
		return Util.arrayBufferToBase64(wrappedKey);
	}
	async unwrapContentKey(wrappedKeyStr, wrappingKey) {
		const buf = Util.base64ToArrayBuffer(wrappedKeyStr);
		return await crypto$1.subtle.unwrapKey("raw", buf, wrappingKey, "AES-KW", "AES-GCM", true, ["encrypt", "decrypt"]);
	}
};
var Password = class {
	async _wrap(keyToWrap, password, salt) {
		const wrappingKey = await getKey(await getKeyMaterial(password), salt);
		const wrappedKey = await crypto$1.subtle.wrapKey("raw", keyToWrap, wrappingKey, "AES-KW");
		return Util.arrayBufferToBase64(wrappedKey);
	}
	async _unwrap(wrappedKeyStr, password, salt, algorithm, permissions) {
		const unwrappingKey = await getUnwrappingKey(password, salt);
		return crypto$1.subtle.unwrapKey("raw", Util.base64ToArrayBuffer(wrappedKeyStr), unwrappingKey, "AES-KW", algorithm, true, permissions);
	}
	async wrapContainerKey(keyToWrap, password, salt) {
		return await this._wrap(keyToWrap, password, salt);
	}
	async unwrapContainerKey(wrappedKeyStr, password, salt) {
		return await this._unwrap(wrappedKeyStr, password, salt, "AES-KW", ["wrapKey", "unwrapKey"]);
	}
	async wrapContentKey(keyToWrap, password, salt) {
		return await this._wrap(keyToWrap, password, salt);
	}
	async unwrapContentKey(wrappedKeyStr, password, salt) {
		return await this._unwrap(wrappedKeyStr, password, salt, "AES-GCM", ["encrypt", "decrypt"]);
	}
};
var Rsa = class {
	async generateKeyPair() {
		const { publicKey, privateKey } = await crypto$1.subtle.generateKey({
			name: "RSA-OAEP",
			modulusLength: 2048,
			publicExponent: new Uint8Array([
				1,
				0,
				1
			]),
			hash: "SHA-256"
		}, true, ["wrapKey", "unwrapKey"]);
		this.publicKey = publicKey;
		this.privateKey = privateKey;
		return {
			publicKey,
			privateKey
		};
	}
	async getPublicKeyJwk() {
		if (!this.publicKey) return null;
		const jwk = await rsaToJsonWebKey(this.publicKey);
		return JSON.stringify(jwk);
	}
	async getPrivateKeyJwk() {
		if (!this.privateKey) return null;
		const jwk = await rsaToJsonWebKey(this.privateKey);
		return JSON.stringify(jwk);
	}
	async setPrivateKeyFromJwk(jwk) {
		this.privateKey = await jwkToRsa(jwk);
	}
	async setPublicKeyFromJwk(jwk) {
		this.publicKey = await jwkToRsa(jwk);
	}
	async wrapContainerKey(aesKey, publicKey) {
		const wrappedKey = await crypto$1.subtle.wrapKey("jwk", aesKey, publicKey, { name: "RSA-OAEP" });
		return Util.arrayBufferToBase64(wrappedKey);
	}
	async unwrapContainerKey(wrappedKeyStr, privateKey) {
		return await crypto$1.subtle.unwrapKey("jwk", Util.base64ToArrayBuffer(wrappedKeyStr), privateKey, { name: "RSA-OAEP" }, {
			name: "AES-KW",
			length: 256
		}, true, ["wrapKey", "unwrapKey"]);
	}
};
var Challenge = class {
	createChallenge() {
		return Util.arrayBufferToBase64(Util.generateSalt(SALT_LENGTH));
	}
	async generateKey() {
		return await generateAesGcmKey();
	}
	async encryptChallenge(challengePlaintext, key, salt) {
		const arrayBuffer = new TextEncoder().encode(challengePlaintext);
		const ciphertextBuffer = await crypto$1.subtle.encrypt({
			name: "AES-GCM",
			iv: salt
		}, key, arrayBuffer);
		return Util.arrayBufferToBase64(ciphertextBuffer);
	}
	async decryptChallenge(challengeCiphertext, key, salt) {
		const arrayBuffer = await crypto$1.subtle.decrypt({
			name: "AES-GCM",
			iv: salt
		}, key, Util.base64ToArrayBuffer(challengeCiphertext));
		return new TextDecoder().decode(arrayBuffer);
	}
};
var Backup = class {
	async generateKey() {
		return await generateAesGcmKey();
	}
	async encryptBackup(plaintext, key, salt) {
		const arrayBuffer = new TextEncoder().encode(plaintext);
		const ciphertextBuffer = await crypto$1.subtle.encrypt({
			name: "AES-GCM",
			iv: salt
		}, key, arrayBuffer);
		return Util.arrayBufferToBase64(ciphertextBuffer);
	}
	async decryptBackup(ciphertext, key, salt) {
		const arrayBuffer = await crypto$1.subtle.decrypt({
			name: "AES-GCM",
			iv: salt
		}, key, Util.base64ToArrayBuffer(ciphertext));
		return new TextDecoder().decode(arrayBuffer);
	}
};
var Keychain = class {
	constructor(storage) {
		this._init(storage);
		this.locked = false;
	}
	_init(storage) {
		this.content = new Content();
		this.container = new Container();
		this.password = new Password();
		this.rsa = new Rsa();
		this.challenge = new Challenge();
		this.backup = new Backup();
		this._keys = {};
		this._storage = storage ?? new Storage();
	}
	get keys() {
		return { ...this._keys };
	}
	set keys(keyObj) {
		this._keys = keyObj;
	}
	getPassphraseValue() {
		return this._storage.getPassPhrase();
	}
	count() {
		return Object.keys(this._keys).length;
	}
	async add(id, key) {
		if (!this.rsa.publicKey) throw Error("Missing public key, required for wrapping AES key");
		const wrappedKeyStr = await this.rsa.wrapContainerKey(key, this.rsa.publicKey);
		this._keys[id] = wrappedKeyStr;
	}
	async get(id) {
		const wrappedKeyStr = this._keys[id];
		if (!wrappedKeyStr) throw Error(`You don't have the key to decrypt this container`);
		return await this.rsa.unwrapContainerKey(wrappedKeyStr, this.rsa.privateKey);
	}
	remove(id) {
		delete this._keys[id];
	}
	async newKeyForContainer(id) {
		const key = await this.container.generateContainerKey();
		console.log(`adding key for container id ${id}`);
		await this.add(id, key);
	}
	async exportKeypair() {
		return {
			publicKey: await this.rsa.getPublicKeyJwk(),
			privateKey: await this.rsa.getPrivateKeyJwk()
		};
	}
	async exportKeys() {
		return { ...this.keys };
	}
	async storePassPhrase(passphrase) {
		await this._storage.storePassPhrase(passphrase);
	}
	async store() {
		await this._storage.storeKeypair(await this.exportKeypair());
		await this._storage.storeKeys(await this.exportKeys());
	}
	async fallbackToStoredKeypair(keypair) {
		if (!keypair) keypair = await this._storage.loadKeypair();
		return keypair;
	}
	async fallbackToStoredKeys(keys) {
		if (!keys) keys = await this._storage.loadKeys();
		return keys;
	}
	async load(keypairStr, keys) {
		try {
			const { publicKey, privateKey } = await this.fallbackToStoredKeypair(keypairStr);
			await this.rsa.setPrivateKeyFromJwk(privateKey);
			await this.rsa.setPublicKeyFromJwk(publicKey);
			this.keys = await this.fallbackToStoredKeys(keys);
			return true;
		} catch (e) {
			console.log(`No keychain in storage`);
			return false;
		}
	}
	async generateBackupKey() {
		return await generateAesGcmKey();
	}
};
var Util = class {
	static generateSalt(size = 16) {
		return (0, import_get_random_values.default)(new Uint8Array(size));
	}
	static generateRandomPassword(size = 16) {
		return this.arrayBufferToBase64(this.generateSalt(size));
	}
	static async compareKeys(k1, k2) {
		return await exportKeyToBase64(k1) === await exportKeyToBase64(k2);
	}
	static arrayBufferToBase64(arrayBuffer) {
		const byteArray = new Uint8Array(arrayBuffer);
		const byteString = String.fromCharCode(...byteArray);
		return btoa(encodeURIComponent(byteString));
	}
	static base64ToArrayBuffer(base64) {
		const byteString = decodeURIComponent(atob(base64));
		const byteArray = new Uint8Array(byteString.length);
		for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
		return byteArray.buffer;
	}
};
function getKeyMaterial(password) {
	const enc = new TextEncoder();
	return crypto$1.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]);
}
function getKey(keyMaterial, salt) {
	return crypto$1.subtle.deriveKey({
		name: "PBKDF2",
		salt,
		iterations: 1e5,
		hash: "SHA-256"
	}, keyMaterial, {
		name: "AES-KW",
		length: 256
	}, true, ["wrapKey", "unwrapKey"]);
}
async function getUnwrappingKey(password, salt) {
	const keyMaterial = await getKeyMaterial(password);
	return crypto$1.subtle.deriveKey({
		name: "PBKDF2",
		salt,
		iterations: 1e5,
		hash: "SHA-256"
	}, keyMaterial, {
		name: "AES-KW",
		length: 256
	}, true, ["wrapKey", "unwrapKey"]);
}
async function rsaToJsonWebKey(key) {
	return await crypto$1.subtle.exportKey("jwk", key);
}
function toJsonWebKey(jwk) {
	if (typeof jwk === "string") return JSON.parse(jwk);
	return jwk;
}
async function jwkToRsa(jwk) {
	jwk = toJsonWebKey(jwk);
	return await crypto$1.subtle.importKey("jwk", jwk, {
		name: "RSA-OAEP",
		hash: "SHA-256"
	}, true, jwk.key_ops || []);
}
async function exportKeyToBase64(key) {
	const keyBuffer = await crypto$1.subtle.exportKey("raw", key);
	return Util.arrayBufferToBase64(keyBuffer);
}
async function decryptKeys(protectedContainerKeysObj, keychain, key, salt) {
	const obj = {};
	await Promise.all(Object.keys(protectedContainerKeysObj).map(async (k) => {
		obj[k] = await keychain.backup.decryptBackup(protectedContainerKeysObj[k], key, salt);
		return true;
	}));
	return obj;
}
async function decryptAll(keychainFromParams, { protectedContainerKeysStr, protectedKeypairStr, passwordWrappedKeyStr, saltStr, password }) {
	const salt = Util.base64ToArrayBuffer(saltStr);
	const key = await keychainFromParams.password.unwrapContentKey(passwordWrappedKeyStr, password, salt);
	const protectedKeypair = JSON.parse(protectedKeypairStr);
	const publicKeyCiphertext = protectedKeypair.publicKey;
	const privateKeyCiphertext = protectedKeypair.privateKey;
	return {
		publicKeyJwk: await keychainFromParams.backup.decryptBackup(publicKeyCiphertext, key, salt),
		privateKeyJwk: await keychainFromParams.backup.decryptBackup(privateKeyCiphertext, key, salt),
		containerKeys: await decryptKeys(JSON.parse(protectedContainerKeysStr), keychainFromParams, key, salt)
	};
}
var MSG_INCORRECT_PASSPHRASE = "Passphrase is incorrect";
var MSG_COULD_NOT_RETRIEVE = "Could not retrieve backup from the server.";
async function restoreKeysUsingLocalStorage(keychain, api) {
	await pullBridgedPassphrase(keychain);
	console.log("🔑 auto restoring keys");
	if (!keychain.getPassphraseValue()) {
		console.log("Keychain passphrase is not initialized");
		return;
	}
	return restoreKeys(keychain, api);
}
async function restoreKeys(keychain, api, msg, passPhrase) {
	if (!msg) msg = { value: "" };
	const password = keychain.getPassphraseValue() || passPhrase;
	if (!password) console.error("Keychain is not initialized");
	let getBackupAPIResponse;
	try {
		getBackupAPIResponse = await api.call(`users/backup`);
	} catch (error) {
		console.error("Could not retrieve backup from the server.", error);
		return;
	}
	if (!getBackupAPIResponse) {
		msg.value = MSG_COULD_NOT_RETRIEVE;
		return;
	}
	const { backupContainerKeys, backupKeypair, backupKeystring, backupSalt } = getBackupAPIResponse;
	const decryptParams = {
		protectedContainerKeysStr: backupContainerKeys,
		protectedKeypairStr: backupKeypair,
		passwordWrappedKeyStr: backupKeystring,
		saltStr: backupSalt,
		password
	};
	try {
		const { publicKeyJwk, privateKeyJwk, containerKeys } = await decryptAll(keychain, decryptParams);
		const keypair = {
			publicKey: publicKeyJwk,
			privateKey: privateKeyJwk
		};
		await keychain.load(keypair, containerKeys);
		await keychain.store();
		msg.value = "✅ Restore complete";
	} catch (e) {
		keychain.locked = true;
		const KEY_RESTORE_ERROR = `⛔️ Could not restore keys. Please make sure your backup phrase is correct.`;
		console.error(KEY_RESTORE_ERROR, e);
		msg.value = MSG_INCORRECT_PASSPHRASE;
		throw new Error(KEY_RESTORE_ERROR);
	}
}
async function encryptKeys(containerKeysObj, key, salt, keychain) {
	const obj = {};
	await Promise.all(Object.keys(containerKeysObj).map(async (k) => {
		obj[k] = await keychain.backup.encryptBackup(containerKeysObj[k], key, salt);
		return true;
	}));
	return obj;
}
async function encryptAll(publicKeyJwk, privateKeyJwk, containerKeys, password, keychain) {
	const key = await keychain.generateBackupKey();
	const salt = Util.generateSalt();
	const protectedContainerKeys = await encryptKeys(containerKeys, key, salt, keychain);
	const protectedContainerKeysStr = JSON.stringify(protectedContainerKeys);
	const protectedKeypair = {
		publicKey: await keychain.backup.encryptBackup(publicKeyJwk, key, salt),
		privateKey: await keychain.backup.encryptBackup(privateKeyJwk, key, salt)
	};
	return {
		protectedContainerKeysStr,
		protectedKeypairStr: JSON.stringify(protectedKeypair),
		passwordWrappedKeyStr: await keychain.password.wrapContentKey(key, password, salt),
		saltStr: Util.arrayBufferToBase64(salt)
	};
}
async function createBackup(keys, keypair, keystring, salt, api) {
	return await api.call(`users/backup`, {
		keys,
		keypair,
		keystring,
		salt
	}, "POST");
}
async function backupKeys(keychain, api, msg) {
	const password = keychain.getPassphraseValue();
	msg.value = "";
	console.log("🔐 auto-backing up keys");
	if (!password) {
		console.warn("Keychain is not initialized, cannot backup keys");
		return;
	}
	const keypair = await keychain.exportKeypair();
	const containerKeys = await keychain.exportKeys();
	const { protectedContainerKeysStr, protectedKeypairStr, passwordWrappedKeyStr, saltStr } = await encryptAll(keypair.publicKey, keypair.privateKey, containerKeys, password, keychain);
	await createBackup(protectedContainerKeysStr, protectedKeypairStr, passwordWrappedKeyStr, saltStr, api);
	msg.value = "✅ Backup complete";
	console.log("🔒 Backup complete");
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/objectSpread2-BvkFp-_Y.mjs
var __create$1 = Object.create;
var __defProp$1 = Object.defineProperty;
var __getOwnPropDesc$1 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames$1 = Object.getOwnPropertyNames;
var __getProtoOf$1 = Object.getPrototypeOf;
var __hasOwnProp$1 = Object.prototype.hasOwnProperty;
var __commonJS$1 = (cb, mod) => function() {
	return mod || (0, cb[__getOwnPropNames$1(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps$1 = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames$1(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp$1.call(to, key) && key !== except) __defProp$1(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc$1(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM$1 = (mod, isNodeMode, target) => (target = mod != null ? __create$1(__getProtoOf$1(mod)) : {}, __copyProps$1(isNodeMode || !mod || !mod.__esModule ? __defProp$1(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var require_typeof$1 = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/typeof.js"(exports, module) {
	function _typeof$2(o) {
		"@babel/helpers - typeof";
		return module.exports = _typeof$2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
			return typeof o$1;
		} : function(o$1) {
			return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
		}, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof$2(o);
	}
	module.exports = _typeof$2, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_toPrimitive$1 = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/toPrimitive.js"(exports, module) {
	var _typeof$1 = require_typeof$1()["default"];
	function toPrimitive$1(t, r) {
		if ("object" != _typeof$1(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof$1(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}
	module.exports = toPrimitive$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_toPropertyKey$1 = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/toPropertyKey.js"(exports, module) {
	var _typeof = require_typeof$1()["default"];
	var toPrimitive = require_toPrimitive$1();
	function toPropertyKey$1(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}
	module.exports = toPropertyKey$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_defineProperty$1 = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/defineProperty.js"(exports, module) {
	var toPropertyKey = require_toPropertyKey$1();
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
	}
	module.exports = _defineProperty, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_objectSpread2$1 = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/objectSpread2.js"(exports, module) {
	var defineProperty = require_defineProperty$1();
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r$1) {
				return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r$1) {
				defineProperty(e, r$1, t[r$1]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r$1) {
				Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
			});
		}
		return e;
	}
	module.exports = _objectSpread2, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
//#endregion
//#region ../../node_modules/.pnpm/@trpc+server@11.17.0_typescript@5.9.3/node_modules/@trpc/server/dist/observable-UMO3vUa_.mjs
/** @public */
function observable(subscribe) {
	const self = {
		subscribe(observer) {
			let teardownRef = null;
			let isDone = false;
			let unsubscribed = false;
			let teardownImmediately = false;
			function unsubscribe() {
				if (teardownRef === null) {
					teardownImmediately = true;
					return;
				}
				if (unsubscribed) return;
				unsubscribed = true;
				if (typeof teardownRef === "function") teardownRef();
				else if (teardownRef) teardownRef.unsubscribe();
			}
			teardownRef = subscribe({
				next(value) {
					var _observer$next;
					if (isDone) return;
					(_observer$next = observer.next) === null || _observer$next === void 0 || _observer$next.call(observer, value);
				},
				error(err) {
					var _observer$error;
					if (isDone) return;
					isDone = true;
					(_observer$error = observer.error) === null || _observer$error === void 0 || _observer$error.call(observer, err);
					unsubscribe();
				},
				complete() {
					var _observer$complete;
					if (isDone) return;
					isDone = true;
					(_observer$complete = observer.complete) === null || _observer$complete === void 0 || _observer$complete.call(observer);
					unsubscribe();
				}
			});
			if (teardownImmediately) unsubscribe();
			return { unsubscribe };
		},
		pipe(...operations) {
			return operations.reduce(pipeReducer, self);
		}
	};
	return self;
}
function pipeReducer(prev, fn) {
	return fn(prev);
}
/** @internal */
function observableToPromise(observable$1) {
	const ac = new AbortController();
	return new Promise((resolve, reject) => {
		let isDone = false;
		function onDone() {
			if (isDone) return;
			isDone = true;
			obs$.unsubscribe();
		}
		ac.signal.addEventListener("abort", () => {
			reject(ac.signal.reason);
		});
		const obs$ = observable$1.subscribe({
			next(data) {
				isDone = true;
				resolve(data);
				onDone();
			},
			error(data) {
				reject(data);
			},
			complete() {
				ac.abort();
				onDone();
			}
		});
	});
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+server@11.17.0_typescript@5.9.3/node_modules/@trpc/server/dist/observable-CUiPknO-.mjs
function share(_opts) {
	return (source) => {
		let refCount = 0;
		let subscription = null;
		const observers = [];
		function startIfNeeded() {
			if (subscription) return;
			subscription = source.subscribe({
				next(value) {
					for (const observer of observers) {
						var _observer$next;
						(_observer$next = observer.next) === null || _observer$next === void 0 || _observer$next.call(observer, value);
					}
				},
				error(error) {
					for (const observer of observers) {
						var _observer$error;
						(_observer$error = observer.error) === null || _observer$error === void 0 || _observer$error.call(observer, error);
					}
				},
				complete() {
					for (const observer of observers) {
						var _observer$complete;
						(_observer$complete = observer.complete) === null || _observer$complete === void 0 || _observer$complete.call(observer);
					}
				}
			});
		}
		function resetIfNeeded() {
			if (refCount === 0 && subscription) {
				const _sub = subscription;
				subscription = null;
				_sub.unsubscribe();
			}
		}
		return observable((subscriber) => {
			refCount++;
			observers.push(subscriber);
			startIfNeeded();
			return { unsubscribe() {
				refCount--;
				resetIfNeeded();
				const index = observers.findIndex((v) => v === subscriber);
				if (index > -1) observers.splice(index, 1);
			} };
		});
	};
}
/**
* @internal
* An observable that maintains and provides a "current value" to subscribers
* @see https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject
*/
function behaviorSubject(initialValue) {
	let value = initialValue;
	const observerList = [];
	const addObserver = (observer) => {
		if (value !== void 0) observer.next(value);
		observerList.push(observer);
	};
	const removeObserver = (observer) => {
		observerList.splice(observerList.indexOf(observer), 1);
	};
	const obs = observable((observer) => {
		addObserver(observer);
		return () => {
			removeObserver(observer);
		};
	});
	obs.next = (nextValue) => {
		if (value === nextValue) return;
		value = nextValue;
		for (const observer of observerList) observer.next(nextValue);
	};
	obs.get = () => value;
	return obs;
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/splitLink-B7Cuf2c_.mjs
/** @internal */
function createChain(opts) {
	return observable((observer) => {
		function execute(index = 0, op = opts.op) {
			const next = opts.links[index];
			if (!next) throw new Error("No more links to execute - did you forget to add an ending link?");
			return next({
				op,
				next(nextOp) {
					return execute(index + 1, nextOp);
				}
			});
		}
		return execute().subscribe(observer);
	});
}
function asArray(value) {
	return Array.isArray(value) ? value : [value];
}
function splitLink(opts) {
	return (runtime) => {
		const yes = asArray(opts.true).map((link) => link(runtime));
		const no = asArray(opts.false).map((link) => link(runtime));
		return (props) => {
			return observable((observer) => {
				const links = opts.condition(props.op) ? yes : no;
				return createChain({
					op: props.op,
					links
				}).subscribe(observer);
			});
		};
	};
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+server@11.17.0_typescript@5.9.3/node_modules/@trpc/server/dist/codes-DagpWZLc.mjs
/**
* Check that value is object
* @internal
*/
function isObject(value) {
	return !!value && !Array.isArray(value) && typeof value === "object";
}
/**
* Create an object without inheriting anything from `Object.prototype`
* @internal
*/
function emptyObject() {
	return Object.create(null);
}
/**
* Run an IIFE
*/
var run = (fn) => fn();
function sleep(ms = 0) {
	return new Promise((res) => setTimeout(res, ms));
}
/**
* JSON-RPC 2.0 Error codes
*
* `-32000` to `-32099` are reserved for implementation-defined server-errors.
* For tRPC we're copying the last digits of HTTP 4XX errors.
*/
var TRPC_ERROR_CODES_BY_KEY = {
	PARSE_ERROR: -32700,
	BAD_REQUEST: -32600,
	INTERNAL_SERVER_ERROR: -32603,
	NOT_IMPLEMENTED: -32603,
	BAD_GATEWAY: -32603,
	SERVICE_UNAVAILABLE: -32603,
	GATEWAY_TIMEOUT: -32603,
	UNAUTHORIZED: -32001,
	PAYMENT_REQUIRED: -32002,
	FORBIDDEN: -32003,
	NOT_FOUND: -32004,
	METHOD_NOT_SUPPORTED: -32005,
	TIMEOUT: -32008,
	CONFLICT: -32009,
	PRECONDITION_FAILED: -32012,
	PAYLOAD_TOO_LARGE: -32013,
	UNSUPPORTED_MEDIA_TYPE: -32015,
	UNPROCESSABLE_CONTENT: -32022,
	PRECONDITION_REQUIRED: -32028,
	TOO_MANY_REQUESTS: -32029,
	CLIENT_CLOSED_REQUEST: -32099
};
TRPC_ERROR_CODES_BY_KEY.BAD_GATEWAY, TRPC_ERROR_CODES_BY_KEY.SERVICE_UNAVAILABLE, TRPC_ERROR_CODES_BY_KEY.GATEWAY_TIMEOUT, TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR;
//#endregion
//#region ../../node_modules/.pnpm/@trpc+server@11.17.0_typescript@5.9.3/node_modules/@trpc/server/dist/getErrorShape-BPSzUA7W.mjs
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function() {
	return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var noop$1 = () => {};
var freezeIfAvailable = (obj) => {
	if (Object.freeze) Object.freeze(obj);
};
function createInnerProxy(callback, path, memo) {
	var _memo$cacheKey;
	const cacheKey = path.join(".");
	(_memo$cacheKey = memo[cacheKey]) !== null && _memo$cacheKey !== void 0 || (memo[cacheKey] = new Proxy(noop$1, {
		get(_obj, key) {
			if (typeof key !== "string" || key === "then") return void 0;
			return createInnerProxy(callback, [...path, key], memo);
		},
		apply(_1, _2, args) {
			const lastOfPath = path[path.length - 1];
			if (lastOfPath === "valueOf" || lastOfPath === "toString" || lastOfPath === "toJSON") return `tRPC.proxy(${path.slice(0, -1).join(".")})`;
			let opts = {
				args,
				path
			};
			if (lastOfPath === "call") opts = {
				args: args.length >= 2 ? [args[1]] : [],
				path: path.slice(0, -1)
			};
			else if (lastOfPath === "apply") opts = {
				args: args.length >= 2 ? args[1] : [],
				path: path.slice(0, -1)
			};
			freezeIfAvailable(opts.args);
			freezeIfAvailable(opts.path);
			return callback(opts);
		}
	}));
	return memo[cacheKey];
}
/**
* Creates a proxy that calls the callback with the path and arguments
*
* @internal
*/
var createRecursiveProxy = (callback) => createInnerProxy(callback, [], emptyObject());
/**
* Used in place of `new Proxy` where each handler will map 1 level deep to another value.
*
* @internal
*/
var createFlatProxy = (callback) => {
	return new Proxy(noop$1, { get(_obj, name) {
		if (name === "then") return void 0;
		return callback(name);
	} });
};
var require_typeof = __commonJS({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/typeof.js"(exports, module) {
	function _typeof$2(o) {
		"@babel/helpers - typeof";
		return module.exports = _typeof$2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
			return typeof o$1;
		} : function(o$1) {
			return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
		}, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof$2(o);
	}
	module.exports = _typeof$2, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_toPrimitive = __commonJS({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/toPrimitive.js"(exports, module) {
	var _typeof$1 = require_typeof()["default"];
	function toPrimitive$1(t, r) {
		if ("object" != _typeof$1(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof$1(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}
	module.exports = toPrimitive$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_toPropertyKey = __commonJS({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/toPropertyKey.js"(exports, module) {
	var _typeof = require_typeof()["default"];
	var toPrimitive = require_toPrimitive();
	function toPropertyKey$1(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}
	module.exports = toPropertyKey$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_defineProperty = __commonJS({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/defineProperty.js"(exports, module) {
	var toPropertyKey = require_toPropertyKey();
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
	}
	module.exports = _defineProperty, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_objectSpread2 = __commonJS({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/objectSpread2.js"(exports, module) {
	var defineProperty = require_defineProperty();
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r$1) {
				return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r$1) {
				defineProperty(e, r$1, t[r$1]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r$1) {
				Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
			});
		}
		return e;
	}
	module.exports = _objectSpread2, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
__toESM(require_objectSpread2(), 1);
__toESM(require_defineProperty(), 1);
var import_objectSpread2$1$11 = __toESM(require_objectSpread2(), 1);
/** @internal */
function transformResultInner(response, transformer) {
	if ("error" in response) {
		const error = transformer.deserialize(response.error);
		return {
			ok: false,
			error: (0, import_objectSpread2$1$11.default)((0, import_objectSpread2$1$11.default)({}, response), {}, { error })
		};
	}
	return {
		ok: true,
		result: (0, import_objectSpread2$1$11.default)((0, import_objectSpread2$1$11.default)({}, response.result), (!response.result.type || response.result.type === "data") && {
			type: "data",
			data: transformer.deserialize(response.result.data)
		})
	};
}
var TransformResultError = class extends Error {
	constructor() {
		super("Unable to transform response from server");
	}
};
/**
* Transforms and validates that the result is a valid TRPCResponse
* @internal
*/
function transformResult(response, transformer) {
	let result;
	try {
		result = transformResultInner(response, transformer);
	} catch (_unused) {
		throw new TransformResultError();
	}
	if (!result.ok && (!isObject(result.error.error) || typeof result.error.error["code"] !== "number")) throw new TransformResultError();
	if (result.ok && !isObject(result.result)) throw new TransformResultError();
	return result;
}
__toESM(require_objectSpread2(), 1);
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/TRPCClientError-apv8gw59.mjs
var import_defineProperty$5 = __toESM$1(require_defineProperty$1(), 1);
var import_objectSpread2$10 = __toESM$1(require_objectSpread2$1(), 1);
function isTRPCClientError(cause) {
	return cause instanceof TRPCClientError;
}
function isTRPCErrorResponse(obj) {
	return isObject(obj) && isObject(obj["error"]) && typeof obj["error"]["code"] === "number" && typeof obj["error"]["message"] === "string";
}
function getMessageFromUnknownError(err, fallback) {
	if (typeof err === "string") return err;
	if (isObject(err) && typeof err["message"] === "string") return err["message"];
	return fallback;
}
var TRPCClientError = class TRPCClientError extends Error {
	constructor(message, opts) {
		var _opts$result, _opts$result2;
		const cause = opts === null || opts === void 0 ? void 0 : opts.cause;
		super(message, { cause });
		(0, import_defineProperty$5.default)(this, "cause", void 0);
		(0, import_defineProperty$5.default)(this, "shape", void 0);
		(0, import_defineProperty$5.default)(this, "data", void 0);
		(0, import_defineProperty$5.default)(this, "meta", void 0);
		this.meta = opts === null || opts === void 0 ? void 0 : opts.meta;
		this.cause = cause;
		this.shape = opts === null || opts === void 0 || (_opts$result = opts.result) === null || _opts$result === void 0 ? void 0 : _opts$result.error;
		this.data = opts === null || opts === void 0 || (_opts$result2 = opts.result) === null || _opts$result2 === void 0 ? void 0 : _opts$result2.error.data;
		this.name = "TRPCClientError";
		Object.setPrototypeOf(this, TRPCClientError.prototype);
	}
	static from(_cause, opts = {}) {
		const cause = _cause;
		if (isTRPCClientError(cause)) {
			if (opts.meta) cause.meta = (0, import_objectSpread2$10.default)((0, import_objectSpread2$10.default)({}, cause.meta), opts.meta);
			return cause;
		}
		if (isTRPCErrorResponse(cause)) return new TRPCClientError(cause.error.message, (0, import_objectSpread2$10.default)((0, import_objectSpread2$10.default)({}, opts), {}, {
			result: cause,
			cause: opts.cause
		}));
		return new TRPCClientError(getMessageFromUnknownError(cause, "Unknown error"), (0, import_objectSpread2$10.default)((0, import_objectSpread2$10.default)({}, opts), {}, { cause }));
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/unstable-internals-Bg7n9BBj.mjs
/**
* @internal
*/
/**
* @internal
*/
function getTransformer(transformer) {
	const _transformer = transformer;
	if (!_transformer) return {
		input: {
			serialize: (data) => data,
			deserialize: (data) => data
		},
		output: {
			serialize: (data) => data,
			deserialize: (data) => data
		}
	};
	if ("input" in _transformer) return _transformer;
	return {
		input: _transformer,
		output: _transformer
	};
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/httpUtils-pyf5RF99.mjs
var isFunction = (fn) => typeof fn === "function";
function getFetch(customFetchImpl) {
	if (customFetchImpl) return customFetchImpl;
	if (typeof window !== "undefined" && isFunction(window.fetch)) return window.fetch;
	if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) return globalThis.fetch;
	throw new Error("No fetch implementation found");
}
var import_objectSpread2$9 = __toESM$1(require_objectSpread2$1(), 1);
function resolveHTTPLinkOptions(opts) {
	return {
		url: opts.url.toString(),
		fetch: opts.fetch,
		transformer: getTransformer(opts.transformer),
		methodOverride: opts.methodOverride
	};
}
function arrayToDict(array) {
	const dict = {};
	for (let index = 0; index < array.length; index++) dict[index] = array[index];
	return dict;
}
var METHOD = {
	query: "GET",
	mutation: "POST",
	subscription: "PATCH"
};
function getInput(opts) {
	return "input" in opts ? opts.transformer.input.serialize(opts.input) : arrayToDict(opts.inputs.map((_input) => opts.transformer.input.serialize(_input)));
}
var getUrl = (opts) => {
	const parts = opts.url.split("?");
	let url = parts[0].replace(/\/$/, "") + "/" + opts.path;
	const queryParts = [];
	if (parts[1]) queryParts.push(parts[1]);
	if ("inputs" in opts) queryParts.push("batch=1");
	if (opts.type === "query" || opts.type === "subscription") {
		const input = getInput(opts);
		if (input !== void 0 && opts.methodOverride !== "POST") queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
	}
	if (queryParts.length) url += "?" + queryParts.join("&");
	return url;
};
var getBody = (opts) => {
	if (opts.type === "query" && opts.methodOverride !== "POST") return void 0;
	const input = getInput(opts);
	return input !== void 0 ? JSON.stringify(input) : void 0;
};
var jsonHttpRequester = (opts) => {
	return httpRequest((0, import_objectSpread2$9.default)((0, import_objectSpread2$9.default)({}, opts), {}, {
		contentTypeHeader: "application/json",
		getUrl,
		getBody
	}));
};
/**
* Polyfill for DOMException with AbortError name
*/
var AbortError = class extends Error {
	constructor() {
		const name = "AbortError";
		super(name);
		this.name = name;
		this.message = name;
	}
};
/**
* Polyfill for `signal.throwIfAborted()`
*
* @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/throwIfAborted
*/
var throwIfAborted = (signal) => {
	var _signal$throwIfAborte;
	if (!(signal === null || signal === void 0 ? void 0 : signal.aborted)) return;
	(_signal$throwIfAborte = signal.throwIfAborted) === null || _signal$throwIfAborte === void 0 || _signal$throwIfAborte.call(signal);
	if (typeof DOMException !== "undefined") throw new DOMException("AbortError", "AbortError");
	throw new AbortError();
};
async function fetchHTTPResponse(opts) {
	var _opts$methodOverride, _opts$trpcAcceptHeade;
	throwIfAborted(opts.signal);
	const url = opts.getUrl(opts);
	const body = opts.getBody(opts);
	const method = (_opts$methodOverride = opts.methodOverride) !== null && _opts$methodOverride !== void 0 ? _opts$methodOverride : METHOD[opts.type];
	const resolvedHeaders = await (async () => {
		const heads = await opts.headers();
		if (Symbol.iterator in heads) return Object.fromEntries(heads);
		return heads;
	})();
	const headers = (0, import_objectSpread2$9.default)((0, import_objectSpread2$9.default)((0, import_objectSpread2$9.default)({}, opts.contentTypeHeader && method !== "GET" ? { "content-type": opts.contentTypeHeader } : {}), opts.trpcAcceptHeader ? { [(_opts$trpcAcceptHeade = opts.trpcAcceptHeaderKey) !== null && _opts$trpcAcceptHeade !== void 0 ? _opts$trpcAcceptHeade : "trpc-accept"]: opts.trpcAcceptHeader } : void 0), resolvedHeaders);
	return getFetch(opts.fetch)(url, {
		method,
		signal: opts.signal,
		body,
		headers
	});
}
async function httpRequest(opts) {
	const meta = {};
	const res = await fetchHTTPResponse(opts);
	meta.response = res;
	const json = await res.json();
	meta.responseJSON = json;
	return {
		json,
		meta
	};
}
__toESM$1(require_objectSpread2$1(), 1);
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/httpBatchLink-LhidKAPw.mjs
/**
* A function that should never be called unless we messed something up.
*/
var throwFatalError = () => {
	throw new Error("Something went wrong. Please submit an issue at https://github.com/trpc/trpc/issues/new");
};
/**
* Dataloader that's very inspired by https://github.com/graphql/dataloader
* Less configuration, no caching, and allows you to cancel requests
* When cancelling a single fetch the whole batch will be cancelled only when _all_ items are cancelled
*/
function dataLoader(batchLoader) {
	let pendingItems = null;
	let dispatchTimer = null;
	const destroyTimerAndPendingItems = () => {
		clearTimeout(dispatchTimer);
		dispatchTimer = null;
		pendingItems = null;
	};
	/**
	* Iterate through the items and split them into groups based on the `batchLoader`'s validate function
	*/
	function groupItems(items) {
		const groupedItems = [[]];
		let index = 0;
		while (true) {
			const item = items[index];
			if (!item) break;
			const lastGroup = groupedItems[groupedItems.length - 1];
			if (item.aborted) {
				var _item$reject;
				(_item$reject = item.reject) === null || _item$reject === void 0 || _item$reject.call(item, /* @__PURE__ */ new Error("Aborted"));
				index++;
				continue;
			}
			if (batchLoader.validate(lastGroup.concat(item).map((it) => it.key))) {
				lastGroup.push(item);
				index++;
				continue;
			}
			if (lastGroup.length === 0) {
				var _item$reject2;
				(_item$reject2 = item.reject) === null || _item$reject2 === void 0 || _item$reject2.call(item, /* @__PURE__ */ new Error("Input is too big for a single dispatch"));
				index++;
				continue;
			}
			groupedItems.push([]);
		}
		return groupedItems;
	}
	function dispatch() {
		const groupedItems = groupItems(pendingItems);
		destroyTimerAndPendingItems();
		for (const items of groupedItems) {
			if (!items.length) continue;
			const batch = { items };
			for (const item of items) item.batch = batch;
			batchLoader.fetch(batch.items.map((_item) => _item.key)).then(async (result) => {
				await Promise.all(result.map(async (valueOrPromise, index) => {
					const item = batch.items[index];
					try {
						var _item$resolve;
						const value = await Promise.resolve(valueOrPromise);
						(_item$resolve = item.resolve) === null || _item$resolve === void 0 || _item$resolve.call(item, value);
					} catch (cause) {
						var _item$reject3;
						(_item$reject3 = item.reject) === null || _item$reject3 === void 0 || _item$reject3.call(item, cause);
					}
					item.batch = null;
					item.reject = null;
					item.resolve = null;
				}));
				for (const item of batch.items) {
					var _item$reject4;
					(_item$reject4 = item.reject) === null || _item$reject4 === void 0 || _item$reject4.call(item, /* @__PURE__ */ new Error("Missing result"));
					item.batch = null;
				}
			}).catch((cause) => {
				for (const item of batch.items) {
					var _item$reject5;
					(_item$reject5 = item.reject) === null || _item$reject5 === void 0 || _item$reject5.call(item, cause);
					item.batch = null;
				}
			});
		}
	}
	function load(key) {
		var _dispatchTimer;
		const item = {
			aborted: false,
			key,
			batch: null,
			resolve: throwFatalError,
			reject: throwFatalError
		};
		const promise = new Promise((resolve, reject) => {
			var _pendingItems;
			item.reject = reject;
			item.resolve = resolve;
			(_pendingItems = pendingItems) !== null && _pendingItems !== void 0 || (pendingItems = []);
			pendingItems.push(item);
		});
		(_dispatchTimer = dispatchTimer) !== null && _dispatchTimer !== void 0 || (dispatchTimer = setTimeout(dispatch));
		return promise;
	}
	return { load };
}
/**
* Like `Promise.all()` but for abort signals
* - When all signals have been aborted, the merged signal will be aborted
* - If one signal is `null`, no signal will be aborted
*/
function allAbortSignals(...signals) {
	const ac = new AbortController();
	const count = signals.length;
	let abortedCount = 0;
	const onAbort = () => {
		if (++abortedCount === count) ac.abort();
	};
	for (const signal of signals) if (signal === null || signal === void 0 ? void 0 : signal.aborted) onAbort();
	else signal === null || signal === void 0 || signal.addEventListener("abort", onAbort, { once: true });
	return ac.signal;
}
var import_objectSpread2$7 = __toESM$1(require_objectSpread2$1(), 1);
/**
* @see https://trpc.io/docs/client/links/httpBatchLink
*/
function httpBatchLink(opts) {
	var _opts$maxURLLength, _opts$maxItems;
	const resolvedOpts = resolveHTTPLinkOptions(opts);
	const maxURLLength = (_opts$maxURLLength = opts.maxURLLength) !== null && _opts$maxURLLength !== void 0 ? _opts$maxURLLength : Infinity;
	const maxItems = (_opts$maxItems = opts.maxItems) !== null && _opts$maxItems !== void 0 ? _opts$maxItems : Infinity;
	return () => {
		const batchLoader = (type) => {
			return {
				validate(batchOps) {
					if (maxURLLength === Infinity && maxItems === Infinity) return true;
					if (batchOps.length > maxItems) return false;
					const path = batchOps.map((op) => op.path).join(",");
					const inputs = batchOps.map((op) => op.input);
					return getUrl((0, import_objectSpread2$7.default)((0, import_objectSpread2$7.default)({}, resolvedOpts), {}, {
						type,
						path,
						inputs,
						signal: null
					})).length <= maxURLLength;
				},
				async fetch(batchOps) {
					const path = batchOps.map((op) => op.path).join(",");
					const inputs = batchOps.map((op) => op.input);
					const signal = allAbortSignals(...batchOps.map((op) => op.signal));
					const res = await jsonHttpRequester((0, import_objectSpread2$7.default)((0, import_objectSpread2$7.default)({}, resolvedOpts), {}, {
						path,
						inputs,
						type,
						headers() {
							if (!opts.headers) return {};
							if (typeof opts.headers === "function") return opts.headers({ opList: batchOps });
							return opts.headers;
						},
						signal
					}));
					return (Array.isArray(res.json) ? res.json : batchOps.map(() => res.json)).map((item) => ({
						meta: res.meta,
						json: item
					}));
				}
			};
		};
		const loaders = {
			query: dataLoader(batchLoader("query")),
			mutation: dataLoader(batchLoader("mutation"))
		};
		return ({ op }) => {
			return observable((observer) => {
				/* istanbul ignore if -- @preserve */
				if (op.type === "subscription") throw new Error("Subscriptions are unsupported by `httpLink` - use `httpSubscriptionLink` or `wsLink`");
				const promise = loaders[op.type].load(op);
				let _res = void 0;
				promise.then((res) => {
					_res = res;
					const transformed = transformResult(res.json, resolvedOpts.transformer.output);
					if (!transformed.ok) {
						observer.error(TRPCClientError.from(transformed.error, { meta: res.meta }));
						return;
					}
					observer.next({
						context: res.meta,
						result: transformed.result
					});
					observer.complete();
				}).catch((err) => {
					observer.error(TRPCClientError.from(err, { meta: _res === null || _res === void 0 ? void 0 : _res.meta }));
				});
				return () => {};
			});
		};
	};
}
__toESM$1(require_objectSpread2$1(), 1);
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/wsLink-DSf4KOdW.mjs
var jsonEncoder = {
	encode: (data) => JSON.stringify(data),
	decode: (data) => {
		if (typeof data !== "string") throw new Error("jsonEncoder received binary data. JSON uses text frames. Use a binary encoder for binary data.");
		return JSON.parse(data);
	}
};
var lazyDefaults = {
	enabled: false,
	closeMs: 0
};
var keepAliveDefaults = {
	enabled: false,
	pongTimeoutMs: 1e3,
	intervalMs: 5e3
};
/**
* Calculates a delay for exponential backoff based on the retry attempt index.
* The delay starts at 0 for the first attempt and doubles for each subsequent attempt,
* capped at 30 seconds.
*/
var exponentialBackoff = (attemptIndex) => {
	return attemptIndex === 0 ? 0 : Math.min(1e3 * 2 ** attemptIndex, 3e4);
};
/**
* Get the result of a value or function that returns a value
* It also optionally accepts typesafe arguments for the function
*/
var resultOf = (value, ...args) => {
	return typeof value === "function" ? value(...args) : value;
};
var import_defineProperty$3 = __toESM$1(require_defineProperty$1(), 1);
var TRPCWebSocketClosedError = class TRPCWebSocketClosedError extends Error {
	constructor(opts) {
		super(opts.message, { cause: opts.cause });
		this.name = "TRPCWebSocketClosedError";
		Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
	}
};
/**
* Utility class for managing a timeout that can be started, stopped, and reset.
* Useful for scenarios where the timeout duration is reset dynamically based on events.
*/
var ResettableTimeout = class {
	constructor(onTimeout, timeoutMs) {
		this.onTimeout = onTimeout;
		this.timeoutMs = timeoutMs;
		(0, import_defineProperty$3.default)(this, "timeout", void 0);
	}
	/**
	* Resets the current timeout, restarting it with the same duration.
	* Does nothing if no timeout is active.
	*/
	reset() {
		if (!this.timeout) return;
		clearTimeout(this.timeout);
		this.timeout = setTimeout(this.onTimeout, this.timeoutMs);
	}
	start() {
		clearTimeout(this.timeout);
		this.timeout = setTimeout(this.onTimeout, this.timeoutMs);
	}
	stop() {
		clearTimeout(this.timeout);
		this.timeout = void 0;
	}
};
function withResolvers() {
	let resolve;
	let reject;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
}
/**
* Resolves a WebSocket URL and optionally appends connection parameters.
*
* If connectionParams are provided, appends 'connectionParams=1' query parameter.
*/
async function prepareUrl(urlOptions) {
	const url = await resultOf(urlOptions.url);
	if (!urlOptions.connectionParams) return url;
	return url + `${url.includes("?") ? "&" : "?"}connectionParams=1`;
}
async function buildConnectionMessage(connectionParams, encoder) {
	const message = {
		method: "connectionParams",
		data: await resultOf(connectionParams)
	};
	return encoder.encode(message);
}
var import_defineProperty$2 = __toESM$1(require_defineProperty$1(), 1);
/**
* Manages WebSocket requests, tracking their lifecycle and providing utility methods
* for handling outgoing and pending requests.
*
* - **Outgoing requests**: Requests that are queued and waiting to be sent.
* - **Pending requests**: Requests that have been sent and are in flight awaiting a response.
*   For subscriptions, multiple responses may be received until the subscription is closed.
*/
var RequestManager = class {
	constructor() {
		(0, import_defineProperty$2.default)(this, "outgoingRequests", new Array());
		(0, import_defineProperty$2.default)(this, "pendingRequests", {});
	}
	/**
	* Registers a new request by adding it to the outgoing queue and setting up
	* callbacks for lifecycle events such as completion or error.
	*
	* @param message - The outgoing message to be sent.
	* @param callbacks - Callback functions to observe the request's state.
	* @returns A cleanup function to manually remove the request.
	*/
	register(message, callbacks) {
		const { promise: end, resolve } = withResolvers();
		this.outgoingRequests.push({
			id: String(message.id),
			message,
			end,
			callbacks: {
				next: callbacks.next,
				complete: () => {
					callbacks.complete();
					resolve();
				},
				error: (e) => {
					callbacks.error(e);
					resolve();
				}
			}
		});
		return () => {
			this.delete(message.id);
			callbacks.complete();
			resolve();
		};
	}
	/**
	* Deletes a request from both the outgoing and pending collections, if it exists.
	*/
	delete(messageId) {
		if (messageId === null) return;
		this.outgoingRequests = this.outgoingRequests.filter(({ id }) => id !== String(messageId));
		delete this.pendingRequests[String(messageId)];
	}
	/**
	* Moves all outgoing requests to the pending state and clears the outgoing queue.
	*
	* The caller is expected to handle the actual sending of the requests
	* (e.g., sending them over the network) after this method is called.
	*
	* @returns The list of requests that were transitioned to the pending state.
	*/
	flush() {
		const requests = this.outgoingRequests;
		this.outgoingRequests = [];
		for (const request of requests) this.pendingRequests[request.id] = request;
		return requests;
	}
	/**
	* Retrieves all currently pending requests, which are in flight awaiting responses
	* or handling ongoing subscriptions.
	*/
	getPendingRequests() {
		return Object.values(this.pendingRequests);
	}
	/**
	* Retrieves a specific pending request by its message ID.
	*/
	getPendingRequest(messageId) {
		if (messageId === null) return null;
		return this.pendingRequests[String(messageId)];
	}
	/**
	* Retrieves all outgoing requests, which are waiting to be sent.
	*/
	getOutgoingRequests() {
		return this.outgoingRequests;
	}
	/**
	* Retrieves all requests, both outgoing and pending, with their respective states.
	*
	* @returns An array of all requests with their state ("outgoing" or "pending").
	*/
	getRequests() {
		return [...this.getOutgoingRequests().map((request) => ({
			state: "outgoing",
			message: request.message,
			end: request.end,
			callbacks: request.callbacks
		})), ...this.getPendingRequests().map((request) => ({
			state: "pending",
			message: request.message,
			end: request.end,
			callbacks: request.callbacks
		}))];
	}
	/**
	* Checks if there are any pending requests, including ongoing subscriptions.
	*/
	hasPendingRequests() {
		return this.getPendingRequests().length > 0;
	}
	/**
	* Checks if there are any pending subscriptions
	*/
	hasPendingSubscriptions() {
		return this.getPendingRequests().some((request) => request.message.method === "subscription");
	}
	/**
	* Checks if there are any outgoing requests waiting to be sent.
	*/
	hasOutgoingRequests() {
		return this.outgoingRequests.length > 0;
	}
};
var import_defineProperty$1 = __toESM$1(require_defineProperty$1(), 1);
/**
* Opens a WebSocket connection asynchronously and returns a promise
* that resolves when the connection is successfully established.
* The promise rejects if an error occurs during the connection attempt.
*/
function asyncWsOpen(ws) {
	const { promise, resolve, reject } = withResolvers();
	ws.addEventListener("open", () => {
		ws.removeEventListener("error", reject);
		resolve();
	});
	ws.addEventListener("error", reject);
	return promise;
}
/**
* Sets up a periodic ping-pong mechanism to keep the WebSocket connection alive.
*
* - Sends "PING" messages at regular intervals defined by `intervalMs`.
* - If a "PONG" response is not received within the `pongTimeoutMs`, the WebSocket is closed.
* - The ping timer resets upon receiving any message to maintain activity.
* - Automatically starts the ping process when the WebSocket connection is opened.
* - Cleans up timers when the WebSocket is closed.
*
* @param ws - The WebSocket instance to manage.
* @param options - Configuration options for ping-pong intervals and timeouts.
*/
function setupPingInterval(ws, { intervalMs, pongTimeoutMs }) {
	let pingTimeout;
	let pongTimeout;
	function start() {
		pingTimeout = setTimeout(() => {
			ws.send("PING");
			pongTimeout = setTimeout(() => {
				ws.close();
			}, pongTimeoutMs);
		}, intervalMs);
	}
	function reset() {
		clearTimeout(pingTimeout);
		start();
	}
	function pong() {
		clearTimeout(pongTimeout);
		reset();
	}
	ws.addEventListener("open", start);
	ws.addEventListener("message", ({ data }) => {
		clearTimeout(pingTimeout);
		start();
		if (data === "PONG") pong();
	});
	ws.addEventListener("close", () => {
		clearTimeout(pingTimeout);
		clearTimeout(pongTimeout);
	});
}
/**
* Manages a WebSocket connection with support for reconnection, keep-alive mechanisms,
* and observable state tracking.
*/
var WsConnection = class WsConnection {
	constructor(opts) {
		var _opts$WebSocketPonyfi;
		(0, import_defineProperty$1.default)(this, "id", ++WsConnection.connectCount);
		(0, import_defineProperty$1.default)(this, "WebSocketPonyfill", void 0);
		(0, import_defineProperty$1.default)(this, "urlOptions", void 0);
		(0, import_defineProperty$1.default)(this, "keepAliveOpts", void 0);
		(0, import_defineProperty$1.default)(this, "encoder", void 0);
		(0, import_defineProperty$1.default)(this, "wsObservable", behaviorSubject(null));
		(0, import_defineProperty$1.default)(this, "openPromise", null);
		this.WebSocketPonyfill = (_opts$WebSocketPonyfi = opts.WebSocketPonyfill) !== null && _opts$WebSocketPonyfi !== void 0 ? _opts$WebSocketPonyfi : WebSocket;
		if (!this.WebSocketPonyfill) throw new Error("No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill");
		this.urlOptions = opts.urlOptions;
		this.keepAliveOpts = opts.keepAlive;
		this.encoder = opts.encoder;
	}
	get ws() {
		return this.wsObservable.get();
	}
	set ws(ws) {
		this.wsObservable.next(ws);
	}
	/**
	* Checks if the WebSocket connection is open and ready to communicate.
	*/
	isOpen() {
		return !!this.ws && this.ws.readyState === this.WebSocketPonyfill.OPEN && !this.openPromise;
	}
	/**
	* Checks if the WebSocket connection is closed or in the process of closing.
	*/
	isClosed() {
		return !!this.ws && (this.ws.readyState === this.WebSocketPonyfill.CLOSING || this.ws.readyState === this.WebSocketPonyfill.CLOSED);
	}
	async open() {
		var _this = this;
		if (_this.openPromise) return _this.openPromise;
		_this.id = ++WsConnection.connectCount;
		_this.openPromise = prepareUrl(_this.urlOptions).then((url) => new _this.WebSocketPonyfill(url)).then(async (ws) => {
			_this.ws = ws;
			ws.binaryType = "arraybuffer";
			ws.addEventListener("message", function({ data }) {
				if (data === "PING") this.send("PONG");
			});
			if (_this.keepAliveOpts.enabled) setupPingInterval(ws, _this.keepAliveOpts);
			ws.addEventListener("close", () => {
				if (_this.ws === ws) _this.ws = null;
			});
			await asyncWsOpen(ws);
			if (_this.urlOptions.connectionParams) ws.send(await buildConnectionMessage(_this.urlOptions.connectionParams, _this.encoder));
		});
		try {
			await _this.openPromise;
		} finally {
			_this.openPromise = null;
		}
	}
	/**
	* Closes the WebSocket connection gracefully.
	* Waits for any ongoing open operation to complete before closing.
	*/
	async close() {
		var _this2 = this;
		try {
			await _this2.openPromise;
		} finally {
			var _this$ws;
			(_this$ws = _this2.ws) === null || _this$ws === void 0 || _this$ws.close();
		}
	}
};
(0, import_defineProperty$1.default)(WsConnection, "connectCount", 0);
/**
* Provides a backward-compatible representation of the connection state.
*/
function backwardCompatibility(connection) {
	if (connection.isOpen()) return {
		id: connection.id,
		state: "open",
		ws: connection.ws
	};
	if (connection.isClosed()) return {
		id: connection.id,
		state: "closed",
		ws: connection.ws
	};
	if (!connection.ws) return null;
	return {
		id: connection.id,
		state: "connecting",
		ws: connection.ws
	};
}
var import_defineProperty$4 = __toESM$1(require_defineProperty$1(), 1);
var import_objectSpread2$5 = __toESM$1(require_objectSpread2$1(), 1);
/**
* A WebSocket client for managing TRPC operations, supporting lazy initialization,
* reconnection, keep-alive, and request management.
*/
var WsClient = class {
	constructor(opts) {
		var _opts$experimental_en, _opts$retryDelayMs;
		(0, import_defineProperty$4.default)(this, "connectionState", void 0);
		(0, import_defineProperty$4.default)(this, "allowReconnect", false);
		(0, import_defineProperty$4.default)(this, "requestManager", new RequestManager());
		(0, import_defineProperty$4.default)(this, "activeConnection", void 0);
		(0, import_defineProperty$4.default)(this, "reconnectRetryDelay", void 0);
		(0, import_defineProperty$4.default)(this, "inactivityTimeout", void 0);
		(0, import_defineProperty$4.default)(this, "callbacks", void 0);
		(0, import_defineProperty$4.default)(this, "lazyMode", void 0);
		(0, import_defineProperty$4.default)(this, "encoder", void 0);
		(0, import_defineProperty$4.default)(this, "reconnecting", null);
		this.encoder = (_opts$experimental_en = opts.experimental_encoder) !== null && _opts$experimental_en !== void 0 ? _opts$experimental_en : jsonEncoder;
		this.callbacks = {
			onOpen: opts.onOpen,
			onClose: opts.onClose,
			onError: opts.onError
		};
		const lazyOptions = (0, import_objectSpread2$5.default)((0, import_objectSpread2$5.default)({}, lazyDefaults), opts.lazy);
		this.inactivityTimeout = new ResettableTimeout(() => {
			if (this.requestManager.hasOutgoingRequests() || this.requestManager.hasPendingRequests()) {
				this.inactivityTimeout.reset();
				return;
			}
			this.close().catch(() => null);
		}, lazyOptions.closeMs);
		this.activeConnection = new WsConnection({
			WebSocketPonyfill: opts.WebSocket,
			urlOptions: opts,
			keepAlive: (0, import_objectSpread2$5.default)((0, import_objectSpread2$5.default)({}, keepAliveDefaults), opts.keepAlive),
			encoder: this.encoder
		});
		this.activeConnection.wsObservable.subscribe({ next: (ws) => {
			if (!ws) return;
			this.setupWebSocketListeners(ws);
		} });
		this.reconnectRetryDelay = (_opts$retryDelayMs = opts.retryDelayMs) !== null && _opts$retryDelayMs !== void 0 ? _opts$retryDelayMs : exponentialBackoff;
		this.lazyMode = lazyOptions.enabled;
		this.connectionState = behaviorSubject({
			type: "state",
			state: lazyOptions.enabled ? "idle" : "connecting",
			error: null
		});
		if (!this.lazyMode) this.open().catch(() => null);
	}
	/**
	* Opens the WebSocket connection. Handles reconnection attempts and updates
	* the connection state accordingly.
	*/
	async open() {
		var _this = this;
		_this.allowReconnect = true;
		if (_this.connectionState.get().state === "idle") _this.connectionState.next({
			type: "state",
			state: "connecting",
			error: null
		});
		try {
			await _this.activeConnection.open();
		} catch (error) {
			_this.reconnect(new TRPCWebSocketClosedError({
				message: "Initialization error",
				cause: error
			}));
			return _this.reconnecting;
		}
	}
	/**
	* Closes the WebSocket connection and stops managing requests.
	* Ensures all outgoing and pending requests are properly finalized.
	*/
	async close() {
		var _this2 = this;
		_this2.allowReconnect = false;
		_this2.inactivityTimeout.stop();
		const requestsToAwait = [];
		for (const request of _this2.requestManager.getRequests()) if (request.message.method === "subscription") request.callbacks.complete();
		else if (request.state === "outgoing") request.callbacks.error(TRPCClientError.from(new TRPCWebSocketClosedError({ message: "Closed before connection was established" })));
		else requestsToAwait.push(request.end);
		await Promise.all(requestsToAwait).catch(() => null);
		await _this2.activeConnection.close().catch(() => null);
		_this2.connectionState.next({
			type: "state",
			state: "idle",
			error: null
		});
	}
	/**
	* Method to request the server.
	* Handles data transformation, batching of requests, and subscription lifecycle.
	*
	* @param op - The operation details including id, type, path, input and signal
	* @param transformer - Data transformer for serializing requests and deserializing responses
	* @param lastEventId - Optional ID of the last received event for subscriptions
	*
	* @returns An observable that emits operation results and handles cleanup
	*/
	request({ op: { id, type, path, input, signal }, transformer, lastEventId }) {
		return observable((observer) => {
			const abort = this.batchSend({
				id,
				method: type,
				params: {
					input: transformer.input.serialize(input),
					path,
					lastEventId
				}
			}, (0, import_objectSpread2$5.default)((0, import_objectSpread2$5.default)({}, observer), {}, { next(event) {
				const transformed = transformResult(event, transformer.output);
				if (!transformed.ok) {
					observer.error(TRPCClientError.from(transformed.error));
					return;
				}
				observer.next({ result: transformed.result });
			} }));
			return () => {
				abort();
				if (type === "subscription" && this.activeConnection.isOpen()) this.send({
					id,
					method: "subscription.stop"
				});
				signal === null || signal === void 0 || signal.removeEventListener("abort", abort);
			};
		});
	}
	get connection() {
		return backwardCompatibility(this.activeConnection);
	}
	reconnect(closedError) {
		var _this3 = this;
		this.connectionState.next({
			type: "state",
			state: "connecting",
			error: TRPCClientError.from(closedError)
		});
		if (this.reconnecting) return;
		const tryReconnect = async (attemptIndex) => {
			try {
				await sleep(_this3.reconnectRetryDelay(attemptIndex));
				if (_this3.allowReconnect) {
					await _this3.activeConnection.close();
					await _this3.activeConnection.open();
					if (_this3.requestManager.hasPendingRequests()) _this3.send(_this3.requestManager.getPendingRequests().map(({ message }) => message));
				}
				_this3.reconnecting = null;
			} catch (_unused) {
				await tryReconnect(attemptIndex + 1);
			}
		};
		this.reconnecting = tryReconnect(0);
	}
	setupWebSocketListeners(ws) {
		var _this4 = this;
		const handleCloseOrError = (cause) => {
			const reqs = this.requestManager.getPendingRequests();
			for (const { message, callbacks } of reqs) {
				if (message.method === "subscription") continue;
				callbacks.error(TRPCClientError.from(cause !== null && cause !== void 0 ? cause : new TRPCWebSocketClosedError({
					message: "WebSocket closed",
					cause
				})));
				this.requestManager.delete(message.id);
			}
		};
		ws.addEventListener("open", () => {
			run(async () => {
				var _this$callbacks$onOpe, _this$callbacks;
				if (_this4.lazyMode) _this4.inactivityTimeout.start();
				(_this$callbacks$onOpe = (_this$callbacks = _this4.callbacks).onOpen) === null || _this$callbacks$onOpe === void 0 || _this$callbacks$onOpe.call(_this$callbacks);
				_this4.connectionState.next({
					type: "state",
					state: "pending",
					error: null
				});
			}).catch((error) => {
				ws.close(3e3);
				handleCloseOrError(error);
			});
		});
		ws.addEventListener("message", ({ data }) => {
			this.inactivityTimeout.reset();
			if (["PING", "PONG"].includes(data)) return;
			const incomingMessage = this.encoder.decode(data);
			if ("method" in incomingMessage) {
				this.handleIncomingRequest(incomingMessage);
				return;
			}
			this.handleResponseMessage(incomingMessage);
		});
		ws.addEventListener("close", (event) => {
			var _this$callbacks$onClo, _this$callbacks2;
			handleCloseOrError(event);
			(_this$callbacks$onClo = (_this$callbacks2 = this.callbacks).onClose) === null || _this$callbacks$onClo === void 0 || _this$callbacks$onClo.call(_this$callbacks2, event);
			if (!this.lazyMode || this.requestManager.hasPendingSubscriptions()) this.reconnect(new TRPCWebSocketClosedError({
				message: "WebSocket closed",
				cause: event
			}));
		});
		ws.addEventListener("error", (event) => {
			var _this$callbacks$onErr, _this$callbacks3;
			handleCloseOrError(event);
			(_this$callbacks$onErr = (_this$callbacks3 = this.callbacks).onError) === null || _this$callbacks$onErr === void 0 || _this$callbacks$onErr.call(_this$callbacks3, event);
			this.reconnect(new TRPCWebSocketClosedError({
				message: "WebSocket closed",
				cause: event
			}));
		});
	}
	handleResponseMessage(message) {
		const request = this.requestManager.getPendingRequest(message.id);
		if (!request) return;
		request.callbacks.next(message);
		let completed = true;
		if ("result" in message && request.message.method === "subscription") {
			if (message.result.type === "data") request.message.params.lastEventId = message.result.id;
			if (message.result.type !== "stopped") completed = false;
		}
		if (completed) {
			request.callbacks.complete();
			this.requestManager.delete(message.id);
		}
	}
	handleIncomingRequest(message) {
		if (message.method === "reconnect") this.reconnect(new TRPCWebSocketClosedError({ message: "Server requested reconnect" }));
	}
	/**
	* Sends a message or batch of messages directly to the server.
	*/
	send(messageOrMessages) {
		if (!this.activeConnection.isOpen()) throw new Error("Active connection is not open");
		const messages = messageOrMessages instanceof Array ? messageOrMessages : [messageOrMessages];
		this.activeConnection.ws.send(this.encoder.encode(messages.length === 1 ? messages[0] : messages));
	}
	/**
	* Groups requests for batch sending.
	*
	* @returns A function to abort the batched request.
	*/
	batchSend(message, callbacks) {
		var _this5 = this;
		this.inactivityTimeout.reset();
		run(async () => {
			if (!_this5.activeConnection.isOpen()) await _this5.open();
			await sleep(0);
			if (!_this5.requestManager.hasOutgoingRequests()) return;
			_this5.send(_this5.requestManager.flush().map(({ message: message$1 }) => message$1));
		}).catch((err) => {
			this.requestManager.delete(message.id);
			callbacks.error(TRPCClientError.from(err));
		});
		return this.requestManager.register(message, callbacks);
	}
};
function createWSClient(opts) {
	return new WsClient(opts);
}
function wsLink(opts) {
	const { client } = opts;
	const transformer = getTransformer(opts.transformer);
	return () => {
		return ({ op }) => {
			return observable((observer) => {
				const connStateSubscription = op.type === "subscription" ? client.connectionState.subscribe({ next(result) {
					observer.next({
						result,
						context: op.context
					});
				} }) : null;
				const requestSubscription = client.request({
					op,
					transformer
				}).subscribe(observer);
				return () => {
					requestSubscription.unsubscribe();
					connStateSubscription === null || connStateSubscription === void 0 || connStateSubscription.unsubscribe();
				};
			});
		};
	};
}
//#endregion
//#region ../../node_modules/.pnpm/@trpc+client@11.17.0_@trpc+server@11.17.0_typescript@5.9.3__typescript@5.9.3/node_modules/@trpc/client/dist/index.mjs
var import_defineProperty = __toESM$1(require_defineProperty$1(), 1);
var import_objectSpread2$4 = __toESM$1(require_objectSpread2$1(), 1);
var TRPCUntypedClient = class {
	constructor(opts) {
		(0, import_defineProperty.default)(this, "links", void 0);
		(0, import_defineProperty.default)(this, "runtime", void 0);
		(0, import_defineProperty.default)(this, "requestId", void 0);
		this.requestId = 0;
		this.runtime = {};
		this.links = opts.links.map((link) => link(this.runtime));
	}
	$request(opts) {
		var _opts$context;
		return createChain({
			links: this.links,
			op: (0, import_objectSpread2$4.default)((0, import_objectSpread2$4.default)({}, opts), {}, {
				context: (_opts$context = opts.context) !== null && _opts$context !== void 0 ? _opts$context : {},
				id: ++this.requestId
			})
		}).pipe(share());
	}
	async requestAsPromise(opts) {
		var _this = this;
		try {
			return (await observableToPromise(_this.$request(opts))).result.data;
		} catch (err) {
			throw TRPCClientError.from(err);
		}
	}
	query(path, input, opts) {
		return this.requestAsPromise({
			type: "query",
			path,
			input,
			context: opts === null || opts === void 0 ? void 0 : opts.context,
			signal: opts === null || opts === void 0 ? void 0 : opts.signal
		});
	}
	mutation(path, input, opts) {
		return this.requestAsPromise({
			type: "mutation",
			path,
			input,
			context: opts === null || opts === void 0 ? void 0 : opts.context,
			signal: opts === null || opts === void 0 ? void 0 : opts.signal
		});
	}
	subscription(path, input, opts) {
		return this.$request({
			type: "subscription",
			path,
			input,
			context: opts.context,
			signal: opts.signal
		}).subscribe({
			next(envelope) {
				switch (envelope.result.type) {
					case "state":
						var _opts$onConnectionSta;
						(_opts$onConnectionSta = opts.onConnectionStateChange) === null || _opts$onConnectionSta === void 0 || _opts$onConnectionSta.call(opts, envelope.result);
						break;
					case "started":
						var _opts$onStarted;
						(_opts$onStarted = opts.onStarted) === null || _opts$onStarted === void 0 || _opts$onStarted.call(opts, { context: envelope.context });
						break;
					case "stopped":
						var _opts$onStopped;
						(_opts$onStopped = opts.onStopped) === null || _opts$onStopped === void 0 || _opts$onStopped.call(opts);
						break;
					case "data":
					case void 0:
						var _opts$onData;
						(_opts$onData = opts.onData) === null || _opts$onData === void 0 || _opts$onData.call(opts, envelope.result.data);
						break;
				}
			},
			error(err) {
				var _opts$onError;
				(_opts$onError = opts.onError) === null || _opts$onError === void 0 || _opts$onError.call(opts, err);
			},
			complete() {
				var _opts$onComplete;
				(_opts$onComplete = opts.onComplete) === null || _opts$onComplete === void 0 || _opts$onComplete.call(opts);
			}
		});
	}
};
var untypedClientSymbol = Symbol.for("trpc_untypedClient");
var clientCallTypeMap = {
	query: "query",
	mutate: "mutation",
	subscribe: "subscription"
};
/** @internal */
var clientCallTypeToProcedureType = (clientCallType) => {
	return clientCallTypeMap[clientCallType];
};
/**
* @internal
*/
function createTRPCClientProxy(client) {
	const proxy = createRecursiveProxy(({ path, args }) => {
		const pathCopy = [...path];
		const procedureType = clientCallTypeToProcedureType(pathCopy.pop());
		const fullPath = pathCopy.join(".");
		return client[procedureType](fullPath, ...args);
	});
	return createFlatProxy((key) => {
		if (key === untypedClientSymbol) return client;
		return proxy[key];
	});
}
function createTRPCClient(opts) {
	return createTRPCClientProxy(new TRPCUntypedClient(opts));
}
__toESM$1(require_objectSpread2$1(), 1);
var import_objectSpread2$2 = __toESM$1(require_objectSpread2$1(), 1);
function inputWithTrackedEventId(input, lastEventId) {
	if (!lastEventId) return input;
	if (input != null && typeof input !== "object") return input;
	return (0, import_objectSpread2$2.default)((0, import_objectSpread2$2.default)({}, input !== null && input !== void 0 ? input : {}), {}, { lastEventId });
}
__toESM$1(__commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/asyncIterator.js"(exports, module) {
	function _asyncIterator$1(r) {
		var n, t, o, e = 2;
		for ("undefined" != typeof Symbol && (t = Symbol.asyncIterator, o = Symbol.iterator); e--;) {
			if (t && null != (n = r[t])) return n.call(r);
			if (o && null != (n = r[o])) return new AsyncFromSyncIterator(n.call(r));
			t = "@@asyncIterator", o = "@@iterator";
		}
		throw new TypeError("Object is not async iterable");
	}
	function AsyncFromSyncIterator(r) {
		function AsyncFromSyncIteratorContinuation(r$1) {
			if (Object(r$1) !== r$1) return Promise.reject(/* @__PURE__ */ new TypeError(r$1 + " is not an object."));
			var n = r$1.done;
			return Promise.resolve(r$1.value).then(function(r$2) {
				return {
					value: r$2,
					done: n
				};
			});
		}
		return AsyncFromSyncIterator = function AsyncFromSyncIterator$1(r$1) {
			this.s = r$1, this.n = r$1.next;
		}, AsyncFromSyncIterator.prototype = {
			s: null,
			n: null,
			next: function next() {
				return AsyncFromSyncIteratorContinuation(this.n.apply(this.s, arguments));
			},
			"return": function _return(r$1) {
				var n = this.s["return"];
				return void 0 === n ? Promise.resolve({
					value: r$1,
					done: !0
				}) : AsyncFromSyncIteratorContinuation(n.apply(this.s, arguments));
			},
			"throw": function _throw(r$1) {
				var n = this.s["return"];
				return void 0 === n ? Promise.reject(r$1) : AsyncFromSyncIteratorContinuation(n.apply(this.s, arguments));
			}
		}, new AsyncFromSyncIterator(r);
	}
	module.exports = _asyncIterator$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} })(), 1);
var import_objectSpread2$1 = __toESM$1(require_objectSpread2$1(), 1);
/**
* @see https://trpc.io/docs/v11/client/links/retryLink
*/
function retryLink(opts) {
	return () => {
		return (callOpts) => {
			return observable((observer) => {
				let next$;
				let callNextTimeout = void 0;
				let lastEventId = void 0;
				attempt(1);
				function opWithLastEventId() {
					const op = callOpts.op;
					if (!lastEventId) return op;
					return (0, import_objectSpread2$1.default)((0, import_objectSpread2$1.default)({}, op), {}, { input: inputWithTrackedEventId(op.input, lastEventId) });
				}
				function attempt(attempts) {
					const op = opWithLastEventId();
					next$ = callOpts.next(op).subscribe({
						error(error) {
							var _opts$retryDelayMs, _opts$retryDelayMs2;
							if (!opts.retry({
								op,
								attempts,
								error
							})) {
								observer.error(error);
								return;
							}
							const delayMs = (_opts$retryDelayMs = (_opts$retryDelayMs2 = opts.retryDelayMs) === null || _opts$retryDelayMs2 === void 0 ? void 0 : _opts$retryDelayMs2.call(opts, attempts)) !== null && _opts$retryDelayMs !== void 0 ? _opts$retryDelayMs : 0;
							if (delayMs <= 0) {
								attempt(attempts + 1);
								return;
							}
							callNextTimeout = setTimeout(() => attempt(attempts + 1), delayMs);
						},
						next(envelope) {
							if ((!envelope.result.type || envelope.result.type === "data") && envelope.result.id) lastEventId = envelope.result.id;
							observer.next(envelope);
						},
						complete() {
							observer.complete();
						}
					});
				}
				return () => {
					next$.unsubscribe();
					clearTimeout(callNextTimeout);
				};
			});
		};
	};
}
var require_usingCtx = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/usingCtx.js"(exports, module) {
	function _usingCtx() {
		var r = "function" == typeof SuppressedError ? SuppressedError : function(r$1, e$1) {
			var n$1 = Error();
			return n$1.name = "SuppressedError", n$1.error = r$1, n$1.suppressed = e$1, n$1;
		}, e = {}, n = [];
		function using(r$1, e$1) {
			if (null != e$1) {
				if (Object(e$1) !== e$1) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
				if (r$1) var o = e$1[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
				if (void 0 === o && (o = e$1[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r$1)) var t = o;
				if ("function" != typeof o) throw new TypeError("Object is not disposable.");
				t && (o = function o$1() {
					try {
						t.call(e$1);
					} catch (r$2) {
						return Promise.reject(r$2);
					}
				}), n.push({
					v: e$1,
					d: o,
					a: r$1
				});
			} else r$1 && n.push({
				d: e$1,
				a: r$1
			});
			return e$1;
		}
		return {
			e,
			u: using.bind(null, !1),
			a: using.bind(null, !0),
			d: function d() {
				var o, t = this.e, s = 0;
				function next() {
					for (; o = n.pop();) try {
						if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
						if (o.d) {
							var r$1 = o.d.call(o.v);
							if (o.a) return s |= 2, Promise.resolve(r$1).then(next, err);
						} else s |= 1;
					} catch (r$2) {
						return err(r$2);
					}
					if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
					if (t !== e) throw t;
				}
				function err(n$1) {
					return t = t !== e ? new r(n$1, t) : n$1, next();
				}
				return next();
			}
		};
	}
	module.exports = _usingCtx, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_OverloadYield = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/OverloadYield.js"(exports, module) {
	function _OverloadYield(e, d) {
		this.v = e, this.k = d;
	}
	module.exports = _OverloadYield, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_awaitAsyncGenerator = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/awaitAsyncGenerator.js"(exports, module) {
	var OverloadYield$1 = require_OverloadYield();
	function _awaitAsyncGenerator$1(e) {
		return new OverloadYield$1(e, 0);
	}
	module.exports = _awaitAsyncGenerator$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
var require_wrapAsyncGenerator = __commonJS$1({ "../../node_modules/.pnpm/@oxc-project+runtime@0.72.2/node_modules/@oxc-project/runtime/src/helpers/wrapAsyncGenerator.js"(exports, module) {
	var OverloadYield = require_OverloadYield();
	function _wrapAsyncGenerator$1(e) {
		return function() {
			return new AsyncGenerator(e.apply(this, arguments));
		};
	}
	function AsyncGenerator(e) {
		var r, t;
		function resume(r$1, t$1) {
			try {
				var n = e[r$1](t$1), o = n.value, u = o instanceof OverloadYield;
				Promise.resolve(u ? o.v : o).then(function(t$2) {
					if (u) {
						var i = "return" === r$1 ? "return" : "next";
						if (!o.k || t$2.done) return resume(i, t$2);
						t$2 = e[i](t$2).value;
					}
					settle(n.done ? "return" : "normal", t$2);
				}, function(e$1) {
					resume("throw", e$1);
				});
			} catch (e$1) {
				settle("throw", e$1);
			}
		}
		function settle(e$1, n) {
			switch (e$1) {
				case "return":
					r.resolve({
						value: n,
						done: !0
					});
					break;
				case "throw":
					r.reject(n);
					break;
				default: r.resolve({
					value: n,
					done: !1
				});
			}
			(r = r.next) ? resume(r.key, r.arg) : t = null;
		}
		this._invoke = function(e$1, n) {
			return new Promise(function(o, u) {
				var i = {
					key: e$1,
					arg: n,
					resolve: o,
					reject: u,
					next: null
				};
				t ? t = t.next = i : (r = t = i, resume(e$1, n));
			});
		}, "function" != typeof e["return"] && (this["return"] = void 0);
	}
	AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function() {
		return this;
	}, AsyncGenerator.prototype.next = function(e) {
		return this._invoke("next", e);
	}, AsyncGenerator.prototype["throw"] = function(e) {
		return this._invoke("throw", e);
	}, AsyncGenerator.prototype["return"] = function(e) {
		return this._invoke("return", e);
	};
	module.exports = _wrapAsyncGenerator$1, module.exports.__esModule = true, module.exports["default"] = module.exports;
} });
__toESM$1(require_usingCtx(), 1);
__toESM$1(require_awaitAsyncGenerator(), 1);
__toESM$1(require_wrapAsyncGenerator(), 1);
__toESM$1(require_objectSpread2$1(), 1);
//#endregion
//#region ../send/frontend/src/lib/config.ts
var TRPC_WS_PATH = `/trpc/ws`;
//#endregion
//#region ../send/frontend/src/lib/trpc.ts
/**
* This is the client-side code that uses the inferred types from the server
*/
var serverUrl = "https://send-backend.tb.pro".trim();
var refreshUrl = `${serverUrl}/api/auth/refresh`;
var trpcUrl = `${serverUrl}/trpc`;
/**
* Detect whether we're running in a test/automation context, where the
* WebSocket must stay closed.
*
* Unit tests inject `import.meta.env.VITE_TESTING`. When that build-time flag is
* unavailable — as in the shipped background bundle — fall back to the presence
* of the WebExtension `browser.test` API, which the Thunderbird/Firefox test
* harness only exposes when the add-on is loaded under automation. This keeps a
* logged-out automation profile from ever opening the socket at startup.
*/
function detectTesting() {
	return typeof browser !== "undefined" && Boolean(browser.test);
}
var isTesting = detectTesting();
/**
* Decide how (and whether) to build the WebSocket client.
*
* Returns `null` — meaning "do not connect" — when running under unit tests or
* when no backend host is configured (empty `serverUrl`). Otherwise returns the
* client config with **lazy mode** enabled.
*
* Lazy mode is critical: the background page of the built-in/system add-on
* imports this module on every Thunderbird launch, including fresh,
* never-signed-in profiles. A non-lazy client opens the socket as a side effect
* of construction (at module load), which under automation triggers a fatal
* "non-local network connections are disabled" abort and crashes the process
* before any feature is used. With lazy mode the connection is deferred until
* the first subscription actually runs (i.e. an authenticated user is using a
* feature) and is closed again after inactivity, so a logged-out profile makes
* zero outbound connections at startup.
*/
function getWsClientConfig(url, testing) {
	const normalizedUrl = url.trim();
	if (testing || normalizedUrl.length === 0) return null;
	return {
		url: `${normalizedUrl}${TRPC_WS_PATH}`,
		lazy: {
			enabled: true,
			closeMs: 1e3
		}
	};
}
var wsClientConfig = getWsClientConfig(serverUrl, isTesting);
var wsClient = wsClientConfig ? createWSClient(wsClientConfig) : null;
/**
* We only import the `AppRouter` type from the server - this is not available at runtime
*/
async function fetchWithLogoutCheck(url, options) {
	async function getAuthStore() {
		const { useAuthStore } = await Promise.resolve().then(() => auth_store_exports);
		return useAuthStore();
	}
	async function buildHeaders() {
		const headers = new Headers(options.headers);
		try {
			if (!headers.has("Authorization")) {
				const token = await (await getAuthStore()).getAccessToken();
				if (token) headers.set("Authorization", `Bearer ${token}`);
			}
		} catch {}
		return headers;
	}
	const res = await fetch(url, {
		...options,
		headers: await buildHeaders(),
		credentials: "include"
	});
	if (res.headers?.get?.("x-logout")) try {
		if (await (await getAuthStore()).recoverOrForceLogout()) return await fetch(url, {
			...options,
			headers: await buildHeaders(),
			credentials: "include"
		});
	} catch (error) {
		console.error("Forced-logout handling failed:", error);
	}
	return res;
}
var trpc = createTRPCClient({ links: [splitLink({
	condition: (op) => op.type === "subscription",
	false: [retryLink({ 
	/**
	* Retry strategy for failed requests:
	* - For 401 unauthorized errors: Attempts to refresh the token and retries up to 3 times
	* - For queries (not mutations): Retries up to 3 times
	* - For all other cases: No retry
	*/
retry(opts) {
		if (opts.error.data?.code === "UNAUTHORIZED") {
			if (opts.op.type !== "query") return false;
			fetch(refreshUrl, { credentials: "include" }).then(() => {
				console.info("revalidated token");
			}).catch((err) => {
				console.info("could not revalidate token", err);
			});
			return opts.attempts <= 3;
		}
	} }), httpBatchLink({
		url: trpcUrl,
		fetch: fetchWithLogoutCheck
	})],
	true: wsClient ? [wsLink({ client: wsClient })] : [httpBatchLink({
		url: trpcUrl,
		fetch: fetchWithLogoutCheck
	})]
})] });
//#endregion
//#region ../send/frontend/src/lib/api.ts
var ApiConnection = class {
	constructor(serverUrl) {
		if (!serverUrl) throw Error("No Server URL provided.");
		const u = new URL(serverUrl);
		this.serverUrl = u.origin;
		this.getStorageType().then((isBucketStorage) => {
			this.isBucketStorage = isBucketStorage;
		});
	}
	async getStorageType() {
		return true;
	}
	toString() {
		return this.serverUrl;
	}
	async removeAuthToken() {
		await this.call("api/auth/oidc/logout");
	}
	async call(path, body = {}, method = "GET", headers = {}, options) {
		const url = `${this.serverUrl}/api/${path}`;
		const refreshTokenUrl = `${this.serverUrl}/api/auth/refresh`;
		const requestHeaders = { ...headers };
		if (!requestHeaders["Authorization"]) try {
			const { useAuthStore } = await Promise.resolve().then(() => auth_store_exports);
			const accessToken = await useAuthStore().getAccessToken();
			if (accessToken) requestHeaders["Authorization"] = `Bearer ${accessToken}`;
		} catch (error) {
			console.debug("Could not get OIDC token for request:", error);
		}
		const opts = {
			mode: "cors",
			credentials: "include",
			method,
			headers: {
				"content-type": "application/json",
				...requestHeaders
			}
		};
		if (method.trim().toUpperCase() === "POST") opts.body = JSON.stringify({ ...body });
		let resp;
		try {
			resp = await fetch(url, opts);
		} catch (e) {
			console.log(e);
			options?.onFailure?.({
				kind: "network",
				status: null,
				error: e
			});
			return null;
		}
		if (resp.headers?.get?.("x-logout")) try {
			const { useAuthStore } = await Promise.resolve().then(() => auth_store_exports);
			const authStore = useAuthStore();
			if (!await authStore.recoverOrForceLogout()) return null;
			const newToken = await authStore.getAccessToken();
			if (newToken) {
				opts.headers["Authorization"] = `Bearer ${newToken}`;
				resp = await fetch(url, opts);
			}
		} catch (error) {
			console.error("Forced-logout handling failed:", error);
			return null;
		}
		else if (resp.status === 401) if (requestHeaders["Authorization"]) try {
			const { useAuthStore } = await Promise.resolve().then(() => auth_store_exports);
			const newToken = await useAuthStore().refreshToken();
			if (newToken) {
				opts.headers["Authorization"] = `Bearer ${newToken}`;
				resp = await fetch(url, opts);
			}
		} catch (error) {
			console.error("Token refresh failed:", error);
			options?.onFailure?.({
				kind: "network",
				status: null,
				error
			});
			return null;
		}
		else try {
			await fetch(refreshTokenUrl, {
				credentials: "include",
				mode: "cors"
			});
			resp = await fetch(url, opts);
		} catch (error) {
			console.log(error);
			options?.onFailure?.({
				kind: "network",
				status: null,
				error
			});
			return null;
		}
		if (!resp.ok) {
			let body;
			try {
				body = (await resp.text()).slice(0, 500);
			} catch {
				body = void 0;
			}
			options?.onFailure?.({
				kind: "http",
				status: resp.status,
				statusText: resp.statusText,
				body
			});
			return null;
		}
		if (!!options?.fullResponse) return resp;
		return resp.json();
	}
};
//#endregion
//#region ../send/frontend/src/stores/api-store.ts
var useApiStore = defineStore("api", () => {
	const url = useConfigStore().serverUrl;
	return { api: new ApiConnection(url) };
});
//#endregion
//#region ../send/frontend/src/lib/init.ts
/**
* Loads user and keychain from storage; creates default folder if necessary.
* @param {UserStore} userStore - Pinia store for managing user.
* @param {Keychain} keychain - Instance of Keychain class.
* @param {FolderStore} folderStore - Pinia store for managing folders.
* @return {Promise<INIT_ERRORS>} - Returns Promise of 0 (success) or an error code typed by INIT_ERRORS.
*/
async function _init(userStore, keychain, folderStore) {
	const hasUser = await userStore.loadFromLocalStorage();
	const hasKeychain = await keychain.load();
	if (!hasUser) return INIT_ERRORS.NO_USER;
	if (!hasKeychain) return INIT_ERRORS.NO_KEYCHAIN;
	try {
		const { api } = useApiStore();
		await restoreKeysUsingLocalStorage(keychain, api);
	} catch (error) {
		console.warn("init(): could not restore keys before folder check", error);
	}
	await folderStore.sync();
	const defaultFolder = folderStore?.defaultFolder;
	const defaultFolderKeyIsMissing = defaultFolder && !keychain.keys[defaultFolder.id];
	if (defaultFolderKeyIsMissing) {
		console.warn(`Default folder ${defaultFolder.id} exists but has no key. Deleting orphaned container and recreating.`);
		await folderStore.deleteFolder(defaultFolder.id);
	}
	if (!defaultFolder || defaultFolderKeyIsMissing) {
		if (!(await folderStore.createFolder())?.id) return INIT_ERRORS.COULD_NOT_CREATE_DEFAULT_FOLDER;
	}
	return INIT_ERRORS.NONE;
}
var inFlight = null;
function init$1(userStore, keychain, folderStore) {
	if (inFlight) return inFlight;
	inFlight = _init(userStore, keychain, folderStore).finally(() => {
		inFlight = null;
	});
	return inFlight;
}
/*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/
//#endregion
//#region ../send/frontend/src/lib/utils.ts
var import_jszip_min = /* @__PURE__ */ __toESM$2((/* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(e) {
		if ("object" == typeof exports && "undefined" != typeof module) module.exports = e();
		else if ("function" == typeof define && define.amd) define([], e);
		else ("undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof self ? self : this).JSZip = e();
	})(function() {
		return function s(a, o, h) {
			function u(r, e) {
				if (!o[r]) {
					if (!a[r]) {
						var t = "function" == typeof __require && __require;
						if (!e && t) return t(r, !0);
						if (l) return l(r, !0);
						var n = /* @__PURE__ */ new Error("Cannot find module '" + r + "'");
						throw n.code = "MODULE_NOT_FOUND", n;
					}
					var i = o[r] = { exports: {} };
					a[r][0].call(i.exports, function(e) {
						var t = a[r][1][e];
						return u(t || e);
					}, i, i.exports, s, a, o, h);
				}
				return o[r].exports;
			}
			for (var l = "function" == typeof __require && __require, e = 0; e < h.length; e++) u(h[e]);
			return u;
		}({
			1: [function(e, t, r) {
				"use strict";
				var d = e("./utils"), c = e("./support"), p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
				r.encode = function(e) {
					for (var t, r, n, i, s, a, o, h = [], u = 0, l = e.length, f = l, c = "string" !== d.getTypeOf(e); u < e.length;) f = l - u, n = c ? (t = e[u++], r = u < l ? e[u++] : 0, u < l ? e[u++] : 0) : (t = e.charCodeAt(u++), r = u < l ? e.charCodeAt(u++) : 0, u < l ? e.charCodeAt(u++) : 0), i = t >> 2, s = (3 & t) << 4 | r >> 4, a = 1 < f ? (15 & r) << 2 | n >> 6 : 64, o = 2 < f ? 63 & n : 64, h.push(p.charAt(i) + p.charAt(s) + p.charAt(a) + p.charAt(o));
					return h.join("");
				}, r.decode = function(e) {
					var t, r, n, i, s, a, o = 0, h = 0, u = "data:";
					if (e.substr(0, u.length) === u) throw new Error("Invalid base64 input, it looks like a data url.");
					var l, f = 3 * (e = e.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
					if (e.charAt(e.length - 1) === p.charAt(64) && f--, e.charAt(e.length - 2) === p.charAt(64) && f--, f % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
					for (l = c.uint8array ? new Uint8Array(0 | f) : new Array(0 | f); o < e.length;) t = p.indexOf(e.charAt(o++)) << 2 | (i = p.indexOf(e.charAt(o++))) >> 4, r = (15 & i) << 4 | (s = p.indexOf(e.charAt(o++))) >> 2, n = (3 & s) << 6 | (a = p.indexOf(e.charAt(o++))), l[h++] = t, 64 !== s && (l[h++] = r), 64 !== a && (l[h++] = n);
					return l;
				};
			}, {
				"./support": 30,
				"./utils": 32
			}],
			2: [function(e, t, r) {
				"use strict";
				var n = e("./external"), i = e("./stream/DataWorker"), s = e("./stream/Crc32Probe"), a = e("./stream/DataLengthProbe");
				function o(e, t, r, n, i) {
					this.compressedSize = e, this.uncompressedSize = t, this.crc32 = r, this.compression = n, this.compressedContent = i;
				}
				o.prototype = {
					getContentWorker: function() {
						var e = new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")), t = this;
						return e.on("end", function() {
							if (this.streamInfo.data_length !== t.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
						}), e;
					},
					getCompressedWorker: function() {
						return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
					}
				}, o.createWorkerFrom = function(e, t, r) {
					return e.pipe(new s()).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression", t);
				}, t.exports = o;
			}, {
				"./external": 6,
				"./stream/Crc32Probe": 25,
				"./stream/DataLengthProbe": 26,
				"./stream/DataWorker": 27
			}],
			3: [function(e, t, r) {
				"use strict";
				var n = e("./stream/GenericWorker");
				r.STORE = {
					magic: "\0\0",
					compressWorker: function() {
						return new n("STORE compression");
					},
					uncompressWorker: function() {
						return new n("STORE decompression");
					}
				}, r.DEFLATE = e("./flate");
			}, {
				"./flate": 7,
				"./stream/GenericWorker": 28
			}],
			4: [function(e, t, r) {
				"use strict";
				var n = e("./utils");
				var o = function() {
					for (var e, t = [], r = 0; r < 256; r++) {
						e = r;
						for (var n = 0; n < 8; n++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
						t[r] = e;
					}
					return t;
				}();
				t.exports = function(e, t) {
					return void 0 !== e && e.length ? "string" !== n.getTypeOf(e) ? function(e, t, r, n) {
						var i = o, s = n + r;
						e ^= -1;
						for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t[a])];
						return -1 ^ e;
					}(0 | t, e, e.length, 0) : function(e, t, r, n) {
						var i = o, s = n + r;
						e ^= -1;
						for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t.charCodeAt(a))];
						return -1 ^ e;
					}(0 | t, e, e.length, 0) : 0;
				};
			}, { "./utils": 32 }],
			5: [function(e, t, r) {
				"use strict";
				r.base64 = !1, r.binary = !1, r.dir = !1, r.createFolders = !0, r.date = null, r.compression = null, r.compressionOptions = null, r.comment = null, r.unixPermissions = null, r.dosPermissions = null;
			}, {}],
			6: [function(e, t, r) {
				"use strict";
				var n = null;
				n = "undefined" != typeof Promise ? Promise : e("lie"), t.exports = { Promise: n };
			}, { lie: 37 }],
			7: [function(e, t, r) {
				"use strict";
				var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Uint32Array, i = e("pako"), s = e("./utils"), a = e("./stream/GenericWorker"), o = n ? "uint8array" : "array";
				function h(e, t) {
					a.call(this, "FlateWorker/" + e), this._pako = null, this._pakoAction = e, this._pakoOptions = t, this.meta = {};
				}
				r.magic = "\b\0", s.inherits(h, a), h.prototype.processChunk = function(e) {
					this.meta = e.meta, null === this._pako && this._createPako(), this._pako.push(s.transformTo(o, e.data), !1);
				}, h.prototype.flush = function() {
					a.prototype.flush.call(this), null === this._pako && this._createPako(), this._pako.push([], !0);
				}, h.prototype.cleanUp = function() {
					a.prototype.cleanUp.call(this), this._pako = null;
				}, h.prototype._createPako = function() {
					this._pako = new i[this._pakoAction]({
						raw: !0,
						level: this._pakoOptions.level || -1
					});
					var t = this;
					this._pako.onData = function(e) {
						t.push({
							data: e,
							meta: t.meta
						});
					};
				}, r.compressWorker = function(e) {
					return new h("Deflate", e);
				}, r.uncompressWorker = function() {
					return new h("Inflate", {});
				};
			}, {
				"./stream/GenericWorker": 28,
				"./utils": 32,
				pako: 38
			}],
			8: [function(e, t, r) {
				"use strict";
				function A(e, t) {
					var r, n = "";
					for (r = 0; r < t; r++) n += String.fromCharCode(255 & e), e >>>= 8;
					return n;
				}
				function n(e, t, r, n, i, s) {
					var a, o, h = e.file, u = e.compression, l = s !== O.utf8encode, f = I.transformTo("string", s(h.name)), c = I.transformTo("string", O.utf8encode(h.name)), d = h.comment, p = I.transformTo("string", s(d)), m = I.transformTo("string", O.utf8encode(d)), _ = c.length !== h.name.length, g = m.length !== d.length, b = "", v = "", y = "", w = h.dir, k = h.date, x = {
						crc32: 0,
						compressedSize: 0,
						uncompressedSize: 0
					};
					t && !r || (x.crc32 = e.crc32, x.compressedSize = e.compressedSize, x.uncompressedSize = e.uncompressedSize);
					var S = 0;
					t && (S |= 8), l || !_ && !g || (S |= 2048);
					var z = 0, C = 0;
					w && (z |= 16), "UNIX" === i ? (C = 798, z |= function(e, t) {
						var r = e;
						return e || (r = t ? 16893 : 33204), (65535 & r) << 16;
					}(h.unixPermissions, w)) : (C = 20, z |= function(e) {
						return 63 & (e || 0);
					}(h.dosPermissions)), a = k.getUTCHours(), a <<= 6, a |= k.getUTCMinutes(), a <<= 5, a |= k.getUTCSeconds() / 2, o = k.getUTCFullYear() - 1980, o <<= 4, o |= k.getUTCMonth() + 1, o <<= 5, o |= k.getUTCDate(), _ && (v = A(1, 1) + A(B(f), 4) + c, b += "up" + A(v.length, 2) + v), g && (y = A(1, 1) + A(B(p), 4) + m, b += "uc" + A(y.length, 2) + y);
					var E = "";
					return E += "\n\0", E += A(S, 2), E += u.magic, E += A(a, 2), E += A(o, 2), E += A(x.crc32, 4), E += A(x.compressedSize, 4), E += A(x.uncompressedSize, 4), E += A(f.length, 2), E += A(b.length, 2), {
						fileRecord: R.LOCAL_FILE_HEADER + E + f + b,
						dirRecord: R.CENTRAL_FILE_HEADER + A(C, 2) + E + A(p.length, 2) + "\0\0\0\0" + A(z, 4) + A(n, 4) + f + b + p
					};
				}
				var I = e("../utils"), i = e("../stream/GenericWorker"), O = e("../utf8"), B = e("../crc32"), R = e("../signature");
				function s(e, t, r, n) {
					i.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = t, this.zipPlatform = r, this.encodeFileName = n, this.streamFiles = e, this.accumulate = !1, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
				}
				I.inherits(s, i), s.prototype.push = function(e) {
					var t = e.meta.percent || 0, r = this.entriesCount, n = this._sources.length;
					this.accumulate ? this.contentBuffer.push(e) : (this.bytesWritten += e.data.length, i.prototype.push.call(this, {
						data: e.data,
						meta: {
							currentFile: this.currentFile,
							percent: r ? (t + 100 * (r - n - 1)) / r : 100
						}
					}));
				}, s.prototype.openedSource = function(e) {
					this.currentSourceOffset = this.bytesWritten, this.currentFile = e.file.name;
					var t = this.streamFiles && !e.file.dir;
					if (t) {
						var r = n(e, t, !1, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
						this.push({
							data: r.fileRecord,
							meta: { percent: 0 }
						});
					} else this.accumulate = !0;
				}, s.prototype.closedSource = function(e) {
					this.accumulate = !1;
					var t = this.streamFiles && !e.file.dir, r = n(e, t, !0, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
					if (this.dirRecords.push(r.dirRecord), t) this.push({
						data: function(e) {
							return R.DATA_DESCRIPTOR + A(e.crc32, 4) + A(e.compressedSize, 4) + A(e.uncompressedSize, 4);
						}(e),
						meta: { percent: 100 }
					});
					else for (this.push({
						data: r.fileRecord,
						meta: { percent: 0 }
					}); this.contentBuffer.length;) this.push(this.contentBuffer.shift());
					this.currentFile = null;
				}, s.prototype.flush = function() {
					for (var e = this.bytesWritten, t = 0; t < this.dirRecords.length; t++) this.push({
						data: this.dirRecords[t],
						meta: { percent: 100 }
					});
					var r = this.bytesWritten - e, n = function(e, t, r, n, i) {
						var s = I.transformTo("string", i(n));
						return R.CENTRAL_DIRECTORY_END + "\0\0\0\0" + A(e, 2) + A(e, 2) + A(t, 4) + A(r, 4) + A(s.length, 2) + s;
					}(this.dirRecords.length, r, e, this.zipComment, this.encodeFileName);
					this.push({
						data: n,
						meta: { percent: 100 }
					});
				}, s.prototype.prepareNextSource = function() {
					this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
				}, s.prototype.registerPrevious = function(e) {
					this._sources.push(e);
					var t = this;
					return e.on("data", function(e) {
						t.processChunk(e);
					}), e.on("end", function() {
						t.closedSource(t.previous.streamInfo), t._sources.length ? t.prepareNextSource() : t.end();
					}), e.on("error", function(e) {
						t.error(e);
					}), this;
				}, s.prototype.resume = function() {
					return !!i.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), !0) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), !0));
				}, s.prototype.error = function(e) {
					var t = this._sources;
					if (!i.prototype.error.call(this, e)) return !1;
					for (var r = 0; r < t.length; r++) try {
						t[r].error(e);
					} catch (e) {}
					return !0;
				}, s.prototype.lock = function() {
					i.prototype.lock.call(this);
					for (var e = this._sources, t = 0; t < e.length; t++) e[t].lock();
				}, t.exports = s;
			}, {
				"../crc32": 4,
				"../signature": 23,
				"../stream/GenericWorker": 28,
				"../utf8": 31,
				"../utils": 32
			}],
			9: [function(e, t, r) {
				"use strict";
				var u = e("../compressions"), n = e("./ZipFileWorker");
				r.generateWorker = function(e, a, t) {
					var o = new n(a.streamFiles, t, a.platform, a.encodeFileName), h = 0;
					try {
						e.forEach(function(e, t) {
							h++;
							var r = function(e, t) {
								var r = e || t, n = u[r];
								if (!n) throw new Error(r + " is not a valid compression method !");
								return n;
							}(t.options.compression, a.compression), n = t.options.compressionOptions || a.compressionOptions || {}, i = t.dir, s = t.date;
							t._compressWorker(r, n).withStreamInfo("file", {
								name: e,
								dir: i,
								date: s,
								comment: t.comment || "",
								unixPermissions: t.unixPermissions,
								dosPermissions: t.dosPermissions
							}).pipe(o);
						}), o.entriesCount = h;
					} catch (e) {
						o.error(e);
					}
					return o;
				};
			}, {
				"../compressions": 3,
				"./ZipFileWorker": 8
			}],
			10: [function(e, t, r) {
				"use strict";
				function n() {
					if (!(this instanceof n)) return new n();
					if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
					this.files = Object.create(null), this.comment = null, this.root = "", this.clone = function() {
						var e = new n();
						for (var t in this) "function" != typeof this[t] && (e[t] = this[t]);
						return e;
					};
				}
				(n.prototype = e("./object")).loadAsync = e("./load"), n.support = e("./support"), n.defaults = e("./defaults"), n.version = "3.10.1", n.loadAsync = function(e, t) {
					return new n().loadAsync(e, t);
				}, n.external = e("./external"), t.exports = n;
			}, {
				"./defaults": 5,
				"./external": 6,
				"./load": 11,
				"./object": 15,
				"./support": 30
			}],
			11: [function(e, t, r) {
				"use strict";
				var u = e("./utils"), i = e("./external"), n = e("./utf8"), s = e("./zipEntries"), a = e("./stream/Crc32Probe"), l = e("./nodejsUtils");
				function f(n) {
					return new i.Promise(function(e, t) {
						var r = n.decompressed.getContentWorker().pipe(new a());
						r.on("error", function(e) {
							t(e);
						}).on("end", function() {
							r.streamInfo.crc32 !== n.decompressed.crc32 ? t(/* @__PURE__ */ new Error("Corrupted zip : CRC32 mismatch")) : e();
						}).resume();
					});
				}
				t.exports = function(e, o) {
					var h = this;
					return o = u.extend(o || {}, {
						base64: !1,
						checkCRC32: !1,
						optimizedBinaryString: !1,
						createFolders: !1,
						decodeFileName: n.utf8decode
					}), l.isNode && l.isStream(e) ? i.Promise.reject(/* @__PURE__ */ new Error("JSZip can't accept a stream when loading a zip file.")) : u.prepareContent("the loaded zip file", e, !0, o.optimizedBinaryString, o.base64).then(function(e) {
						var t = new s(o);
						return t.load(e), t;
					}).then(function(e) {
						var t = [i.Promise.resolve(e)], r = e.files;
						if (o.checkCRC32) for (var n = 0; n < r.length; n++) t.push(f(r[n]));
						return i.Promise.all(t);
					}).then(function(e) {
						for (var t = e.shift(), r = t.files, n = 0; n < r.length; n++) {
							var i = r[n], s = i.fileNameStr, a = u.resolve(i.fileNameStr);
							h.file(a, i.decompressed, {
								binary: !0,
								optimizedBinaryString: !0,
								date: i.date,
								dir: i.dir,
								comment: i.fileCommentStr.length ? i.fileCommentStr : null,
								unixPermissions: i.unixPermissions,
								dosPermissions: i.dosPermissions,
								createFolders: o.createFolders
							}), i.dir || (h.file(a).unsafeOriginalName = s);
						}
						return t.zipComment.length && (h.comment = t.zipComment), h;
					});
				};
			}, {
				"./external": 6,
				"./nodejsUtils": 14,
				"./stream/Crc32Probe": 25,
				"./utf8": 31,
				"./utils": 32,
				"./zipEntries": 33
			}],
			12: [function(e, t, r) {
				"use strict";
				var n = e("../utils"), i = e("../stream/GenericWorker");
				function s(e, t) {
					i.call(this, "Nodejs stream input adapter for " + e), this._upstreamEnded = !1, this._bindStream(t);
				}
				n.inherits(s, i), s.prototype._bindStream = function(e) {
					var t = this;
					(this._stream = e).pause(), e.on("data", function(e) {
						t.push({
							data: e,
							meta: { percent: 0 }
						});
					}).on("error", function(e) {
						t.isPaused ? this.generatedError = e : t.error(e);
					}).on("end", function() {
						t.isPaused ? t._upstreamEnded = !0 : t.end();
					});
				}, s.prototype.pause = function() {
					return !!i.prototype.pause.call(this) && (this._stream.pause(), !0);
				}, s.prototype.resume = function() {
					return !!i.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), !0);
				}, t.exports = s;
			}, {
				"../stream/GenericWorker": 28,
				"../utils": 32
			}],
			13: [function(e, t, r) {
				"use strict";
				var i = e("readable-stream").Readable;
				function n(e, t, r) {
					i.call(this, t), this._helper = e;
					var n = this;
					e.on("data", function(e, t) {
						n.push(e) || n._helper.pause(), r && r(t);
					}).on("error", function(e) {
						n.emit("error", e);
					}).on("end", function() {
						n.push(null);
					});
				}
				e("../utils").inherits(n, i), n.prototype._read = function() {
					this._helper.resume();
				}, t.exports = n;
			}, {
				"../utils": 32,
				"readable-stream": 16
			}],
			14: [function(e, t, r) {
				"use strict";
				t.exports = {
					isNode: "undefined" != typeof Buffer,
					newBufferFrom: function(e, t) {
						if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(e, t);
						if ("number" == typeof e) throw new Error("The \"data\" argument must not be a number");
						return new Buffer(e, t);
					},
					allocBuffer: function(e) {
						if (Buffer.alloc) return Buffer.alloc(e);
						var t = new Buffer(e);
						return t.fill(0), t;
					},
					isBuffer: function(e) {
						return Buffer.isBuffer(e);
					},
					isStream: function(e) {
						return e && "function" == typeof e.on && "function" == typeof e.pause && "function" == typeof e.resume;
					}
				};
			}, {}],
			15: [function(e, t, r) {
				"use strict";
				function s(e, t, r) {
					var n, i = u.getTypeOf(t), s = u.extend(r || {}, f);
					s.date = s.date || /* @__PURE__ */ new Date(), null !== s.compression && (s.compression = s.compression.toUpperCase()), "string" == typeof s.unixPermissions && (s.unixPermissions = parseInt(s.unixPermissions, 8)), s.unixPermissions && 16384 & s.unixPermissions && (s.dir = !0), s.dosPermissions && 16 & s.dosPermissions && (s.dir = !0), s.dir && (e = g(e)), s.createFolders && (n = _(e)) && b.call(this, n, !0);
					var a = "string" === i && !1 === s.binary && !1 === s.base64;
					r && void 0 !== r.binary || (s.binary = !a), (t instanceof c && 0 === t.uncompressedSize || s.dir || !t || 0 === t.length) && (s.base64 = !1, s.binary = !0, t = "", s.compression = "STORE", i = "string");
					var o = null;
					o = t instanceof c || t instanceof l ? t : p.isNode && p.isStream(t) ? new m(e, t) : u.prepareContent(e, t, s.binary, s.optimizedBinaryString, s.base64);
					var h = new d(e, o, s);
					this.files[e] = h;
				}
				var i = e("./utf8"), u = e("./utils"), l = e("./stream/GenericWorker"), a = e("./stream/StreamHelper"), f = e("./defaults"), c = e("./compressedObject"), d = e("./zipObject"), o = e("./generate"), p = e("./nodejsUtils"), m = e("./nodejs/NodejsStreamInputAdapter"), _ = function(e) {
					"/" === e.slice(-1) && (e = e.substring(0, e.length - 1));
					var t = e.lastIndexOf("/");
					return 0 < t ? e.substring(0, t) : "";
				}, g = function(e) {
					return "/" !== e.slice(-1) && (e += "/"), e;
				}, b = function(e, t) {
					return t = void 0 !== t ? t : f.createFolders, e = g(e), this.files[e] || s.call(this, e, null, {
						dir: !0,
						createFolders: t
					}), this.files[e];
				};
				function h(e) {
					return "[object RegExp]" === Object.prototype.toString.call(e);
				}
				t.exports = {
					load: function() {
						throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
					},
					forEach: function(e) {
						var t, r, n;
						for (t in this.files) n = this.files[t], (r = t.slice(this.root.length, t.length)) && t.slice(0, this.root.length) === this.root && e(r, n);
					},
					filter: function(r) {
						var n = [];
						return this.forEach(function(e, t) {
							r(e, t) && n.push(t);
						}), n;
					},
					file: function(e, t, r) {
						if (1 !== arguments.length) return e = this.root + e, s.call(this, e, t, r), this;
						if (h(e)) {
							var n = e;
							return this.filter(function(e, t) {
								return !t.dir && n.test(e);
							});
						}
						var i = this.files[this.root + e];
						return i && !i.dir ? i : null;
					},
					folder: function(r) {
						if (!r) return this;
						if (h(r)) return this.filter(function(e, t) {
							return t.dir && r.test(e);
						});
						var e = this.root + r, t = b.call(this, e), n = this.clone();
						return n.root = t.name, n;
					},
					remove: function(r) {
						r = this.root + r;
						var e = this.files[r];
						if (e || ("/" !== r.slice(-1) && (r += "/"), e = this.files[r]), e && !e.dir) delete this.files[r];
						else for (var t = this.filter(function(e, t) {
							return t.name.slice(0, r.length) === r;
						}), n = 0; n < t.length; n++) delete this.files[t[n].name];
						return this;
					},
					generate: function() {
						throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
					},
					generateInternalStream: function(e) {
						var t, r = {};
						try {
							if ((r = u.extend(e || {}, {
								streamFiles: !1,
								compression: "STORE",
								compressionOptions: null,
								type: "",
								platform: "DOS",
								comment: null,
								mimeType: "application/zip",
								encodeFileName: i.utf8encode
							})).type = r.type.toLowerCase(), r.compression = r.compression.toUpperCase(), "binarystring" === r.type && (r.type = "string"), !r.type) throw new Error("No output type specified.");
							u.checkSupport(r.type), "darwin" !== r.platform && "freebsd" !== r.platform && "linux" !== r.platform && "sunos" !== r.platform || (r.platform = "UNIX"), "win32" === r.platform && (r.platform = "DOS");
							var n = r.comment || this.comment || "";
							t = o.generateWorker(this, r, n);
						} catch (e) {
							(t = new l("error")).error(e);
						}
						return new a(t, r.type || "string", r.mimeType);
					},
					generateAsync: function(e, t) {
						return this.generateInternalStream(e).accumulate(t);
					},
					generateNodeStream: function(e, t) {
						return (e = e || {}).type || (e.type = "nodebuffer"), this.generateInternalStream(e).toNodejsStream(t);
					}
				};
			}, {
				"./compressedObject": 2,
				"./defaults": 5,
				"./generate": 9,
				"./nodejs/NodejsStreamInputAdapter": 12,
				"./nodejsUtils": 14,
				"./stream/GenericWorker": 28,
				"./stream/StreamHelper": 29,
				"./utf8": 31,
				"./utils": 32,
				"./zipObject": 35
			}],
			16: [function(e, t, r) {
				"use strict";
				t.exports = e("stream");
			}, { stream: void 0 }],
			17: [function(e, t, r) {
				"use strict";
				var n = e("./DataReader");
				function i(e) {
					n.call(this, e);
					for (var t = 0; t < this.data.length; t++) e[t] = 255 & e[t];
				}
				e("../utils").inherits(i, n), i.prototype.byteAt = function(e) {
					return this.data[this.zero + e];
				}, i.prototype.lastIndexOfSignature = function(e) {
					for (var t = e.charCodeAt(0), r = e.charCodeAt(1), n = e.charCodeAt(2), i = e.charCodeAt(3), s = this.length - 4; 0 <= s; --s) if (this.data[s] === t && this.data[s + 1] === r && this.data[s + 2] === n && this.data[s + 3] === i) return s - this.zero;
					return -1;
				}, i.prototype.readAndCheckSignature = function(e) {
					var t = e.charCodeAt(0), r = e.charCodeAt(1), n = e.charCodeAt(2), i = e.charCodeAt(3), s = this.readData(4);
					return t === s[0] && r === s[1] && n === s[2] && i === s[3];
				}, i.prototype.readData = function(e) {
					if (this.checkOffset(e), 0 === e) return [];
					var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
					return this.index += e, t;
				}, t.exports = i;
			}, {
				"../utils": 32,
				"./DataReader": 18
			}],
			18: [function(e, t, r) {
				"use strict";
				var n = e("../utils");
				function i(e) {
					this.data = e, this.length = e.length, this.index = 0, this.zero = 0;
				}
				i.prototype = {
					checkOffset: function(e) {
						this.checkIndex(this.index + e);
					},
					checkIndex: function(e) {
						if (this.length < this.zero + e || e < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + e + "). Corrupted zip ?");
					},
					setIndex: function(e) {
						this.checkIndex(e), this.index = e;
					},
					skip: function(e) {
						this.setIndex(this.index + e);
					},
					byteAt: function() {},
					readInt: function(e) {
						var t, r = 0;
						for (this.checkOffset(e), t = this.index + e - 1; t >= this.index; t--) r = (r << 8) + this.byteAt(t);
						return this.index += e, r;
					},
					readString: function(e) {
						return n.transformTo("string", this.readData(e));
					},
					readData: function() {},
					lastIndexOfSignature: function() {},
					readAndCheckSignature: function() {},
					readDate: function() {
						var e = this.readInt(4);
						return new Date(Date.UTC(1980 + (e >> 25 & 127), (e >> 21 & 15) - 1, e >> 16 & 31, e >> 11 & 31, e >> 5 & 63, (31 & e) << 1));
					}
				}, t.exports = i;
			}, { "../utils": 32 }],
			19: [function(e, t, r) {
				"use strict";
				var n = e("./Uint8ArrayReader");
				function i(e) {
					n.call(this, e);
				}
				e("../utils").inherits(i, n), i.prototype.readData = function(e) {
					this.checkOffset(e);
					var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
					return this.index += e, t;
				}, t.exports = i;
			}, {
				"../utils": 32,
				"./Uint8ArrayReader": 21
			}],
			20: [function(e, t, r) {
				"use strict";
				var n = e("./DataReader");
				function i(e) {
					n.call(this, e);
				}
				e("../utils").inherits(i, n), i.prototype.byteAt = function(e) {
					return this.data.charCodeAt(this.zero + e);
				}, i.prototype.lastIndexOfSignature = function(e) {
					return this.data.lastIndexOf(e) - this.zero;
				}, i.prototype.readAndCheckSignature = function(e) {
					return e === this.readData(4);
				}, i.prototype.readData = function(e) {
					this.checkOffset(e);
					var t = this.data.slice(this.zero + this.index, this.zero + this.index + e);
					return this.index += e, t;
				}, t.exports = i;
			}, {
				"../utils": 32,
				"./DataReader": 18
			}],
			21: [function(e, t, r) {
				"use strict";
				var n = e("./ArrayReader");
				function i(e) {
					n.call(this, e);
				}
				e("../utils").inherits(i, n), i.prototype.readData = function(e) {
					if (this.checkOffset(e), 0 === e) return new Uint8Array(0);
					var t = this.data.subarray(this.zero + this.index, this.zero + this.index + e);
					return this.index += e, t;
				}, t.exports = i;
			}, {
				"../utils": 32,
				"./ArrayReader": 17
			}],
			22: [function(e, t, r) {
				"use strict";
				var n = e("../utils"), i = e("../support"), s = e("./ArrayReader"), a = e("./StringReader"), o = e("./NodeBufferReader"), h = e("./Uint8ArrayReader");
				t.exports = function(e) {
					var t = n.getTypeOf(e);
					return n.checkSupport(t), "string" !== t || i.uint8array ? "nodebuffer" === t ? new o(e) : i.uint8array ? new h(n.transformTo("uint8array", e)) : new s(n.transformTo("array", e)) : new a(e);
				};
			}, {
				"../support": 30,
				"../utils": 32,
				"./ArrayReader": 17,
				"./NodeBufferReader": 19,
				"./StringReader": 20,
				"./Uint8ArrayReader": 21
			}],
			23: [function(e, t, r) {
				"use strict";
				r.LOCAL_FILE_HEADER = "PK", r.CENTRAL_FILE_HEADER = "PK", r.CENTRAL_DIRECTORY_END = "PK", r.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", r.ZIP64_CENTRAL_DIRECTORY_END = "PK", r.DATA_DESCRIPTOR = "PK\x07\b";
			}, {}],
			24: [function(e, t, r) {
				"use strict";
				var n = e("./GenericWorker"), i = e("../utils");
				function s(e) {
					n.call(this, "ConvertWorker to " + e), this.destType = e;
				}
				i.inherits(s, n), s.prototype.processChunk = function(e) {
					this.push({
						data: i.transformTo(this.destType, e.data),
						meta: e.meta
					});
				}, t.exports = s;
			}, {
				"../utils": 32,
				"./GenericWorker": 28
			}],
			25: [function(e, t, r) {
				"use strict";
				var n = e("./GenericWorker"), i = e("../crc32");
				function s() {
					n.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
				}
				e("../utils").inherits(s, n), s.prototype.processChunk = function(e) {
					this.streamInfo.crc32 = i(e.data, this.streamInfo.crc32 || 0), this.push(e);
				}, t.exports = s;
			}, {
				"../crc32": 4,
				"../utils": 32,
				"./GenericWorker": 28
			}],
			26: [function(e, t, r) {
				"use strict";
				var n = e("../utils"), i = e("./GenericWorker");
				function s(e) {
					i.call(this, "DataLengthProbe for " + e), this.propName = e, this.withStreamInfo(e, 0);
				}
				n.inherits(s, i), s.prototype.processChunk = function(e) {
					if (e) {
						var t = this.streamInfo[this.propName] || 0;
						this.streamInfo[this.propName] = t + e.data.length;
					}
					i.prototype.processChunk.call(this, e);
				}, t.exports = s;
			}, {
				"../utils": 32,
				"./GenericWorker": 28
			}],
			27: [function(e, t, r) {
				"use strict";
				var n = e("../utils"), i = e("./GenericWorker");
				function s(e) {
					i.call(this, "DataWorker");
					var t = this;
					this.dataIsReady = !1, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = !1, e.then(function(e) {
						t.dataIsReady = !0, t.data = e, t.max = e && e.length || 0, t.type = n.getTypeOf(e), t.isPaused || t._tickAndRepeat();
					}, function(e) {
						t.error(e);
					});
				}
				n.inherits(s, i), s.prototype.cleanUp = function() {
					i.prototype.cleanUp.call(this), this.data = null;
				}, s.prototype.resume = function() {
					return !!i.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = !0, n.delay(this._tickAndRepeat, [], this)), !0);
				}, s.prototype._tickAndRepeat = function() {
					this._tickScheduled = !1, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (n.delay(this._tickAndRepeat, [], this), this._tickScheduled = !0));
				}, s.prototype._tick = function() {
					if (this.isPaused || this.isFinished) return !1;
					var e = null, t = Math.min(this.max, this.index + 16384);
					if (this.index >= this.max) return this.end();
					switch (this.type) {
						case "string":
							e = this.data.substring(this.index, t);
							break;
						case "uint8array":
							e = this.data.subarray(this.index, t);
							break;
						case "array":
						case "nodebuffer": e = this.data.slice(this.index, t);
					}
					return this.index = t, this.push({
						data: e,
						meta: { percent: this.max ? this.index / this.max * 100 : 0 }
					});
				}, t.exports = s;
			}, {
				"../utils": 32,
				"./GenericWorker": 28
			}],
			28: [function(e, t, r) {
				"use strict";
				function n(e) {
					this.name = e || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = !0, this.isFinished = !1, this.isLocked = !1, this._listeners = {
						data: [],
						end: [],
						error: []
					}, this.previous = null;
				}
				n.prototype = {
					push: function(e) {
						this.emit("data", e);
					},
					end: function() {
						if (this.isFinished) return !1;
						this.flush();
						try {
							this.emit("end"), this.cleanUp(), this.isFinished = !0;
						} catch (e) {
							this.emit("error", e);
						}
						return !0;
					},
					error: function(e) {
						return !this.isFinished && (this.isPaused ? this.generatedError = e : (this.isFinished = !0, this.emit("error", e), this.previous && this.previous.error(e), this.cleanUp()), !0);
					},
					on: function(e, t) {
						return this._listeners[e].push(t), this;
					},
					cleanUp: function() {
						this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
					},
					emit: function(e, t) {
						if (this._listeners[e]) for (var r = 0; r < this._listeners[e].length; r++) this._listeners[e][r].call(this, t);
					},
					pipe: function(e) {
						return e.registerPrevious(this);
					},
					registerPrevious: function(e) {
						if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
						this.streamInfo = e.streamInfo, this.mergeStreamInfo(), this.previous = e;
						var t = this;
						return e.on("data", function(e) {
							t.processChunk(e);
						}), e.on("end", function() {
							t.end();
						}), e.on("error", function(e) {
							t.error(e);
						}), this;
					},
					pause: function() {
						return !this.isPaused && !this.isFinished && (this.isPaused = !0, this.previous && this.previous.pause(), !0);
					},
					resume: function() {
						if (!this.isPaused || this.isFinished) return !1;
						var e = this.isPaused = !1;
						return this.generatedError && (this.error(this.generatedError), e = !0), this.previous && this.previous.resume(), !e;
					},
					flush: function() {},
					processChunk: function(e) {
						this.push(e);
					},
					withStreamInfo: function(e, t) {
						return this.extraStreamInfo[e] = t, this.mergeStreamInfo(), this;
					},
					mergeStreamInfo: function() {
						for (var e in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, e) && (this.streamInfo[e] = this.extraStreamInfo[e]);
					},
					lock: function() {
						if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
						this.isLocked = !0, this.previous && this.previous.lock();
					},
					toString: function() {
						var e = "Worker " + this.name;
						return this.previous ? this.previous + " -> " + e : e;
					}
				}, t.exports = n;
			}, {}],
			29: [function(e, t, r) {
				"use strict";
				var h = e("../utils"), i = e("./ConvertWorker"), s = e("./GenericWorker"), u = e("../base64"), n = e("../support"), a = e("../external"), o = null;
				if (n.nodestream) try {
					o = e("../nodejs/NodejsStreamOutputAdapter");
				} catch (e) {}
				function l(e, o) {
					return new a.Promise(function(t, r) {
						var n = [], i = e._internalType, s = e._outputType, a = e._mimeType;
						e.on("data", function(e, t) {
							n.push(e), o && o(t);
						}).on("error", function(e) {
							n = [], r(e);
						}).on("end", function() {
							try {
								t(function(e, t, r) {
									switch (e) {
										case "blob": return h.newBlob(h.transformTo("arraybuffer", t), r);
										case "base64": return u.encode(t);
										default: return h.transformTo(e, t);
									}
								}(s, function(e, t) {
									var r, n = 0, i = null, s = 0;
									for (r = 0; r < t.length; r++) s += t[r].length;
									switch (e) {
										case "string": return t.join("");
										case "array": return Array.prototype.concat.apply([], t);
										case "uint8array":
											for (i = new Uint8Array(s), r = 0; r < t.length; r++) i.set(t[r], n), n += t[r].length;
											return i;
										case "nodebuffer": return Buffer.concat(t);
										default: throw new Error("concat : unsupported type '" + e + "'");
									}
								}(i, n), a));
							} catch (e) {
								r(e);
							}
							n = [];
						}).resume();
					});
				}
				function f(e, t, r) {
					var n = t;
					switch (t) {
						case "blob":
						case "arraybuffer":
							n = "uint8array";
							break;
						case "base64": n = "string";
					}
					try {
						this._internalType = n, this._outputType = t, this._mimeType = r, h.checkSupport(n), this._worker = e.pipe(new i(n)), e.lock();
					} catch (e) {
						this._worker = new s("error"), this._worker.error(e);
					}
				}
				f.prototype = {
					accumulate: function(e) {
						return l(this, e);
					},
					on: function(e, t) {
						var r = this;
						return "data" === e ? this._worker.on(e, function(e) {
							t.call(r, e.data, e.meta);
						}) : this._worker.on(e, function() {
							h.delay(t, arguments, r);
						}), this;
					},
					resume: function() {
						return h.delay(this._worker.resume, [], this._worker), this;
					},
					pause: function() {
						return this._worker.pause(), this;
					},
					toNodejsStream: function(e) {
						if (h.checkSupport("nodestream"), "nodebuffer" !== this._outputType) throw new Error(this._outputType + " is not supported by this method");
						return new o(this, { objectMode: "nodebuffer" !== this._outputType }, e);
					}
				}, t.exports = f;
			}, {
				"../base64": 1,
				"../external": 6,
				"../nodejs/NodejsStreamOutputAdapter": 13,
				"../support": 30,
				"../utils": 32,
				"./ConvertWorker": 24,
				"./GenericWorker": 28
			}],
			30: [function(e, t, r) {
				"use strict";
				if (r.base64 = !0, r.array = !0, r.string = !0, r.arraybuffer = "undefined" != typeof ArrayBuffer && "undefined" != typeof Uint8Array, r.nodebuffer = "undefined" != typeof Buffer, r.uint8array = "undefined" != typeof Uint8Array, "undefined" == typeof ArrayBuffer) r.blob = !1;
				else {
					var n = /* @__PURE__ */ new ArrayBuffer(0);
					try {
						r.blob = 0 === new Blob([n], { type: "application/zip" }).size;
					} catch (e) {
						try {
							var i = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
							i.append(n), r.blob = 0 === i.getBlob("application/zip").size;
						} catch (e) {
							r.blob = !1;
						}
					}
				}
				try {
					r.nodestream = !!e("readable-stream").Readable;
				} catch (e) {
					r.nodestream = !1;
				}
			}, { "readable-stream": 16 }],
			31: [function(e, t, s) {
				"use strict";
				for (var o = e("./utils"), h = e("./support"), r = e("./nodejsUtils"), n = e("./stream/GenericWorker"), u = new Array(256), i = 0; i < 256; i++) u[i] = 252 <= i ? 6 : 248 <= i ? 5 : 240 <= i ? 4 : 224 <= i ? 3 : 192 <= i ? 2 : 1;
				u[254] = u[254] = 1;
				function a() {
					n.call(this, "utf-8 decode"), this.leftOver = null;
				}
				function l() {
					n.call(this, "utf-8 encode");
				}
				s.utf8encode = function(e) {
					return h.nodebuffer ? r.newBufferFrom(e, "utf-8") : function(e) {
						var t, r, n, i, s, a = e.length, o = 0;
						for (i = 0; i < a; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), o += r < 128 ? 1 : r < 2048 ? 2 : r < 65536 ? 3 : 4;
						for (t = h.uint8array ? new Uint8Array(o) : new Array(o), i = s = 0; s < o; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), r < 128 ? t[s++] = r : (r < 2048 ? t[s++] = 192 | r >>> 6 : (r < 65536 ? t[s++] = 224 | r >>> 12 : (t[s++] = 240 | r >>> 18, t[s++] = 128 | r >>> 12 & 63), t[s++] = 128 | r >>> 6 & 63), t[s++] = 128 | 63 & r);
						return t;
					}(e);
				}, s.utf8decode = function(e) {
					return h.nodebuffer ? o.transformTo("nodebuffer", e).toString("utf-8") : function(e) {
						var t, r, n, i, s = e.length, a = new Array(2 * s);
						for (t = r = 0; t < s;) if ((n = e[t++]) < 128) a[r++] = n;
						else if (4 < (i = u[n])) a[r++] = 65533, t += i - 1;
						else {
							for (n &= 2 === i ? 31 : 3 === i ? 15 : 7; 1 < i && t < s;) n = n << 6 | 63 & e[t++], i--;
							1 < i ? a[r++] = 65533 : n < 65536 ? a[r++] = n : (n -= 65536, a[r++] = 55296 | n >> 10 & 1023, a[r++] = 56320 | 1023 & n);
						}
						return a.length !== r && (a.subarray ? a = a.subarray(0, r) : a.length = r), o.applyFromCharCode(a);
					}(e = o.transformTo(h.uint8array ? "uint8array" : "array", e));
				}, o.inherits(a, n), a.prototype.processChunk = function(e) {
					var t = o.transformTo(h.uint8array ? "uint8array" : "array", e.data);
					if (this.leftOver && this.leftOver.length) {
						if (h.uint8array) {
							var r = t;
							(t = new Uint8Array(r.length + this.leftOver.length)).set(this.leftOver, 0), t.set(r, this.leftOver.length);
						} else t = this.leftOver.concat(t);
						this.leftOver = null;
					}
					var n = function(e, t) {
						var r;
						for ((t = t || e.length) > e.length && (t = e.length), r = t - 1; 0 <= r && 128 == (192 & e[r]);) r--;
						return r < 0 ? t : 0 === r ? t : r + u[e[r]] > t ? r : t;
					}(t), i = t;
					n !== t.length && (h.uint8array ? (i = t.subarray(0, n), this.leftOver = t.subarray(n, t.length)) : (i = t.slice(0, n), this.leftOver = t.slice(n, t.length))), this.push({
						data: s.utf8decode(i),
						meta: e.meta
					});
				}, a.prototype.flush = function() {
					this.leftOver && this.leftOver.length && (this.push({
						data: s.utf8decode(this.leftOver),
						meta: {}
					}), this.leftOver = null);
				}, s.Utf8DecodeWorker = a, o.inherits(l, n), l.prototype.processChunk = function(e) {
					this.push({
						data: s.utf8encode(e.data),
						meta: e.meta
					});
				}, s.Utf8EncodeWorker = l;
			}, {
				"./nodejsUtils": 14,
				"./stream/GenericWorker": 28,
				"./support": 30,
				"./utils": 32
			}],
			32: [function(e, t, a) {
				"use strict";
				var o = e("./support"), h = e("./base64"), r = e("./nodejsUtils"), u = e("./external");
				function n(e) {
					return e;
				}
				function l(e, t) {
					for (var r = 0; r < e.length; ++r) t[r] = 255 & e.charCodeAt(r);
					return t;
				}
				e("setimmediate"), a.newBlob = function(t, r) {
					a.checkSupport("blob");
					try {
						return new Blob([t], { type: r });
					} catch (e) {
						try {
							var n = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
							return n.append(t), n.getBlob(r);
						} catch (e) {
							throw new Error("Bug : can't construct the Blob.");
						}
					}
				};
				var i = {
					stringifyByChunk: function(e, t, r) {
						var n = [], i = 0, s = e.length;
						if (s <= r) return String.fromCharCode.apply(null, e);
						for (; i < s;) "array" === t || "nodebuffer" === t ? n.push(String.fromCharCode.apply(null, e.slice(i, Math.min(i + r, s)))) : n.push(String.fromCharCode.apply(null, e.subarray(i, Math.min(i + r, s)))), i += r;
						return n.join("");
					},
					stringifyByChar: function(e) {
						for (var t = "", r = 0; r < e.length; r++) t += String.fromCharCode(e[r]);
						return t;
					},
					applyCanBeUsed: {
						uint8array: function() {
							try {
								return o.uint8array && 1 === String.fromCharCode.apply(null, new Uint8Array(1)).length;
							} catch (e) {
								return !1;
							}
						}(),
						nodebuffer: function() {
							try {
								return o.nodebuffer && 1 === String.fromCharCode.apply(null, r.allocBuffer(1)).length;
							} catch (e) {
								return !1;
							}
						}()
					}
				};
				function s(e) {
					var t = 65536, r = a.getTypeOf(e), n = !0;
					if ("uint8array" === r ? n = i.applyCanBeUsed.uint8array : "nodebuffer" === r && (n = i.applyCanBeUsed.nodebuffer), n) for (; 1 < t;) try {
						return i.stringifyByChunk(e, r, t);
					} catch (e) {
						t = Math.floor(t / 2);
					}
					return i.stringifyByChar(e);
				}
				function f(e, t) {
					for (var r = 0; r < e.length; r++) t[r] = e[r];
					return t;
				}
				a.applyFromCharCode = s;
				var c = {};
				c.string = {
					string: n,
					array: function(e) {
						return l(e, new Array(e.length));
					},
					arraybuffer: function(e) {
						return c.string.uint8array(e).buffer;
					},
					uint8array: function(e) {
						return l(e, new Uint8Array(e.length));
					},
					nodebuffer: function(e) {
						return l(e, r.allocBuffer(e.length));
					}
				}, c.array = {
					string: s,
					array: n,
					arraybuffer: function(e) {
						return new Uint8Array(e).buffer;
					},
					uint8array: function(e) {
						return new Uint8Array(e);
					},
					nodebuffer: function(e) {
						return r.newBufferFrom(e);
					}
				}, c.arraybuffer = {
					string: function(e) {
						return s(new Uint8Array(e));
					},
					array: function(e) {
						return f(new Uint8Array(e), new Array(e.byteLength));
					},
					arraybuffer: n,
					uint8array: function(e) {
						return new Uint8Array(e);
					},
					nodebuffer: function(e) {
						return r.newBufferFrom(new Uint8Array(e));
					}
				}, c.uint8array = {
					string: s,
					array: function(e) {
						return f(e, new Array(e.length));
					},
					arraybuffer: function(e) {
						return e.buffer;
					},
					uint8array: n,
					nodebuffer: function(e) {
						return r.newBufferFrom(e);
					}
				}, c.nodebuffer = {
					string: s,
					array: function(e) {
						return f(e, new Array(e.length));
					},
					arraybuffer: function(e) {
						return c.nodebuffer.uint8array(e).buffer;
					},
					uint8array: function(e) {
						return f(e, new Uint8Array(e.length));
					},
					nodebuffer: n
				}, a.transformTo = function(e, t) {
					if (t = t || "", !e) return t;
					a.checkSupport(e);
					return c[a.getTypeOf(t)][e](t);
				}, a.resolve = function(e) {
					for (var t = e.split("/"), r = [], n = 0; n < t.length; n++) {
						var i = t[n];
						"." === i || "" === i && 0 !== n && n !== t.length - 1 || (".." === i ? r.pop() : r.push(i));
					}
					return r.join("/");
				}, a.getTypeOf = function(e) {
					return "string" == typeof e ? "string" : "[object Array]" === Object.prototype.toString.call(e) ? "array" : o.nodebuffer && r.isBuffer(e) ? "nodebuffer" : o.uint8array && e instanceof Uint8Array ? "uint8array" : o.arraybuffer && e instanceof ArrayBuffer ? "arraybuffer" : void 0;
				}, a.checkSupport = function(e) {
					if (!o[e.toLowerCase()]) throw new Error(e + " is not supported by this platform");
				}, a.MAX_VALUE_16BITS = 65535, a.MAX_VALUE_32BITS = -1, a.pretty = function(e) {
					var t, r, n = "";
					for (r = 0; r < (e || "").length; r++) n += "\\x" + ((t = e.charCodeAt(r)) < 16 ? "0" : "") + t.toString(16).toUpperCase();
					return n;
				}, a.delay = function(e, t, r) {
					setImmediate(function() {
						e.apply(r || null, t || []);
					});
				}, a.inherits = function(e, t) {
					function r() {}
					r.prototype = t.prototype, e.prototype = new r();
				}, a.extend = function() {
					var e, t, r = {};
					for (e = 0; e < arguments.length; e++) for (t in arguments[e]) Object.prototype.hasOwnProperty.call(arguments[e], t) && void 0 === r[t] && (r[t] = arguments[e][t]);
					return r;
				}, a.prepareContent = function(r, e, n, i, s) {
					return u.Promise.resolve(e).then(function(n) {
						return o.blob && (n instanceof Blob || -1 !== ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(n))) && "undefined" != typeof FileReader ? new u.Promise(function(t, r) {
							var e = new FileReader();
							e.onload = function(e) {
								t(e.target.result);
							}, e.onerror = function(e) {
								r(e.target.error);
							}, e.readAsArrayBuffer(n);
						}) : n;
					}).then(function(e) {
						var t = a.getTypeOf(e);
						return t ? ("arraybuffer" === t ? e = a.transformTo("uint8array", e) : "string" === t && (s ? e = h.decode(e) : n && !0 !== i && (e = function(e) {
							return l(e, o.uint8array ? new Uint8Array(e.length) : new Array(e.length));
						}(e))), e) : u.Promise.reject(/* @__PURE__ */ new Error("Can't read the data of '" + r + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
					});
				};
			}, {
				"./base64": 1,
				"./external": 6,
				"./nodejsUtils": 14,
				"./support": 30,
				setimmediate: 54
			}],
			33: [function(e, t, r) {
				"use strict";
				var n = e("./reader/readerFor"), i = e("./utils"), s = e("./signature"), a = e("./zipEntry"), o = e("./support");
				function h(e) {
					this.files = [], this.loadOptions = e;
				}
				h.prototype = {
					checkSignature: function(e) {
						if (!this.reader.readAndCheckSignature(e)) {
							this.reader.index -= 4;
							var t = this.reader.readString(4);
							throw new Error("Corrupted zip or bug: unexpected signature (" + i.pretty(t) + ", expected " + i.pretty(e) + ")");
						}
					},
					isSignature: function(e, t) {
						var r = this.reader.index;
						this.reader.setIndex(e);
						var n = this.reader.readString(4) === t;
						return this.reader.setIndex(r), n;
					},
					readBlockEndOfCentral: function() {
						this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
						var e = this.reader.readData(this.zipCommentLength), t = o.uint8array ? "uint8array" : "array", r = i.transformTo(t, e);
						this.zipComment = this.loadOptions.decodeFileName(r);
					},
					readBlockZip64EndOfCentral: function() {
						this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
						for (var e, t, r, n = this.zip64EndOfCentralSize - 44; 0 < n;) e = this.reader.readInt(2), t = this.reader.readInt(4), r = this.reader.readData(t), this.zip64ExtensibleData[e] = {
							id: e,
							length: t,
							value: r
						};
					},
					readBlockZip64EndOfCentralLocator: function() {
						if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
					},
					readLocalFiles: function() {
						var e, t;
						for (e = 0; e < this.files.length; e++) t = this.files[e], this.reader.setIndex(t.localHeaderOffset), this.checkSignature(s.LOCAL_FILE_HEADER), t.readLocalPart(this.reader), t.handleUTF8(), t.processAttributes();
					},
					readCentralDir: function() {
						var e;
						for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);) (e = new a({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(e);
						if (this.centralDirRecords !== this.files.length && 0 !== this.centralDirRecords && 0 === this.files.length) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
					},
					readEndOfCentral: function() {
						var e = this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);
						if (e < 0) throw !this.isSignature(0, s.LOCAL_FILE_HEADER) ? /* @__PURE__ */ new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html") : /* @__PURE__ */ new Error("Corrupted zip: can't find end of central directory");
						this.reader.setIndex(e);
						var t = e;
						if (this.checkSignature(s.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === i.MAX_VALUE_16BITS || this.diskWithCentralDirStart === i.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === i.MAX_VALUE_16BITS || this.centralDirRecords === i.MAX_VALUE_16BITS || this.centralDirSize === i.MAX_VALUE_32BITS || this.centralDirOffset === i.MAX_VALUE_32BITS) {
							if (this.zip64 = !0, (e = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
							if (this.reader.setIndex(e), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, s.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
							this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
						}
						var r = this.centralDirOffset + this.centralDirSize;
						this.zip64 && (r += 20, r += 12 + this.zip64EndOfCentralSize);
						var n = t - r;
						if (0 < n) this.isSignature(t, s.CENTRAL_FILE_HEADER) || (this.reader.zero = n);
						else if (n < 0) throw new Error("Corrupted zip: missing " + Math.abs(n) + " bytes.");
					},
					prepareReader: function(e) {
						this.reader = n(e);
					},
					load: function(e) {
						this.prepareReader(e), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
					}
				}, t.exports = h;
			}, {
				"./reader/readerFor": 22,
				"./signature": 23,
				"./support": 30,
				"./utils": 32,
				"./zipEntry": 34
			}],
			34: [function(e, t, r) {
				"use strict";
				var n = e("./reader/readerFor"), s = e("./utils"), i = e("./compressedObject"), a = e("./crc32"), o = e("./utf8"), h = e("./compressions"), u = e("./support");
				function l(e, t) {
					this.options = e, this.loadOptions = t;
				}
				l.prototype = {
					isEncrypted: function() {
						return 1 == (1 & this.bitFlag);
					},
					useUTF8: function() {
						return 2048 == (2048 & this.bitFlag);
					},
					readLocalPart: function(e) {
						var t, r;
						if (e.skip(22), this.fileNameLength = e.readInt(2), r = e.readInt(2), this.fileName = e.readData(this.fileNameLength), e.skip(r), -1 === this.compressedSize || -1 === this.uncompressedSize) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
						if (null === (t = function(e) {
							for (var t in h) if (Object.prototype.hasOwnProperty.call(h, t) && h[t].magic === e) return h[t];
							return null;
						}(this.compressionMethod))) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
						this.decompressed = new i(this.compressedSize, this.uncompressedSize, this.crc32, t, e.readData(this.compressedSize));
					},
					readCentralPart: function(e) {
						this.versionMadeBy = e.readInt(2), e.skip(2), this.bitFlag = e.readInt(2), this.compressionMethod = e.readString(2), this.date = e.readDate(), this.crc32 = e.readInt(4), this.compressedSize = e.readInt(4), this.uncompressedSize = e.readInt(4);
						var t = e.readInt(2);
						if (this.extraFieldsLength = e.readInt(2), this.fileCommentLength = e.readInt(2), this.diskNumberStart = e.readInt(2), this.internalFileAttributes = e.readInt(2), this.externalFileAttributes = e.readInt(4), this.localHeaderOffset = e.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
						e.skip(t), this.readExtraFields(e), this.parseZIP64ExtraField(e), this.fileComment = e.readData(this.fileCommentLength);
					},
					processAttributes: function() {
						this.unixPermissions = null, this.dosPermissions = null;
						var e = this.versionMadeBy >> 8;
						this.dir = !!(16 & this.externalFileAttributes), 0 == e && (this.dosPermissions = 63 & this.externalFileAttributes), 3 == e && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || "/" !== this.fileNameStr.slice(-1) || (this.dir = !0);
					},
					parseZIP64ExtraField: function() {
						if (this.extraFields[1]) {
							var e = n(this.extraFields[1].value);
							this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = e.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = e.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = e.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = e.readInt(4));
						}
					},
					readExtraFields: function(e) {
						var t, r, n, i = e.index + this.extraFieldsLength;
						for (this.extraFields || (this.extraFields = {}); e.index + 4 < i;) t = e.readInt(2), r = e.readInt(2), n = e.readData(r), this.extraFields[t] = {
							id: t,
							length: r,
							value: n
						};
						e.setIndex(i);
					},
					handleUTF8: function() {
						var e = u.uint8array ? "uint8array" : "array";
						if (this.useUTF8()) this.fileNameStr = o.utf8decode(this.fileName), this.fileCommentStr = o.utf8decode(this.fileComment);
						else {
							var t = this.findExtraFieldUnicodePath();
							if (null !== t) this.fileNameStr = t;
							else {
								var r = s.transformTo(e, this.fileName);
								this.fileNameStr = this.loadOptions.decodeFileName(r);
							}
							var n = this.findExtraFieldUnicodeComment();
							if (null !== n) this.fileCommentStr = n;
							else {
								var i = s.transformTo(e, this.fileComment);
								this.fileCommentStr = this.loadOptions.decodeFileName(i);
							}
						}
					},
					findExtraFieldUnicodePath: function() {
						var e = this.extraFields[28789];
						if (e) {
							var t = n(e.value);
							return 1 !== t.readInt(1) ? null : a(this.fileName) !== t.readInt(4) ? null : o.utf8decode(t.readData(e.length - 5));
						}
						return null;
					},
					findExtraFieldUnicodeComment: function() {
						var e = this.extraFields[25461];
						if (e) {
							var t = n(e.value);
							return 1 !== t.readInt(1) ? null : a(this.fileComment) !== t.readInt(4) ? null : o.utf8decode(t.readData(e.length - 5));
						}
						return null;
					}
				}, t.exports = l;
			}, {
				"./compressedObject": 2,
				"./compressions": 3,
				"./crc32": 4,
				"./reader/readerFor": 22,
				"./support": 30,
				"./utf8": 31,
				"./utils": 32
			}],
			35: [function(e, t, r) {
				"use strict";
				function n(e, t, r) {
					this.name = e, this.dir = r.dir, this.date = r.date, this.comment = r.comment, this.unixPermissions = r.unixPermissions, this.dosPermissions = r.dosPermissions, this._data = t, this._dataBinary = r.binary, this.options = {
						compression: r.compression,
						compressionOptions: r.compressionOptions
					};
				}
				var s = e("./stream/StreamHelper"), i = e("./stream/DataWorker"), a = e("./utf8"), o = e("./compressedObject"), h = e("./stream/GenericWorker");
				n.prototype = {
					internalStream: function(e) {
						var t = null, r = "string";
						try {
							if (!e) throw new Error("No output type specified.");
							var n = "string" === (r = e.toLowerCase()) || "text" === r;
							"binarystring" !== r && "text" !== r || (r = "string"), t = this._decompressWorker();
							var i = !this._dataBinary;
							i && !n && (t = t.pipe(new a.Utf8EncodeWorker())), !i && n && (t = t.pipe(new a.Utf8DecodeWorker()));
						} catch (e) {
							(t = new h("error")).error(e);
						}
						return new s(t, r, "");
					},
					async: function(e, t) {
						return this.internalStream(e).accumulate(t);
					},
					nodeStream: function(e, t) {
						return this.internalStream(e || "nodebuffer").toNodejsStream(t);
					},
					_compressWorker: function(e, t) {
						if (this._data instanceof o && this._data.compression.magic === e.magic) return this._data.getCompressedWorker();
						var r = this._decompressWorker();
						return this._dataBinary || (r = r.pipe(new a.Utf8EncodeWorker())), o.createWorkerFrom(r, e, t);
					},
					_decompressWorker: function() {
						return this._data instanceof o ? this._data.getContentWorker() : this._data instanceof h ? this._data : new i(this._data);
					}
				};
				for (var u = [
					"asText",
					"asBinary",
					"asNodeBuffer",
					"asUint8Array",
					"asArrayBuffer"
				], l = function() {
					throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
				}, f = 0; f < u.length; f++) n.prototype[u[f]] = l;
				t.exports = n;
			}, {
				"./compressedObject": 2,
				"./stream/DataWorker": 27,
				"./stream/GenericWorker": 28,
				"./stream/StreamHelper": 29,
				"./utf8": 31
			}],
			36: [function(e, l, t) {
				(function(t) {
					"use strict";
					var r, n, e = t.MutationObserver || t.WebKitMutationObserver;
					if (e) {
						var i = 0, s = new e(u), a = t.document.createTextNode("");
						s.observe(a, { characterData: !0 }), r = function() {
							a.data = i = ++i % 2;
						};
					} else if (t.setImmediate || void 0 === t.MessageChannel) r = "document" in t && "onreadystatechange" in t.document.createElement("script") ? function() {
						var e = t.document.createElement("script");
						e.onreadystatechange = function() {
							u(), e.onreadystatechange = null, e.parentNode.removeChild(e), e = null;
						}, t.document.documentElement.appendChild(e);
					} : function() {
						setTimeout(u, 0);
					};
					else {
						var o = new t.MessageChannel();
						o.port1.onmessage = u, r = function() {
							o.port2.postMessage(0);
						};
					}
					var h = [];
					function u() {
						var e, t;
						n = !0;
						for (var r = h.length; r;) {
							for (t = h, h = [], e = -1; ++e < r;) t[e]();
							r = h.length;
						}
						n = !1;
					}
					l.exports = function(e) {
						1 !== h.push(e) || n || r();
					};
				}).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
			}, {}],
			37: [function(e, t, r) {
				"use strict";
				var i = e("immediate");
				function u() {}
				var l = {}, s = ["REJECTED"], a = ["FULFILLED"], n = ["PENDING"];
				function o(e) {
					if ("function" != typeof e) throw new TypeError("resolver must be a function");
					this.state = n, this.queue = [], this.outcome = void 0, e !== u && d(this, e);
				}
				function h(e, t, r) {
					this.promise = e, "function" == typeof t && (this.onFulfilled = t, this.callFulfilled = this.otherCallFulfilled), "function" == typeof r && (this.onRejected = r, this.callRejected = this.otherCallRejected);
				}
				function f(t, r, n) {
					i(function() {
						var e;
						try {
							e = r(n);
						} catch (e) {
							return l.reject(t, e);
						}
						e === t ? l.reject(t, /* @__PURE__ */ new TypeError("Cannot resolve promise with itself")) : l.resolve(t, e);
					});
				}
				function c(e) {
					var t = e && e.then;
					if (e && ("object" == typeof e || "function" == typeof e) && "function" == typeof t) return function() {
						t.apply(e, arguments);
					};
				}
				function d(t, e) {
					var r = !1;
					function n(e) {
						r || (r = !0, l.reject(t, e));
					}
					function i(e) {
						r || (r = !0, l.resolve(t, e));
					}
					var s = p(function() {
						e(i, n);
					});
					"error" === s.status && n(s.value);
				}
				function p(e, t) {
					var r = {};
					try {
						r.value = e(t), r.status = "success";
					} catch (e) {
						r.status = "error", r.value = e;
					}
					return r;
				}
				(t.exports = o).prototype.finally = function(t) {
					if ("function" != typeof t) return this;
					var r = this.constructor;
					return this.then(function(e) {
						return r.resolve(t()).then(function() {
							return e;
						});
					}, function(e) {
						return r.resolve(t()).then(function() {
							throw e;
						});
					});
				}, o.prototype.catch = function(e) {
					return this.then(null, e);
				}, o.prototype.then = function(e, t) {
					if ("function" != typeof e && this.state === a || "function" != typeof t && this.state === s) return this;
					var r = new this.constructor(u);
					this.state !== n ? f(r, this.state === a ? e : t, this.outcome) : this.queue.push(new h(r, e, t));
					return r;
				}, h.prototype.callFulfilled = function(e) {
					l.resolve(this.promise, e);
				}, h.prototype.otherCallFulfilled = function(e) {
					f(this.promise, this.onFulfilled, e);
				}, h.prototype.callRejected = function(e) {
					l.reject(this.promise, e);
				}, h.prototype.otherCallRejected = function(e) {
					f(this.promise, this.onRejected, e);
				}, l.resolve = function(e, t) {
					var r = p(c, t);
					if ("error" === r.status) return l.reject(e, r.value);
					var n = r.value;
					if (n) d(e, n);
					else {
						e.state = a, e.outcome = t;
						for (var i = -1, s = e.queue.length; ++i < s;) e.queue[i].callFulfilled(t);
					}
					return e;
				}, l.reject = function(e, t) {
					e.state = s, e.outcome = t;
					for (var r = -1, n = e.queue.length; ++r < n;) e.queue[r].callRejected(t);
					return e;
				}, o.resolve = function(e) {
					if (e instanceof this) return e;
					return l.resolve(new this(u), e);
				}, o.reject = function(e) {
					var t = new this(u);
					return l.reject(t, e);
				}, o.all = function(e) {
					var r = this;
					if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(/* @__PURE__ */ new TypeError("must be an array"));
					var n = e.length, i = !1;
					if (!n) return this.resolve([]);
					var s = new Array(n), a = 0, t = -1, o = new this(u);
					for (; ++t < n;) h(e[t], t);
					return o;
					function h(e, t) {
						r.resolve(e).then(function(e) {
							s[t] = e, ++a !== n || i || (i = !0, l.resolve(o, s));
						}, function(e) {
							i || (i = !0, l.reject(o, e));
						});
					}
				}, o.race = function(e) {
					var t = this;
					if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(/* @__PURE__ */ new TypeError("must be an array"));
					var r = e.length, n = !1;
					if (!r) return this.resolve([]);
					var i = -1, s = new this(u);
					for (; ++i < r;) a = e[i], t.resolve(a).then(function(e) {
						n || (n = !0, l.resolve(s, e));
					}, function(e) {
						n || (n = !0, l.reject(s, e));
					});
					var a;
					return s;
				};
			}, { immediate: 36 }],
			38: [function(e, t, r) {
				"use strict";
				var n = {};
				(0, e("./lib/utils/common").assign)(n, e("./lib/deflate"), e("./lib/inflate"), e("./lib/zlib/constants")), t.exports = n;
			}, {
				"./lib/deflate": 39,
				"./lib/inflate": 40,
				"./lib/utils/common": 41,
				"./lib/zlib/constants": 44
			}],
			39: [function(e, t, r) {
				"use strict";
				var a = e("./zlib/deflate"), o = e("./utils/common"), h = e("./utils/strings"), i = e("./zlib/messages"), s = e("./zlib/zstream"), u = Object.prototype.toString, l = 0, f = -1, c = 0, d = 8;
				function p(e) {
					if (!(this instanceof p)) return new p(e);
					this.options = o.assign({
						level: f,
						method: d,
						chunkSize: 16384,
						windowBits: 15,
						memLevel: 8,
						strategy: c,
						to: ""
					}, e || {});
					var t = this.options;
					t.raw && 0 < t.windowBits ? t.windowBits = -t.windowBits : t.gzip && 0 < t.windowBits && t.windowBits < 16 && (t.windowBits += 16), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new s(), this.strm.avail_out = 0;
					var r = a.deflateInit2(this.strm, t.level, t.method, t.windowBits, t.memLevel, t.strategy);
					if (r !== l) throw new Error(i[r]);
					if (t.header && a.deflateSetHeader(this.strm, t.header), t.dictionary) {
						var n;
						if (n = "string" == typeof t.dictionary ? h.string2buf(t.dictionary) : "[object ArrayBuffer]" === u.call(t.dictionary) ? new Uint8Array(t.dictionary) : t.dictionary, (r = a.deflateSetDictionary(this.strm, n)) !== l) throw new Error(i[r]);
						this._dict_set = !0;
					}
				}
				function n(e, t) {
					var r = new p(t);
					if (r.push(e, !0), r.err) throw r.msg || i[r.err];
					return r.result;
				}
				p.prototype.push = function(e, t) {
					var r, n, i = this.strm, s = this.options.chunkSize;
					if (this.ended) return !1;
					n = t === ~~t ? t : !0 === t ? 4 : 0, "string" == typeof e ? i.input = h.string2buf(e) : "[object ArrayBuffer]" === u.call(e) ? i.input = new Uint8Array(e) : i.input = e, i.next_in = 0, i.avail_in = i.input.length;
					do {
						if (0 === i.avail_out && (i.output = new o.Buf8(s), i.next_out = 0, i.avail_out = s), 1 !== (r = a.deflate(i, n)) && r !== l) return this.onEnd(r), !(this.ended = !0);
						0 !== i.avail_out && (0 !== i.avail_in || 4 !== n && 2 !== n) || ("string" === this.options.to ? this.onData(h.buf2binstring(o.shrinkBuf(i.output, i.next_out))) : this.onData(o.shrinkBuf(i.output, i.next_out)));
					} while ((0 < i.avail_in || 0 === i.avail_out) && 1 !== r);
					return 4 === n ? (r = a.deflateEnd(this.strm), this.onEnd(r), this.ended = !0, r === l) : 2 !== n || (this.onEnd(l), !(i.avail_out = 0));
				}, p.prototype.onData = function(e) {
					this.chunks.push(e);
				}, p.prototype.onEnd = function(e) {
					e === l && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = o.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
				}, r.Deflate = p, r.deflate = n, r.deflateRaw = function(e, t) {
					return (t = t || {}).raw = !0, n(e, t);
				}, r.gzip = function(e, t) {
					return (t = t || {}).gzip = !0, n(e, t);
				};
			}, {
				"./utils/common": 41,
				"./utils/strings": 42,
				"./zlib/deflate": 46,
				"./zlib/messages": 51,
				"./zlib/zstream": 53
			}],
			40: [function(e, t, r) {
				"use strict";
				var c = e("./zlib/inflate"), d = e("./utils/common"), p = e("./utils/strings"), m = e("./zlib/constants"), n = e("./zlib/messages"), i = e("./zlib/zstream"), s = e("./zlib/gzheader"), _ = Object.prototype.toString;
				function a(e) {
					if (!(this instanceof a)) return new a(e);
					this.options = d.assign({
						chunkSize: 16384,
						windowBits: 0,
						to: ""
					}, e || {});
					var t = this.options;
					t.raw && 0 <= t.windowBits && t.windowBits < 16 && (t.windowBits = -t.windowBits, 0 === t.windowBits && (t.windowBits = -15)), !(0 <= t.windowBits && t.windowBits < 16) || e && e.windowBits || (t.windowBits += 32), 15 < t.windowBits && t.windowBits < 48 && 0 == (15 & t.windowBits) && (t.windowBits |= 15), this.err = 0, this.msg = "", this.ended = !1, this.chunks = [], this.strm = new i(), this.strm.avail_out = 0;
					var r = c.inflateInit2(this.strm, t.windowBits);
					if (r !== m.Z_OK) throw new Error(n[r]);
					this.header = new s(), c.inflateGetHeader(this.strm, this.header);
				}
				function o(e, t) {
					var r = new a(t);
					if (r.push(e, !0), r.err) throw r.msg || n[r.err];
					return r.result;
				}
				a.prototype.push = function(e, t) {
					var r, n, i, s, a, o, h = this.strm, u = this.options.chunkSize, l = this.options.dictionary, f = !1;
					if (this.ended) return !1;
					n = t === ~~t ? t : !0 === t ? m.Z_FINISH : m.Z_NO_FLUSH, "string" == typeof e ? h.input = p.binstring2buf(e) : "[object ArrayBuffer]" === _.call(e) ? h.input = new Uint8Array(e) : h.input = e, h.next_in = 0, h.avail_in = h.input.length;
					do {
						if (0 === h.avail_out && (h.output = new d.Buf8(u), h.next_out = 0, h.avail_out = u), (r = c.inflate(h, m.Z_NO_FLUSH)) === m.Z_NEED_DICT && l && (o = "string" == typeof l ? p.string2buf(l) : "[object ArrayBuffer]" === _.call(l) ? new Uint8Array(l) : l, r = c.inflateSetDictionary(this.strm, o)), r === m.Z_BUF_ERROR && !0 === f && (r = m.Z_OK, f = !1), r !== m.Z_STREAM_END && r !== m.Z_OK) return this.onEnd(r), !(this.ended = !0);
						h.next_out && (0 !== h.avail_out && r !== m.Z_STREAM_END && (0 !== h.avail_in || n !== m.Z_FINISH && n !== m.Z_SYNC_FLUSH) || ("string" === this.options.to ? (i = p.utf8border(h.output, h.next_out), s = h.next_out - i, a = p.buf2string(h.output, i), h.next_out = s, h.avail_out = u - s, s && d.arraySet(h.output, h.output, i, s, 0), this.onData(a)) : this.onData(d.shrinkBuf(h.output, h.next_out)))), 0 === h.avail_in && 0 === h.avail_out && (f = !0);
					} while ((0 < h.avail_in || 0 === h.avail_out) && r !== m.Z_STREAM_END);
					return r === m.Z_STREAM_END && (n = m.Z_FINISH), n === m.Z_FINISH ? (r = c.inflateEnd(this.strm), this.onEnd(r), this.ended = !0, r === m.Z_OK) : n !== m.Z_SYNC_FLUSH || (this.onEnd(m.Z_OK), !(h.avail_out = 0));
				}, a.prototype.onData = function(e) {
					this.chunks.push(e);
				}, a.prototype.onEnd = function(e) {
					e === m.Z_OK && ("string" === this.options.to ? this.result = this.chunks.join("") : this.result = d.flattenChunks(this.chunks)), this.chunks = [], this.err = e, this.msg = this.strm.msg;
				}, r.Inflate = a, r.inflate = o, r.inflateRaw = function(e, t) {
					return (t = t || {}).raw = !0, o(e, t);
				}, r.ungzip = o;
			}, {
				"./utils/common": 41,
				"./utils/strings": 42,
				"./zlib/constants": 44,
				"./zlib/gzheader": 47,
				"./zlib/inflate": 49,
				"./zlib/messages": 51,
				"./zlib/zstream": 53
			}],
			41: [function(e, t, r) {
				"use strict";
				var n = "undefined" != typeof Uint8Array && "undefined" != typeof Uint16Array && "undefined" != typeof Int32Array;
				r.assign = function(e) {
					for (var t = Array.prototype.slice.call(arguments, 1); t.length;) {
						var r = t.shift();
						if (r) {
							if ("object" != typeof r) throw new TypeError(r + "must be non-object");
							for (var n in r) r.hasOwnProperty(n) && (e[n] = r[n]);
						}
					}
					return e;
				}, r.shrinkBuf = function(e, t) {
					return e.length === t ? e : e.subarray ? e.subarray(0, t) : (e.length = t, e);
				};
				var i = {
					arraySet: function(e, t, r, n, i) {
						if (t.subarray && e.subarray) e.set(t.subarray(r, r + n), i);
						else for (var s = 0; s < n; s++) e[i + s] = t[r + s];
					},
					flattenChunks: function(e) {
						var t, r, n, i, s, a;
						for (t = n = 0, r = e.length; t < r; t++) n += e[t].length;
						for (a = new Uint8Array(n), t = i = 0, r = e.length; t < r; t++) s = e[t], a.set(s, i), i += s.length;
						return a;
					}
				}, s = {
					arraySet: function(e, t, r, n, i) {
						for (var s = 0; s < n; s++) e[i + s] = t[r + s];
					},
					flattenChunks: function(e) {
						return [].concat.apply([], e);
					}
				};
				r.setTyped = function(e) {
					e ? (r.Buf8 = Uint8Array, r.Buf16 = Uint16Array, r.Buf32 = Int32Array, r.assign(r, i)) : (r.Buf8 = Array, r.Buf16 = Array, r.Buf32 = Array, r.assign(r, s));
				}, r.setTyped(n);
			}, {}],
			42: [function(e, t, r) {
				"use strict";
				var h = e("./common"), i = !0, s = !0;
				try {
					String.fromCharCode.apply(null, [0]);
				} catch (e) {
					i = !1;
				}
				try {
					String.fromCharCode.apply(null, new Uint8Array(1));
				} catch (e) {
					s = !1;
				}
				for (var u = new h.Buf8(256), n = 0; n < 256; n++) u[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
				function l(e, t) {
					if (t < 65537 && (e.subarray && s || !e.subarray && i)) return String.fromCharCode.apply(null, h.shrinkBuf(e, t));
					for (var r = "", n = 0; n < t; n++) r += String.fromCharCode(e[n]);
					return r;
				}
				u[254] = u[254] = 1, r.string2buf = function(e) {
					var t, r, n, i, s, a = e.length, o = 0;
					for (i = 0; i < a; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), o += r < 128 ? 1 : r < 2048 ? 2 : r < 65536 ? 3 : 4;
					for (t = new h.Buf8(o), i = s = 0; s < o; i++) 55296 == (64512 & (r = e.charCodeAt(i))) && i + 1 < a && 56320 == (64512 & (n = e.charCodeAt(i + 1))) && (r = 65536 + (r - 55296 << 10) + (n - 56320), i++), r < 128 ? t[s++] = r : (r < 2048 ? t[s++] = 192 | r >>> 6 : (r < 65536 ? t[s++] = 224 | r >>> 12 : (t[s++] = 240 | r >>> 18, t[s++] = 128 | r >>> 12 & 63), t[s++] = 128 | r >>> 6 & 63), t[s++] = 128 | 63 & r);
					return t;
				}, r.buf2binstring = function(e) {
					return l(e, e.length);
				}, r.binstring2buf = function(e) {
					for (var t = new h.Buf8(e.length), r = 0, n = t.length; r < n; r++) t[r] = e.charCodeAt(r);
					return t;
				}, r.buf2string = function(e, t) {
					var r, n, i, s, a = t || e.length, o = new Array(2 * a);
					for (r = n = 0; r < a;) if ((i = e[r++]) < 128) o[n++] = i;
					else if (4 < (s = u[i])) o[n++] = 65533, r += s - 1;
					else {
						for (i &= 2 === s ? 31 : 3 === s ? 15 : 7; 1 < s && r < a;) i = i << 6 | 63 & e[r++], s--;
						1 < s ? o[n++] = 65533 : i < 65536 ? o[n++] = i : (i -= 65536, o[n++] = 55296 | i >> 10 & 1023, o[n++] = 56320 | 1023 & i);
					}
					return l(o, n);
				}, r.utf8border = function(e, t) {
					var r;
					for ((t = t || e.length) > e.length && (t = e.length), r = t - 1; 0 <= r && 128 == (192 & e[r]);) r--;
					return r < 0 ? t : 0 === r ? t : r + u[e[r]] > t ? r : t;
				};
			}, { "./common": 41 }],
			43: [function(e, t, r) {
				"use strict";
				t.exports = function(e, t, r, n) {
					for (var i = 65535 & e | 0, s = e >>> 16 & 65535 | 0, a = 0; 0 !== r;) {
						for (r -= a = 2e3 < r ? 2e3 : r; s = s + (i = i + t[n++] | 0) | 0, --a;);
						i %= 65521, s %= 65521;
					}
					return i | s << 16 | 0;
				};
			}, {}],
			44: [function(e, t, r) {
				"use strict";
				t.exports = {
					Z_NO_FLUSH: 0,
					Z_PARTIAL_FLUSH: 1,
					Z_SYNC_FLUSH: 2,
					Z_FULL_FLUSH: 3,
					Z_FINISH: 4,
					Z_BLOCK: 5,
					Z_TREES: 6,
					Z_OK: 0,
					Z_STREAM_END: 1,
					Z_NEED_DICT: 2,
					Z_ERRNO: -1,
					Z_STREAM_ERROR: -2,
					Z_DATA_ERROR: -3,
					Z_BUF_ERROR: -5,
					Z_NO_COMPRESSION: 0,
					Z_BEST_SPEED: 1,
					Z_BEST_COMPRESSION: 9,
					Z_DEFAULT_COMPRESSION: -1,
					Z_FILTERED: 1,
					Z_HUFFMAN_ONLY: 2,
					Z_RLE: 3,
					Z_FIXED: 4,
					Z_DEFAULT_STRATEGY: 0,
					Z_BINARY: 0,
					Z_TEXT: 1,
					Z_UNKNOWN: 2,
					Z_DEFLATED: 8
				};
			}, {}],
			45: [function(e, t, r) {
				"use strict";
				var o = function() {
					for (var e, t = [], r = 0; r < 256; r++) {
						e = r;
						for (var n = 0; n < 8; n++) e = 1 & e ? 3988292384 ^ e >>> 1 : e >>> 1;
						t[r] = e;
					}
					return t;
				}();
				t.exports = function(e, t, r, n) {
					var i = o, s = n + r;
					e ^= -1;
					for (var a = n; a < s; a++) e = e >>> 8 ^ i[255 & (e ^ t[a])];
					return -1 ^ e;
				};
			}, {}],
			46: [function(e, t, r) {
				"use strict";
				var h, c = e("../utils/common"), u = e("./trees"), d = e("./adler32"), p = e("./crc32"), n = e("./messages"), l = 0, f = 4, m = 0, _ = -2, g = -1, b = 4, i = 2, v = 8, y = 9, s = 286, a = 30, o = 19, w = 2 * s + 1, k = 15, x = 3, S = 258, z = S + x + 1, C = 42, E = 113, A = 1, I = 2, O = 3, B = 4;
				function R(e, t) {
					return e.msg = n[t], t;
				}
				function T(e) {
					return (e << 1) - (4 < e ? 9 : 0);
				}
				function D(e) {
					for (var t = e.length; 0 <= --t;) e[t] = 0;
				}
				function F(e) {
					var t = e.state, r = t.pending;
					r > e.avail_out && (r = e.avail_out), 0 !== r && (c.arraySet(e.output, t.pending_buf, t.pending_out, r, e.next_out), e.next_out += r, t.pending_out += r, e.total_out += r, e.avail_out -= r, t.pending -= r, 0 === t.pending && (t.pending_out = 0));
				}
				function N(e, t) {
					u._tr_flush_block(e, 0 <= e.block_start ? e.block_start : -1, e.strstart - e.block_start, t), e.block_start = e.strstart, F(e.strm);
				}
				function U(e, t) {
					e.pending_buf[e.pending++] = t;
				}
				function P(e, t) {
					e.pending_buf[e.pending++] = t >>> 8 & 255, e.pending_buf[e.pending++] = 255 & t;
				}
				function L(e, t) {
					var r, n, i = e.max_chain_length, s = e.strstart, a = e.prev_length, o = e.nice_match, h = e.strstart > e.w_size - z ? e.strstart - (e.w_size - z) : 0, u = e.window, l = e.w_mask, f = e.prev, c = e.strstart + S, d = u[s + a - 1], p = u[s + a];
					e.prev_length >= e.good_match && (i >>= 2), o > e.lookahead && (o = e.lookahead);
					do
						if (u[(r = t) + a] === p && u[r + a - 1] === d && u[r] === u[s] && u[++r] === u[s + 1]) {
							s += 2, r++;
							do							;
while (u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && u[++s] === u[++r] && s < c);
							if (n = S - (c - s), s = c - S, a < n) {
								if (e.match_start = t, o <= (a = n)) break;
								d = u[s + a - 1], p = u[s + a];
							}
						}
					while ((t = f[t & l]) > h && 0 != --i);
					return a <= e.lookahead ? a : e.lookahead;
				}
				function j(e) {
					var t, r, n, i, s, a, o, h, u, l, f = e.w_size;
					do {
						if (i = e.window_size - e.lookahead - e.strstart, e.strstart >= f + (f - z)) {
							for (c.arraySet(e.window, e.window, f, f, 0), e.match_start -= f, e.strstart -= f, e.block_start -= f, t = r = e.hash_size; n = e.head[--t], e.head[t] = f <= n ? n - f : 0, --r;);
							for (t = r = f; n = e.prev[--t], e.prev[t] = f <= n ? n - f : 0, --r;);
							i += f;
						}
						if (0 === e.strm.avail_in) break;
						if (a = e.strm, o = e.window, h = e.strstart + e.lookahead, u = i, l = void 0, l = a.avail_in, u < l && (l = u), r = 0 === l ? 0 : (a.avail_in -= l, c.arraySet(o, a.input, a.next_in, l, h), 1 === a.state.wrap ? a.adler = d(a.adler, o, l, h) : 2 === a.state.wrap && (a.adler = p(a.adler, o, l, h)), a.next_in += l, a.total_in += l, l), e.lookahead += r, e.lookahead + e.insert >= x) for (s = e.strstart - e.insert, e.ins_h = e.window[s], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[s + 1]) & e.hash_mask; e.insert && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[s + x - 1]) & e.hash_mask, e.prev[s & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = s, s++, e.insert--, !(e.lookahead + e.insert < x)););
					} while (e.lookahead < z && 0 !== e.strm.avail_in);
				}
				function Z(e, t) {
					for (var r, n;;) {
						if (e.lookahead < z) {
							if (j(e), e.lookahead < z && t === l) return A;
							if (0 === e.lookahead) break;
						}
						if (r = 0, e.lookahead >= x && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), 0 !== r && e.strstart - r <= e.w_size - z && (e.match_length = L(e, r)), e.match_length >= x) if (n = u._tr_tally(e, e.strstart - e.match_start, e.match_length - x), e.lookahead -= e.match_length, e.match_length <= e.max_lazy_match && e.lookahead >= x) {
							for (e.match_length--; e.strstart++, e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart, 0 != --e.match_length;);
							e.strstart++;
						} else e.strstart += e.match_length, e.match_length = 0, e.ins_h = e.window[e.strstart], e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + 1]) & e.hash_mask;
						else n = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++;
						if (n && (N(e, !1), 0 === e.strm.avail_out)) return A;
					}
					return e.insert = e.strstart < x - 1 ? e.strstart : x - 1, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
				}
				function W(e, t) {
					for (var r, n, i;;) {
						if (e.lookahead < z) {
							if (j(e), e.lookahead < z && t === l) return A;
							if (0 === e.lookahead) break;
						}
						if (r = 0, e.lookahead >= x && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), e.prev_length = e.match_length, e.prev_match = e.match_start, e.match_length = x - 1, 0 !== r && e.prev_length < e.max_lazy_match && e.strstart - r <= e.w_size - z && (e.match_length = L(e, r), e.match_length <= 5 && (1 === e.strategy || e.match_length === x && 4096 < e.strstart - e.match_start) && (e.match_length = x - 1)), e.prev_length >= x && e.match_length <= e.prev_length) {
							for (i = e.strstart + e.lookahead - x, n = u._tr_tally(e, e.strstart - 1 - e.prev_match, e.prev_length - x), e.lookahead -= e.prev_length - 1, e.prev_length -= 2; ++e.strstart <= i && (e.ins_h = (e.ins_h << e.hash_shift ^ e.window[e.strstart + x - 1]) & e.hash_mask, r = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h], e.head[e.ins_h] = e.strstart), 0 != --e.prev_length;);
							if (e.match_available = 0, e.match_length = x - 1, e.strstart++, n && (N(e, !1), 0 === e.strm.avail_out)) return A;
						} else if (e.match_available) {
							if ((n = u._tr_tally(e, 0, e.window[e.strstart - 1])) && N(e, !1), e.strstart++, e.lookahead--, 0 === e.strm.avail_out) return A;
						} else e.match_available = 1, e.strstart++, e.lookahead--;
					}
					return e.match_available && (n = u._tr_tally(e, 0, e.window[e.strstart - 1]), e.match_available = 0), e.insert = e.strstart < x - 1 ? e.strstart : x - 1, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
				}
				function M(e, t, r, n, i) {
					this.good_length = e, this.max_lazy = t, this.nice_length = r, this.max_chain = n, this.func = i;
				}
				function H() {
					this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = v, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new c.Buf16(2 * w), this.dyn_dtree = new c.Buf16(2 * (2 * a + 1)), this.bl_tree = new c.Buf16(2 * (2 * o + 1)), D(this.dyn_ltree), D(this.dyn_dtree), D(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new c.Buf16(k + 1), this.heap = new c.Buf16(2 * s + 1), D(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new c.Buf16(2 * s + 1), D(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
				}
				function G(e) {
					var t;
					return e && e.state ? (e.total_in = e.total_out = 0, e.data_type = i, (t = e.state).pending = 0, t.pending_out = 0, t.wrap < 0 && (t.wrap = -t.wrap), t.status = t.wrap ? C : E, e.adler = 2 === t.wrap ? 0 : 1, t.last_flush = l, u._tr_init(t), m) : R(e, _);
				}
				function K(e) {
					var t = G(e);
					return t === m && function(e) {
						e.window_size = 2 * e.w_size, D(e.head), e.max_lazy_match = h[e.level].max_lazy, e.good_match = h[e.level].good_length, e.nice_match = h[e.level].nice_length, e.max_chain_length = h[e.level].max_chain, e.strstart = 0, e.block_start = 0, e.lookahead = 0, e.insert = 0, e.match_length = e.prev_length = x - 1, e.match_available = 0, e.ins_h = 0;
					}(e.state), t;
				}
				function Y(e, t, r, n, i, s) {
					if (!e) return _;
					var a = 1;
					if (t === g && (t = 6), n < 0 ? (a = 0, n = -n) : 15 < n && (a = 2, n -= 16), i < 1 || y < i || r !== v || n < 8 || 15 < n || t < 0 || 9 < t || s < 0 || b < s) return R(e, _);
					8 === n && (n = 9);
					var o = new H();
					return (e.state = o).strm = e, o.wrap = a, o.gzhead = null, o.w_bits = n, o.w_size = 1 << o.w_bits, o.w_mask = o.w_size - 1, o.hash_bits = i + 7, o.hash_size = 1 << o.hash_bits, o.hash_mask = o.hash_size - 1, o.hash_shift = ~~((o.hash_bits + x - 1) / x), o.window = new c.Buf8(2 * o.w_size), o.head = new c.Buf16(o.hash_size), o.prev = new c.Buf16(o.w_size), o.lit_bufsize = 1 << i + 6, o.pending_buf_size = 4 * o.lit_bufsize, o.pending_buf = new c.Buf8(o.pending_buf_size), o.d_buf = 1 * o.lit_bufsize, o.l_buf = 3 * o.lit_bufsize, o.level = t, o.strategy = s, o.method = r, K(e);
				}
				h = [
					new M(0, 0, 0, 0, function(e, t) {
						var r = 65535;
						for (r > e.pending_buf_size - 5 && (r = e.pending_buf_size - 5);;) {
							if (e.lookahead <= 1) {
								if (j(e), 0 === e.lookahead && t === l) return A;
								if (0 === e.lookahead) break;
							}
							e.strstart += e.lookahead, e.lookahead = 0;
							var n = e.block_start + r;
							if ((0 === e.strstart || e.strstart >= n) && (e.lookahead = e.strstart - n, e.strstart = n, N(e, !1), 0 === e.strm.avail_out)) return A;
							if (e.strstart - e.block_start >= e.w_size - z && (N(e, !1), 0 === e.strm.avail_out)) return A;
						}
						return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : (e.strstart > e.block_start && (N(e, !1), e.strm.avail_out), A);
					}),
					new M(4, 4, 8, 4, Z),
					new M(4, 5, 16, 8, Z),
					new M(4, 6, 32, 32, Z),
					new M(4, 4, 16, 16, W),
					new M(8, 16, 32, 32, W),
					new M(8, 16, 128, 128, W),
					new M(8, 32, 128, 256, W),
					new M(32, 128, 258, 1024, W),
					new M(32, 258, 258, 4096, W)
				], r.deflateInit = function(e, t) {
					return Y(e, t, v, 15, 8, 0);
				}, r.deflateInit2 = Y, r.deflateReset = K, r.deflateResetKeep = G, r.deflateSetHeader = function(e, t) {
					return e && e.state ? 2 !== e.state.wrap ? _ : (e.state.gzhead = t, m) : _;
				}, r.deflate = function(e, t) {
					var r, n, i, s;
					if (!e || !e.state || 5 < t || t < 0) return e ? R(e, _) : _;
					if (n = e.state, !e.output || !e.input && 0 !== e.avail_in || 666 === n.status && t !== f) return R(e, 0 === e.avail_out ? -5 : _);
					if (n.strm = e, r = n.last_flush, n.last_flush = t, n.status === C) if (2 === n.wrap) e.adler = 0, U(n, 31), U(n, 139), U(n, 8), n.gzhead ? (U(n, (n.gzhead.text ? 1 : 0) + (n.gzhead.hcrc ? 2 : 0) + (n.gzhead.extra ? 4 : 0) + (n.gzhead.name ? 8 : 0) + (n.gzhead.comment ? 16 : 0)), U(n, 255 & n.gzhead.time), U(n, n.gzhead.time >> 8 & 255), U(n, n.gzhead.time >> 16 & 255), U(n, n.gzhead.time >> 24 & 255), U(n, 9 === n.level ? 2 : 2 <= n.strategy || n.level < 2 ? 4 : 0), U(n, 255 & n.gzhead.os), n.gzhead.extra && n.gzhead.extra.length && (U(n, 255 & n.gzhead.extra.length), U(n, n.gzhead.extra.length >> 8 & 255)), n.gzhead.hcrc && (e.adler = p(e.adler, n.pending_buf, n.pending, 0)), n.gzindex = 0, n.status = 69) : (U(n, 0), U(n, 0), U(n, 0), U(n, 0), U(n, 0), U(n, 9 === n.level ? 2 : 2 <= n.strategy || n.level < 2 ? 4 : 0), U(n, 3), n.status = E);
					else {
						var a = v + (n.w_bits - 8 << 4) << 8;
						a |= (2 <= n.strategy || n.level < 2 ? 0 : n.level < 6 ? 1 : 6 === n.level ? 2 : 3) << 6, 0 !== n.strstart && (a |= 32), a += 31 - a % 31, n.status = E, P(n, a), 0 !== n.strstart && (P(n, e.adler >>> 16), P(n, 65535 & e.adler)), e.adler = 1;
					}
					if (69 === n.status) if (n.gzhead.extra) {
						for (i = n.pending; n.gzindex < (65535 & n.gzhead.extra.length) && (n.pending !== n.pending_buf_size || (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending !== n.pending_buf_size));) U(n, 255 & n.gzhead.extra[n.gzindex]), n.gzindex++;
						n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), n.gzindex === n.gzhead.extra.length && (n.gzindex = 0, n.status = 73);
					} else n.status = 73;
					if (73 === n.status) if (n.gzhead.name) {
						i = n.pending;
						do {
							if (n.pending === n.pending_buf_size && (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending === n.pending_buf_size)) {
								s = 1;
								break;
							}
							s = n.gzindex < n.gzhead.name.length ? 255 & n.gzhead.name.charCodeAt(n.gzindex++) : 0, U(n, s);
						} while (0 !== s);
						n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), 0 === s && (n.gzindex = 0, n.status = 91);
					} else n.status = 91;
					if (91 === n.status) if (n.gzhead.comment) {
						i = n.pending;
						do {
							if (n.pending === n.pending_buf_size && (n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), F(e), i = n.pending, n.pending === n.pending_buf_size)) {
								s = 1;
								break;
							}
							s = n.gzindex < n.gzhead.comment.length ? 255 & n.gzhead.comment.charCodeAt(n.gzindex++) : 0, U(n, s);
						} while (0 !== s);
						n.gzhead.hcrc && n.pending > i && (e.adler = p(e.adler, n.pending_buf, n.pending - i, i)), 0 === s && (n.status = 103);
					} else n.status = 103;
					if (103 === n.status && (n.gzhead.hcrc ? (n.pending + 2 > n.pending_buf_size && F(e), n.pending + 2 <= n.pending_buf_size && (U(n, 255 & e.adler), U(n, e.adler >> 8 & 255), e.adler = 0, n.status = E)) : n.status = E), 0 !== n.pending) {
						if (F(e), 0 === e.avail_out) return n.last_flush = -1, m;
					} else if (0 === e.avail_in && T(t) <= T(r) && t !== f) return R(e, -5);
					if (666 === n.status && 0 !== e.avail_in) return R(e, -5);
					if (0 !== e.avail_in || 0 !== n.lookahead || t !== l && 666 !== n.status) {
						var o = 2 === n.strategy ? function(e, t) {
							for (var r;;) {
								if (0 === e.lookahead && (j(e), 0 === e.lookahead)) {
									if (t === l) return A;
									break;
								}
								if (e.match_length = 0, r = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++, r && (N(e, !1), 0 === e.strm.avail_out)) return A;
							}
							return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
						}(n, t) : 3 === n.strategy ? function(e, t) {
							for (var r, n, i, s, a = e.window;;) {
								if (e.lookahead <= S) {
									if (j(e), e.lookahead <= S && t === l) return A;
									if (0 === e.lookahead) break;
								}
								if (e.match_length = 0, e.lookahead >= x && 0 < e.strstart && (n = a[i = e.strstart - 1]) === a[++i] && n === a[++i] && n === a[++i]) {
									s = e.strstart + S;
									do									;
while (n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && n === a[++i] && i < s);
									e.match_length = S - (s - i), e.match_length > e.lookahead && (e.match_length = e.lookahead);
								}
								if (e.match_length >= x ? (r = u._tr_tally(e, 1, e.match_length - x), e.lookahead -= e.match_length, e.strstart += e.match_length, e.match_length = 0) : (r = u._tr_tally(e, 0, e.window[e.strstart]), e.lookahead--, e.strstart++), r && (N(e, !1), 0 === e.strm.avail_out)) return A;
							}
							return e.insert = 0, t === f ? (N(e, !0), 0 === e.strm.avail_out ? O : B) : e.last_lit && (N(e, !1), 0 === e.strm.avail_out) ? A : I;
						}(n, t) : h[n.level].func(n, t);
						if (o !== O && o !== B || (n.status = 666), o === A || o === O) return 0 === e.avail_out && (n.last_flush = -1), m;
						if (o === I && (1 === t ? u._tr_align(n) : 5 !== t && (u._tr_stored_block(n, 0, 0, !1), 3 === t && (D(n.head), 0 === n.lookahead && (n.strstart = 0, n.block_start = 0, n.insert = 0))), F(e), 0 === e.avail_out)) return n.last_flush = -1, m;
					}
					return t !== f ? m : n.wrap <= 0 ? 1 : (2 === n.wrap ? (U(n, 255 & e.adler), U(n, e.adler >> 8 & 255), U(n, e.adler >> 16 & 255), U(n, e.adler >> 24 & 255), U(n, 255 & e.total_in), U(n, e.total_in >> 8 & 255), U(n, e.total_in >> 16 & 255), U(n, e.total_in >> 24 & 255)) : (P(n, e.adler >>> 16), P(n, 65535 & e.adler)), F(e), 0 < n.wrap && (n.wrap = -n.wrap), 0 !== n.pending ? m : 1);
				}, r.deflateEnd = function(e) {
					var t;
					return e && e.state ? (t = e.state.status) !== C && 69 !== t && 73 !== t && 91 !== t && 103 !== t && t !== E && 666 !== t ? R(e, _) : (e.state = null, t === E ? R(e, -3) : m) : _;
				}, r.deflateSetDictionary = function(e, t) {
					var r, n, i, s, a, o, h, u, l = t.length;
					if (!e || !e.state) return _;
					if (2 === (s = (r = e.state).wrap) || 1 === s && r.status !== C || r.lookahead) return _;
					for (1 === s && (e.adler = d(e.adler, t, l, 0)), r.wrap = 0, l >= r.w_size && (0 === s && (D(r.head), r.strstart = 0, r.block_start = 0, r.insert = 0), u = new c.Buf8(r.w_size), c.arraySet(u, t, l - r.w_size, r.w_size, 0), t = u, l = r.w_size), a = e.avail_in, o = e.next_in, h = e.input, e.avail_in = l, e.next_in = 0, e.input = t, j(r); r.lookahead >= x;) {
						for (n = r.strstart, i = r.lookahead - (x - 1); r.ins_h = (r.ins_h << r.hash_shift ^ r.window[n + x - 1]) & r.hash_mask, r.prev[n & r.w_mask] = r.head[r.ins_h], r.head[r.ins_h] = n, n++, --i;);
						r.strstart = n, r.lookahead = x - 1, j(r);
					}
					return r.strstart += r.lookahead, r.block_start = r.strstart, r.insert = r.lookahead, r.lookahead = 0, r.match_length = r.prev_length = x - 1, r.match_available = 0, e.next_in = o, e.input = h, e.avail_in = a, r.wrap = s, m;
				}, r.deflateInfo = "pako deflate (from Nodeca project)";
			}, {
				"../utils/common": 41,
				"./adler32": 43,
				"./crc32": 45,
				"./messages": 51,
				"./trees": 52
			}],
			47: [function(e, t, r) {
				"use strict";
				t.exports = function() {
					this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = !1;
				};
			}, {}],
			48: [function(e, t, r) {
				"use strict";
				t.exports = function(e, t) {
					var r = e.state, n = e.next_in, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z = e.input, C;
					i = n + (e.avail_in - 5), s = e.next_out, C = e.output, a = s - (t - e.avail_out), o = s + (e.avail_out - 257), h = r.dmax, u = r.wsize, l = r.whave, f = r.wnext, c = r.window, d = r.hold, p = r.bits, m = r.lencode, _ = r.distcode, g = (1 << r.lenbits) - 1, b = (1 << r.distbits) - 1;
					e: do {
						p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = m[d & g];
						t: for (;;) {
							if (d >>>= y = v >>> 24, p -= y, 0 === (y = v >>> 16 & 255)) C[s++] = 65535 & v;
							else {
								if (!(16 & y)) {
									if (0 == (64 & y)) {
										v = m[(65535 & v) + (d & (1 << y) - 1)];
										continue t;
									}
									if (32 & y) {
										r.mode = 12;
										break e;
									}
									e.msg = "invalid literal/length code", r.mode = 30;
									break e;
								}
								w = 65535 & v, (y &= 15) && (p < y && (d += z[n++] << p, p += 8), w += d & (1 << y) - 1, d >>>= y, p -= y), p < 15 && (d += z[n++] << p, p += 8, d += z[n++] << p, p += 8), v = _[d & b];
								r: for (;;) {
									if (d >>>= y = v >>> 24, p -= y, !(16 & (y = v >>> 16 & 255))) {
										if (0 == (64 & y)) {
											v = _[(65535 & v) + (d & (1 << y) - 1)];
											continue r;
										}
										e.msg = "invalid distance code", r.mode = 30;
										break e;
									}
									if (k = 65535 & v, p < (y &= 15) && (d += z[n++] << p, (p += 8) < y && (d += z[n++] << p, p += 8)), h < (k += d & (1 << y) - 1)) {
										e.msg = "invalid distance too far back", r.mode = 30;
										break e;
									}
									if (d >>>= y, p -= y, (y = s - a) < k) {
										if (l < (y = k - y) && r.sane) {
											e.msg = "invalid distance too far back", r.mode = 30;
											break e;
										}
										if (S = c, (x = 0) === f) {
											if (x += u - y, y < w) {
												for (w -= y; C[s++] = c[x++], --y;);
												x = s - k, S = C;
											}
										} else if (f < y) {
											if (x += u + f - y, (y -= f) < w) {
												for (w -= y; C[s++] = c[x++], --y;);
												if (x = 0, f < w) {
													for (w -= y = f; C[s++] = c[x++], --y;);
													x = s - k, S = C;
												}
											}
										} else if (x += f - y, y < w) {
											for (w -= y; C[s++] = c[x++], --y;);
											x = s - k, S = C;
										}
										for (; 2 < w;) C[s++] = S[x++], C[s++] = S[x++], C[s++] = S[x++], w -= 3;
										w && (C[s++] = S[x++], 1 < w && (C[s++] = S[x++]));
									} else {
										for (x = s - k; C[s++] = C[x++], C[s++] = C[x++], C[s++] = C[x++], 2 < (w -= 3););
										w && (C[s++] = C[x++], 1 < w && (C[s++] = C[x++]));
									}
									break;
								}
							}
							break;
						}
					} while (n < i && s < o);
					n -= w = p >> 3, d &= (1 << (p -= w << 3)) - 1, e.next_in = n, e.next_out = s, e.avail_in = n < i ? i - n + 5 : 5 - (n - i), e.avail_out = s < o ? o - s + 257 : 257 - (s - o), r.hold = d, r.bits = p;
				};
			}, {}],
			49: [function(e, t, r) {
				"use strict";
				var I = e("../utils/common"), O = e("./adler32"), B = e("./crc32"), R = e("./inffast"), T = e("./inftrees"), D = 1, F = 2, N = 0, U = -2, P = 1, n = 852, i = 592;
				function L(e) {
					return (e >>> 24 & 255) + (e >>> 8 & 65280) + ((65280 & e) << 8) + ((255 & e) << 24);
				}
				function s() {
					this.mode = 0, this.last = !1, this.wrap = 0, this.havedict = !1, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new I.Buf16(320), this.work = new I.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
				}
				function a(e) {
					var t;
					return e && e.state ? (t = e.state, e.total_in = e.total_out = t.total = 0, e.msg = "", t.wrap && (e.adler = 1 & t.wrap), t.mode = P, t.last = 0, t.havedict = 0, t.dmax = 32768, t.head = null, t.hold = 0, t.bits = 0, t.lencode = t.lendyn = new I.Buf32(n), t.distcode = t.distdyn = new I.Buf32(i), t.sane = 1, t.back = -1, N) : U;
				}
				function o(e) {
					var t;
					return e && e.state ? ((t = e.state).wsize = 0, t.whave = 0, t.wnext = 0, a(e)) : U;
				}
				function h(e, t) {
					var r, n;
					return e && e.state ? (n = e.state, t < 0 ? (r = 0, t = -t) : (r = 1 + (t >> 4), t < 48 && (t &= 15)), t && (t < 8 || 15 < t) ? U : (null !== n.window && n.wbits !== t && (n.window = null), n.wrap = r, n.wbits = t, o(e))) : U;
				}
				function u(e, t) {
					var r, n;
					return e ? (n = new s(), (e.state = n).window = null, (r = h(e, t)) !== N && (e.state = null), r) : U;
				}
				var l, f, c = !0;
				function j(e) {
					if (c) {
						var t;
						for (l = new I.Buf32(512), f = new I.Buf32(32), t = 0; t < 144;) e.lens[t++] = 8;
						for (; t < 256;) e.lens[t++] = 9;
						for (; t < 280;) e.lens[t++] = 7;
						for (; t < 288;) e.lens[t++] = 8;
						for (T(D, e.lens, 0, 288, l, 0, e.work, { bits: 9 }), t = 0; t < 32;) e.lens[t++] = 5;
						T(F, e.lens, 0, 32, f, 0, e.work, { bits: 5 }), c = !1;
					}
					e.lencode = l, e.lenbits = 9, e.distcode = f, e.distbits = 5;
				}
				function Z(e, t, r, n) {
					var i, s = e.state;
					return null === s.window && (s.wsize = 1 << s.wbits, s.wnext = 0, s.whave = 0, s.window = new I.Buf8(s.wsize)), n >= s.wsize ? (I.arraySet(s.window, t, r - s.wsize, s.wsize, 0), s.wnext = 0, s.whave = s.wsize) : (n < (i = s.wsize - s.wnext) && (i = n), I.arraySet(s.window, t, r - n, i, s.wnext), (n -= i) ? (I.arraySet(s.window, t, r - n, n, 0), s.wnext = n, s.whave = s.wsize) : (s.wnext += i, s.wnext === s.wsize && (s.wnext = 0), s.whave < s.wsize && (s.whave += i))), 0;
				}
				r.inflateReset = o, r.inflateReset2 = h, r.inflateResetKeep = a, r.inflateInit = function(e) {
					return u(e, 15);
				}, r.inflateInit2 = u, r.inflate = function(e, t) {
					var r, n, i, s, a, o, h, u, l, f, c, d, p, m, _, g, b, v, y, w, k, x, S, z, C = 0, E = new I.Buf8(4), A = [
						16,
						17,
						18,
						0,
						8,
						7,
						9,
						6,
						10,
						5,
						11,
						4,
						12,
						3,
						13,
						2,
						14,
						1,
						15
					];
					if (!e || !e.state || !e.output || !e.input && 0 !== e.avail_in) return U;
					12 === (r = e.state).mode && (r.mode = 13), a = e.next_out, i = e.output, h = e.avail_out, s = e.next_in, n = e.input, o = e.avail_in, u = r.hold, l = r.bits, f = o, c = h, x = N;
					e: for (;;) switch (r.mode) {
						case P:
							if (0 === r.wrap) {
								r.mode = 13;
								break;
							}
							for (; l < 16;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if (2 & r.wrap && 35615 === u) {
								E[r.check = 0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0), l = u = 0, r.mode = 2;
								break;
							}
							if (r.flags = 0, r.head && (r.head.done = !1), !(1 & r.wrap) || (((255 & u) << 8) + (u >> 8)) % 31) {
								e.msg = "incorrect header check", r.mode = 30;
								break;
							}
							if (8 != (15 & u)) {
								e.msg = "unknown compression method", r.mode = 30;
								break;
							}
							if (l -= 4, k = 8 + (15 & (u >>>= 4)), 0 === r.wbits) r.wbits = k;
							else if (k > r.wbits) {
								e.msg = "invalid window size", r.mode = 30;
								break;
							}
							r.dmax = 1 << k, e.adler = r.check = 1, r.mode = 512 & u ? 10 : 12, l = u = 0;
							break;
						case 2:
							for (; l < 16;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if (r.flags = u, 8 != (255 & r.flags)) {
								e.msg = "unknown compression method", r.mode = 30;
								break;
							}
							if (57344 & r.flags) {
								e.msg = "unknown header flags set", r.mode = 30;
								break;
							}
							r.head && (r.head.text = u >> 8 & 1), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0, r.mode = 3;
						case 3:
							for (; l < 32;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							r.head && (r.head.time = u), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, E[2] = u >>> 16 & 255, E[3] = u >>> 24 & 255, r.check = B(r.check, E, 4, 0)), l = u = 0, r.mode = 4;
						case 4:
							for (; l < 16;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							r.head && (r.head.xflags = 255 & u, r.head.os = u >> 8), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0, r.mode = 5;
						case 5:
							if (1024 & r.flags) {
								for (; l < 16;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.length = u, r.head && (r.head.extra_len = u), 512 & r.flags && (E[0] = 255 & u, E[1] = u >>> 8 & 255, r.check = B(r.check, E, 2, 0)), l = u = 0;
							} else r.head && (r.head.extra = null);
							r.mode = 6;
						case 6:
							if (1024 & r.flags && (o < (d = r.length) && (d = o), d && (r.head && (k = r.head.extra_len - r.length, r.head.extra || (r.head.extra = new Array(r.head.extra_len)), I.arraySet(r.head.extra, n, s, d, k)), 512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, r.length -= d), r.length)) break e;
							r.length = 0, r.mode = 7;
						case 7:
							if (2048 & r.flags) {
								if (0 === o) break e;
								for (d = 0; k = n[s + d++], r.head && k && r.length < 65536 && (r.head.name += String.fromCharCode(k)), k && d < o;);
								if (512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, k) break e;
							} else r.head && (r.head.name = null);
							r.length = 0, r.mode = 8;
						case 8:
							if (4096 & r.flags) {
								if (0 === o) break e;
								for (d = 0; k = n[s + d++], r.head && k && r.length < 65536 && (r.head.comment += String.fromCharCode(k)), k && d < o;);
								if (512 & r.flags && (r.check = B(r.check, n, d, s)), o -= d, s += d, k) break e;
							} else r.head && (r.head.comment = null);
							r.mode = 9;
						case 9:
							if (512 & r.flags) {
								for (; l < 16;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (u !== (65535 & r.check)) {
									e.msg = "header crc mismatch", r.mode = 30;
									break;
								}
								l = u = 0;
							}
							r.head && (r.head.hcrc = r.flags >> 9 & 1, r.head.done = !0), e.adler = r.check = 0, r.mode = 12;
							break;
						case 10:
							for (; l < 32;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							e.adler = r.check = L(u), l = u = 0, r.mode = 11;
						case 11:
							if (0 === r.havedict) return e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, 2;
							e.adler = r.check = 1, r.mode = 12;
						case 12: if (5 === t || 6 === t) break e;
						case 13:
							if (r.last) {
								u >>>= 7 & l, l -= 7 & l, r.mode = 27;
								break;
							}
							for (; l < 3;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							switch (r.last = 1 & u, l -= 1, 3 & (u >>>= 1)) {
								case 0:
									r.mode = 14;
									break;
								case 1:
									if (j(r), r.mode = 20, 6 !== t) break;
									u >>>= 2, l -= 2;
									break e;
								case 2:
									r.mode = 17;
									break;
								case 3: e.msg = "invalid block type", r.mode = 30;
							}
							u >>>= 2, l -= 2;
							break;
						case 14:
							for (u >>>= 7 & l, l -= 7 & l; l < 32;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if ((65535 & u) != (u >>> 16 ^ 65535)) {
								e.msg = "invalid stored block lengths", r.mode = 30;
								break;
							}
							if (r.length = 65535 & u, l = u = 0, r.mode = 15, 6 === t) break e;
						case 15: r.mode = 16;
						case 16:
							if (d = r.length) {
								if (o < d && (d = o), h < d && (d = h), 0 === d) break e;
								I.arraySet(i, n, s, d, a), o -= d, s += d, h -= d, a += d, r.length -= d;
								break;
							}
							r.mode = 12;
							break;
						case 17:
							for (; l < 14;) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if (r.nlen = 257 + (31 & u), u >>>= 5, l -= 5, r.ndist = 1 + (31 & u), u >>>= 5, l -= 5, r.ncode = 4 + (15 & u), u >>>= 4, l -= 4, 286 < r.nlen || 30 < r.ndist) {
								e.msg = "too many length or distance symbols", r.mode = 30;
								break;
							}
							r.have = 0, r.mode = 18;
						case 18:
							for (; r.have < r.ncode;) {
								for (; l < 3;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.lens[A[r.have++]] = 7 & u, u >>>= 3, l -= 3;
							}
							for (; r.have < 19;) r.lens[A[r.have++]] = 0;
							if (r.lencode = r.lendyn, r.lenbits = 7, S = { bits: r.lenbits }, x = T(0, r.lens, 0, 19, r.lencode, 0, r.work, S), r.lenbits = S.bits, x) {
								e.msg = "invalid code lengths set", r.mode = 30;
								break;
							}
							r.have = 0, r.mode = 19;
						case 19:
							for (; r.have < r.nlen + r.ndist;) {
								for (; g = (C = r.lencode[u & (1 << r.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (b < 16) u >>>= _, l -= _, r.lens[r.have++] = b;
								else {
									if (16 === b) {
										for (z = _ + 2; l < z;) {
											if (0 === o) break e;
											o--, u += n[s++] << l, l += 8;
										}
										if (u >>>= _, l -= _, 0 === r.have) {
											e.msg = "invalid bit length repeat", r.mode = 30;
											break;
										}
										k = r.lens[r.have - 1], d = 3 + (3 & u), u >>>= 2, l -= 2;
									} else if (17 === b) {
										for (z = _ + 3; l < z;) {
											if (0 === o) break e;
											o--, u += n[s++] << l, l += 8;
										}
										l -= _, k = 0, d = 3 + (7 & (u >>>= _)), u >>>= 3, l -= 3;
									} else {
										for (z = _ + 7; l < z;) {
											if (0 === o) break e;
											o--, u += n[s++] << l, l += 8;
										}
										l -= _, k = 0, d = 11 + (127 & (u >>>= _)), u >>>= 7, l -= 7;
									}
									if (r.have + d > r.nlen + r.ndist) {
										e.msg = "invalid bit length repeat", r.mode = 30;
										break;
									}
									for (; d--;) r.lens[r.have++] = k;
								}
							}
							if (30 === r.mode) break;
							if (0 === r.lens[256]) {
								e.msg = "invalid code -- missing end-of-block", r.mode = 30;
								break;
							}
							if (r.lenbits = 9, S = { bits: r.lenbits }, x = T(D, r.lens, 0, r.nlen, r.lencode, 0, r.work, S), r.lenbits = S.bits, x) {
								e.msg = "invalid literal/lengths set", r.mode = 30;
								break;
							}
							if (r.distbits = 6, r.distcode = r.distdyn, S = { bits: r.distbits }, x = T(F, r.lens, r.nlen, r.ndist, r.distcode, 0, r.work, S), r.distbits = S.bits, x) {
								e.msg = "invalid distances set", r.mode = 30;
								break;
							}
							if (r.mode = 20, 6 === t) break e;
						case 20: r.mode = 21;
						case 21:
							if (6 <= o && 258 <= h) {
								e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, R(e, c), a = e.next_out, i = e.output, h = e.avail_out, s = e.next_in, n = e.input, o = e.avail_in, u = r.hold, l = r.bits, 12 === r.mode && (r.back = -1);
								break;
							}
							for (r.back = 0; g = (C = r.lencode[u & (1 << r.lenbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if (g && 0 == (240 & g)) {
								for (v = _, y = g, w = b; g = (C = r.lencode[w + ((u & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l);) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								u >>>= v, l -= v, r.back += v;
							}
							if (u >>>= _, l -= _, r.back += _, r.length = b, 0 === g) {
								r.mode = 26;
								break;
							}
							if (32 & g) {
								r.back = -1, r.mode = 12;
								break;
							}
							if (64 & g) {
								e.msg = "invalid literal/length code", r.mode = 30;
								break;
							}
							r.extra = 15 & g, r.mode = 22;
						case 22:
							if (r.extra) {
								for (z = r.extra; l < z;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.length += u & (1 << r.extra) - 1, u >>>= r.extra, l -= r.extra, r.back += r.extra;
							}
							r.was = r.length, r.mode = 23;
						case 23:
							for (; g = (C = r.distcode[u & (1 << r.distbits) - 1]) >>> 16 & 255, b = 65535 & C, !((_ = C >>> 24) <= l);) {
								if (0 === o) break e;
								o--, u += n[s++] << l, l += 8;
							}
							if (0 == (240 & g)) {
								for (v = _, y = g, w = b; g = (C = r.distcode[w + ((u & (1 << v + y) - 1) >> v)]) >>> 16 & 255, b = 65535 & C, !(v + (_ = C >>> 24) <= l);) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								u >>>= v, l -= v, r.back += v;
							}
							if (u >>>= _, l -= _, r.back += _, 64 & g) {
								e.msg = "invalid distance code", r.mode = 30;
								break;
							}
							r.offset = b, r.extra = 15 & g, r.mode = 24;
						case 24:
							if (r.extra) {
								for (z = r.extra; l < z;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								r.offset += u & (1 << r.extra) - 1, u >>>= r.extra, l -= r.extra, r.back += r.extra;
							}
							if (r.offset > r.dmax) {
								e.msg = "invalid distance too far back", r.mode = 30;
								break;
							}
							r.mode = 25;
						case 25:
							if (0 === h) break e;
							if (d = c - h, r.offset > d) {
								if ((d = r.offset - d) > r.whave && r.sane) {
									e.msg = "invalid distance too far back", r.mode = 30;
									break;
								}
								p = d > r.wnext ? (d -= r.wnext, r.wsize - d) : r.wnext - d, d > r.length && (d = r.length), m = r.window;
							} else m = i, p = a - r.offset, d = r.length;
							for (h < d && (d = h), h -= d, r.length -= d; i[a++] = m[p++], --d;);
							0 === r.length && (r.mode = 21);
							break;
						case 26:
							if (0 === h) break e;
							i[a++] = r.length, h--, r.mode = 21;
							break;
						case 27:
							if (r.wrap) {
								for (; l < 32;) {
									if (0 === o) break e;
									o--, u |= n[s++] << l, l += 8;
								}
								if (c -= h, e.total_out += c, r.total += c, c && (e.adler = r.check = r.flags ? B(r.check, i, c, a - c) : O(r.check, i, c, a - c)), c = h, (r.flags ? u : L(u)) !== r.check) {
									e.msg = "incorrect data check", r.mode = 30;
									break;
								}
								l = u = 0;
							}
							r.mode = 28;
						case 28:
							if (r.wrap && r.flags) {
								for (; l < 32;) {
									if (0 === o) break e;
									o--, u += n[s++] << l, l += 8;
								}
								if (u !== (4294967295 & r.total)) {
									e.msg = "incorrect length check", r.mode = 30;
									break;
								}
								l = u = 0;
							}
							r.mode = 29;
						case 29:
							x = 1;
							break e;
						case 30:
							x = -3;
							break e;
						case 31: return -4;
						case 32:
						default: return U;
					}
					return e.next_out = a, e.avail_out = h, e.next_in = s, e.avail_in = o, r.hold = u, r.bits = l, (r.wsize || c !== e.avail_out && r.mode < 30 && (r.mode < 27 || 4 !== t)) && Z(e, e.output, e.next_out, c - e.avail_out) ? (r.mode = 31, -4) : (f -= e.avail_in, c -= e.avail_out, e.total_in += f, e.total_out += c, r.total += c, r.wrap && c && (e.adler = r.check = r.flags ? B(r.check, i, c, e.next_out - c) : O(r.check, i, c, e.next_out - c)), e.data_type = r.bits + (r.last ? 64 : 0) + (12 === r.mode ? 128 : 0) + (20 === r.mode || 15 === r.mode ? 256 : 0), (0 == f && 0 === c || 4 === t) && x === N && (x = -5), x);
				}, r.inflateEnd = function(e) {
					if (!e || !e.state) return U;
					var t = e.state;
					return t.window && (t.window = null), e.state = null, N;
				}, r.inflateGetHeader = function(e, t) {
					var r;
					return e && e.state ? 0 == (2 & (r = e.state).wrap) ? U : ((r.head = t).done = !1, N) : U;
				}, r.inflateSetDictionary = function(e, t) {
					var r, n = t.length;
					return e && e.state ? 0 !== (r = e.state).wrap && 11 !== r.mode ? U : 11 === r.mode && O(1, t, n, 0) !== r.check ? -3 : Z(e, t, n, n) ? (r.mode = 31, -4) : (r.havedict = 1, N) : U;
				}, r.inflateInfo = "pako inflate (from Nodeca project)";
			}, {
				"../utils/common": 41,
				"./adler32": 43,
				"./crc32": 45,
				"./inffast": 48,
				"./inftrees": 50
			}],
			50: [function(e, t, r) {
				"use strict";
				var D = e("../utils/common"), F = [
					3,
					4,
					5,
					6,
					7,
					8,
					9,
					10,
					11,
					13,
					15,
					17,
					19,
					23,
					27,
					31,
					35,
					43,
					51,
					59,
					67,
					83,
					99,
					115,
					131,
					163,
					195,
					227,
					258,
					0,
					0
				], N = [
					16,
					16,
					16,
					16,
					16,
					16,
					16,
					16,
					17,
					17,
					17,
					17,
					18,
					18,
					18,
					18,
					19,
					19,
					19,
					19,
					20,
					20,
					20,
					20,
					21,
					21,
					21,
					21,
					16,
					72,
					78
				], U = [
					1,
					2,
					3,
					4,
					5,
					7,
					9,
					13,
					17,
					25,
					33,
					49,
					65,
					97,
					129,
					193,
					257,
					385,
					513,
					769,
					1025,
					1537,
					2049,
					3073,
					4097,
					6145,
					8193,
					12289,
					16385,
					24577,
					0,
					0
				], P = [
					16,
					16,
					16,
					16,
					17,
					17,
					18,
					18,
					19,
					19,
					20,
					20,
					21,
					21,
					22,
					22,
					23,
					23,
					24,
					24,
					25,
					25,
					26,
					26,
					27,
					27,
					28,
					28,
					29,
					29,
					64,
					64
				];
				t.exports = function(e, t, r, n, i, s, a, o) {
					var h, u, l, f, c, d, p, m, _, g = o.bits, b = 0, v = 0, y = 0, w = 0, k = 0, x = 0, S = 0, z = 0, C = 0, E = 0, A = null, I = 0, O = new D.Buf16(16), B = new D.Buf16(16), R = null, T = 0;
					for (b = 0; b <= 15; b++) O[b] = 0;
					for (v = 0; v < n; v++) O[t[r + v]]++;
					for (k = g, w = 15; 1 <= w && 0 === O[w]; w--);
					if (w < k && (k = w), 0 === w) return i[s++] = 20971520, i[s++] = 20971520, o.bits = 1, 0;
					for (y = 1; y < w && 0 === O[y]; y++);
					for (k < y && (k = y), b = z = 1; b <= 15; b++) if (z <<= 1, (z -= O[b]) < 0) return -1;
					if (0 < z && (0 === e || 1 !== w)) return -1;
					for (B[1] = 0, b = 1; b < 15; b++) B[b + 1] = B[b] + O[b];
					for (v = 0; v < n; v++) 0 !== t[r + v] && (a[B[t[r + v]]++] = v);
					if (d = 0 === e ? (A = R = a, 19) : 1 === e ? (A = F, I -= 257, R = N, T -= 257, 256) : (A = U, R = P, -1), b = y, c = s, S = v = E = 0, l = -1, f = (C = 1 << (x = k)) - 1, 1 === e && 852 < C || 2 === e && 592 < C) return 1;
					for (;;) {
						for (p = b - S, _ = a[v] < d ? (m = 0, a[v]) : a[v] > d ? (m = R[T + a[v]], A[I + a[v]]) : (m = 96, 0), h = 1 << b - S, y = u = 1 << x; i[c + (E >> S) + (u -= h)] = p << 24 | m << 16 | _ | 0, 0 !== u;);
						for (h = 1 << b - 1; E & h;) h >>= 1;
						if (0 !== h ? (E &= h - 1, E += h) : E = 0, v++, 0 == --O[b]) {
							if (b === w) break;
							b = t[r + a[v]];
						}
						if (k < b && (E & f) !== l) {
							for (0 === S && (S = k), c += y, z = 1 << (x = b - S); x + S < w && !((z -= O[x + S]) <= 0);) x++, z <<= 1;
							if (C += 1 << x, 1 === e && 852 < C || 2 === e && 592 < C) return 1;
							i[l = E & f] = k << 24 | x << 16 | c - s | 0;
						}
					}
					return 0 !== E && (i[c + E] = b - S << 24 | 4194304), o.bits = k, 0;
				};
			}, { "../utils/common": 41 }],
			51: [function(e, t, r) {
				"use strict";
				t.exports = {
					2: "need dictionary",
					1: "stream end",
					0: "",
					"-1": "file error",
					"-2": "stream error",
					"-3": "data error",
					"-4": "insufficient memory",
					"-5": "buffer error",
					"-6": "incompatible version"
				};
			}, {}],
			52: [function(e, t, r) {
				"use strict";
				var i = e("../utils/common"), o = 0, h = 1;
				function n(e) {
					for (var t = e.length; 0 <= --t;) e[t] = 0;
				}
				var s = 0, a = 29, u = 256, l = u + 1 + a, f = 30, c = 19, _ = 2 * l + 1, g = 15, d = 16, p = 7, m = 256, b = 16, v = 17, y = 18, w = [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					1,
					2,
					2,
					2,
					2,
					3,
					3,
					3,
					3,
					4,
					4,
					4,
					4,
					5,
					5,
					5,
					5,
					0
				], k = [
					0,
					0,
					0,
					0,
					1,
					1,
					2,
					2,
					3,
					3,
					4,
					4,
					5,
					5,
					6,
					6,
					7,
					7,
					8,
					8,
					9,
					9,
					10,
					10,
					11,
					11,
					12,
					12,
					13,
					13
				], x = [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					2,
					3,
					7
				], S = [
					16,
					17,
					18,
					0,
					8,
					7,
					9,
					6,
					10,
					5,
					11,
					4,
					12,
					3,
					13,
					2,
					14,
					1,
					15
				], z = new Array(2 * (l + 2));
				n(z);
				var C = new Array(2 * f);
				n(C);
				var E = new Array(512);
				n(E);
				var A = new Array(256);
				n(A);
				var I = new Array(a);
				n(I);
				var O, B, R, T = new Array(f);
				function D(e, t, r, n, i) {
					this.static_tree = e, this.extra_bits = t, this.extra_base = r, this.elems = n, this.max_length = i, this.has_stree = e && e.length;
				}
				function F(e, t) {
					this.dyn_tree = e, this.max_code = 0, this.stat_desc = t;
				}
				function N(e) {
					return e < 256 ? E[e] : E[256 + (e >>> 7)];
				}
				function U(e, t) {
					e.pending_buf[e.pending++] = 255 & t, e.pending_buf[e.pending++] = t >>> 8 & 255;
				}
				function P(e, t, r) {
					e.bi_valid > d - r ? (e.bi_buf |= t << e.bi_valid & 65535, U(e, e.bi_buf), e.bi_buf = t >> d - e.bi_valid, e.bi_valid += r - d) : (e.bi_buf |= t << e.bi_valid & 65535, e.bi_valid += r);
				}
				function L(e, t, r) {
					P(e, r[2 * t], r[2 * t + 1]);
				}
				function j(e, t) {
					for (var r = 0; r |= 1 & e, e >>>= 1, r <<= 1, 0 < --t;);
					return r >>> 1;
				}
				function Z(e, t, r) {
					var n, i, s = new Array(g + 1), a = 0;
					for (n = 1; n <= g; n++) s[n] = a = a + r[n - 1] << 1;
					for (i = 0; i <= t; i++) {
						var o = e[2 * i + 1];
						0 !== o && (e[2 * i] = j(s[o]++, o));
					}
				}
				function W(e) {
					var t;
					for (t = 0; t < l; t++) e.dyn_ltree[2 * t] = 0;
					for (t = 0; t < f; t++) e.dyn_dtree[2 * t] = 0;
					for (t = 0; t < c; t++) e.bl_tree[2 * t] = 0;
					e.dyn_ltree[2 * m] = 1, e.opt_len = e.static_len = 0, e.last_lit = e.matches = 0;
				}
				function M(e) {
					8 < e.bi_valid ? U(e, e.bi_buf) : 0 < e.bi_valid && (e.pending_buf[e.pending++] = e.bi_buf), e.bi_buf = 0, e.bi_valid = 0;
				}
				function H(e, t, r, n) {
					var i = 2 * t, s = 2 * r;
					return e[i] < e[s] || e[i] === e[s] && n[t] <= n[r];
				}
				function G(e, t, r) {
					for (var n = e.heap[r], i = r << 1; i <= e.heap_len && (i < e.heap_len && H(t, e.heap[i + 1], e.heap[i], e.depth) && i++, !H(t, n, e.heap[i], e.depth));) e.heap[r] = e.heap[i], r = i, i <<= 1;
					e.heap[r] = n;
				}
				function K(e, t, r) {
					var n, i, s, a, o = 0;
					if (0 !== e.last_lit) for (; n = e.pending_buf[e.d_buf + 2 * o] << 8 | e.pending_buf[e.d_buf + 2 * o + 1], i = e.pending_buf[e.l_buf + o], o++, 0 === n ? L(e, i, t) : (L(e, (s = A[i]) + u + 1, t), 0 !== (a = w[s]) && P(e, i -= I[s], a), L(e, s = N(--n), r), 0 !== (a = k[s]) && P(e, n -= T[s], a)), o < e.last_lit;);
					L(e, m, t);
				}
				function Y(e, t) {
					var r, n, i, s = t.dyn_tree, a = t.stat_desc.static_tree, o = t.stat_desc.has_stree, h = t.stat_desc.elems, u = -1;
					for (e.heap_len = 0, e.heap_max = _, r = 0; r < h; r++) 0 !== s[2 * r] ? (e.heap[++e.heap_len] = u = r, e.depth[r] = 0) : s[2 * r + 1] = 0;
					for (; e.heap_len < 2;) s[2 * (i = e.heap[++e.heap_len] = u < 2 ? ++u : 0)] = 1, e.depth[i] = 0, e.opt_len--, o && (e.static_len -= a[2 * i + 1]);
					for (t.max_code = u, r = e.heap_len >> 1; 1 <= r; r--) G(e, s, r);
					for (i = h; r = e.heap[1], e.heap[1] = e.heap[e.heap_len--], G(e, s, 1), n = e.heap[1], e.heap[--e.heap_max] = r, e.heap[--e.heap_max] = n, s[2 * i] = s[2 * r] + s[2 * n], e.depth[i] = (e.depth[r] >= e.depth[n] ? e.depth[r] : e.depth[n]) + 1, s[2 * r + 1] = s[2 * n + 1] = i, e.heap[1] = i++, G(e, s, 1), 2 <= e.heap_len;);
					e.heap[--e.heap_max] = e.heap[1], function(e, t) {
						var r, n, i, s, a, o, h = t.dyn_tree, u = t.max_code, l = t.stat_desc.static_tree, f = t.stat_desc.has_stree, c = t.stat_desc.extra_bits, d = t.stat_desc.extra_base, p = t.stat_desc.max_length, m = 0;
						for (s = 0; s <= g; s++) e.bl_count[s] = 0;
						for (h[2 * e.heap[e.heap_max] + 1] = 0, r = e.heap_max + 1; r < _; r++) p < (s = h[2 * h[2 * (n = e.heap[r]) + 1] + 1] + 1) && (s = p, m++), h[2 * n + 1] = s, u < n || (e.bl_count[s]++, a = 0, d <= n && (a = c[n - d]), o = h[2 * n], e.opt_len += o * (s + a), f && (e.static_len += o * (l[2 * n + 1] + a)));
						if (0 !== m) {
							do {
								for (s = p - 1; 0 === e.bl_count[s];) s--;
								e.bl_count[s]--, e.bl_count[s + 1] += 2, e.bl_count[p]--, m -= 2;
							} while (0 < m);
							for (s = p; 0 !== s; s--) for (n = e.bl_count[s]; 0 !== n;) u < (i = e.heap[--r]) || (h[2 * i + 1] !== s && (e.opt_len += (s - h[2 * i + 1]) * h[2 * i], h[2 * i + 1] = s), n--);
						}
					}(e, t), Z(s, u, e.bl_count);
				}
				function X(e, t, r) {
					var n, i, s = -1, a = t[1], o = 0, h = 7, u = 4;
					for (0 === a && (h = 138, u = 3), t[2 * (r + 1) + 1] = 65535, n = 0; n <= r; n++) i = a, a = t[2 * (n + 1) + 1], ++o < h && i === a || (o < u ? e.bl_tree[2 * i] += o : 0 !== i ? (i !== s && e.bl_tree[2 * i]++, e.bl_tree[2 * b]++) : o <= 10 ? e.bl_tree[2 * v]++ : e.bl_tree[2 * y]++, s = i, u = (o = 0) === a ? (h = 138, 3) : i === a ? (h = 6, 3) : (h = 7, 4));
				}
				function V(e, t, r) {
					var n, i, s = -1, a = t[1], o = 0, h = 7, u = 4;
					for (0 === a && (h = 138, u = 3), n = 0; n <= r; n++) if (i = a, a = t[2 * (n + 1) + 1], !(++o < h && i === a)) {
						if (o < u) for (; L(e, i, e.bl_tree), 0 != --o;);
						else 0 !== i ? (i !== s && (L(e, i, e.bl_tree), o--), L(e, b, e.bl_tree), P(e, o - 3, 2)) : o <= 10 ? (L(e, v, e.bl_tree), P(e, o - 3, 3)) : (L(e, y, e.bl_tree), P(e, o - 11, 7));
						s = i, u = (o = 0) === a ? (h = 138, 3) : i === a ? (h = 6, 3) : (h = 7, 4);
					}
				}
				n(T);
				var q = !1;
				function J(e, t, r, n) {
					P(e, (s << 1) + (n ? 1 : 0), 3), function(e, t, r, n) {
						M(e), n && (U(e, r), U(e, ~r)), i.arraySet(e.pending_buf, e.window, t, r, e.pending), e.pending += r;
					}(e, t, r, !0);
				}
				r._tr_init = function(e) {
					q || (function() {
						var e, t, r, n, i, s = new Array(g + 1);
						for (n = r = 0; n < a - 1; n++) for (I[n] = r, e = 0; e < 1 << w[n]; e++) A[r++] = n;
						for (A[r - 1] = n, n = i = 0; n < 16; n++) for (T[n] = i, e = 0; e < 1 << k[n]; e++) E[i++] = n;
						for (i >>= 7; n < f; n++) for (T[n] = i << 7, e = 0; e < 1 << k[n] - 7; e++) E[256 + i++] = n;
						for (t = 0; t <= g; t++) s[t] = 0;
						for (e = 0; e <= 143;) z[2 * e + 1] = 8, e++, s[8]++;
						for (; e <= 255;) z[2 * e + 1] = 9, e++, s[9]++;
						for (; e <= 279;) z[2 * e + 1] = 7, e++, s[7]++;
						for (; e <= 287;) z[2 * e + 1] = 8, e++, s[8]++;
						for (Z(z, l + 1, s), e = 0; e < f; e++) C[2 * e + 1] = 5, C[2 * e] = j(e, 5);
						O = new D(z, w, u + 1, l, g), B = new D(C, k, 0, f, g), R = new D(new Array(0), x, 0, c, p);
					}(), q = !0), e.l_desc = new F(e.dyn_ltree, O), e.d_desc = new F(e.dyn_dtree, B), e.bl_desc = new F(e.bl_tree, R), e.bi_buf = 0, e.bi_valid = 0, W(e);
				}, r._tr_stored_block = J, r._tr_flush_block = function(e, t, r, n) {
					var i, s, a = 0;
					0 < e.level ? (2 === e.strm.data_type && (e.strm.data_type = function(e) {
						var t, r = 4093624447;
						for (t = 0; t <= 31; t++, r >>>= 1) if (1 & r && 0 !== e.dyn_ltree[2 * t]) return o;
						if (0 !== e.dyn_ltree[18] || 0 !== e.dyn_ltree[20] || 0 !== e.dyn_ltree[26]) return h;
						for (t = 32; t < u; t++) if (0 !== e.dyn_ltree[2 * t]) return h;
						return o;
					}(e)), Y(e, e.l_desc), Y(e, e.d_desc), a = function(e) {
						var t;
						for (X(e, e.dyn_ltree, e.l_desc.max_code), X(e, e.dyn_dtree, e.d_desc.max_code), Y(e, e.bl_desc), t = c - 1; 3 <= t && 0 === e.bl_tree[2 * S[t] + 1]; t--);
						return e.opt_len += 3 * (t + 1) + 5 + 5 + 4, t;
					}(e), i = e.opt_len + 3 + 7 >>> 3, (s = e.static_len + 3 + 7 >>> 3) <= i && (i = s)) : i = s = r + 5, r + 4 <= i && -1 !== t ? J(e, t, r, n) : 4 === e.strategy || s === i ? (P(e, 2 + (n ? 1 : 0), 3), K(e, z, C)) : (P(e, 4 + (n ? 1 : 0), 3), function(e, t, r, n) {
						var i;
						for (P(e, t - 257, 5), P(e, r - 1, 5), P(e, n - 4, 4), i = 0; i < n; i++) P(e, e.bl_tree[2 * S[i] + 1], 3);
						V(e, e.dyn_ltree, t - 1), V(e, e.dyn_dtree, r - 1);
					}(e, e.l_desc.max_code + 1, e.d_desc.max_code + 1, a + 1), K(e, e.dyn_ltree, e.dyn_dtree)), W(e), n && M(e);
				}, r._tr_tally = function(e, t, r) {
					return e.pending_buf[e.d_buf + 2 * e.last_lit] = t >>> 8 & 255, e.pending_buf[e.d_buf + 2 * e.last_lit + 1] = 255 & t, e.pending_buf[e.l_buf + e.last_lit] = 255 & r, e.last_lit++, 0 === t ? e.dyn_ltree[2 * r]++ : (e.matches++, t--, e.dyn_ltree[2 * (A[r] + u + 1)]++, e.dyn_dtree[2 * N(t)]++), e.last_lit === e.lit_bufsize - 1;
				}, r._tr_align = function(e) {
					P(e, 2, 3), L(e, m, z), function(e) {
						16 === e.bi_valid ? (U(e, e.bi_buf), e.bi_buf = 0, e.bi_valid = 0) : 8 <= e.bi_valid && (e.pending_buf[e.pending++] = 255 & e.bi_buf, e.bi_buf >>= 8, e.bi_valid -= 8);
					}(e);
				};
			}, { "../utils/common": 41 }],
			53: [function(e, t, r) {
				"use strict";
				t.exports = function() {
					this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
				};
			}, {}],
			54: [function(e, t, r) {
				(function(e) {
					(function(r, n) {
						"use strict";
						if (!r.setImmediate) {
							var i, s, t, a, o = 1, h = {}, u = !1, l = r.document, e = Object.getPrototypeOf && Object.getPrototypeOf(r);
							e = e && e.setTimeout ? e : r, i = "[object process]" === {}.toString.call(r.process) ? function(e) {
								process.nextTick(function() {
									c(e);
								});
							} : function() {
								if (r.postMessage && !r.importScripts) {
									var e = !0, t = r.onmessage;
									return r.onmessage = function() {
										e = !1;
									}, r.postMessage("", "*"), r.onmessage = t, e;
								}
							}() ? (a = "setImmediate$" + Math.random() + "$", r.addEventListener ? r.addEventListener("message", d, !1) : r.attachEvent("onmessage", d), function(e) {
								r.postMessage(a + e, "*");
							}) : r.MessageChannel ? ((t = new MessageChannel()).port1.onmessage = function(e) {
								c(e.data);
							}, function(e) {
								t.port2.postMessage(e);
							}) : l && "onreadystatechange" in l.createElement("script") ? (s = l.documentElement, function(e) {
								var t = l.createElement("script");
								t.onreadystatechange = function() {
									c(e), t.onreadystatechange = null, s.removeChild(t), t = null;
								}, s.appendChild(t);
							}) : function(e) {
								setTimeout(c, 0, e);
							}, e.setImmediate = function(e) {
								"function" != typeof e && (e = new Function("" + e));
								for (var t = new Array(arguments.length - 1), r = 0; r < t.length; r++) t[r] = arguments[r + 1];
								return h[o] = {
									callback: e,
									args: t
								}, i(o), o++;
							}, e.clearImmediate = f;
						}
						function f(e) {
							delete h[e];
						}
						function c(e) {
							if (u) setTimeout(c, 0, e);
							else {
								var t = h[e];
								if (t) {
									u = !0;
									try {
										(function(e) {
											var t = e.callback, r = e.args;
											switch (r.length) {
												case 0:
													t();
													break;
												case 1:
													t(r[0]);
													break;
												case 2:
													t(r[0], r[1]);
													break;
												case 3:
													t(r[0], r[1], r[2]);
													break;
												default: t.apply(n, r);
											}
										})(t);
									} finally {
										f(e), u = !1;
									}
								}
							}
						}
						function d(e) {
							e.source === r && "string" == typeof e.data && 0 === e.data.indexOf(a) && c(+e.data.slice(a.length));
						}
					})("undefined" == typeof self ? void 0 === e ? this : e : self);
				}).call(this, "undefined" != typeof global ? global : "undefined" != typeof self ? self : "undefined" != typeof window ? window : {});
			}, {}]
		}, {}, [10])(10);
	});
})))(), 1);
/**
* Generates a SHA-256 hash from a file blob.
*
* @param {Blob} fileBlob - The file blob to hash
* @returns {Promise<string>} - Returns a Promise that resolves to the hexadecimal hash string
*/
async function generateFileHash(fileBlob) {
	return sha256Hex(await fileBlob.arrayBuffer());
}
/**
* Hex-encodes the SHA-256 digest of an already-in-memory buffer.
*/
async function sha256Hex(buffer) {
	const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
	return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function canUserUpload(currentUploadSize) {
	const { active, limit } = await trpc.getTotalUsedStorage.query();
	return active + currentUploadSize >= limit;
}
/**
* Returns a promise that resolves after an amount of time has passed.
*
* @param { number } delayMs - number of milliseconds that must pass before the promise resolves
*/
function delay(delayMs = 100) {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}
/**
* Runs a function at an interval until it succeeds or the maximum wait time is reached.
*
* @param {function(): any} fn - The function to retry. Function can be `async`.
* @param {number} waitTimeMs - How long to wait between each retry.
* @param {number} maxWaitTimeMs - The maximum amount of time to retry until we give up.
*/
async function retryUntilSuccessOrTimeout(fn, waitTimeMs = 1e3, maxWaitTimeMs = 6e4) {
	for (let waitTotalMs = 0; waitTotalMs < maxWaitTimeMs; waitTotalMs += waitTimeMs) {
		await delay(waitTimeMs);
		try {
			if (!!await fn()) return;
		} catch (e) {
			console.error(`Error on waiting for the file to show up in storage: ${e}`);
		}
	}
}
async function streamToArrayBuffer(stream, size) {
	const reader = stream.getReader();
	let state = await reader.read();
	if (size) {
		const result = new Uint8Array(size);
		let offset = 0;
		while (!state.done) {
			result.set(state.value, offset);
			offset += state.value.length;
			state = await reader.read();
		}
		return result.buffer;
	}
	const parts = [];
	let len = 0;
	while (!state.done) {
		parts.push(state.value);
		len += state.value.length;
		state = await reader.read();
	}
	let offset = 0;
	const result = new Uint8Array(len);
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result.buffer;
}
var ConnectionError = class extends Error {
	constructor(canceled, duration, size) {
		super(canceled ? "0" : "connection closed");
		this.canceled = canceled;
		this.duration = duration;
		this.size = size;
	}
};
function asyncInitWebSocket(serverUrl) {
	return new Promise((resolve, reject) => {
		try {
			const ws = new WebSocket(serverUrl);
			ws.addEventListener("open", () => resolve(ws), { once: true });
		} catch (e) {
			reject(new ConnectionError(false));
		}
	});
}
async function listenForResponse(ws, canceler) {
	return new Promise((resolve, reject) => {
		function handleClose() {
			ws.removeEventListener("message", handleMessage);
			reject(new ConnectionError(canceler.canceled));
		}
		function handleMessage(msg) {
			ws.removeEventListener("close", handleClose);
			try {
				const response = JSON.parse(msg.data);
				if (response.error) throw new Error(response.error);
				else resolve(response);
			} catch (e) {
				reject(e);
			}
		}
		ws.addEventListener("message", handleMessage, { once: true });
		ws.addEventListener("close", handleClose, { once: true });
	});
}
/**
* Zips `blob` under `filename` and returns the archive as a Blob.
*
* Why this is not just `zip.generateAsync({ type: 'blob' })`:
* JSZip's one-shot blob output builds the entire archive as a single
* `Uint8Array` and then calls `new Blob([thatArray])`. Firefox rejects any
* single ArrayBuffer/ArrayBufferView Blob member larger than 2 GB with
* "can't construct the Blob ... larger than 2 GB" — so zipping a file bigger
* than ~2 GB (e.g. a typeless file wrapped by {@link formatBlob}) throws before
* a single byte is uploaded (#981). Note this is a hard per-member limit, not an
* out-of-memory condition: the same Firefox happily allocates a 6 GiB
* ArrayBuffer, but refuses a >2 GB Blob member.
*
* Instead we consume JSZip's streaming output and hand the (individually
* sub-2 GB) chunks to the Blob constructor as separate members. A Blob's *total*
* size may exceed 2 GB as long as no single member does, so the archive can be
* arbitrarily large.
*
* Backwards compatibility: `generateAsync` is itself implemented on top of this
* same internal stream with the same default settings (STORE, no compression),
* so the archive bytes are identical to the previous implementation. Files
* zipped before and after this change are byte-for-byte interchangeable and the
* download/unzip path is unaffected — this only changes how the output Blob is
* assembled in memory, not its contents.
*/
async function zipBlob(blob, filename) {
	const zip = new import_jszip_min.default();
	zip.file(filename, blob);
	const chunks = [];
	await new Promise((resolve, reject) => {
		zip.generateInternalStream({ type: "uint8array" }).on("data", (chunk) => chunks.push(chunk)).on("error", reject).on("end", () => resolve()).resume();
	});
	return new Blob(chunks, { type: "application/zip" });
}
async function unzipMultipartPiece(arrayBuffer) {
	try {
		const zip = new import_jszip_min.default();
		const buffer = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : new ArrayBuffer(arrayBuffer.byteLength);
		if (!(arrayBuffer instanceof ArrayBuffer)) new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
		const zipData = await zip.loadAsync(buffer);
		const fileNames = Object.keys(zipData.files);
		if (fileNames.length === 0) throw new Error("No files found in zip archive");
		const targetFileName = fileNames[0];
		const isMultipart = false;
		const file = zipData.files[targetFileName];
		if (file.dir) throw new Error("Expected file but found directory in zip archive");
		return {
			content: await file.async("arraybuffer"),
			isMultipart,
			partNumber: void 0
		};
	} catch (error) {
		console.error("Error unzipping multipart content:", error);
		const buffer = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : new ArrayBuffer(arrayBuffer.byteLength);
		if (!(arrayBuffer instanceof ArrayBuffer)) new Uint8Array(buffer).set(new Uint8Array(arrayBuffer));
		return {
			content: buffer,
			isMultipart: false
		};
	}
}
var formatBlob = async (blob) => {
	if (blob.type === "") {
		const zippedBlob = await zipBlob(blob, blob.name);
		const compressedBlob = new Blob([zippedBlob], { type: "application/zip" });
		compressedBlob.name = `${blob.name}.zip`;
		return compressedBlob;
	}
	return blob;
};
/**
* Checks a precomputed file hash against the suspicious-files list and blocks
* the upload (alert + throw) if it matches.
*/
var assertNotSuspicious = async (api, fileHash) => {
	const { isSuspicious } = await api.call(`uploads/check-upload-hash/${fileHash}`);
	if (isSuspicious) {
		alert("Warning: This file has been reported as suspicious. You cannot upload it. If you believe this is an error, please contact support.");
		throw new Error("Suspicious file detected");
	}
};
var hashAndCheck = async (api, fileBlob) => {
	const fileHash = await generateFileHash(fileBlob);
	console.log("File hash (SHA-256):", fileHash);
	await assertNotSuspicious(api, fileHash);
	return fileHash;
};
var hashFiles = async (api, fileBlob, maxSize, onProgress) => {
	const hashFromChunk = [];
	if (fileBlob.size <= maxSize) {
		const hashedBlob = await hashAndCheck(api, fileBlob);
		onProgress?.(1, 1);
		return [hashedBlob];
	}
	const totalSize = fileBlob.size;
	const numChunks = Math.ceil(totalSize / maxSize);
	for (let i = 0; i < numChunks; i++) {
		const start = i * maxSize;
		const end = Math.min(start + maxSize, totalSize);
		const chunk = fileBlob.slice(start, end);
		const chunkBlob = new Blob([chunk], { type: fileBlob.type });
		chunkBlob.name = `${fileBlob.name}`;
		const zippedChunk = await hashAndCheck(api, chunkBlob);
		hashFromChunk.push(zippedChunk);
		onProgress?.(i + 1, numChunks);
	}
	return hashFromChunk;
};
/**
* Streams a large file into upload-ready parts, one `maxSize` window at a time.
*
* Crucially, it reads the file **sequentially from offset 0 via
* `fileBlob.stream()`** and never calls `.slice()`/`.arrayBuffer()` at a high
* byte offset. The previous approach (hashFiles + splitIntoMultipleZips) sliced
* the file at offsets past ~2 GiB, which Firefox rejects with a NotReadableError
* / "can't construct the Blob" on files larger than ~2 GB (#981). Reading via a
* ReadableStream keeps each in-memory buffer bounded to one window and avoids
* the 2^31 offset boundary entirely.
*
* Parts are yielded **in order as they become ready**, so a caller can begin
* uploading window 0 while later windows are still being read/hashed/zipped
* (#980).
*
* For each window it hashes the raw bytes, runs the suspicious-file check, then
* zips the window — producing the exact same wire format as
* splitIntoMultipleZips (a zip of the raw chunk, named after the original file).
*/
async function* streamZippedParts(api, fileBlob, maxSize, onBytesHashed) {
	const reader = fileBlob.stream().getReader();
	let windowChunks = [];
	let windowSize = 0;
	let totalHashed = 0;
	const flushWindow = async () => {
		const windowBytes = new Uint8Array(windowSize);
		let offset = 0;
		for (const piece of windowChunks) {
			windowBytes.set(piece, offset);
			offset += piece.byteLength;
		}
		windowChunks = [];
		windowSize = 0;
		const hash = await sha256Hex(windowBytes.buffer);
		await assertNotSuspicious(api, hash);
		const rawBlob = new Blob([windowBytes], { type: fileBlob.type });
		rawBlob.name = fileBlob.name;
		const zipped = await zipBlob(rawBlob, fileBlob.name);
		const zippedBlob = new Blob([zipped], { type: "application/zip" });
		zippedBlob.name = fileBlob.name;
		return {
			blob: zippedBlob,
			hash
		};
	};
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			let chunk = value;
			while (windowSize + chunk.byteLength >= maxSize) {
				const take = maxSize - windowSize;
				windowChunks.push(chunk.subarray(0, take));
				windowSize += take;
				totalHashed += take;
				onBytesHashed?.(totalHashed);
				yield await flushWindow();
				chunk = chunk.subarray(take);
			}
			if (chunk.byteLength > 0) {
				windowChunks.push(chunk);
				windowSize += chunk.byteLength;
			}
		}
		if (windowSize > 0) {
			totalHashed += windowSize;
			onBytesHashed?.(totalHashed);
			yield await flushWindow();
		}
	} finally {
		reader.releaseLock();
	}
}
var checkBlobSize = async (blob) => {
	console.log(blob);
	if (blob.size > 2e10) {
		console.warn("File too big");
		return false;
	}
	return true;
};
//#endregion
//#region ../send/frontend/src/lib/helpers.ts
async function _download({ url, progressTracker, id }) {
	const endpoint = `https://send-backend.tb.pro/api/download`;
	const xhr = new XMLHttpRequest();
	const { setProgress } = progressTracker;
	xhr.onprogress = (event) => {
		if (event.lengthComputable) {
			const downloadProgress = event.loaded;
			setProgress(downloadProgress);
		}
	};
	return new Promise((resolve, reject) => {
		xhr.addEventListener("loadend", async function() {
			if (xhr.status !== 200) return reject(/* @__PURE__ */ new Error(`${xhr.status}`));
			resolve(new Blob([xhr.response]));
		});
		xhr.open("get", id ? `${endpoint}/${id}` : url);
		xhr.responseType = "blob";
		xhr.send();
	});
}
async function _upload(stream, key, encryptedSize = -1, { canceler = {}, progressTracker }) {
	let host = "https://send-backend.tb.pro";
	if (host) host = host.split("//")[1];
	else throw new Error("no server url is set");
	const ws = await asyncInitWebSocket(`wss://${host}/api/ws`);
	try {
		const fileMeta = {
			name: "filename",
			size: encryptedSize
		};
		listenForResponse(ws, canceler);
		ws.send(JSON.stringify(fileMeta));
		let size = 0;
		const completedResponse = listenForResponse(ws, canceler);
		if (key) stream = encryptStream(stream, key);
		const reader = stream.getReader();
		let state = await reader.read();
		while (!state.done) {
			if (canceler.cancelled) ws.close();
			if (ws.readyState !== WebSocket.OPEN) break;
			const buf = state.value;
			ws.send(buf);
			size += buf.length;
			console.info("Uploaded", size, "bytes", "- timestamp:", Date.now());
			progressTracker.setProgress(size);
			state = await reader.read();
			while (ws.bufferedAmount > 65536 * 2 && ws.readyState === WebSocket.OPEN && !canceler.cancelled) await delay();
		}
		if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0]));
		return await completedResponse;
	} catch (e) {
		console.error(e);
		throw e;
	} finally {
		if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close();
	}
}
async function encrypt(stream, key) {
	try {
		let size = 0;
		const chunks = [];
		if (key) stream = encryptStream(stream, key);
		const reader = stream.getReader();
		let state = await reader.read();
		while (!state.done) {
			const buf = state.value;
			chunks.push(buf);
			size += buf.length;
			console.info("Encrypted", size, "bytes", "- timestamp:", Date.now());
			state = await reader.read();
		}
		return concatenateUint8Arrays(chunks);
	} catch (e) {
		console.error(e);
	}
}
function concatenateUint8Arrays(arrays) {
	const totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
	const result = new Uint8Array(totalLength);
	let length = 0;
	for (const array of arrays) {
		result.set(array, length);
		length += array.length;
	}
	return result;
}
/**
* Calculates the size of a file after encrypting.
*
* @param originalSize: number - the original file size.
* @param recordSize: number - the size of each chunk of data that gets encrypted.
* @returns number - the total size of the file after encryption.
*/
function calculateEncryptedSize(originalSize, recordSize = ECE_RECORD_SIZE) {
	const chunkSize = recordSize - 17;
	return originalSize + Math.ceil(originalSize / chunkSize) * 17 + 21;
}
var UPLOAD_ABORTED = "UPLOAD_ABORTED";
var UPLOAD_HTTP_RETRY_BASE_DELAY_MS = 1e3;
/**
* Exponential backoff with jitter for the upload PUT retry schedule:
*   delay = base * 2^attempt * (0.5 + Math.random() / 2)
* The jitter factor is in [0.5, 1.0), so with the default 1000ms base the
* per-attempt delays grow roughly ~1s, ~2s, ~4s while staying de-synchronized
* across clients (avoids a thundering herd when B2 recovers).
*
* @param attempt - zero-based index of the attempt that just failed
* @param baseDelayMs - base delay; defaults to UPLOAD_HTTP_RETRY_BASE_DELAY_MS
*/
function getUploadRetryDelayMs(attempt, baseDelayMs = UPLOAD_HTTP_RETRY_BASE_DELAY_MS) {
	const exponential = baseDelayMs * 2 ** attempt;
	const jitter = .5 + Math.random() / 2;
	return Math.floor(exponential * jitter);
}
var uploadWithTracker = ({ url, readableStream, progressTracker, signal }) => {
	const { setProgress } = progressTracker;
	const XHR_TIMEOUT_MS = 18e4;
	const attemptPut = (blob, attempt) => {
		if (signal?.aborted) return Promise.reject(/* @__PURE__ */ new Error(UPLOAD_ABORTED));
		if (attempt > 0) setProgress(0);
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open("PUT", url, true);
			xhr.setRequestHeader("Content-Type", "application/octet-stream");
			xhr.timeout = XHR_TIMEOUT_MS;
			const onAbort = () => xhr.abort();
			signal?.addEventListener("abort", onAbort, { once: true });
			const cleanup = () => signal?.removeEventListener("abort", onAbort);
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					const uploadProgress = event.loaded;
					setProgress(uploadProgress);
				}
			};
			xhr.onload = () => {
				cleanup();
				if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
				else {
					console.error("Upload failed:");
					reject(/* @__PURE__ */ new Error("UPLOAD_FAILED"));
				}
			};
			xhr.onabort = () => {
				cleanup();
				reject(/* @__PURE__ */ new Error(UPLOAD_ABORTED));
			};
			xhr.onerror = () => {
				cleanup();
				reject(/* @__PURE__ */ new Error("XHR: UPLOAD_FAILED"));
			};
			xhr.ontimeout = () => {
				cleanup();
				reject(/* @__PURE__ */ new Error(`Upload timed out after ${XHR_TIMEOUT_MS / 1e3}s`));
			};
			xhr.send(blob);
		}).catch((error) => {
			if (!(signal?.aborted || error?.message === "UPLOAD_ABORTED") && attempt < 3) {
				const delayMs = getUploadRetryDelayMs(attempt);
				console.warn(`HTTP PUT attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`, error.message);
				return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() => attemptPut(blob, attempt + 1));
			}
			throw error;
		});
	};
	return new Response(readableStream).blob().then((uploadBlob) => {
		return attemptPut(uploadBlob, 0);
	});
};
//#endregion
//#region ../send/frontend/src/lib/filesync.ts
async function _saveFile(file) {
	return new Promise(function(resolve) {
		const dataView = new DataView(file.plaintext);
		const blob = new Blob([dataView], { type: file.type });
		const downloadUrl = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = downloadUrl;
		a.download = file.name;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(downloadUrl);
			resolve();
		}, 0);
	});
}
async function getBlob(id, size, key, isBucketStorage = true, filename = "dummy.file", type = "text/plain", api, progressTracker) {
	const { isSuspicious } = await api.call(`download/check-upload-id/${id}`);
	if (isSuspicious) throw new Error("File has been reported as suspicious");
	if (!isBucketStorage) {
		const downloadedBlob = await _download({
			id,
			progressTracker
		});
		let plaintext;
		if (key) plaintext = await streamToArrayBuffer(decryptStream(blobStream(downloadedBlob), key), size);
		else plaintext = await downloadedBlob.arrayBuffer();
		return await _saveFile({
			plaintext,
			name: decodeURIComponent(filename),
			type
		});
	}
	try {
		const bucketResponse = await api.call(`download/${id}/signed`);
		if (!bucketResponse?.url) throw new Error("BUCKET_URL_NOT_FOUND");
		progressTracker.setUploadSize(size);
		progressTracker.setText("Downloading file");
		const downloadedBlob = await _download({
			url: bucketResponse.url,
			progressTracker
		});
		let plaintext;
		if (key) plaintext = await streamToArrayBuffer(decryptStream(blobStream(downloadedBlob), key), size);
		else plaintext = await downloadedBlob.arrayBuffer();
		return await _saveFile({
			plaintext,
			name: decodeURIComponent(filename),
			type
		});
	} catch (error) {
		console.error("DOWNLOAD_FAILED", error);
		throw error;
	}
}
async function sendBlob(blob, aesKey, api, progressTracker, isBucketStorage = true, options = {}) {
	const { signal, onUploadId } = options;
	const stream = blobStream(blob);
	if (!isBucketStorage) {
		const result = await _upload(stream, aesKey, calculateEncryptedSize(blob.size), { progressTracker });
		const id = Array.isArray(result) ? result[0].id : result.id;
		onUploadId?.(id);
		return id;
	}
	try {
		const { id, url } = await api.call("uploads/signed", { type: "application/octet-stream" }, "POST");
		onUploadId?.(id);
		progressTracker.setProcessStage("encrypting");
		progressTracker.setText("Encrypting file");
		const encrypted = await encrypt(stream, aesKey);
		progressTracker.setProcessStage("uploading");
		progressTracker.setText("Uploading file");
		await uploadWithTracker({
			url,
			readableStream: new ReadableStream({ start(controller) {
				controller.enqueue(encrypted);
				controller.close();
			} }),
			progressTracker,
			signal
		});
		return id;
	} catch (error) {
		throw new Error("UPLOAD_FAILED", { cause: error });
	}
}
async function _saveFileStream(file) {
	if ("showSaveFilePicker" in window) try {
		const writable = await (await window.showSaveFilePicker({
			suggestedName: file.name,
			types: [{
				description: file.type,
				accept: { [file.type]: [] }
			}]
		})).createWritable();
		const reader = file.stream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			await writable.write(value);
		}
		await writable.close();
		return;
	} catch (error) {
		console.warn("File System Access API failed, falling back to blob approach:", error);
	}
	const blob = await new Response(file.stream).blob();
	const typedBlob = new Blob([blob], { type: file.type });
	return new Promise(function(resolve) {
		const downloadUrl = URL.createObjectURL(typedBlob);
		const a = document.createElement("a");
		a.href = downloadUrl;
		a.download = file.name;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(downloadUrl);
			resolve();
		}, 0);
	});
}
//#endregion
//#region ../send/frontend/src/lib/download.ts
var Downloader = class {
	constructor(keychain, api) {
		this.keychain = keychain;
		this.api = api;
	}
	async doDownload(id, folderId, wrappedKeyStr, filename, metrics, progressTracker) {
		if (!id) return false;
		if (!folderId) return false;
		const { isSuspicious } = await this.api.call(`download/check-upload-id/${id}`);
		if (isSuspicious) throw new Error("File has been reported as suspicious");
		const wrappingKey = await this.keychain.get(folderId);
		if (!wrappingKey) return false;
		const { size, type } = await this.api.call(`uploads/${id}/metadata`);
		if (!size) return false;
		const contentKey = await this.keychain.container.unwrapContentKey(wrappedKeyStr, wrappingKey);
		const isBucketStorage = this.api.isBucketStorage;
		try {
			progressTracker.setFileName(filename);
			progressTracker.setProcessStage("downloading");
			await getBlob(id, size, contentKey, isBucketStorage, filename, type, this.api, progressTracker);
			metrics.capture("download.size", {
				size,
				type
			});
			return true;
		} catch (e) {
			return false;
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/version.js
var SDK_VERSION = "8.55.2";
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/worldwide.js
/** Get's the global object for the current JavaScript runtime */
var GLOBAL_OBJ = globalThis;
/**
* Returns a global singleton contained in the global `__SENTRY__[]` object.
*
* If the singleton doesn't already exist in `__SENTRY__`, it will be created using the given factory
* function and added to the `__SENTRY__` object.
*
* @param name name of the global singleton on __SENTRY__
* @param creator creator Factory function to create the singleton if it doesn't already exist on `__SENTRY__`
* @param obj (Optional) The global object on which to look for `__SENTRY__`, if not `GLOBAL_OBJ`'s return value
* @returns the singleton
*/
function getGlobalSingleton(name, creator, obj) {
	const gbl = obj || GLOBAL_OBJ;
	const __SENTRY__ = gbl.__SENTRY__ = gbl.__SENTRY__ || {};
	const versionedCarrier = __SENTRY__[SDK_VERSION] = __SENTRY__["8.55.2"] || {};
	return versionedCarrier[name] || (versionedCarrier[name] = creator());
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/debug-build.js
/**
* This serves as a build time flag that will be true by default, but false in non-debug builds or if users replace `__SENTRY_DEBUG__` in their generated code.
*
* ATTENTION: This constant must never cross package boundaries (i.e. be exported) to guarantee that it can be used for tree shaking.
*/
var DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/logger.js
/** Prefix for logging strings */
var PREFIX = "Sentry Logger ";
var CONSOLE_LEVELS = [
	"debug",
	"info",
	"warn",
	"error",
	"log",
	"assert",
	"trace"
];
/** This may be mutated by the console instrumentation. */
var originalConsoleMethods = {};
/** JSDoc */
/**
* Temporarily disable sentry console instrumentations.
*
* @param callback The function to run against the original `console` messages
* @returns The results of the callback
*/
function consoleSandbox(callback) {
	if (!("console" in GLOBAL_OBJ)) return callback();
	const console = GLOBAL_OBJ.console;
	const wrappedFuncs = {};
	const wrappedLevels = Object.keys(originalConsoleMethods);
	wrappedLevels.forEach((level) => {
		const originalConsoleMethod = originalConsoleMethods[level];
		wrappedFuncs[level] = console[level];
		console[level] = originalConsoleMethod;
	});
	try {
		return callback();
	} finally {
		wrappedLevels.forEach((level) => {
			console[level] = wrappedFuncs[level];
		});
	}
}
function makeLogger() {
	let enabled = false;
	const logger = {
		enable: () => {
			enabled = true;
		},
		disable: () => {
			enabled = false;
		},
		isEnabled: () => enabled
	};
	if (DEBUG_BUILD) CONSOLE_LEVELS.forEach((name) => {
		logger[name] = (...args) => {
			if (enabled) consoleSandbox(() => {
				GLOBAL_OBJ.console[name](`${PREFIX}[${name}]:`, ...args);
			});
		};
	});
	else CONSOLE_LEVELS.forEach((name) => {
		logger[name] = () => void 0;
	});
	return logger;
}
/**
* This is a logger singleton which either logs things or no-ops if logging is not enabled.
* The logger is a singleton on the carrier, to ensure that a consistent logger is used throughout the SDK.
*/
var logger$1 = getGlobalSingleton("logger", makeLogger);
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/carrier.js
/**
* An object that contains globally accessible properties and maintains a scope stack.
* @hidden
*/
/**
* Returns the global shim registry.
*
* FIXME: This function is problematic, because despite always returning a valid Carrier,
* it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
* at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
**/
function getMainCarrier() {
	getSentryCarrier(GLOBAL_OBJ);
	return GLOBAL_OBJ;
}
/** Will either get the existing sentry carrier, or create a new one. */
function getSentryCarrier(carrier) {
	const __SENTRY__ = carrier.__SENTRY__ = carrier.__SENTRY__ || {};
	__SENTRY__.version = __SENTRY__.version || "8.55.2";
	return __SENTRY__[SDK_VERSION] = __SENTRY__["8.55.2"] || {};
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/is.js
var objectToString = Object.prototype.toString;
/**
* Checks whether given value is an instance of the given built-in class.
*
* @param wat The value to be checked
* @param className
* @returns A boolean representing the result.
*/
function isBuiltin(wat, className) {
	return objectToString.call(wat) === `[object ${className}]`;
}
/**
* Checks whether given value's type is an object literal, or a class instance.
* {@link isPlainObject}.
*
* @param wat A value to be checked.
* @returns A boolean representing the result.
*/
function isPlainObject(wat) {
	return isBuiltin(wat, "Object");
}
/**
* Checks whether given value has a then function.
* @param wat A value to be checked.
*/
function isThenable(wat) {
	return Boolean(wat && wat.then && typeof wat.then === "function");
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/object.js
/**
* Defines a non-enumerable property on the given object.
*
* @param obj The object on which to set the property
* @param name The name of the property to be set
* @param value The value to which to set the property
*/
function addNonEnumerableProperty(obj, name, value) {
	try {
		Object.defineProperty(obj, name, {
			value,
			writable: true,
			configurable: true
		});
	} catch (o_O) {
		DEBUG_BUILD && logger$1.log(`Failed to add non-enumerable property "${name}" to object`, obj);
	}
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/time.js
var ONE_SECOND_IN_MS = 1e3;
/**
* A partial definition of the [Performance Web API]{@link https://developer.mozilla.org/en-US/docs/Web/API/Performance}
* for accessing a high-resolution monotonic clock.
*/
/**
* Returns a timestamp in seconds since the UNIX epoch using the Date API.
*
* TODO(v8): Return type should be rounded.
*/
function dateTimestampInSeconds() {
	return Date.now() / ONE_SECOND_IN_MS;
}
/**
* Returns a wrapper around the native Performance API browser implementation, or undefined for browsers that do not
* support the API.
*
* Wrapping the native API works around differences in behavior from different browsers.
*/
function createUnixTimestampInSecondsFunc() {
	const { performance } = GLOBAL_OBJ;
	if (!performance || !performance.now) return dateTimestampInSeconds;
	const approxStartingTimeOrigin = Date.now() - performance.now();
	const timeOrigin = performance.timeOrigin == void 0 ? approxStartingTimeOrigin : performance.timeOrigin;
	return () => {
		return (timeOrigin + performance.now()) / ONE_SECOND_IN_MS;
	};
}
/**
* Returns a timestamp in seconds since the UNIX epoch using either the Performance or Date APIs, depending on the
* availability of the Performance API.
*
* BUG: Note that because of how browsers implement the Performance API, the clock might stop when the computer is
* asleep. This creates a skew between `dateTimestampInSeconds` and `timestampInSeconds`. The
* skew can grow to arbitrary amounts like days, weeks or months.
* See https://github.com/getsentry/sentry-javascript/issues/2590.
*/
var timestampInSeconds = createUnixTimestampInSecondsFunc();
(() => {
	const { performance } = GLOBAL_OBJ;
	if (!performance || !performance.now) return;
	const threshold = 3600 * 1e3;
	const performanceNow = performance.now();
	const dateNow = Date.now();
	const timeOriginDelta = performance.timeOrigin ? Math.abs(performance.timeOrigin + performanceNow - dateNow) : threshold;
	const timeOriginIsReliable = timeOriginDelta < threshold;
	const navigationStart = performance.timing && performance.timing.navigationStart;
	const navigationStartDelta = typeof navigationStart === "number" ? Math.abs(navigationStart + performanceNow - dateNow) : threshold;
	if (timeOriginIsReliable || navigationStartDelta < threshold) if (timeOriginDelta <= navigationStartDelta) return performance.timeOrigin;
	else return navigationStart;
	return dateNow;
})();
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/misc.js
/**
* UUID4 generator
*
* @returns string Generated UUID4.
*/
function uuid4() {
	const gbl = GLOBAL_OBJ;
	const crypto = gbl.crypto || gbl.msCrypto;
	let getRandomByte = () => Math.random() * 16;
	try {
		if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
		if (crypto && crypto.getRandomValues) getRandomByte = () => {
			const typedArray = new Uint8Array(1);
			crypto.getRandomValues(typedArray);
			return typedArray[0];
		};
	} catch (_) {}
	return "10000000100040008000100000000000".replace(/[018]/g, (c) => (c ^ (getRandomByte() & 15) >> c / 4).toString(16));
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/session.js
/**
* Updates a session object with the properties passed in the context.
*
* Note that this function mutates the passed object and returns void.
* (Had to do this instead of returning a new and updated session because closing and sending a session
* makes an update to the session after it was passed to the sending logic.
* @see BaseClient.captureSession )
*
* @param session the `Session` to update
* @param context the `SessionContext` holding the properties that should be updated in @param session
*/
function updateSession(session, context = {}) {
	if (context.user) {
		if (!session.ipAddress && context.user.ip_address) session.ipAddress = context.user.ip_address;
		if (!session.did && !context.did) session.did = context.user.id || context.user.email || context.user.username;
	}
	session.timestamp = context.timestamp || timestampInSeconds();
	if (context.abnormal_mechanism) session.abnormal_mechanism = context.abnormal_mechanism;
	if (context.ignoreDuration) session.ignoreDuration = context.ignoreDuration;
	if (context.sid) session.sid = context.sid.length === 32 ? context.sid : uuid4();
	if (context.init !== void 0) session.init = context.init;
	if (!session.did && context.did) session.did = `${context.did}`;
	if (typeof context.started === "number") session.started = context.started;
	if (session.ignoreDuration) session.duration = void 0;
	else if (typeof context.duration === "number") session.duration = context.duration;
	else {
		const duration = session.timestamp - session.started;
		session.duration = duration >= 0 ? duration : 0;
	}
	if (context.release) session.release = context.release;
	if (context.environment) session.environment = context.environment;
	if (!session.ipAddress && context.ipAddress) session.ipAddress = context.ipAddress;
	if (!session.userAgent && context.userAgent) session.userAgent = context.userAgent;
	if (typeof context.errors === "number") session.errors = context.errors;
	if (context.status) session.status = context.status;
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils-hoist/propagationContext.js
/**
* Generate a random, valid trace ID.
*/
function generateTraceId() {
	return uuid4();
}
/**
* Generate a random, valid span ID.
*/
function generateSpanId() {
	return uuid4().substring(16);
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils/merge.js
/**
* Shallow merge two objects.
* Does not mutate the passed in objects.
* Undefined/empty values in the merge object will overwrite existing values.
*
* By default, this merges 2 levels deep.
*/
function merge(initialObj, mergeObj, levels = 2) {
	if (!mergeObj || typeof mergeObj !== "object" || levels <= 0) return mergeObj;
	if (initialObj && mergeObj && Object.keys(mergeObj).length === 0) return initialObj;
	const output = { ...initialObj };
	for (const key in mergeObj) if (Object.prototype.hasOwnProperty.call(mergeObj, key)) output[key] = merge(output[key], mergeObj[key], levels - 1);
	return output;
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils/spanOnScope.js
var SCOPE_SPAN_FIELD = "_sentrySpan";
/**
* Set the active span for a given scope.
* NOTE: This should NOT be used directly, but is only used internally by the trace methods.
*/
function _setSpanForScope(scope, span) {
	if (span) addNonEnumerableProperty(scope, SCOPE_SPAN_FIELD, span);
	else delete scope[SCOPE_SPAN_FIELD];
}
/**
* Get the active span for a given scope.
* NOTE: This should NOT be used directly, but is only used internally by the trace methods.
*/
function _getSpanForScope(scope) {
	return scope[SCOPE_SPAN_FIELD];
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/scope.js
/**
* Default value for maximum number of breadcrumbs added to an event.
*/
var DEFAULT_MAX_BREADCRUMBS = 100;
/**
* Holds additional event information.
*/
var Scope = class ScopeClass {
	/** Flag if notifying is happening. */
	/** Callback for client to receive scope changes. */
	/** Callback list that will be called during event processing. */
	/** Array of breadcrumbs. */
	/** User */
	/** Tags */
	/** Extra */
	/** Contexts */
	/** Attachments */
	/** Propagation Context for distributed tracing */
	/**
	* A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
	* sent to Sentry
	*/
	/** Fingerprint */
	/** Severity */
	/**
	* Transaction Name
	*
	* IMPORTANT: The transaction name on the scope has nothing to do with root spans/transaction objects.
	* It's purpose is to assign a transaction to the scope that's added to non-transaction events.
	*/
	/** Session */
	/** Request Mode Session Status */
	/** The client on this scope */
	/** Contains the last event id of a captured event.  */
	constructor() {
		this._notifyingListeners = false;
		this._scopeListeners = [];
		this._eventProcessors = [];
		this._breadcrumbs = [];
		this._attachments = [];
		this._user = {};
		this._tags = {};
		this._extra = {};
		this._contexts = {};
		this._sdkProcessingMetadata = {};
		this._propagationContext = {
			traceId: generateTraceId(),
			spanId: generateSpanId()
		};
	}
	/**
	* @inheritDoc
	*/
	clone() {
		const newScope = new ScopeClass();
		newScope._breadcrumbs = [...this._breadcrumbs];
		newScope._tags = { ...this._tags };
		newScope._extra = { ...this._extra };
		newScope._contexts = { ...this._contexts };
		if (this._contexts.flags) newScope._contexts.flags = { values: [...this._contexts.flags.values] };
		newScope._user = this._user;
		newScope._level = this._level;
		newScope._session = this._session;
		newScope._transactionName = this._transactionName;
		newScope._fingerprint = this._fingerprint;
		newScope._eventProcessors = [...this._eventProcessors];
		newScope._requestSession = this._requestSession;
		newScope._attachments = [...this._attachments];
		newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
		newScope._propagationContext = { ...this._propagationContext };
		newScope._client = this._client;
		newScope._lastEventId = this._lastEventId;
		_setSpanForScope(newScope, _getSpanForScope(this));
		return newScope;
	}
	/**
	* @inheritDoc
	*/
	setClient(client) {
		this._client = client;
	}
	/**
	* @inheritDoc
	*/
	setLastEventId(lastEventId) {
		this._lastEventId = lastEventId;
	}
	/**
	* @inheritDoc
	*/
	getClient() {
		return this._client;
	}
	/**
	* @inheritDoc
	*/
	lastEventId() {
		return this._lastEventId;
	}
	/**
	* @inheritDoc
	*/
	addScopeListener(callback) {
		this._scopeListeners.push(callback);
	}
	/**
	* @inheritDoc
	*/
	addEventProcessor(callback) {
		this._eventProcessors.push(callback);
		return this;
	}
	/**
	* @inheritDoc
	*/
	setUser(user) {
		this._user = user || {
			email: void 0,
			id: void 0,
			ip_address: void 0,
			username: void 0
		};
		if (this._session) updateSession(this._session, { user });
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	getUser() {
		return this._user;
	}
	/**
	* @inheritDoc
	*/
	getRequestSession() {
		return this._requestSession;
	}
	/**
	* @inheritDoc
	*/
	setRequestSession(requestSession) {
		this._requestSession = requestSession;
		return this;
	}
	/**
	* @inheritDoc
	*/
	setTags(tags) {
		this._tags = {
			...this._tags,
			...tags
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setTag(key, value) {
		this._tags = {
			...this._tags,
			[key]: value
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setExtras(extras) {
		this._extra = {
			...this._extra,
			...extras
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setExtra(key, extra) {
		this._extra = {
			...this._extra,
			[key]: extra
		};
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setFingerprint(fingerprint) {
		this._fingerprint = fingerprint;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setLevel(level) {
		this._level = level;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* Sets the transaction name on the scope so that the name of e.g. taken server route or
	* the page location is attached to future events.
	*
	* IMPORTANT: Calling this function does NOT change the name of the currently active
	* root span. If you want to change the name of the active root span, use
	* `Sentry.updateSpanName(rootSpan, 'new name')` instead.
	*
	* By default, the SDK updates the scope's transaction name automatically on sensible
	* occasions, such as a page navigation or when handling a new request on the server.
	*/
	setTransactionName(name) {
		this._transactionName = name;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setContext(key, context) {
		if (context === null) delete this._contexts[key];
		else this._contexts[key] = context;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	setSession(session) {
		if (!session) delete this._session;
		else this._session = session;
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	getSession() {
		return this._session;
	}
	/**
	* @inheritDoc
	*/
	update(captureContext) {
		if (!captureContext) return this;
		const scopeToMerge = typeof captureContext === "function" ? captureContext(this) : captureContext;
		const [scopeInstance, requestSession] = scopeToMerge instanceof Scope ? [scopeToMerge.getScopeData(), scopeToMerge.getRequestSession()] : isPlainObject(scopeToMerge) ? [captureContext, captureContext.requestSession] : [];
		const { tags, extra, user, contexts, level, fingerprint = [], propagationContext } = scopeInstance || {};
		this._tags = {
			...this._tags,
			...tags
		};
		this._extra = {
			...this._extra,
			...extra
		};
		this._contexts = {
			...this._contexts,
			...contexts
		};
		if (user && Object.keys(user).length) this._user = user;
		if (level) this._level = level;
		if (fingerprint.length) this._fingerprint = fingerprint;
		if (propagationContext) this._propagationContext = propagationContext;
		if (requestSession) this._requestSession = requestSession;
		return this;
	}
	/**
	* @inheritDoc
	*/
	clear() {
		this._breadcrumbs = [];
		this._tags = {};
		this._extra = {};
		this._user = {};
		this._contexts = {};
		this._level = void 0;
		this._transactionName = void 0;
		this._fingerprint = void 0;
		this._requestSession = void 0;
		this._session = void 0;
		_setSpanForScope(this, void 0);
		this._attachments = [];
		this.setPropagationContext({ traceId: generateTraceId() });
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	addBreadcrumb(breadcrumb, maxBreadcrumbs) {
		const maxCrumbs = typeof maxBreadcrumbs === "number" ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;
		if (maxCrumbs <= 0) return this;
		const mergedBreadcrumb = {
			timestamp: dateTimestampInSeconds(),
			...breadcrumb
		};
		this._breadcrumbs.push(mergedBreadcrumb);
		if (this._breadcrumbs.length > maxCrumbs) {
			this._breadcrumbs = this._breadcrumbs.slice(-maxCrumbs);
			if (this._client) this._client.recordDroppedEvent("buffer_overflow", "log_item");
		}
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	getLastBreadcrumb() {
		return this._breadcrumbs[this._breadcrumbs.length - 1];
	}
	/**
	* @inheritDoc
	*/
	clearBreadcrumbs() {
		this._breadcrumbs = [];
		this._notifyScopeListeners();
		return this;
	}
	/**
	* @inheritDoc
	*/
	addAttachment(attachment) {
		this._attachments.push(attachment);
		return this;
	}
	/**
	* @inheritDoc
	*/
	clearAttachments() {
		this._attachments = [];
		return this;
	}
	/** @inheritDoc */
	getScopeData() {
		return {
			breadcrumbs: this._breadcrumbs,
			attachments: this._attachments,
			contexts: this._contexts,
			tags: this._tags,
			extra: this._extra,
			user: this._user,
			level: this._level,
			fingerprint: this._fingerprint || [],
			eventProcessors: this._eventProcessors,
			propagationContext: this._propagationContext,
			sdkProcessingMetadata: this._sdkProcessingMetadata,
			transactionName: this._transactionName,
			span: _getSpanForScope(this)
		};
	}
	/**
	* @inheritDoc
	*/
	setSDKProcessingMetadata(newData) {
		this._sdkProcessingMetadata = merge(this._sdkProcessingMetadata, newData, 2);
		return this;
	}
	/**
	* @inheritDoc
	*/
	setPropagationContext(context) {
		this._propagationContext = {
			spanId: generateSpanId(),
			...context
		};
		return this;
	}
	/**
	* @inheritDoc
	*/
	getPropagationContext() {
		return this._propagationContext;
	}
	/**
	* @inheritDoc
	*/
	captureException(exception, hint) {
		const eventId = hint && hint.event_id ? hint.event_id : uuid4();
		if (!this._client) {
			logger$1.warn("No client configured on scope - will not capture exception!");
			return eventId;
		}
		const syntheticException = /* @__PURE__ */ new Error("Sentry syntheticException");
		this._client.captureException(exception, {
			originalException: exception,
			syntheticException,
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* @inheritDoc
	*/
	captureMessage(message, level, hint) {
		const eventId = hint && hint.event_id ? hint.event_id : uuid4();
		if (!this._client) {
			logger$1.warn("No client configured on scope - will not capture message!");
			return eventId;
		}
		const syntheticException = new Error(message);
		this._client.captureMessage(message, level, {
			originalException: message,
			syntheticException,
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* @inheritDoc
	*/
	captureEvent(event, hint) {
		const eventId = hint && hint.event_id ? hint.event_id : uuid4();
		if (!this._client) {
			logger$1.warn("No client configured on scope - will not capture event!");
			return eventId;
		}
		this._client.captureEvent(event, {
			...hint,
			event_id: eventId
		}, this);
		return eventId;
	}
	/**
	* This will be called on every set call.
	*/
	_notifyScopeListeners() {
		if (!this._notifyingListeners) {
			this._notifyingListeners = true;
			this._scopeListeners.forEach((callback) => {
				callback(this);
			});
			this._notifyingListeners = false;
		}
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/defaultScopes.js
/** Get the default current scope. */
function getDefaultCurrentScope() {
	return getGlobalSingleton("defaultCurrentScope", () => new Scope());
}
/** Get the default isolation scope. */
function getDefaultIsolationScope() {
	return getGlobalSingleton("defaultIsolationScope", () => new Scope());
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/asyncContext/stackStrategy.js
/**
* This is an object that holds a stack of scopes.
*/
var AsyncContextStack = class {
	constructor(scope, isolationScope) {
		let assignedScope;
		if (!scope) assignedScope = new Scope();
		else assignedScope = scope;
		let assignedIsolationScope;
		if (!isolationScope) assignedIsolationScope = new Scope();
		else assignedIsolationScope = isolationScope;
		this._stack = [{ scope: assignedScope }];
		this._isolationScope = assignedIsolationScope;
	}
	/**
	* Fork a scope for the stack.
	*/
	withScope(callback) {
		const scope = this._pushScope();
		let maybePromiseResult;
		try {
			maybePromiseResult = callback(scope);
		} catch (e) {
			this._popScope();
			throw e;
		}
		if (isThenable(maybePromiseResult)) return maybePromiseResult.then((res) => {
			this._popScope();
			return res;
		}, (e) => {
			this._popScope();
			throw e;
		});
		this._popScope();
		return maybePromiseResult;
	}
	/**
	* Get the client of the stack.
	*/
	getClient() {
		return this.getStackTop().client;
	}
	/**
	* Returns the scope of the top stack.
	*/
	getScope() {
		return this.getStackTop().scope;
	}
	/**
	* Get the isolation scope for the stack.
	*/
	getIsolationScope() {
		return this._isolationScope;
	}
	/**
	* Returns the topmost scope layer in the order domain > local > process.
	*/
	getStackTop() {
		return this._stack[this._stack.length - 1];
	}
	/**
	* Push a scope to the stack.
	*/
	_pushScope() {
		const scope = this.getScope().clone();
		this._stack.push({
			client: this.getClient(),
			scope
		});
		return scope;
	}
	/**
	* Pop a scope from the stack.
	*/
	_popScope() {
		if (this._stack.length <= 1) return false;
		return !!this._stack.pop();
	}
};
/**
* Get the global async context stack.
* This will be removed during the v8 cycle and is only here to make migration easier.
*/
function getAsyncContextStack() {
	const sentry = getSentryCarrier(getMainCarrier());
	return sentry.stack = sentry.stack || new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope());
}
function withScope(callback) {
	return getAsyncContextStack().withScope(callback);
}
function withSetScope(scope, callback) {
	const stack = getAsyncContextStack();
	return stack.withScope(() => {
		stack.getStackTop().scope = scope;
		return callback(scope);
	});
}
function withIsolationScope(callback) {
	return getAsyncContextStack().withScope(() => {
		return callback(getAsyncContextStack().getIsolationScope());
	});
}
/**
* Get the stack-based async context strategy.
*/
function getStackAsyncContextStrategy() {
	return {
		withIsolationScope,
		withScope,
		withSetScope,
		withSetIsolationScope: (_isolationScope, callback) => {
			return withIsolationScope(callback);
		},
		getCurrentScope: () => getAsyncContextStack().getScope(),
		getIsolationScope: () => getAsyncContextStack().getIsolationScope()
	};
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/asyncContext/index.js
/**
* Get the current async context strategy.
* If none has been setup, the default will be used.
*/
function getAsyncContextStrategy(carrier) {
	const sentry = getSentryCarrier(carrier);
	if (sentry.acs) return sentry.acs;
	return getStackAsyncContextStrategy();
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/currentScopes.js
/**
* Get the currently active scope.
*/
function getCurrentScope() {
	return getAsyncContextStrategy(getMainCarrier()).getCurrentScope();
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/utils/prepareEvent.js
/**
* Parse either an `EventHint` directly, or convert a `CaptureContext` to an `EventHint`.
* This is used to allow to update method signatures that used to accept a `CaptureContext` but should now accept an `EventHint`.
*/
function parseEventHintOrCaptureContext(hint) {
	if (!hint) return;
	if (hintIsScopeOrFunction(hint)) return { captureContext: hint };
	if (hintIsScopeContext(hint)) return { captureContext: hint };
	return hint;
}
function hintIsScopeOrFunction(hint) {
	return hint instanceof Scope || typeof hint === "function";
}
var captureContextKeys = [
	"user",
	"level",
	"extra",
	"contexts",
	"tags",
	"fingerprint",
	"requestSession",
	"propagationContext"
];
function hintIsScopeContext(hint) {
	return Object.keys(hint).some((key) => captureContextKeys.includes(key));
}
//#endregion
//#region ../../node_modules/.pnpm/@sentry+core@8.55.2/node_modules/@sentry/core/build/esm/exports.js
/**
* Captures an exception event and sends it to Sentry.
*
* @param exception The exception to capture.
* @param hint Optional additional data to attach to the Sentry event.
* @returns the id of the captured Sentry event.
*/
function captureException(exception, hint) {
	return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}
//#endregion
//#region ../send/frontend/src/lib/upload.ts
/**
* Turn the (optional) {@link ApiCallFailure} from the create-entry call into a
* descriptive Error to use as the thrown error's `cause`, so the underlying
* reason (network vs HTTP status/body) survives in Sentry instead of being a
* bare "Failed to create upload entry".
*/
function createEntryFailureToCause(failure) {
	if (failure?.kind === "http") {
		const suffix = failure.body ? `: ${failure.body}` : "";
		return /* @__PURE__ */ new Error(`create-entry HTTP ${failure.status} ${failure.statusText}${suffix}`);
	}
	if (failure?.kind === "network") return failure.error instanceof Error ? failure.error : /* @__PURE__ */ new Error(`create-entry network error: ${String(failure.error)}`);
	return /* @__PURE__ */ new Error("create-entry returned no result");
}
var Uploader = class {
	constructor(user, keychain, api) {
		this.user = user;
		this.keychain = keychain;
		this.api = api;
	}
	/**
	* Asks the backend to delete every part this upload attempt wrote to storage.
	* Called when a multipart upload fails partway so that already-uploaded (and
	* partially-uploaded) parts don't linger as orphaned bytes in the bucket.
	*/
	async deleteWrittenUploads(api, ids) {
		if (ids.length === 0) return;
		await api.call("uploads/cleanup", { ids }, "POST");
	}
	/**
	* Fire-and-forget cleanup for use during page teardown (pagehide), when an
	* upload is still in flight and the normal `if (fatalError)` cleanup will
	* never run. Uses a `keepalive` fetch so the request survives the page being
	* torn down, and cookie auth (`credentials: 'include'`) since requireJWT reads
	* the auth cookie — a Bearer header can't be attached reliably at unload time.
	* Best-effort only: hard kills/crashes still rely on the server-side reaper.
	*/
	teardownCleanup(api, ids) {
		if (ids.length === 0) return;
		try {
			fetch(`${api.serverUrl}/api/uploads/cleanup`, {
				method: "POST",
				keepalive: true,
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ids })
			});
		} catch {}
	}
	/**
	* Creates a multipart progress tracker that manages overall progress across all parts
	*/
	createMultipartProgressTracker(mainTracker, blobSizes, isMultipart, originalFileSize) {
		const totalBlobSize = blobSizes.reduce((sum, size) => sum + size, 0);
		const partProgress = new Array(blobSizes.length).fill(0);
		const updateOverallProgress = () => {
			if (!isMultipart || blobSizes.length === 1) mainTracker.setProgress(Math.min(partProgress[0], originalFileSize));
			else {
				const overallProgress = partProgress.reduce((sum, progress) => sum + progress, 0) / totalBlobSize * originalFileSize;
				mainTracker.setProgress(Math.min(overallProgress, originalFileSize));
			}
		};
		return {
			getPartTracker: (partIndex) => {
				const partSize = blobSizes[partIndex];
				return {
					total: mainTracker.total,
					progressed: mainTracker.progressed,
					percentage: mainTracker.percentage,
					error: mainTracker.error,
					text: mainTracker.text,
					fileName: mainTracker.fileName,
					processStage: mainTracker.processStage,
					initialize: () => {},
					setUploadSize: () => {},
					setFileName: (name) => {
						mainTracker.setFileName(name);
					},
					setProcessStage: (stage) => {
						mainTracker.setProcessStage(stage);
					},
					setText: (message) => {
						mainTracker.setText(message);
					},
					setProgress: (progress) => {
						partProgress[partIndex] = Math.min(progress, partSize);
						updateOverallProgress();
					}
				};
			},
			markPartComplete: (partIndex) => {
				partProgress[partIndex] = blobSizes[partIndex];
				updateOverallProgress();
			}
		};
	}
	async doUpload(fileBlob, containerId, api, progressTracker) {
		if (!containerId) return null;
		if (!fileBlob) return null;
		const wrappingKey = await this.keychain.get(containerId);
		if (!wrappingKey) return null;
		const key = await this.keychain.content.generateKey();
		const wrappedKeyStr = await this.keychain.container.wrapContentKey(key, wrappingKey);
		const shouldSplit = fileBlob.size > SPLIT_SIZE;
		const numChunks = shouldSplit ? Math.ceil(fileBlob.size / SPLIT_SIZE) : 1;
		const partSizes = Array.from({ length: numChunks }, (_, i) => Math.min(SPLIT_SIZE, fileBlob.size - i * SPLIT_SIZE));
		progressTracker.setUploadSize(fileBlob.size);
		progressTracker.setProcessStage("hashing");
		progressTracker.setText("Hashing file");
		const parts = new Array(numChunks);
		const hashes = new Array(numChunks);
		const partReady = Array.from({ length: numChunks }, () => {
			let resolve;
			let reject;
			const promise = new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			});
			promise.catch(() => {});
			return {
				promise,
				resolve,
				reject
			};
		});
		if (shouldSplit) (async () => {
			let produced = 0;
			try {
				for await (const part of streamZippedParts(api, fileBlob, SPLIT_SIZE, (bytesHashed) => {
					if (parts[0] !== void 0) return;
					const pct = Math.round(bytesHashed / fileBlob.size * 100);
					progressTracker.setText(`Hashing file (${pct}%)`);
				})) {
					parts[produced] = part.blob;
					hashes[produced] = part.hash;
					partReady[produced].resolve();
					produced++;
				}
				if (produced < numChunks) {
					const err = /* @__PURE__ */ new Error(`Streaming produced ${produced} of ${numChunks} expected parts`);
					for (let i = produced; i < numChunks; i++) partReady[i].reject(err);
				}
			} catch (err) {
				for (let i = produced; i < numChunks; i++) partReady[i].reject(err);
			}
		})();
		else {
			const [singleHash] = await hashFiles(api, fileBlob, SPLIT_SIZE);
			parts[0] = fileBlob;
			hashes[0] = singleHash;
			partReady[0].resolve();
		}
		const multipartTracker = this.createMultipartProgressTracker(progressTracker, partSizes, shouldSplit, fileBlob.size);
		const abortController = new AbortController();
		const writtenUploadIds = /* @__PURE__ */ new Set();
		const uploadPart = async (blob, index) => {
			const filename = blob.name;
			const isBucketStorage = api.isBucketStorage;
			const partTracker = multipartTracker.getPartTracker(index);
			const part = shouldSplit ? index + 1 : void 0;
			const id = await sendBlob(blob, key, api, partTracker, isBucketStorage, {
				signal: abortController.signal,
				onUploadId: (uploadId) => writtenUploadIds.add(uploadId)
			});
			if (!id) throw new Error("Failed to send blob");
			await retryUntilSuccessOrTimeout(async () => {
				const { size } = await this.api.call(`uploads/${id}/stat`);
				return !!size;
			}, 2e3, 18e4);
			let uploadResult = null;
			let upload = null;
			let retryCount = 0;
			const maxRetries = 5;
			while (retryCount < maxRetries && !uploadResult) {
				if (abortController.signal.aborted) throw new Error("Upload aborted");
				try {
					if (!upload) {
						let createEntryFailure;
						const result = await this.api.call("uploads", {
							id,
							size: blob.size,
							ownerId: this.user.id,
							type: blob.type,
							containerId,
							part,
							fileHash: hashes[index]
						}, "POST", {}, { onFailure: (failure) => {
							createEntryFailure = failure;
						} });
						if (!result) {
							const cause = createEntryFailureToCause(createEntryFailure);
							captureException(cause, {
								tags: {
									upload_stage: "create_entry",
									create_entry_failure_kind: createEntryFailure?.kind ?? "unknown",
									...createEntryFailure?.kind === "http" ? { create_entry_http_status: String(createEntryFailure.status) } : {}
								},
								contexts: { create_entry: {
									kind: createEntryFailure?.kind ?? "unknown",
									status: createEntryFailure?.kind === "http" ? createEntryFailure.status : null,
									statusText: createEntryFailure?.kind === "http" ? createEntryFailure.statusText : void 0,
									body: createEntryFailure?.kind === "http" ? createEntryFailure.body : void 0
								} }
							});
							throw new Error("Failed to create upload entry", { cause });
						}
						upload = result.upload;
					}
					const itemObj = await this.api.call(`containers/${containerId}/item`, {
						uploadId: upload.id,
						name: filename,
						type: "MESSAGE",
						wrappedKey: wrappedKeyStr,
						multipart: shouldSplit ? true : false,
						totalSize: fileBlob.size
					}, "POST");
					if (!itemObj) throw new Error("Failed to create item object");
					uploadResult = {
						upload,
						itemObj
					};
				} catch (error) {
					retryCount++;
					console.error(`Create-entry attempt ${retryCount} failed:`, error);
					if (retryCount >= maxRetries) {
						const failureMessage = `Upload failed for ${fileBlob.name} after ${maxRetries} attempts` + (part ? ` (part ${part})` : "");
						console.error(failureMessage, error);
						throw new Error(failureMessage);
					}
					await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1e3));
				}
			}
			const { itemObj } = uploadResult;
			const item = {
				...itemObj,
				upload: {
					size: blob.size,
					type: blob.type,
					part
				}
			};
			multipartTracker.markPartComplete(index);
			return item;
		};
		const uploadResponses = new Array(numChunks);
		let nextIndex = 0;
		let fatalError = null;
		const runWorker = async () => {
			while (true) {
				if (fatalError) return;
				const index = nextIndex++;
				if (index >= numChunks) return;
				try {
					await partReady[index].promise;
					const item = await uploadPart(parts[index], index);
					if (!item) throw new Error(`Upload part ${index} returned no item`);
					uploadResponses[index] = item;
					parts[index] = void 0;
				} catch (error) {
					if (!fatalError) fatalError = error;
					abortController.abort();
					return;
				}
			}
		};
		const onPageHide = () => this.teardownCleanup(api, [...writtenUploadIds]);
		window.addEventListener("pagehide", onPageHide);
		try {
			const workerCount = Math.min(4, numChunks);
			await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
			if (fatalError) {
				await this.deleteWrittenUploads(api, [...writtenUploadIds]).catch(() => {});
				const failureMessage = fatalError instanceof Error ? fatalError.message : `Upload failed for ${fileBlob.name}`;
				progressTracker.setProcessStage("error");
				progressTracker.setText(failureMessage);
				progressTracker.error = failureMessage;
				throw fatalError instanceof Error ? fatalError : new Error(failureMessage);
			}
			return uploadResponses;
		} finally {
			window.removeEventListener("pagehide", onPageHide);
		}
	}
};
//#endregion
//#region ../send/frontend/src/stores/keychain-store.ts
var useKeychainStore = defineStore("keychain", () => {
	const keychain = new Keychain(new Storage());
	function resetKeychain() {
		keychain._init();
	}
	async function addKey(id, key) {
		await keychain.add(id, key);
	}
	async function getKey(id) {
		return await keychain.get(id);
	}
	function removeKey(id) {
		keychain.remove(id);
	}
	async function newKeyForContainer(id) {
		await keychain.newKeyForContainer(id);
	}
	return {
		keychain,
		resetKeychain,
		addKey,
		getKey,
		removeKey,
		newKeyForContainer
	};
});
//#endregion
//#region ../send/frontend/src/types.ts
var UserTier = /* @__PURE__ */ function(UserTier) {
	UserTier[UserTier["FREE"] = 1] = "FREE";
	UserTier[UserTier["EPHEMERAL"] = 2] = "EPHEMERAL";
	UserTier[UserTier["PRO"] = 3] = "PRO";
	return UserTier;
}({});
//#endregion
//#region ../send/frontend/src/stores/user-store.ts
var EMPTY_USER = {
	id: void 0,
	tier: UserTier.FREE,
	email: "",
	thundermailEmail: ""
};
var useUserStore = defineStore("user", () => {
	const { api } = useApiStore();
	const storage = new Storage();
	const user = /* @__PURE__ */ reactive({ ...EMPTY_USER });
	function populateUser(userData) {
		user.id = userData.id;
		user.tier = userData.tier;
		user.email = userData.email;
		user.thundermailEmail = userData.thundermailEmail;
		user.name = userData.name;
		if (userData.uniqueHash) user.uniqueHash = userData.uniqueHash;
		if (userData.thundermailEmail) user.thundermailEmail = userData.thundermailEmail;
	}
	async function createUser(email, jwkPublicKey, isEphemeral = false) {
		const resp = await api.call(`users`, {
			email,
			publicKey: jwkPublicKey,
			tier: isEphemeral ? UserTier.EPHEMERAL : UserTier.PRO
		}, "POST");
		if (!resp) return null;
		return {
			id: resp.user.id,
			tier: resp.user.tier,
			email,
			thundermailEmail: resp.user.thundermailEmail,
			uniqueHash: resp.user.uniqueHash
		};
	}
	async function login(loginEmail = user.email) {
		console.log(`logging in as ${loginEmail}`);
		const resp = await api.call(`users/login`, { email: loginEmail }, "POST");
		if (!resp) return null;
		populateUser(resp);
		return resp;
	}
	async function loadFromLocalStorage() {
		try {
			const userFromStorage = await storage.getUserFromLocalStorage();
			if (!userFromStorage) return false;
			const { id, tier, email, thundermailEmail, name } = userFromStorage;
			populateUser({
				id,
				email,
				tier,
				thundermailEmail,
				name
			});
			return true;
		} catch (e) {
			return false;
		}
	}
	async function store(newId, newTier, newEmail, newThundermailEmail, newName) {
		let { id, tier, email, thundermailEmail, name } = user;
		id = newId ?? id;
		tier = newTier ?? tier;
		email = newEmail ?? email;
		name = newName ?? name;
		thundermailEmail = newThundermailEmail ?? thundermailEmail;
		if (!id) return;
		await storage.storeUser({
			id,
			tier,
			email,
			thundermailEmail,
			name
		});
	}
	async function populateFromBackend() {
		if (user.id) return true;
		const userResp = await api.call(`users/me`);
		if (!userResp?.user) return false;
		populateUser(userResp.user);
		return true;
	}
	async function getPublicKey() {
		return (await api.call(`users/publickey/${user.id}`)).publicKey;
	}
	async function updatePublicKey(jwkPublicKey) {
		return (await api.call(`users/publickey`, { publicKey: jwkPublicKey }, "POST")).update?.publicKey;
	}
	async function createBackup(userId, keys, keypair, keystring, salt) {
		return await api.call(`users/${userId}/backup`, {
			keys,
			keypair,
			keystring,
			salt
		}, "POST");
	}
	async function getBackup() {
		return await api.call(`users/backup`);
	}
	async function setUserToDefault() {
		Object.entries(EMPTY_USER).forEach(([key, value]) => {
			user[key] = value;
		});
	}
	async function clearUserFromStorage() {
		storage.clear();
		setUserToDefault();
	}
	return {
		user,
		createUser,
		login,
		store,
		loadFromLocalStorage,
		populateFromBackend,
		getPublicKey,
		updatePublicKey,
		createBackup,
		getBackup,
		clearUserFromStorage
	};
});
//#endregion
//#region ../send/frontend/src/lib/messages.ts
var CLIENT_MESSAGES = {
	SHOULD_LOG_IN: `You need to log into your mozilla account. Make sure you're in the allow list for alpha access.`,
	FILE_TOO_BIG: `Your file size is not supported, please try with files smaller than ${MAX_FILE_SIZE_HUMAN_READABLE}`,
	UPLOAD_FAILED: `Upload failed. Please try again.`,
	STORAGE_LIMIT_EXCEEDED: `Uploading this file would exceed your storage limit. Please delete some files and try again.`
};
//#endregion
//#region ../send/frontend/src/lib/folderView.ts
/**
* This function is meant for managing files in a folder, handling multipart file deduplication
* @returns Computed property containing unique files with multipart suffix removed
*/
var organizeFiles = (files) => {
	const items = [];
	if (!files) return [];
	files.forEach((item) => {
		if (!item?.multipart) {
			items.push(item);
			return;
		}
		if (item.upload.part === 1) items.push({
			...item,
			upload: {
				...item.upload,
				size: item.totalSize
			}
		});
	});
	return items;
};
//#endregion
//#region ../../node_modules/.pnpm/posthog-js@1.372.5/node_modules/posthog-js/dist/module.js
var t = "undefined" != typeof window ? window : void 0, e = "undefined" != typeof globalThis ? globalThis : t;
"undefined" == typeof self && (e.self = e), "undefined" == typeof File && (e.File = function() {});
var i = null == e ? void 0 : e.navigator, r = null == e ? void 0 : e.document, s = null == e ? void 0 : e.location, n = null == e ? void 0 : e.fetch, o = null != e && e.XMLHttpRequest && "withCredentials" in new e.XMLHttpRequest() ? e.XMLHttpRequest : void 0, a = null == e ? void 0 : e.AbortController, l = null == e ? void 0 : e.CompressionStream, u = null == i ? void 0 : i.userAgent, h = null != t ? t : {}, d = "1.372.5", v = {
	DEBUG: !1,
	LIB_VERSION: d,
	LIB_NAME: "web",
	JS_SDK_VERSION: d
};
function c(t, e, i, r, s, n, o) {
	try {
		var a = t[n](o), l = a.value;
	} catch (t) {
		i(t);
		return;
	}
	a.done ? e(l) : Promise.resolve(l).then(r, s);
}
function p(t) {
	return function() {
		var e = this, i = arguments;
		return new Promise((function(r, s) {
			var n = t.apply(e, i);
			function o(t) {
				c(n, r, s, o, a, "next", t);
			}
			function a(t) {
				c(n, r, s, o, a, "throw", t);
			}
			o(void 0);
		}));
	};
}
function f() {
	return f = Object.assign ? Object.assign.bind() : function(t) {
		for (var e = 1; arguments.length > e; e++) {
			var i = arguments[e];
			for (var r in i) ({}).hasOwnProperty.call(i, r) && (t[r] = i[r]);
		}
		return t;
	}, f.apply(null, arguments);
}
function _(t, e) {
	if (null == t) return {};
	var i = {};
	for (var r in t) if ({}.hasOwnProperty.call(t, r)) {
		if (-1 !== e.indexOf(r)) continue;
		i[r] = t[r];
	}
	return i;
}
function g() {
	return g = p((function* (t, e, i) {
		void 0 === e && (e = !0);
		try {
			var r = new CompressionStream("gzip"), s = r.writable.getWriter(), n = s.write(new TextEncoder().encode(t)).then((() => s.close())).catch(function() {
				var t = p((function* (t) {
					try {
						yield s.abort(t);
					} catch (t) {}
					throw t;
				}));
				return function(e) {
					return t.apply(this, arguments);
				};
			}()), o = new Response(r.readable).blob(), [a] = yield Promise.all([o, n]);
			return a;
		} catch (t) {
			if (null != i && i.rethrow) throw t;
			return e && console.error("Failed to gzip compress data", t), null;
		}
	})), g.apply(this, arguments);
}
var m = [
	"amazonbot",
	"amazonproductbot",
	"app.hypefactors.com",
	"applebot",
	"archive.org_bot",
	"awariobot",
	"backlinksextendedbot",
	"baiduspider",
	"bingbot",
	"bingpreview",
	"chrome-lighthouse",
	"dataforseobot",
	"deepscan",
	"duckduckbot",
	"facebookexternal",
	"facebookcatalog",
	"http://yandex.com/bots",
	"hubspot",
	"ia_archiver",
	"leikibot",
	"linkedinbot",
	"meta-externalagent",
	"mj12bot",
	"msnbot",
	"nessus",
	"petalbot",
	"pinterest",
	"prerender",
	"rogerbot",
	"screaming frog",
	"sebot-wa",
	"sitebulb",
	"slackbot",
	"slurp",
	"trendictionbot",
	"turnitin",
	"twitterbot",
	"vercel-screenshot",
	"vercelbot",
	"yahoo! slurp",
	"yandexbot",
	"zoombot",
	"bot.htm",
	"bot.php",
	"(bot;",
	"bot/",
	"crawler",
	"ahrefsbot",
	"ahrefssiteaudit",
	"semrushbot",
	"siteauditbot",
	"splitsignalbot",
	"gptbot",
	"oai-searchbot",
	"chatgpt-user",
	"perplexitybot",
	"better uptime bot",
	"sentryuptimebot",
	"uptimerobot",
	"headlesschrome",
	"cypress",
	"google-hoteladsverifier",
	"adsbot-google",
	"apis-google",
	"duplexweb-google",
	"feedfetcher-google",
	"google favicon",
	"google web preview",
	"google-read-aloud",
	"googlebot",
	"googleother",
	"google-cloudvertexbot",
	"googleweblight",
	"mediapartners-google",
	"storebot-google",
	"google-inspectiontool",
	"bytespider"
], b = function(t, e) {
	if (void 0 === e && (e = []), !t) return !1;
	var i = t.toLowerCase();
	return m.concat(e).some(((t) => {
		var e = t.toLowerCase();
		return -1 !== i.indexOf(e);
	}));
}, y = [
	"$snapshot",
	"$pageview",
	"$pageleave",
	"$set",
	"survey dismissed",
	"survey sent",
	"survey shown",
	"$identify",
	"$groupidentify",
	"$create_alias",
	"$$client_ingestion_warning",
	"$web_experiment_applied",
	"$feature_enrollment_update",
	"$feature_flag_called"
];
function w(t, e) {
	return -1 !== t.indexOf(e);
}
var x = function(t) {
	return t.trim();
}, E = function(t) {
	return t.replace(/^\$/, "");
}, S = Object.prototype, T = S.hasOwnProperty, k = S.toString, R = Array.isArray || function(t) {
	return "[object Array]" === k.call(t);
}, P = (t) => "function" == typeof t, O = (t) => t === Object(t) && !R(t), I = (t) => {
	if (O(t)) {
		for (var e in t) if (T.call(t, e)) return !1;
		return !0;
	}
	return !1;
}, C = (t) => void 0 === t, F = (t) => "[object String]" == k.call(t), A = (t) => F(t) && 0 === t.trim().length, M = (t) => null === t, D = (t) => C(t) || M(t), L = (t) => "[object Number]" == k.call(t) && t == t, U = (t) => L(t) && t > 0, N = (t) => "[object Boolean]" === k.call(t), j = (t) => t instanceof FormData, z = (t) => w(y, t);
function B(t) {
	return null === t || "object" != typeof t;
}
function H(t, e) {
	return {}.toString.call(t) === "[object " + e + "]";
}
function q(t) {
	return "undefined" != typeof Event && function(t, e) {
		try {
			return t instanceof e;
		} catch (t) {
			return !1;
		}
	}(t, Event);
}
var V = [
	!0,
	"true",
	1,
	"1",
	"yes"
], W = (t) => w(V, t), G = [
	!1,
	"false",
	0,
	"0",
	"no"
];
function Y(t, e, i, r, s) {
	return e > i && (r.warn("min cannot be greater than max."), e = i), L(t) ? t > i ? (r.warn(" cannot be  greater than max: " + i + ". Using max value instead."), i) : e > t ? (r.warn(" cannot be less than min: " + e + ". Using min value instead."), e) : t : (r.warn(" must be a number. using max or fallback. max: " + i + ", fallback: " + s), Y(s || i, e, i, r));
}
var J = class {
	constructor(t) {
		this.$t = {}, this.zt = t.zt, this.Ut = Y(t.bucketSize, 0, 100, t.Gt), this.Wt = Y(t.refillRate, 0, this.Ut, t.Gt), this.Xt = Y(t.refillInterval, 0, 864e5, t.Gt);
	}
	Jt(t, e) {
		var i = Math.floor((e - t.lastAccess) / this.Xt);
		i > 0 && (t.tokens = Math.min(t.tokens + i * this.Wt, this.Ut), t.lastAccess = t.lastAccess + i * this.Xt);
	}
	consumeRateLimit(t) {
		var e, i = Date.now(), r = String(t), s = this.$t[r];
		return s ? this.Jt(s, i) : this.$t[r] = s = {
			tokens: this.Ut,
			lastAccess: i
		}, 0 === s.tokens || (s.tokens--, 0 === s.tokens && (null == (e = this.zt) || e.call(this, t)), 0 === s.tokens);
	}
	stop() {
		this.$t = {};
	}
};
var K, X, Q, Z = "Mobile", tt = "iOS", et = "Android", it = "Tablet", rt = et + " " + it, st = "iPad", nt = "Apple", ot = nt + " Watch", at = "Safari", lt = "BlackBerry", ut = "Samsung", ht = ut + "Browser", dt = ut + " Internet", vt = "Chrome", ct = vt + " OS", pt = vt + " " + tt, ft = "Internet Explorer", _t = ft + " " + Z, gt = "Opera", mt = gt + " Mini", bt = "Edge", yt = "Microsoft " + bt, wt = "Firefox", xt = wt + " " + tt, Et = "Nintendo", St = "PlayStation", $t = "Xbox", Tt = et + " " + Z, kt = Z + " " + at, Rt = "Windows", Pt = Rt + " Phone", Ot = "Nokia", It = "Ouya", Ct = "Generic", Ft = Ct + " " + Z.toLowerCase(), At = Ct + " " + it.toLowerCase(), Mt = "Konqueror", Dt = "(\\d+(\\.\\d+)?)", Lt = new RegExp("Version/" + Dt), Ut = new RegExp($t, "i"), Nt = new RegExp(St + " \\w+", "i"), jt = new RegExp(Et + " \\w+", "i"), zt = new RegExp(lt + "|PlayBook|BB10", "i"), Bt = {
	"NT3.51": "NT 3.11",
	"NT4.0": "NT 4.0",
	"5.0": "2000",
	5.1: "XP",
	5.2: "XP",
	"6.0": "Vista",
	6.1: "7",
	6.2: "8",
	6.3: "8.1",
	6.4: "10",
	"10.0": "10"
}, Ht = function(t, e) {
	return e = e || "", w(t, " OPR/") && w(t, "Mini") ? mt : w(t, " OPR/") ? gt : zt.test(t) ? lt : w(t, "IE" + Z) || w(t, "WPDesktop") ? _t : w(t, ht) ? dt : w(t, bt) || w(t, "Edg/") ? yt : w(t, "FBIOS") ? "Facebook " + Z : w(t, "UCWEB") || w(t, "UCBrowser") ? "UC Browser" : w(t, "CriOS") ? pt : w(t, "CrMo") || w(t, vt) ? vt : w(t, et) && w(t, at) ? Tt : w(t, "FxiOS") ? xt : w(t.toLowerCase(), Mt.toLowerCase()) ? Mt : ((t, e) => e && w(e, nt) || function(t) {
		return w(t, at) && !w(t, vt) && !w(t, et);
	}(t))(t, e) ? w(t, Z) ? kt : at : w(t, wt) ? wt : w(t, "MSIE") || w(t, "Trident/") ? ft : w(t, "Gecko") ? wt : "";
}, qt = {
	[_t]: [new RegExp("rv:" + Dt)],
	[yt]: [new RegExp(bt + "?\\/" + Dt)],
	[vt]: [new RegExp("(" + vt + "|CrMo)\\/" + Dt)],
	[pt]: [new RegExp("CriOS\\/" + Dt)],
	"UC Browser": [new RegExp("(UCBrowser|UCWEB)\\/" + Dt)],
	[at]: [Lt],
	[kt]: [Lt],
	[gt]: [new RegExp("(Opera|OPR)\\/" + Dt)],
	[wt]: [new RegExp(wt + "\\/" + Dt)],
	[xt]: [new RegExp("FxiOS\\/" + Dt)],
	[Mt]: [new RegExp("Konqueror[:/]?" + Dt, "i")],
	[lt]: [new RegExp(lt + " " + Dt), Lt],
	[Tt]: [new RegExp("android\\s" + Dt, "i")],
	[dt]: [new RegExp(ht + "\\/" + Dt)],
	[ft]: [new RegExp("(rv:|MSIE )" + Dt)],
	Mozilla: [new RegExp("rv:" + Dt)]
}, Vt = function(t, e) {
	var r = qt[Ht(t, e)];
	if (C(r)) return null;
	for (var s = 0; r.length > s; s++) {
		var n = t.match(r[s]);
		if (n) return parseFloat(n[n.length - 2]);
	}
	return null;
}, Wt = [
	[new RegExp($t + "; " + $t + " (.*?)[);]", "i"), (t) => [$t, t && t[1] || ""]],
	[new RegExp(Et, "i"), [Et, ""]],
	[new RegExp(St, "i"), [St, ""]],
	[zt, [lt, ""]],
	[new RegExp(Rt, "i"), (t, e) => {
		if (/Phone/.test(e) || /WPDesktop/.test(e)) return [Pt, ""];
		if (new RegExp(Z).test(e) && !/IEMobile\b/.test(e)) return [Rt + " " + Z, ""];
		var i = /Windows NT ([0-9.]+)/i.exec(e);
		if (i && i[1]) {
			var r = Bt[i[1]] || "";
			return /arm/i.test(e) && (r = "RT"), [Rt, r];
		}
		return [Rt, ""];
	}],
	[/((iPhone|iPad|iPod).*?OS (\d+)_(\d+)_?(\d+)?|iPhone)/, (t) => t && t[3] ? [tt, [
		t[3],
		t[4],
		t[5] || "0"
	].join(".")] : [tt, ""]],
	[/(watch.*\/(\d+\.\d+\.\d+)|watch os,(\d+\.\d+),)/i, (t) => {
		var e = "";
		return t && t.length >= 3 && (e = C(t[2]) ? t[3] : t[2]), ["watchOS", e];
	}],
	[new RegExp("(" + et + " (\\d+)\\.(\\d+)\\.?(\\d+)?|" + et + ")", "i"), (t) => t && t[2] ? [et, [
		t[2],
		t[3],
		t[4] || "0"
	].join(".")] : [et, ""]],
	[/Mac OS X (\d+)[_.](\d+)[_.]?(\d+)?/i, (t) => {
		var e = ["Mac OS X", ""];
		return t && t[1] && (e[1] = [
			t[1],
			t[2],
			t[3] || "0"
		].join(".")), e;
	}],
	[/Mac/i, ["Mac OS X", ""]],
	[/CrOS/, [ct, ""]],
	[/Linux|debian/i, ["Linux", ""]]
], Gt = function(t) {
	return jt.test(t) ? Et : Nt.test(t) ? St : Ut.test(t) ? $t : new RegExp(It, "i").test(t) ? It : new RegExp("(" + Pt + "|WPDesktop)", "i").test(t) ? Pt : /iPad/.test(t) ? st : /iPod/.test(t) ? "iPod Touch" : /iPhone/.test(t) ? "iPhone" : /(watch)(?: ?os[,/]|\d,\d\/)[\d.]+/i.test(t) ? ot : zt.test(t) ? lt : /(kobo)\s(ereader|touch)/i.test(t) ? "Kobo" : new RegExp(Ot, "i").test(t) ? Ot : /(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i.test(t) || /(kf[a-z]+)( bui|\)).+silk\//i.test(t) ? "Kindle Fire" : /(Android|ZTE)/i.test(t) ? new RegExp(Z).test(t) && !/(9138B|TB782B|Nexus [97]|pixel c|HUAWEISHT|BTV|noble nook|smart ultra 6)/i.test(t) || /pixel[\daxl ]{1,6}/i.test(t) && !/pixel c/i.test(t) || /(huaweimed-al00|tah-|APA|SM-G92|i980|zte|U304AA)/i.test(t) || /lmy47v/i.test(t) && !/QTAQZ3/i.test(t) ? et : rt : new RegExp("(pda|" + Z + ")", "i").test(t) ? Ft : new RegExp(it, "i").test(t) && !new RegExp(it + " pc", "i").test(t) ? At : "";
}, Yt = (t) => t instanceof Error, Jt = {
	trace: {
		text: "TRACE",
		number: 1
	},
	debug: {
		text: "DEBUG",
		number: 5
	},
	info: {
		text: "INFO",
		number: 9
	},
	warn: {
		text: "WARN",
		number: 13
	},
	error: {
		text: "ERROR",
		number: 17
	},
	fatal: {
		text: "FATAL",
		number: 21
	}
}, Kt = Jt.info;
function Xt(t) {
	if (N(t)) return { boolValue: t };
	if ("number" == typeof t) return Number.isFinite(t) ? Number.isInteger(t) ? { intValue: t } : { doubleValue: t } : { stringValue: String(t) };
	if ("string" == typeof t) return { stringValue: t };
	if (R(t)) return { arrayValue: { values: t.map(((t) => Xt(t))) } };
	try {
		return { stringValue: JSON.stringify(t) };
	} catch (e) {
		return { stringValue: String(t) };
	}
}
function Qt(t) {
	var e = [];
	for (var i in t) {
		var r = t[i];
		M(r) || C(r) || e.push({
			key: i,
			value: Xt(r)
		});
	}
	return e;
}
function Zt(t) {
	var e = globalThis._posthogChunkIds;
	if (e) {
		var i = Object.keys(e);
		return Q && i.length === X || (X = i.length, Q = i.reduce(((i, r) => {
			K || (K = {});
			var s = K[r];
			if (s) i[s[0]] = s[1];
			else for (var n = t(r), o = n.length - 1; o >= 0; o--) {
				var a = n[o], l = null == a ? void 0 : a.filename, u = e[r];
				if (l && u) {
					i[l] = u, K[r] = [l, u];
					break;
				}
			}
			return i;
		}), {})), Q;
	}
}
var te = class {
	constructor(t, e, i) {
		void 0 === i && (i = []), this.coercers = t, this.stackParser = e, this.modifiers = i;
	}
	buildFromUnknown(t, e) {
		void 0 === e && (e = {});
		var i = e && e.mechanism || {
			handled: !0,
			type: "generic"
		}, r = this.buildCoercingContext(i, e, 0).apply(t), s = this.buildParsingContext(e), n = this.parseStacktrace(r, s);
		return {
			$exception_list: this.convertToExceptionList(n, i),
			$exception_level: "error"
		};
	}
	modifyFrames(t) {
		var e = this;
		return p((function* () {
			for (var i of t) i.stacktrace && i.stacktrace.frames && R(i.stacktrace.frames) && (i.stacktrace.frames = yield e.applyModifiers(i.stacktrace.frames));
			return t;
		}))();
	}
	coerceFallback(t) {
		var e;
		return {
			type: "Error",
			value: "Unknown error",
			stack: null == (e = t.syntheticException) ? void 0 : e.stack,
			synthetic: !0
		};
	}
	parseStacktrace(t, e) {
		var i, r;
		return null != t.cause && (i = this.parseStacktrace(t.cause, e)), "" != t.stack && null != t.stack && (r = this.applyChunkIds(this.stackParser(t.stack, t.synthetic ? e.skipFirstLines : 0), e.chunkIdMap)), f({}, t, {
			cause: i,
			stack: r
		});
	}
	applyChunkIds(t, e) {
		return t.map(((t) => (t.filename && e && (t.chunk_id = e[t.filename]), t)));
	}
	applyCoercers(t, e) {
		for (var i of this.coercers) if (i.match(t)) return i.coerce(t, e);
		return this.coerceFallback(e);
	}
	applyModifiers(t) {
		var e = this;
		return p((function* () {
			var i = t;
			for (var r of e.modifiers) i = yield r(i);
			return i;
		}))();
	}
	convertToExceptionList(t, e) {
		var i, r, s, n = {
			type: t.type,
			value: t.value,
			mechanism: {
				type: null !== (i = e.type) && void 0 !== i ? i : "generic",
				handled: null === (r = e.handled) || void 0 === r || r,
				synthetic: null !== (s = t.synthetic) && void 0 !== s && s
			}
		};
		t.stack && (n.stacktrace = {
			type: "raw",
			frames: t.stack
		});
		var o = [n];
		return null != t.cause && o.push(...this.convertToExceptionList(t.cause, f({}, e, { handled: !0 }))), o;
	}
	buildParsingContext(t) {
		var e;
		return {
			chunkIdMap: Zt(this.stackParser),
			skipFirstLines: null !== (e = t.skipFirstLines) && void 0 !== e ? e : 1
		};
	}
	buildCoercingContext(t, e, i) {
		void 0 === i && (i = 0);
		var r = (i, r) => {
			if (4 >= r) {
				var s = this.buildCoercingContext(t, e, r);
				return this.applyCoercers(i, s);
			}
		};
		return f({}, e, {
			syntheticException: 0 == i ? e.syntheticException : void 0,
			mechanism: t,
			apply: (t) => r(t, i),
			next: (t) => r(t, i + 1)
		});
	}
};
var ee = "?";
function ie(t, e, i, r, s) {
	var n = {
		platform: t,
		filename: e,
		function: "<anonymous>" === i ? ee : i,
		in_app: !0
	};
	return C(r) || (n.lineno = r), C(s) || (n.colno = s), n;
}
var re = (t, e) => {
	var i = -1 !== t.indexOf("safari-extension"), r = -1 !== t.indexOf("safari-web-extension");
	return i || r ? [-1 !== t.indexOf("@") ? t.split("@")[0] : ee, i ? "safari-extension:" + e : "safari-web-extension:" + e] : [t, e];
}, se = /^\s*at (\S+?)(?::(\d+))(?::(\d+))\s*$/i, ne = /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, oe = /\((\S*)(?::(\d+))(?::(\d+))\)/, ae = (t, e) => {
	var i = se.exec(t);
	if (i) {
		var [, r, s, n] = i;
		return ie(e, r, ee, +s, +n);
	}
	var o = ne.exec(t);
	if (o) {
		if (o[2] && 0 === o[2].indexOf("eval")) {
			var a = oe.exec(o[2]);
			a && (o[2] = a[1], o[3] = a[2], o[4] = a[3]);
		}
		var [l, u] = re(o[1] || ee, o[2]);
		return ie(e, u, l, o[3] ? +o[3] : void 0, o[4] ? +o[4] : void 0);
	}
}, le = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i, ue = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i, he = (t, e) => {
	var i = le.exec(t);
	if (i) {
		if (i[3] && i[3].indexOf(" > eval") > -1) {
			var r = ue.exec(i[3]);
			r && (i[1] = i[1] || "eval", i[3] = r[1], i[4] = r[2], i[5] = "");
		}
		var s = i[3], n = i[1] || ee;
		return [n, s] = re(n, s), ie(e, s, n, i[4] ? +i[4] : void 0, i[5] ? +i[5] : void 0);
	}
}, de = /\(error: (.*)\)/;
var ve = class {
	match(t) {
		return this.isDOMException(t) || this.isDOMError(t);
	}
	coerce(t, e) {
		var i = F(t.stack);
		return {
			type: this.getType(t),
			value: this.getValue(t),
			stack: i ? t.stack : void 0,
			cause: t.cause ? e.next(t.cause) : void 0,
			synthetic: !1
		};
	}
	getType(t) {
		return this.isDOMError(t) ? "DOMError" : "DOMException";
	}
	getValue(t) {
		var e = t.name || (this.isDOMError(t) ? "DOMError" : "DOMException");
		return t.message ? e + ": " + t.message : e;
	}
	isDOMException(t) {
		return H(t, "DOMException");
	}
	isDOMError(t) {
		return H(t, "DOMError");
	}
};
var ce = class {
	match(t) {
		return ((t) => t instanceof Error)(t);
	}
	coerce(t, e) {
		return {
			type: this.getType(t),
			value: this.getMessage(t, e),
			stack: this.getStack(t),
			cause: t.cause ? e.next(t.cause) : void 0,
			synthetic: !1
		};
	}
	getType(t) {
		return t.name || t.constructor.name;
	}
	getMessage(t, e) {
		var i = t.message;
		return String(i.error && "string" == typeof i.error.message ? i.error.message : i);
	}
	getStack(t) {
		return t.stacktrace || t.stack || void 0;
	}
};
var pe = class {
	constructor() {}
	match(t) {
		return H(t, "ErrorEvent") && null != t.error;
	}
	coerce(t, e) {
		var i;
		return e.apply(t.error) || {
			type: "ErrorEvent",
			value: t.message,
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var fe = /^(?:[Uu]ncaught (?:exception: )?)?(?:((?:Eval|Internal|Range|Reference|Syntax|Type|URI|)Error): )?(.*)$/i;
var _e = class {
	match(t) {
		return "string" == typeof t;
	}
	coerce(t, e) {
		var i, [r, s] = this.getInfos(t);
		return {
			type: null != r ? r : "Error",
			value: null != s ? s : t,
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
	getInfos(t) {
		var e = "Error", i = t, r = t.match(fe);
		return r && (e = r[1], i = r[2]), [e, i];
	}
};
var ge = [
	"fatal",
	"error",
	"warning",
	"log",
	"info",
	"debug"
];
function me(t, e) {
	void 0 === e && (e = 40);
	var i = Object.keys(t);
	if (i.sort(), !i.length) return "[object has no keys]";
	for (var r = i.length; r > 0; r--) {
		var s = i.slice(0, r).join(", ");
		if (e >= s.length) return r === i.length ? s : s.length > e ? s.slice(0, e) + "..." : s;
	}
	return "";
}
var be = class {
	match(t) {
		return "object" == typeof t && null !== t;
	}
	coerce(t, e) {
		var i, r = this.getErrorPropertyFromObject(t);
		return r ? e.apply(r) : {
			type: this.getType(t),
			value: this.getValue(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			level: this.isSeverityLevel(t.level) ? t.level : "error",
			synthetic: !0
		};
	}
	getType(t) {
		return q(t) ? t.constructor.name : "Error";
	}
	getValue(t) {
		if ("name" in t && "string" == typeof t.name) {
			var e = "'" + t.name + "' captured as exception";
			return "message" in t && "string" == typeof t.message && (e += " with message: '" + t.message + "'"), e;
		}
		if ("message" in t && "string" == typeof t.message) return t.message;
		var i = this.getObjectClassName(t);
		return (i && "Object" !== i ? "'" + i + "'" : "Object") + " captured as exception with keys: " + me(t);
	}
	isSeverityLevel(t) {
		return F(t) && !A(t) && ge.indexOf(t) >= 0;
	}
	getErrorPropertyFromObject(t) {
		for (var e in t) if ({}.hasOwnProperty.call(t, e)) {
			var i = t[e];
			if (Yt(i)) return i;
		}
	}
	getObjectClassName(t) {
		try {
			var e = Object.getPrototypeOf(t);
			return e ? e.constructor.name : void 0;
		} catch (t) {
			return;
		}
	}
};
var ye = class {
	match(t) {
		return q(t);
	}
	coerce(t, e) {
		var i, r = t.constructor.name;
		return {
			type: r,
			value: r + " captured as exception with keys: " + me(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var we = class {
	match(t) {
		return B(t);
	}
	coerce(t, e) {
		var i;
		return {
			type: "Error",
			value: "Primitive value captured as exception: " + String(t),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		};
	}
};
var xe = class {
	match(t) {
		return H(t, "PromiseRejectionEvent") || this.isCustomEventWrappingRejection(t);
	}
	isCustomEventWrappingRejection(t) {
		if (!q(t)) return !1;
		try {
			var e = t.detail;
			return null != e && "object" == typeof e && "reason" in e;
		} catch (t) {
			return !1;
		}
	}
	coerce(t, e) {
		var i, r = this.getUnhandledRejectionReason(t);
		return B(r) ? {
			type: "UnhandledRejection",
			value: "Non-Error promise rejection captured with value: " + String(r),
			stack: null == (i = e.syntheticException) ? void 0 : i.stack,
			synthetic: !0
		} : e.apply(r);
	}
	getUnhandledRejectionReason(t) {
		try {
			if ("reason" in t) return t.reason;
			if ("detail" in t && null != t.detail && "object" == typeof t.detail && "reason" in t.detail) return t.detail.reason;
		} catch (t) {}
		return t;
	}
};
var Ee = "$message", Se = "$timestamp", $e = new Set([Ee, Se]), Te = {
	enabled: !0,
	max_bytes: 32768
};
function ke(t) {
	var e;
	return t ? {
		enabled: null !== (e = t.enabled) && void 0 !== e ? e : Te.enabled,
		max_bytes: Pe(t.max_bytes, Te.max_bytes)
	} : f({}, Te);
}
var Re = class {
	constructor(t) {
		this.Kt = [], this.Qt = 0, this.Bt = ke(t);
	}
	setConfig(t) {
		this.Bt = ke(t), this.er();
	}
	add(t) {
		var e = function(t) {
			var e = function(t) {
				var e = /* @__PURE__ */ new WeakSet();
				try {
					return JSON.stringify(t, ((t, i) => {
						if ("bigint" == typeof i) return i.toString();
						if ("function" != typeof i && "symbol" != typeof i) {
							if (i instanceof Date) return i.toISOString();
							if (i instanceof Error) return {
								name: i.name,
								message: i.message,
								stack: i.stack
							};
							if (i && "object" == typeof i) {
								if (e.has(i)) return "[Circular]";
								e.add(i);
							}
							return i;
						}
					}));
				} catch (t) {
					return;
				}
			}(t);
			if (e) try {
				var i = JSON.parse(e);
				if (!O(i)) return;
				var r = i, s = r[Ee], n = r[Se];
				if (!F(s) || 0 === s.trim().length) return;
				if (!F(n) && !L(n)) return;
				return {
					step: r,
					json: e
				};
			} catch (t) {
				return;
			}
		}(t);
		if (e) {
			var i = function(t) {
				if ("undefined" != typeof TextEncoder) return new TextEncoder().encode(t).length;
				for (var e = encodeURIComponent(t), i = 0, r = 0; e.length > r; r++) "%" === e[r] ? (i += 1, r += 2) : i += 1;
				return i;
			}(e.json);
			i > this.Bt.max_bytes || (this.Kt.push({
				step: e.step,
				bytes: i
			}), this.Qt += i, this.er());
		}
	}
	getAttachable() {
		return this.Kt.map(((t) => t.step));
	}
	clear() {
		this.Kt = [], this.Qt = 0;
	}
	size() {
		return this.Kt.length;
	}
	er() {
		for (; this.Qt > this.Bt.max_bytes && this.Kt.length > 0;) {
			var t = this.Kt.shift();
			t && (this.Qt -= t.bytes);
		}
	}
};
function Pe(t, e) {
	if (!L(t) || t === Infinity || t === -Infinity) return e;
	var i = Math.floor(t);
	return 0 > i ? e : i;
}
var Oe = function(e, i) {
	var { debugEnabled: r } = void 0 === i ? {} : i, s = {
		C(i) {
			if (t && (v.DEBUG || h.POSTHOG_DEBUG || r) && !C(t.console) && t.console) {
				for (var s = ("__rrweb_original__" in t.console[i]) ? t.console[i].__rrweb_original__ : t.console[i], n = arguments.length, o = new Array(n > 1 ? n - 1 : 0), a = 1; n > a; a++) o[a - 1] = arguments[a];
				s(e, ...o);
			}
		},
		info() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.C("log", ...e);
		},
		warn() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.C("warn", ...e);
		},
		error() {
			for (var t = arguments.length, e = new Array(t), i = 0; t > i; i++) e[i] = arguments[i];
			s.C("error", ...e);
		},
		critical() {
			for (var t = arguments.length, i = new Array(t), r = 0; t > r; r++) i[r] = arguments[r];
			console.error(e, ...i);
		},
		uninitializedWarning(t) {
			s.error("You must initialize PostHog before calling " + t);
		},
		createLogger: (t, i) => Oe(e + " " + t, i)
	};
	return s;
}, Ie = Oe("[PostHog.js]"), Ce = Ie.createLogger, Fe = Ce("[ExternalScriptsLoader]"), Ae = (t, e, i) => {
	if (t.config.disable_external_dependency_loading) return Fe.warn(e + " was requested but loading of external scripts is disabled."), i("Loading of external scripts is disabled");
	var s = null == r ? void 0 : r.querySelectorAll("script");
	if (s) {
		for (var n, o = function() {
			if (s[a].src === e) {
				var t = s[a];
				return t.__posthog_loading_callback_fired ? { v: i() } : (t.addEventListener("load", ((e) => {
					t.__posthog_loading_callback_fired = !0, i(void 0, e);
				})), t.onerror = (t) => i(t), { v: void 0 });
			}
		}, a = 0; s.length > a; a++) if (n = o()) return n.v;
	}
	var l = () => {
		if (!r) return i("document not found");
		var s = r.createElement("script");
		if (s.type = "text/javascript", s.crossOrigin = "anonymous", s.src = e, s.onload = (t) => {
			s.__posthog_loading_callback_fired = !0, i(void 0, t);
		}, s.onerror = (t) => i(t), t.config.prepare_external_dependency_script && (s = t.config.prepare_external_dependency_script(s)), !s) return i("prepare_external_dependency_script returned null");
		if ("head" === t.config.external_scripts_inject_target) r.head.appendChild(s);
		else {
			var n, o = r.querySelectorAll("body > script");
			o.length > 0 ? null == (n = o[0].parentNode) || n.insertBefore(s, o[0]) : r.body.appendChild(s);
		}
	};
	null != r && r.body ? l() : r?.addEventListener("DOMContentLoaded", l);
};
h.__PosthogExtensions__ = h.__PosthogExtensions__ || {}, h.__PosthogExtensions__.loadExternalDependency = (t, e, i) => {
	if ("remote-config" !== e) {
		var r;
		if (t.config.__preview_external_dependency_versioned_paths) r = t.requestRouter.endpointFor("assets", "/static/" + t.version + "/" + e + ".js");
		else {
			var s = "/static/" + e + ".js?v=" + t.version;
			if ("toolbar" === e) {
				var n = 3e5;
				s = s + "&t=" + Math.floor(Date.now() / n) * n;
			}
			r = t.requestRouter.endpointFor("assets", s);
		}
		Ae(t, r, i);
	} else Ae(t, t.requestRouter.endpointFor("assets", "/array/" + t.config.token + "/config.js"), i);
}, h.__PosthogExtensions__.loadSiteApp = (t, e, i) => {
	Ae(t, t.requestRouter.endpointFor("api", e), i);
};
var Me = "$people_distinct_id", De = "$device_id", Le = "__alias", Ue = "__timers", Ne = "$autocapture_disabled_server_side", je = "$heatmaps_enabled_server_side", ze = "$exception_capture_enabled_server_side", Be = "$error_tracking_suppression_rules", He = "$error_tracking_capture_extension_exceptions", qe = "$web_vitals_enabled_server_side", Ve = "$dead_clicks_enabled_server_side", We = "$product_tours_enabled_server_side", Ge = "$web_vitals_allowed_metrics", Ye = "$session_recording_remote_config", Je = "$replay_override_sampling", Ke = "$replay_override_linked_flag", Xe = "$replay_override_url_trigger", Qe = "$replay_override_event_trigger", Ze = "$sesid", ti = "$session_is_sampled", ei = "$enabled_feature_flags", ii = "$active_feature_flags", ri = "$early_access_features", si = "$feature_flag_details", ni = "$feature_flag_payloads", oi = "$feature_flag_request_id", ai = "$override_feature_flags", li = "$override_feature_flag_payloads", ui = "$stored_person_properties", hi = "$stored_group_properties", di = "$surveys", vi = "$surveys_activated", ci = "ph_product_tours", pi = "$flag_call_reported", fi = "$flag_call_reported_session_id", _i = "$feature_flag_errors", gi = "$feature_flag_evaluated_at", mi = "$user_state", bi = "$client_session_props", yi = "$capture_rate_limit", wi = "$initial_campaign_params", xi = "$initial_referrer_info", Ei = "$initial_person_info", Si = "$epp", $i = "__POSTHOG_TOOLBAR__", Ti = "$posthog_cookieless", ki = "$sdk_debug_extensions_init_method", Ri = "$sdk_debug_extensions_init_time_ms", Pi = "$sdk_debug_recording_script_not_loaded", Oi = "PostHog loadExternalDependency extension not found.", Ii = "on_reject", Ci = "always", Fi = "anonymous", Ai = "identified", Mi = "identified_only", Di = "visibilitychange", Li = "beforeunload", Ui = "$pageview", Ni = "$pageleave", ji = "$identify", zi = "$groupidentify";
function Bi(t, e) {
	R(t) && t.forEach(e);
}
function Hi(t, e) {
	if (!D(t)) if (R(t)) t.forEach(e);
	else if (j(t)) t.forEach(((t, i) => e(t, i)));
	else for (var i in t) T.call(t, i) && e(t[i], i);
}
var qi = function(t) {
	for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
	for (var s of i) for (var n in s) void 0 !== s[n] && (t[n] = s[n]);
	return t;
};
function Vi(t) {
	for (var e = Object.keys(t), i = e.length, r = new Array(i); i--;) r[i] = [e[i], t[e[i]]];
	return r;
}
var Wi = function(t) {
	try {
		return t();
	} catch (t) {
		return;
	}
}, Gi = function(t) {
	return function() {
		try {
			for (var e = arguments.length, i = new Array(e), r = 0; e > r; r++) i[r] = arguments[r];
			return t.apply(this, i);
		} catch (t) {
			Ie.critical("Implementation error. Please turn on debug mode and open a ticket on https://app.posthog.com/home#panel=support%3Asupport%3A."), Ie.critical(t);
		}
	};
}, Yi = function(t) {
	var e = {};
	return Hi(t, (function(t, i) {
		(F(t) && t.length > 0 || L(t)) && (e[i] = t);
	})), e;
};
var Ji = [
	"herokuapp.com",
	"vercel.app",
	"netlify.app"
];
function Ki(t) {
	var e = null == t ? void 0 : t.hostname;
	if (!F(e)) return !1;
	var i = e.split(".").slice(-2).join(".");
	for (var r of Ji) if (i === r) return !1;
	return !0;
}
function Xi(t, e, i, r) {
	var { capture: s = !1, passive: n = !0 } = null != r ? r : {};
	t?.addEventListener(e, i, {
		capture: s,
		passive: n
	});
}
function Qi(t) {
	return "ph_toolbar_internal" === t.name;
}
Math.trunc || (Math.trunc = function(t) {
	return 0 > t ? Math.ceil(t) : Math.floor(t);
}), Number.isInteger || (Number.isInteger = function(t) {
	return L(t) && isFinite(t) && Math.floor(t) === t;
});
var Zi = class Zi {
	constructor(t) {
		if (this.bytes = t, 16 !== t.length) throw new TypeError("not 128-bit length");
	}
	static fromFieldsV7(t, e, i, r) {
		if (!Number.isInteger(t) || !Number.isInteger(e) || !Number.isInteger(i) || !Number.isInteger(r) || 0 > t || 0 > e || 0 > i || 0 > r || t > 0xffffffffffff || e > 4095 || i > 1073741823 || r > 4294967295) throw new RangeError("invalid field value");
		var s = new Uint8Array(16);
		return s[0] = t / Math.pow(2, 40), s[1] = t / Math.pow(2, 32), s[2] = t / Math.pow(2, 24), s[3] = t / Math.pow(2, 16), s[4] = t / Math.pow(2, 8), s[5] = t, s[6] = 112 | e >>> 8, s[7] = e, s[8] = 128 | i >>> 24, s[9] = i >>> 16, s[10] = i >>> 8, s[11] = i, s[12] = r >>> 24, s[13] = r >>> 16, s[14] = r >>> 8, s[15] = r, new Zi(s);
	}
	toString() {
		for (var t = "", e = 0; this.bytes.length > e; e++) t = t + (this.bytes[e] >>> 4).toString(16) + (15 & this.bytes[e]).toString(16), 3 !== e && 5 !== e && 7 !== e && 9 !== e || (t += "-");
		if (36 !== t.length) throw new Error("Invalid UUIDv7 was generated");
		return t;
	}
	clone() {
		return new Zi(this.bytes.slice(0));
	}
	equals(t) {
		return 0 === this.compareTo(t);
	}
	compareTo(t) {
		for (var e = 0; 16 > e; e++) {
			var i = this.bytes[e] - t.bytes[e];
			if (0 !== i) return Math.sign(i);
		}
		return 0;
	}
};
var tr = class {
	constructor() {
		this.I = 0, this.S = 0, this.k = new rr();
	}
	generate() {
		var t = this.generateOrAbort();
		if (C(t)) {
			this.I = 0;
			var e = this.generateOrAbort();
			if (C(e)) throw new Error("Could not generate UUID after timestamp reset");
			return e;
		}
		return t;
	}
	generateOrAbort() {
		var t = Date.now();
		if (t > this.I) this.I = t, this.A();
		else {
			if (this.I >= t + 1e4) return;
			this.S++, this.S > 4398046511103 && (this.I++, this.A());
		}
		return Zi.fromFieldsV7(this.I, Math.trunc(this.S / Math.pow(2, 30)), this.S & Math.pow(2, 30) - 1, this.k.nextUint32());
	}
	A() {
		this.S = 1024 * this.k.nextUint32() + (1023 & this.k.nextUint32());
	}
};
var er, ir = (t) => {
	if ("undefined" != typeof UUIDV7_DENY_WEAK_RNG && UUIDV7_DENY_WEAK_RNG) throw new Error("no cryptographically strong RNG available");
	for (var e = 0; t.length > e; e++) t[e] = 65536 * Math.trunc(65536 * Math.random()) + Math.trunc(65536 * Math.random());
	return t;
};
t && !C(t.crypto) && crypto.getRandomValues && (ir = (t) => crypto.getRandomValues(t));
var rr = class {
	constructor() {
		this.T = new Uint32Array(8), this.N = Infinity;
	}
	nextUint32() {
		return this.T.length > this.N || (ir(this.T), this.N = 0), this.T[this.N++];
	}
};
var sr = () => nr().toString(), nr = () => (er || (er = new tr())).generate(), or = "", ar = /[a-z0-9][a-z0-9-]+\.[a-z]{2,}$/i;
var lr = {
	R: () => !!r,
	B(t) {
		Ie.error("cookieStore error: " + t);
	},
	O(t) {
		if (r) {
			try {
				for (var e = t + "=", i = r.cookie.split(";").filter(((t) => t.length)), s = 0; i.length > s; s++) {
					for (var n = i[s]; " " == n.charAt(0);) n = n.substring(1, n.length);
					if (0 === n.indexOf(e)) return decodeURIComponent(n.substring(e.length, n.length));
				}
			} catch (t) {}
			return null;
		}
	},
	Z(t) {
		var e;
		try {
			e = JSON.parse(lr.O(t)) || {};
		} catch (t) {}
		return e;
	},
	M(t, e, i, s, n) {
		if (r) try {
			var o = "", a = "", l = function(t, e) {
				if (e) {
					var i = function(t, e) {
						if (void 0 === e && (e = r), or) return or;
						if (!e) return "";
						if (["localhost", "127.0.0.1"].includes(t)) return "";
						for (var i = t.split("."), s = Math.min(i.length, 8), n = "dmn_chk_" + sr(); !or && s--;) {
							var o = i.slice(s).join("."), a = n + "=1;domain=." + o + ";path=/";
							e.cookie = a + ";max-age=3", e.cookie.includes(n) && (e.cookie = a + ";max-age=0", or = o);
						}
						return or;
					}(t);
					if (!i) {
						var s = ((t) => {
							var e = t.match(ar);
							return e ? e[0] : "";
						})(t);
						s !== i && Ie.info("Warning: cookie subdomain discovery mismatch", s, i), i = s;
					}
					return i ? "; domain=." + i : "";
				}
				return "";
			}(r.location.hostname, s);
			if (i) {
				var u = /* @__PURE__ */ new Date();
				u.setTime(u.getTime() + 864e5 * i), o = "; expires=" + u.toUTCString();
			}
			n && (a = "; secure");
			var h = t + "=" + encodeURIComponent(JSON.stringify(e)) + o + "; SameSite=Lax; path=/" + l + a;
			return h.length > 3686.4 && Ie.warn("cookieStore warning: large cookie, len=" + h.length), r.cookie = h, h;
		} catch (t) {
			return;
		}
	},
	F(t, e) {
		if (null != r && r.cookie) try {
			lr.M(t, "", -1, e);
		} catch (t) {
			return;
		}
	}
}, ur = null, hr = {
	R() {
		if (!M(ur)) return ur;
		var e = !0;
		if (C(t)) e = !1;
		else try {
			var i = "__mplssupport__";
			hr.M(i, "xyz"), "\"xyz\"" !== hr.O(i) && (e = !1), hr.F(i);
		} catch (t) {
			e = !1;
		}
		return e || Ie.error("localStorage unsupported; falling back to cookie store"), ur = e, e;
	},
	B(t) {
		Ie.error("localStorage error: " + t);
	},
	O(e) {
		try {
			return null == t ? void 0 : t.localStorage.getItem(e);
		} catch (t) {
			hr.B(t);
		}
		return null;
	},
	Z(t) {
		try {
			return JSON.parse(hr.O(t)) || {};
		} catch (t) {}
		return null;
	},
	M(e, i) {
		try {
			t?.localStorage.setItem(e, JSON.stringify(i));
		} catch (t) {
			hr.B(t);
		}
	},
	F(e) {
		try {
			t?.localStorage.removeItem(e);
		} catch (t) {
			hr.B(t);
		}
	}
}, dr = [
	De,
	"distinct_id",
	Ze,
	ti,
	Si,
	Ei,
	mi
], vr = {}, cr = {
	R: () => !0,
	B(t) {
		Ie.error("memoryStorage error: " + t);
	},
	O: (t) => vr[t] || null,
	Z: (t) => vr[t] || null,
	M(t, e) {
		vr[t] = e;
	},
	F(t) {
		delete vr[t];
	}
}, pr = null, fr = {
	R() {
		if (!M(pr)) return pr;
		if (pr = !0, C(t)) pr = !1;
		else try {
			var e = "__support__";
			fr.M(e, "xyz"), "\"xyz\"" !== fr.O(e) && (pr = !1), fr.F(e);
		} catch (t) {
			pr = !1;
		}
		return pr;
	},
	B(t) {
		Ie.error("sessionStorage error: ", t);
	},
	O(e) {
		try {
			return null == t ? void 0 : t.sessionStorage.getItem(e);
		} catch (t) {
			fr.B(t);
		}
		return null;
	},
	Z(t) {
		try {
			return JSON.parse(fr.O(t)) || null;
		} catch (t) {}
		return null;
	},
	M(e, i) {
		try {
			t?.sessionStorage.setItem(e, JSON.stringify(i));
		} catch (t) {
			fr.B(t);
		}
	},
	F(e) {
		try {
			t?.sessionStorage.removeItem(e);
		} catch (t) {
			fr.B(t);
		}
	}
};
var _r = class {
	constructor(t) {
		this._instance = t;
	}
	get Bt() {
		return this._instance.config;
	}
	get consent() {
		return this.rr() ? 0 : this.ir;
	}
	isOptedOut() {
		return this.Bt.cookieless_mode === Ci || this.isRejected() || -1 === this.consent && this.Bt.cookieless_mode === Ii;
	}
	isOptedIn() {
		return !this.isOptedOut();
	}
	isExplicitlyOptedOut() {
		return 0 === this.consent;
	}
	isRejected() {
		return 0 === this.consent || -1 === this.consent && this.Bt.opt_out_capturing_by_default;
	}
	optInOut(t) {
		this.nr.M(this.sr, t ? 1 : 0, this.Bt.cookie_expiration, this.Bt.cross_subdomain_cookie, this.Bt.secure_cookie);
	}
	reset() {
		this.nr.F(this.sr, this.Bt.cross_subdomain_cookie);
	}
	get sr() {
		var { token: t, opt_out_capturing_cookie_prefix: e, consent_persistence_name: i } = this._instance.config;
		return i || (e ? e + t : "__ph_opt_in_out_" + t);
	}
	get ir() {
		var t = this.nr.O(this.sr);
		return W(t) ? 1 : w(G, t) ? 0 : -1;
	}
	get nr() {
		var t = this.Bt.opt_out_capturing_persistence_type, e = "localStorage" === t ? hr : lr;
		if (!this.ar || this.ar !== e) {
			this.ar = e;
			var i = "localStorage" === t ? lr : hr;
			i.O(this.sr) && (this.ar.O(this.sr) || this.optInOut(W(i.O(this.sr))), i.F(this.sr, this.Bt.cross_subdomain_cookie));
		}
		return this.ar;
	}
	rr() {
		return !!this.Bt.respect_dnt && [
			null == i ? void 0 : i.doNotTrack,
			null == i ? void 0 : i.msDoNotTrack,
			h.doNotTrack
		].some(((t) => W(t)));
	}
};
var gr = Ce("[Dead Clicks]"), mr = () => !0, br = (t) => {
	var e, i = !(null == (e = t.instance.persistence) || !e.get_property(Ve)), r = t.instance.config.capture_dead_clicks;
	return N(r) ? r : !!O(r) || i;
};
var yr = class {
	get lazyLoadedDeadClicksAutocapture() {
		return this.lr;
	}
	constructor(t, e, i) {
		this.instance = t, this.isEnabled = e, this.onCapture = i, this.startIfEnabledOrStop();
	}
	onRemoteConfig(t) {
		"captureDeadClicks" in t && (this.instance.persistence && this.instance.persistence.register({ [Ve]: t.captureDeadClicks }), this.startIfEnabledOrStop());
	}
	startIfEnabledOrStop() {
		this.isEnabled(this) ? this.ur((() => {
			this.hr();
		})) : this.stop();
	}
	ur(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.initDeadClicksAutocapture && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this.instance, "dead-clicks-autocapture", ((e) => {
			e ? gr.error("failed to load script", e) : t();
		}));
	}
	hr() {
		var t;
		if (r) {
			if (!this.lr && null != (t = h.__PosthogExtensions__) && t.initDeadClicksAutocapture) {
				var e = O(this.instance.config.capture_dead_clicks) ? this.instance.config.capture_dead_clicks : {};
				e.__onCapture = this.onCapture, this.lr = h.__PosthogExtensions__.initDeadClicksAutocapture(this.instance, e), this.lr.start(r), gr.info("starting...");
			}
		} else gr.error("`document` not found. Cannot start.");
	}
	stop() {
		this.lr && (this.lr.stop(), this.lr = void 0, gr.info("stopping..."));
	}
};
var wr = Ce("[SegmentIntegration]");
var xr = "posthog-js";
function Er(t, e) {
	var { organization: i, projectId: r, prefix: s, severityAllowList: n = ["error"], sendExceptionsToPostHog: o = !0 } = void 0 === e ? {} : e;
	return (e) => {
		var a, l, u, h, d;
		if ("*" !== n && !n.includes(e.level) || !t.__loaded) return e;
		e.tags || (e.tags = {});
		var v = t.requestRouter.endpointFor("ui", "/project/" + t.config.token + "/person/" + t.get_distinct_id());
		e.tags["PostHog Person URL"] = v, t.sessionRecordingStarted() && (e.tags["PostHog Recording URL"] = t.get_session_replay_url({ withTimestamp: !0 }));
		var c, p = (null == (a = e.exception) ? void 0 : a.values) || [], _ = p.map(((t) => f({}, t, { stacktrace: t.stacktrace ? f({}, t.stacktrace, {
			type: "raw",
			frames: (t.stacktrace.frames || []).map(((t) => f({}, t, { platform: "web:javascript" })))
		}) : void 0 }))), g = {
			$exception_message: (null == (l = p[0]) ? void 0 : l.value) || e.message,
			$exception_type: null == (u = p[0]) ? void 0 : u.type,
			$exception_level: e.level,
			$exception_list: _,
			$sentry_event_id: e.event_id,
			$sentry_exception: e.exception,
			$sentry_exception_message: (null == (h = p[0]) ? void 0 : h.value) || e.message,
			$sentry_exception_type: null == (d = p[0]) ? void 0 : d.type,
			$sentry_tags: e.tags
		};
		return i && r && (g.$sentry_url = (s || "https://sentry.io/organizations/") + i + "/issues/?project=" + r + "&query=" + e.event_id), o && (null == (c = t.exceptions) || c.sendExceptionEvent(g)), e;
	};
}
var Sr = class {
	constructor(t, e, i, r, s, n) {
		this.name = xr, this.setupOnce = function(o) {
			o(Er(t, {
				organization: e,
				projectId: i,
				prefix: r,
				severityAllowList: s,
				sendExceptionsToPostHog: null == n || n
			}));
		};
	}
};
var $r = class {
	constructor(t) {
		this.cr = (t, e, i) => {
			i && (i.noSessionId || i.activityTimeout || i.sessionPastMaximumLength) && (Ie.info("[PageViewManager] Session rotated, clearing pageview state", {
				sessionId: t,
				changeReason: i
			}), this.dr = void 0, this._instance.scrollManager.resetContext());
		}, this._instance = t, this.vr();
	}
	vr() {
		var t;
		this.pr = null == (t = this._instance.sessionManager) ? void 0 : t.onSessionId(this.cr);
	}
	destroy() {
		var t;
		null == (t = this.pr) || t.call(this), this.pr = void 0;
	}
	doPageView(e, i) {
		var r, s = this.gr(e, i);
		return this.dr = {
			pathname: null !== (r = null == t ? void 0 : t.location.pathname) && void 0 !== r ? r : "",
			pageViewId: i,
			timestamp: e
		}, this._instance.scrollManager.resetContext(), s;
	}
	doPageLeave(t) {
		var e;
		return this.gr(t, null == (e = this.dr) ? void 0 : e.pageViewId);
	}
	doEvent() {
		var t;
		return { $pageview_id: null == (t = this.dr) ? void 0 : t.pageViewId };
	}
	gr(t, e) {
		var i = this.dr;
		if (!i) return { $pageview_id: e };
		var r = {
			$pageview_id: e,
			$prev_pageview_id: i.pageViewId
		}, s = this._instance.scrollManager.getContext();
		if (s && !this._instance.config.disable_scroll_properties) {
			var { maxScrollHeight: n, lastScrollY: o, maxScrollY: a, maxContentHeight: l, lastContentY: u, maxContentY: h } = s;
			if (!(C(n) || C(o) || C(a) || C(l) || C(u) || C(h))) {
				n = Math.ceil(n), o = Math.ceil(o), a = Math.ceil(a), l = Math.ceil(l), u = Math.ceil(u), h = Math.ceil(h);
				var d = n > 1 ? Y(o / n, 0, 1, Ie) : 1, v = n > 1 ? Y(a / n, 0, 1, Ie) : 1, c = l > 1 ? Y(u / l, 0, 1, Ie) : 1, p = l > 1 ? Y(h / l, 0, 1, Ie) : 1;
				r = qi(r, {
					$prev_pageview_last_scroll: o,
					$prev_pageview_last_scroll_percentage: d,
					$prev_pageview_max_scroll: a,
					$prev_pageview_max_scroll_percentage: v,
					$prev_pageview_last_content: u,
					$prev_pageview_last_content_percentage: c,
					$prev_pageview_max_content: h,
					$prev_pageview_max_content_percentage: p
				});
			}
		}
		return i.pathname && (r.$prev_pageview_pathname = i.pathname), i.timestamp && (r.$prev_pageview_duration = (t.getTime() - i.timestamp.getTime()) / 1e3), r;
	}
};
var Tr = {
	[Me]: { exposure: "hidden" },
	[Le]: { exposure: "hidden" },
	__cmpns: { exposure: "hidden" },
	[Ue]: { exposure: "hidden" },
	[Ne]: { exposure: "event" },
	[je]: { exposure: "hidden" },
	[ze]: { exposure: "event" },
	[Be]: { exposure: "hidden" },
	[He]: { exposure: "event" },
	[qe]: { exposure: "event" },
	[Ve]: { exposure: "event" },
	[We]: { exposure: "hidden" },
	[Ge]: { exposure: "event" },
	[Ye]: { exposure: "hidden" },
	$session_recording_enabled_server_side: { exposure: "hidden" },
	[Ze]: { exposure: "hidden" },
	[ti]: { exposure: "event" },
	$session_past_minimum_duration: { exposure: "event" },
	$session_recording_url_trigger_activated_session: { exposure: "event" },
	$session_recording_event_trigger_activated_session: { exposure: "event" },
	$debug_first_full_snapshot_timestamp: { exposure: "event" },
	[ei]: {
		exposure: "derived",
		shouldSkipFromEventProperties: (t, e) => e(),
		transformToEventProperties(t) {
			if (!O(t)) return {};
			for (var e = {}, i = Object.keys(t), r = 0; i.length > r; r++) e["$feature/" + i[r]] = t[i[r]];
			return e;
		}
	},
	[ii]: { exposure: "event" },
	[ri]: { exposure: "hidden" },
	[si]: { exposure: "hidden" },
	[ni]: { exposure: "event" },
	[oi]: { exposure: "event" },
	[ai]: { exposure: "event" },
	[li]: { exposure: "hidden" },
	[ui]: { exposure: "hidden" },
	[hi]: { exposure: "hidden" },
	[di]: { exposure: "hidden" },
	[vi]: { exposure: "event" },
	[ci]: { exposure: "hidden" },
	$product_tours_activated: { exposure: "hidden" },
	$conversations_widget_session_id: { exposure: "event" },
	$conversations_ticket_id: { exposure: "event" },
	$conversations_widget_state: { exposure: "event" },
	$conversations_user_traits: { exposure: "event" },
	[pi]: { exposure: "hidden" },
	[fi]: { exposure: "hidden" },
	[_i]: { exposure: "hidden" },
	[gi]: { exposure: "hidden" },
	[mi]: { exposure: "hidden" },
	[bi]: { exposure: "hidden" },
	[yi]: { exposure: "hidden" },
	[wi]: { exposure: "hidden" },
	[xi]: { exposure: "hidden" },
	[Ei]: { exposure: "hidden" },
	[Si]: { exposure: "hidden" },
	[Je]: { exposure: "event" },
	[Ke]: { exposure: "event" },
	[Xe]: { exposure: "event" },
	[Qe]: { exposure: "event" },
	[ki]: { exposure: "event" },
	[Ri]: { exposure: "event" },
	[Pi]: { exposure: "event" },
	$sdk_debug_replay_event_trigger_status: { exposure: "event" },
	$sdk_debug_replay_linked_flag_trigger_status: { exposure: "event" },
	$sdk_debug_replay_matched_recording_trigger_groups: { exposure: "event" },
	$sdk_debug_replay_remote_trigger_matching_config: { exposure: "event" },
	$sdk_debug_replay_trigger_groups_count: { exposure: "event" },
	$sdk_debug_replay_url_trigger_status: { exposure: "event" },
	$session_recording_start_reason: { exposure: "event" }
}, kr = [
	["$posthog_sr_group_event_trigger_", { exposure: "hidden" }],
	["$posthog_sr_group_url_trigger_", { exposure: "hidden" }],
	["$posthog_sr_group_sampling_", { exposure: "hidden" }]
], Rr = (t) => {
	var e = null == r ? void 0 : r.createElement("a");
	return C(e) ? null : (e.href = t, e);
}, Pr = function(t, e) {
	for (var i, r = ((t.split("#")[0] || "").split(/\?(.*)/)[1] || "").replace(/^\?+/g, "").split("&"), s = 0; r.length > s; s++) {
		var n = r[s].split("=");
		if (n[0] === e) {
			i = n;
			break;
		}
	}
	if (!R(i) || 2 > i.length) return "";
	var o = i[1];
	try {
		o = decodeURIComponent(o);
	} catch (t) {
		Ie.error("Skipping decoding for malformed query param: " + o);
	}
	return o.replace(/\+/g, " ");
}, Or = function(t, e, i) {
	if (!t || !e || !e.length) return t;
	for (var r = t.split("#"), s = r[1], n = (r[0] || "").split("?"), o = n[1], a = n[0], l = (o || "").split("&"), u = [], h = 0; l.length > h; h++) {
		var d = l[h].split("=");
		R(d) && (e.includes(d[0]) ? u.push(d[0] + "=" + i) : u.push(l[h]));
	}
	var v = a;
	return null != o && (v += "?" + u.join("&")), null != s && (v += "#" + s), v;
}, Ir = function(t, e) {
	var i = t.match(new RegExp(e + "=([^&]*)"));
	return i ? i[1] : null;
}, Cr = "https?://(.*)", Fr = [
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"twclid",
	"li_fat_id",
	"igshid",
	"ttclid",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"irclid",
	"_kx"
], Ar = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"gad_source",
	"mc_cid",
	...Fr
], Mr = "<masked>", Dr = ["li_fat_id"];
function Lr(t, e, i) {
	if (!r) return {};
	var s, n = e ? [...Fr, ...i || []] : [], o = Ur(Or(r.URL, n, Mr), t);
	return qi((s = {}, Hi(Dr, (function(t) {
		var e = lr.O(t);
		s[t] = e || null;
	})), s), o);
}
function Ur(t, e) {
	var i = Ar.concat(e || []), r = {};
	return Hi(i, (function(e) {
		r[e] = Pr(t, e) || null;
	})), r;
}
function Nr(t) {
	var e = function(t) {
		return t ? 0 === t.search(Cr + "google.([^/?]*)") ? "google" : 0 === t.search(Cr + "bing.com") ? "bing" : 0 === t.search(Cr + "yahoo.com") ? "yahoo" : 0 === t.search(Cr + "duckduckgo.com") ? "duckduckgo" : null : null;
	}(t), i = "yahoo" != e ? "q" : "p", s = {};
	if (!M(e)) {
		s.$search_engine = e;
		var n = r ? Pr(r.referrer, i) : "";
		n.length && (s.ph_keyword = n);
	}
	return s;
}
function jr() {
	return navigator.language || navigator.userLanguage;
}
var zr = "$direct";
function Br() {
	return (null == r ? void 0 : r.referrer) || zr;
}
function Hr(t, e) {
	var i = t ? [...Fr, ...e || []] : [], r = null == s ? void 0 : s.href.substring(0, 1e3);
	return {
		r: Br().substring(0, 1e3),
		u: r ? Or(r, i, Mr) : void 0
	};
}
function qr(t) {
	var e, { r: i, u: r } = t, s = {
		$referrer: i,
		$referring_domain: null == i ? void 0 : i == zr ? zr : null == (e = Rr(i)) ? void 0 : e.host
	};
	if (r) {
		s.$current_url = r;
		var n = Rr(r);
		s.$host = null == n ? void 0 : n.host, s.$pathname = null == n ? void 0 : n.pathname;
		qi(s, Ur(r));
	}
	if (i) qi(s, Nr(i));
	return s;
}
function Vr() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch (t) {
		return;
	}
}
function Wr() {
	try {
		return (/* @__PURE__ */ new Date()).getTimezoneOffset();
	} catch (t) {
		return;
	}
}
var Gr = [
	"cookie",
	"localstorage",
	"localstorage+cookie",
	"sessionstorage",
	"memory"
];
var Yr = class {
	constructor(t, e) {
		this.Bt = t, this.props = {}, this.mr = !1, this.yr = ((t) => {
			var e = "";
			return t.token && (e = t.token.replace(/\+/g, "PL").replace(/\//g, "SL").replace(/=/g, "EQ")), t.persistence_name ? "ph_" + t.persistence_name : "ph_" + e + "_posthog";
		})(t), this.nr = this.br(t), this.load(), t.debug && Ie.info("Persistence loaded", t.persistence, f({}, this.props)), this.update_config(t, t, e), this.save();
	}
	isDisabled() {
		return !!this._r;
	}
	br(e) {
		-1 === Gr.indexOf(e.persistence.toLowerCase()) && (Ie.critical("Unknown persistence type " + e.persistence + "; falling back to localStorage+cookie"), e.persistence = "localStorage+cookie");
		var i = function(e) {
			void 0 === e && (e = []);
			var i = [...dr, ...e];
			return f({}, hr, {
				Z(t) {
					try {
						var e = {};
						try {
							e = lr.Z(t) || {};
						} catch (t) {}
						var i = qi(e, JSON.parse(hr.O(t) || "{}"));
						return hr.M(t, i), i;
					} catch (t) {}
					return null;
				},
				M(t, e, r, s, n, o) {
					try {
						hr.M(t, e, void 0, void 0, o);
						var a = {};
						i.forEach(((t) => {
							e[t] && (a[t] = e[t]);
						})), Object.keys(a).length && lr.M(t, a, r, s, n, o);
					} catch (t) {
						hr.B(t);
					}
				},
				F(e, i) {
					try {
						t?.localStorage.removeItem(e), lr.F(e, i);
					} catch (t) {
						hr.B(t);
					}
				}
			});
		}(e.cookie_persisted_properties || []), r = e.persistence.toLowerCase();
		return "localstorage" === r && hr.R() ? hr : "localstorage+cookie" === r && i.R() ? i : "sessionstorage" === r && fr.R() ? fr : "memory" === r ? cr : "cookie" === r ? lr : i.R() ? i : lr;
	}
	wr(t) {
		var e = null != t ? t : this.Bt.feature_flag_cache_ttl_ms;
		if (!e || 0 >= e) return !1;
		var i = this.props[gi];
		return !i || "number" != typeof i || Date.now() - i > e;
	}
	properties() {
		var t = {};
		return Hi(this.props, ((e, i) => {
			var r = ((t) => {
				var e = Tr[t];
				if (e) return e;
				for (var [i, r] of kr) if (0 === t.indexOf(i)) return r;
			})(i);
			if ("derived" === (null == r ? void 0 : r.exposure)) {
				if (null != r.shouldSkipFromEventProperties && r.shouldSkipFromEventProperties(e, i === ei ? () => this.wr() : () => !1)) return;
				r.transformToEventProperties && qi(t, r.transformToEventProperties(e));
			} else r && "event" !== r.exposure || (t[i] = e);
		})), t;
	}
	load() {
		if (!this._r) {
			var t = this.nr.Z(this.yr);
			t && (this.props = qi({}, t));
		}
	}
	save() {
		this._r || this.nr.M(this.yr, this.props, this.Ir, this.Cr, this.Sr, this.Bt.debug);
	}
	remove() {
		this.nr.F(this.yr, !1), this.nr.F(this.yr, !0);
	}
	clear() {
		this.remove(), this.props = {};
	}
	register_once(t, e, i) {
		if (O(t)) {
			C(e) && (e = "None"), this.Ir = C(i) ? this.kr : i;
			var r = !1;
			if (Hi(t, ((t, i) => {
				this.props.hasOwnProperty(i) && this.props[i] !== e || (this.Tr(i, t), r = !0);
			})), r) return this.save(), !0;
		}
		return !1;
	}
	register(t, e) {
		if (O(t)) {
			this.Ir = C(e) ? this.kr : e;
			var i = !1;
			if (Hi(t, ((e, r) => {
				t.hasOwnProperty(r) && this.props[r] !== e && (this.Tr(r, e), i = !0);
			})), i) return this.save(), !0;
		}
		return !1;
	}
	unregister(t) {
		t in this.props && (this.Ar(t), this.save());
	}
	update_campaign_params() {
		if (!this.mr) {
			var t = Lr(this.Bt.custom_campaign_params, this.Bt.mask_personal_data_properties, this.Bt.custom_personal_data_properties);
			I(Yi(t)) || this.register(t), this.mr = !0;
		}
	}
	update_search_keyword() {
		var t;
		this.register((t = null == r ? void 0 : r.referrer) ? Nr(t) : {});
	}
	update_referrer_info() {
		var t;
		this.register_once({
			$referrer: Br(),
			$referring_domain: null != r && r.referrer && (null == (t = Rr(r.referrer)) ? void 0 : t.host) || zr
		}, void 0);
	}
	set_initial_person_info() {
		this.props[wi] || this.props[xi] || this.register_once({ [Ei]: Hr(this.Bt.mask_personal_data_properties, this.Bt.custom_personal_data_properties) }, void 0);
	}
	get_initial_props() {
		var t = {};
		Hi([xi, wi], ((e) => {
			var i = this.props[e];
			i && Hi(i, (function(e, i) {
				t["$initial_" + E(i)] = e;
			}));
		}));
		var e, i, r = this.props[Ei];
		if (r) qi(t, (e = qr(r), i = {}, Hi(e, (function(t, e) {
			i["$initial_" + E(e)] = t;
		})), i));
		return t;
	}
	safe_merge(t) {
		return Hi(this.props, (function(e, i) {
			i in t || (t[i] = e);
		})), t;
	}
	update_config(t, e, i) {
		if (this.kr = this.Ir = t.cookie_expiration, this.set_disabled(t.disable_persistence || !!i), this.set_cross_subdomain(t.cross_subdomain_cookie), this.set_secure(t.secure_cookie), t.persistence !== e.persistence || !((t, e) => {
			if (t.length !== e.length) return !1;
			var i = [...t].sort(), r = [...e].sort();
			return i.every(((t, e) => t === r[e]));
		})(t.cookie_persisted_properties || [], e.cookie_persisted_properties || [])) {
			var r = this.br(t), s = this.props;
			this.clear(), this.nr = r, this.props = s, this.save();
		}
	}
	set_disabled(t) {
		this._r = t, this._r ? this.remove() : this.save();
	}
	set_cross_subdomain(t) {
		t !== this.Cr && (this.Cr = t, this.remove(), this.save());
	}
	set_secure(t) {
		t !== this.Sr && (this.Sr = t, this.remove(), this.save());
	}
	set_event_timer(t, e) {
		var i = this.props[Ue] || {};
		i[t] = e, this.Tr(Ue, i), this.save();
	}
	remove_event_timer(t) {
		var e = this.props[Ue] || {}, i = e[t];
		return C(i) || (delete e[t], this.Tr(Ue, e), this.save()), i;
	}
	get_property(t) {
		return this.props[t];
	}
	set_property(t, e) {
		this.Tr(t, e), this.save();
	}
	Tr(t, e) {
		this.props[t] = e;
	}
	Ar(t) {
		delete this.props[t];
	}
}, Jr = {
	Activation: "events",
	Cancellation: "cancelEvents"
}, Zr = {
	Popover: "popover",
	API: "api",
	Widget: "widget",
	ExternalSurvey: "external_survey"
}, rs = {
	SHOWN: "survey shown",
	DISMISSED: "survey dismissed",
	SENT: "survey sent",
	ABANDONED: "survey abandoned"
}, ss = {
	SURVEY_ID: "$survey_id",
	SURVEY_NAME: "$survey_name",
	SURVEY_RESPONSE: "$survey_response",
	SURVEY_ITERATION: "$survey_iteration",
	SURVEY_ITERATION_START_DATE: "$survey_iteration_start_date",
	SURVEY_PARTIALLY_COMPLETED: "$survey_partially_completed",
	SURVEY_SUBMISSION_ID: "$survey_submission_id",
	SURVEY_QUESTIONS: "$survey_questions",
	SURVEY_COMPLETED: "$survey_completed",
	PRODUCT_TOUR_ID: "$product_tour_id",
	SURVEY_LAST_SEEN_DATE: "$survey_last_seen_date",
	SURVEY_LANGUAGE: "$survey_language"
}, ns = {
	Popover: "popover",
	Inline: "inline"
}, as = {
	SHOWN: "product tour shown",
	DISMISSED: "product tour dismissed",
	COMPLETED: "product tour completed",
	STEP_SHOWN: "product tour step shown",
	STEP_COMPLETED: "product tour step completed",
	BUTTON_CLICKED: "product tour button clicked",
	STEP_SELECTOR_FAILED: "product tour step selector failed",
	BANNER_CONTAINER_SELECTOR_FAILED: "product tour banner container selector failed",
	BANNER_ACTION_CLICKED: "product tour banner action clicked"
}, ls = {
	TOUR_ID: "$product_tour_id",
	TOUR_NAME: "$product_tour_name",
	TOUR_ITERATION: "$product_tour_iteration",
	TOUR_RENDER_REASON: "$product_tour_render_reason",
	TOUR_STEP_ID: "$product_tour_step_id",
	TOUR_STEP_ORDER: "$product_tour_step_order",
	TOUR_STEP_TYPE: "$product_tour_step_type",
	TOUR_DISMISS_REASON: "$product_tour_dismiss_reason",
	TOUR_BUTTON_TEXT: "$product_tour_button_text",
	TOUR_BUTTON_ACTION: "$product_tour_button_action",
	TOUR_BUTTON_LINK: "$product_tour_button_link",
	TOUR_BUTTON_TOUR_ID: "$product_tour_button_tour_id",
	TOUR_STEPS_COUNT: "$product_tour_steps_count",
	TOUR_STEP_SELECTOR: "$product_tour_step_selector",
	TOUR_STEP_SELECTOR_FOUND: "$product_tour_step_selector_found",
	TOUR_STEP_ELEMENT_TAG: "$product_tour_step_element_tag",
	TOUR_STEP_ELEMENT_ID: "$product_tour_step_element_id",
	TOUR_STEP_ELEMENT_CLASSES: "$product_tour_step_element_classes",
	TOUR_STEP_ELEMENT_TEXT: "$product_tour_step_element_text",
	TOUR_ERROR: "$product_tour_error",
	TOUR_MATCHES_COUNT: "$product_tour_matches_count",
	TOUR_FAILURE_PHASE: "$product_tour_failure_phase",
	TOUR_WAITED_FOR_ELEMENT: "$product_tour_waited_for_element",
	TOUR_WAIT_DURATION_MS: "$product_tour_wait_duration_ms",
	TOUR_BANNER_SELECTOR: "$product_tour_banner_selector",
	TOUR_LINKED_SURVEY_ID: "$product_tour_linked_survey_id",
	USE_MANUAL_SELECTOR: "$use_manual_selector",
	INFERENCE_DATA_PRESENT: "$inference_data_present",
	TOUR_LAST_SEEN_DATE: "$product_tour_last_seen_date",
	TOUR_TYPE: "$product_tour_type"
}, us = Ce("[RateLimiter]");
var hs = class {
	constructor(t) {
		this.serverLimits = {}, this.lastEventRateLimited = !1, this.checkForLimiting = (t) => {
			var e = t.text;
			if (e && e.length) try {
				(JSON.parse(e).quota_limited || []).forEach(((t) => {
					us.info((t || "events") + " is quota limited."), this.serverLimits[t] = (/* @__PURE__ */ new Date()).getTime() + 6e4;
				}));
			} catch (t) {
				us.warn("could not rate limit - continuing. Error: \"" + (null == t ? void 0 : t.message) + "\"", { text: e });
				return;
			}
		}, this.instance = t, this.lastEventRateLimited = this.clientRateLimitContext(!0).isRateLimited;
	}
	get captureEventsPerSecond() {
		var t;
		return (null == (t = this.instance.config.rate_limiting) ? void 0 : t.events_per_second) || 10;
	}
	get captureEventsBurstLimit() {
		var t;
		return Math.max((null == (t = this.instance.config.rate_limiting) ? void 0 : t.events_burst_limit) || 10 * this.captureEventsPerSecond, this.captureEventsPerSecond);
	}
	clientRateLimitContext(t) {
		var e, i, r;
		void 0 === t && (t = !1);
		var { captureEventsBurstLimit: s, captureEventsPerSecond: n } = this, o = (/* @__PURE__ */ new Date()).getTime(), a = null !== (e = null == (i = this.instance.persistence) ? void 0 : i.get_property(yi)) && void 0 !== e ? e : {
			tokens: s,
			last: o
		};
		a.tokens += (o - a.last) / 1e3 * n, a.last = o, a.tokens > s && (a.tokens = s);
		var l = 1 > a.tokens;
		return l || t || (a.tokens = Math.max(0, a.tokens - 1)), !l || this.lastEventRateLimited || t || this.instance.capture("$$client_ingestion_warning", { $$client_ingestion_warning_message: "posthog-js client rate limited. Config is set to " + n + " events per second and " + s + " events burst limit." }, { skip_client_rate_limiting: !0 }), this.lastEventRateLimited = l, null == (r = this.instance.persistence) || r.set_property(yi, a), {
			isRateLimited: l,
			remainingTokens: a.tokens
		};
	}
	isServerRateLimited(t) {
		var e = this.serverLimits[t || "events"] || !1;
		return !1 !== e && (/* @__PURE__ */ new Date()).getTime() < e;
	}
};
var ds = Ce("[RemoteConfig]");
var vs = class {
	constructor(t) {
		this._instance = t;
	}
	get remoteConfig() {
		var t;
		return null == (t = h._POSTHOG_REMOTE_CONFIG) || null == (t = t[this._instance.config.token]) ? void 0 : t.config;
	}
	Er(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.loadExternalDependency ? null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "remote-config", (() => t(this.remoteConfig))) : t();
	}
	Rr(t) {
		this._instance._send_request({
			method: "GET",
			url: this._instance.requestRouter.endpointFor("assets", "/array/" + this._instance.config.token + "/config"),
			callback(e) {
				t(e.json);
			}
		});
	}
	load() {
		try {
			if (this.remoteConfig) return ds.info("Using preloaded remote config", this.remoteConfig), this.Nr(this.remoteConfig), void this.Mr();
			if (this._instance.Fr()) return void ds.warn("Remote config is disabled. Falling back to local config.");
			this.Er(((t) => {
				if (!t) return ds.info("No config found after loading remote JS config. Falling back to JSON."), void this.Rr(((t) => {
					this.Nr(t), this.Mr();
				}));
				this.Nr(t), this.Mr();
			}));
		} catch (t) {
			ds.error("Error loading remote config", t);
		}
	}
	stop() {
		this.Or && (clearInterval(this.Or), this.Or = void 0);
	}
	refresh() {
		this._instance.Fr() || "hidden" === (null == r ? void 0 : r.visibilityState) || this._instance.reloadFeatureFlags();
	}
	Mr() {
		var t;
		if (!this.Or) {
			var e = null !== (t = this._instance.config.remote_config_refresh_interval_ms) && void 0 !== t ? t : 3e5;
			0 !== e && (this.Or = setInterval((() => {
				this.refresh();
			}), e));
		}
	}
	Nr(t) {
		var e;
		t || ds.error("Failed to fetch remote config from PostHog."), this._instance.Nr(null != t ? t : {}), !1 !== (null == t ? void 0 : t.hasFeatureFlags) && (this._instance.config.advanced_disable_feature_flags_on_first_load || null == (e = this._instance.featureFlags) || e.ensureFlagsLoaded());
	}
}, ps = {
	GZipJS: "gzip-js",
	Base64: "base64"
}, fs = Uint8Array, _s = Uint16Array, gs = Uint32Array, ms = new fs([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]), bs = new fs([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]), ys = new fs([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]), ws = function(t, e) {
	for (var i = new _s(31), r = 0; 31 > r; ++r) i[r] = e += 1 << t[r - 1];
	var s = new gs(i[30]);
	for (r = 1; 30 > r; ++r) for (var n = i[r]; i[r + 1] > n; ++n) s[n] = n - i[r] << 5 | r;
	return [i, s];
}, xs = ws(ms, 2), Es = xs[1];
xs[0][28] = 258, Es[258] = 28;
for (var Ss = ws(bs, 0)[1], $s = new _s(32768), Ts = 0; 32768 > Ts; ++Ts) {
	var ks = (43690 & Ts) >>> 1 | (21845 & Ts) << 1;
	$s[Ts] = ((65280 & (ks = (61680 & (ks = (52428 & ks) >>> 2 | (13107 & ks) << 2)) >>> 4 | (3855 & ks) << 4)) >>> 8 | (255 & ks) << 8) >>> 1;
}
var Rs = function(t, e, i) {
	for (var r = t.length, s = 0, n = new _s(e); r > s; ++s) ++n[t[s] - 1];
	var o, a = new _s(e);
	for (s = 0; e > s; ++s) a[s] = a[s - 1] + n[s - 1] << 1;
	if (i) {
		o = new _s(1 << e);
		var l = 15 - e;
		for (s = 0; r > s; ++s) if (t[s]) for (var u = s << 4 | t[s], h = e - t[s], d = a[t[s] - 1]++ << h, v = d | (1 << h) - 1; v >= d; ++d) o[$s[d] >>> l] = u;
	} else for (o = new _s(r), s = 0; r > s; ++s) o[s] = $s[a[t[s] - 1]++] >>> 15 - t[s];
	return o;
}, Ps = new fs(288);
for (Ts = 0; 144 > Ts; ++Ts) Ps[Ts] = 8;
for (Ts = 144; 256 > Ts; ++Ts) Ps[Ts] = 9;
for (Ts = 256; 280 > Ts; ++Ts) Ps[Ts] = 7;
for (Ts = 280; 288 > Ts; ++Ts) Ps[Ts] = 8;
var Os = new fs(32);
for (Ts = 0; 32 > Ts; ++Ts) Os[Ts] = 5;
var Is = Rs(Ps, 9, 0), Cs = Rs(Os, 5, 0), Fs = function(t) {
	return (t / 8 >> 0) + (7 & t && 1);
}, As = function(t, e, i) {
	(null == i || i > t.length) && (i = t.length);
	var r = new (t instanceof _s ? _s : t instanceof gs ? gs : fs)(i - e);
	return r.set(t.subarray(e, i)), r;
}, Ms = function(t, e, i) {
	var r = e / 8 >> 0;
	t[r] |= i <<= 7 & e, t[r + 1] |= i >>> 8;
}, Ds = function(t, e, i) {
	var r = e / 8 >> 0;
	t[r] |= i <<= 7 & e, t[r + 1] |= i >>> 8, t[r + 2] |= i >>> 16;
}, Ls = function(t, e) {
	for (var i = [], r = 0; t.length > r; ++r) t[r] && i.push({
		s: r,
		f: t[r]
	});
	var s = i.length, n = i.slice();
	if (!s) return [new fs(0), 0];
	if (1 == s) {
		var o = new fs(i[0].s + 1);
		return o[i[0].s] = 1, [o, 1];
	}
	i.sort((function(t, e) {
		return t.f - e.f;
	})), i.push({
		s: -1,
		f: 25001
	});
	var a = i[0], l = i[1], u = 0, h = 1, d = 2;
	for (i[0] = {
		s: -1,
		f: a.f + l.f,
		l: a,
		r: l
	}; h != s - 1;) a = i[i[d].f > i[u].f ? u++ : d++], l = i[u != h && i[d].f > i[u].f ? u++ : d++], i[h++] = {
		s: -1,
		f: a.f + l.f,
		l: a,
		r: l
	};
	var v = n[0].s;
	for (r = 1; s > r; ++r) n[r].s > v && (v = n[r].s);
	var c = new _s(v + 1), p = Us(i[h - 1], c, 0);
	if (p > e) {
		r = 0;
		var f = 0, _ = p - e, g = 1 << _;
		for (n.sort((function(t, e) {
			return c[e.s] - c[t.s] || t.f - e.f;
		})); s > r; ++r) {
			var m = n[r].s;
			if (e >= c[m]) break;
			f += g - (1 << p - c[m]), c[m] = e;
		}
		for (f >>>= _; f > 0;) {
			var b = n[r].s;
			e > c[b] ? f -= 1 << e - c[b]++ - 1 : ++r;
		}
		for (; r >= 0 && f; --r) {
			var y = n[r].s;
			c[y] == e && (--c[y], ++f);
		}
		p = e;
	}
	return [new fs(c), p];
}, Us = function(t, e, i) {
	return -1 == t.s ? Math.max(Us(t.l, e, i + 1), Us(t.r, e, i + 1)) : e[t.s] = i;
}, Ns = function(t) {
	for (var e = t.length; e && !t[--e];);
	for (var i = new _s(++e), r = 0, s = t[0], n = 1, o = function(t) {
		i[r++] = t;
	}, a = 1; e >= a; ++a) if (t[a] == s && a != e) ++n;
	else {
		if (!s && n > 2) {
			for (; n > 138; n -= 138) o(32754);
			n > 2 && (o(n > 10 ? n - 11 << 5 | 28690 : n - 3 << 5 | 12305), n = 0);
		} else if (n > 3) {
			for (o(s), --n; n > 6; n -= 6) o(8304);
			n > 2 && (o(n - 3 << 5 | 8208), n = 0);
		}
		for (; n--;) o(s);
		n = 1, s = t[a];
	}
	return [i.subarray(0, r), e];
}, js = function(t, e) {
	for (var i = 0, r = 0; e.length > r; ++r) i += t[r] * e[r];
	return i;
}, zs = function(t, e, i) {
	var r = i.length, s = Fs(e + 2);
	t[s] = 255 & r, t[s + 1] = r >>> 8, t[s + 2] = 255 ^ t[s], t[s + 3] = 255 ^ t[s + 1];
	for (var n = 0; r > n; ++n) t[s + n + 4] = i[n];
	return 8 * (s + 4 + r);
}, Bs = function(t, e, i, r, s, n, o, a, l, u, h) {
	Ms(e, h++, i), ++s[256];
	for (var d = Ls(s, 15), v = d[0], c = d[1], p = Ls(n, 15), f = p[0], _ = p[1], g = Ns(v), m = g[0], b = g[1], y = Ns(f), w = y[0], x = y[1], E = new _s(19), S = 0; m.length > S; ++S) E[31 & m[S]]++;
	for (S = 0; w.length > S; ++S) E[31 & w[S]]++;
	for (var T = Ls(E, 7), k = T[0], R = T[1], P = 19; P > 4 && !k[ys[P - 1]]; --P);
	var O, I, C, F, A = u + 5 << 3, M = js(s, Ps) + js(n, Os) + o, D = js(s, v) + js(n, f) + o + 14 + 3 * P + js(E, k) + (2 * E[16] + 3 * E[17] + 7 * E[18]);
	if (M >= A && D >= A) return zs(e, h, t.subarray(l, l + u));
	if (Ms(e, h, 1 + (M > D)), h += 2, M > D) {
		O = Rs(v, c, 0), I = v, C = Rs(f, _, 0), F = f;
		var L = Rs(k, R, 0);
		for (Ms(e, h, b - 257), Ms(e, h + 5, x - 1), Ms(e, h + 10, P - 4), h += 14, S = 0; P > S; ++S) Ms(e, h + 3 * S, k[ys[S]]);
		h += 3 * P;
		for (var U = [m, w], N = 0; 2 > N; ++N) {
			var j = U[N];
			for (S = 0; j.length > S; ++S) Ms(e, h, L[z = 31 & j[S]]), h += k[z], z > 15 && (Ms(e, h, j[S] >>> 5 & 127), h += j[S] >>> 12);
		}
	} else O = Is, I = Ps, C = Cs, F = Os;
	for (S = 0; a > S; ++S) if (r[S] > 255) {
		var z;
		Ds(e, h, O[257 + (z = r[S] >>> 18 & 31)]), h += I[z + 257], z > 7 && (Ms(e, h, r[S] >>> 23 & 31), h += ms[z]);
		var B = 31 & r[S];
		Ds(e, h, C[B]), h += F[B], B > 3 && (Ds(e, h, r[S] >>> 5 & 8191), h += bs[B]);
	} else Ds(e, h, O[r[S]]), h += I[r[S]];
	return Ds(e, h, O[256]), h + I[256];
}, Hs = new gs([
	65540,
	131080,
	131088,
	131104,
	262176,
	1048704,
	1048832,
	2114560,
	2117632
]), qs = function() {
	for (var t = new gs(256), e = 0; 256 > e; ++e) {
		for (var i = e, r = 9; --r;) i = (1 & i && 3988292384) ^ i >>> 1;
		t[e] = i;
	}
	return t;
}(), Vs = function(t, e, i) {
	for (; i; ++e) t[e] = i, i >>>= 8;
};
function Ws(t, e) {
	void 0 === e && (e = {});
	var i = function() {
		var t = 4294967295;
		return {
			p(e) {
				for (var i = t, r = 0; e.length > r; ++r) i = qs[255 & i ^ e[r]] ^ i >>> 8;
				t = i;
			},
			d() {
				return 4294967295 ^ t;
			}
		};
	}(), r = t.length;
	i.p(t);
	var s, n, o, a, l, u = (a = 10 + ((s = e).filename && s.filename.length + 1 || 0), l = 8, function(t, e, i, r, s, n) {
		var o = t.length, a = new fs(r + o + 5 * (1 + Math.floor(o / 7e3)) + s), l = a.subarray(r, a.length - s), u = 0;
		if (!e || 8 > o) for (var h = 0; o >= h; h += 65535) {
			var d = h + 65535;
			o > d ? u = zs(l, u, t.subarray(h, d)) : (l[h] = !0, u = zs(l, u, t.subarray(h, o)));
		}
		else {
			for (var v = Hs[e - 1], c = v >>> 13, p = 8191 & v, f = (1 << i) - 1, _ = new _s(32768), g = new _s(f + 1), m = Math.ceil(i / 3), b = 2 * m, y = function(e) {
				return (t[e] ^ t[e + 1] << m ^ t[e + 2] << b) & f;
			}, w = new gs(25e3), x = new _s(288), E = new _s(32), S = 0, T = 0, k = (h = 0, 0), R = 0, P = 0; o > h; ++h) {
				var O = y(h), I = 32767 & h, C = g[O];
				if (_[I] = C, g[O] = I, h >= R) {
					var F = o - h;
					if ((S > 7e3 || k > 24576) && F > 423) {
						u = Bs(t, l, 0, w, x, E, T, k, P, h - P, u), k = S = T = 0, P = h;
						for (var A = 0; 286 > A; ++A) x[A] = 0;
						for (A = 0; 30 > A; ++A) E[A] = 0;
					}
					var M = 2, D = 0, L = p, U = I - C & 32767;
					if (F > 2 && O == y(h - U)) for (var N = Math.min(c, F) - 1, j = Math.min(32767, h), z = Math.min(258, F); j >= U && --L && I != C;) {
						if (t[h + M] == t[h + M - U]) {
							for (var B = 0; z > B && t[h + B] == t[h + B - U]; ++B);
							if (B > M) {
								if (M = B, D = U, B > N) break;
								var H = Math.min(U, B - 2), q = 0;
								for (A = 0; H > A; ++A) {
									var V = h - U + A + 32768 & 32767, W = V - _[V] + 32768 & 32767;
									W > q && (q = W, C = V);
								}
							}
						}
						U += (I = C) - (C = _[I]) + 32768 & 32767;
					}
					if (D) {
						w[k++] = 268435456 | Es[M] << 18 | Ss[D];
						var G = 31 & Es[M], Y = 31 & Ss[D];
						T += ms[G] + bs[Y], ++x[257 + G], ++E[Y], R = h + M, ++S;
					} else w[k++] = t[h], ++x[t[h]];
				}
			}
			u = Bs(t, l, !0, w, x, E, T, k, P, h - P, u);
		}
		return As(a, 0, r + Fs(u) + s);
	}(n = t, null == (o = e).level ? 6 : o.level, null == o.mem ? Math.ceil(1.5 * Math.max(8, Math.min(13, Math.log(n.length)))) : 12 + o.mem, a, l)), h = u.length;
	return function(t, e) {
		var i = e.filename;
		if (t[0] = 31, t[1] = 139, t[2] = 8, t[8] = 2 > e.level ? 4 : 9 == e.level ? 2 : 0, t[9] = 3, 0 != e.mtime && Vs(t, 4, Math.floor(new Date(e.mtime || Date.now()) / 1e3)), i) {
			t[3] = 8;
			for (var r = 0; i.length >= r; ++r) t[r + 10] = i.charCodeAt(r);
		}
	}(u, e), Vs(u, h - 8, i.d()), Vs(u, h - 4, r), u;
}
var Gs = !!o || !!n, Ys = "text/plain", Js = !1, Ks = function(t, e, i) {
	var r;
	void 0 === i && (i = !0);
	var [s, n] = t.split("?"), o = f({}, e), a = null !== (r = null == n ? void 0 : n.split("&").map(((t) => {
		var e, [r, s] = t.split("="), n = i && null !== (e = o[r]) && void 0 !== e ? e : s;
		return delete o[r], r + "=" + n;
	}))) && void 0 !== r ? r : [], l = function(t, e) {
		var i, r;
		void 0 === e && (e = "&");
		var s = [];
		return Hi(t, (function(t, e) {
			C(t) || C(e) || "undefined" === e || (i = encodeURIComponent(((t) => t instanceof File)(t) ? t.name : t.toString()), r = encodeURIComponent(e), s[s.length] = r + "=" + i);
		})), s.join(e);
	}(o);
	return l && a.push(l), s + "?" + a.join("&");
}, Xs = (t, e) => JSON.stringify(t, ((t, e) => "bigint" == typeof e ? e.toString() : e), e), Qs = (t) => {
	if (t.tr) return t.tr;
	var { data: e, compression: i } = t;
	if (e) {
		if (i === ps.GZipJS) {
			var r = Ws(function(t, e) {
				var i = t.length;
				if ("undefined" != typeof TextEncoder) return new TextEncoder().encode(t);
				for (var r = new fs(t.length + (t.length >>> 1)), s = 0, n = function(t) {
					r[s++] = t;
				}, o = 0; i > o; ++o) {
					if (s + 5 > r.length) {
						var a = new fs(s + 8 + (i - o << 1));
						a.set(r), r = a;
					}
					var l = t.charCodeAt(o);
					128 > l ? n(l) : 2048 > l ? (n(192 | l >>> 6), n(128 | 63 & l)) : l > 55295 && 57344 > l ? (n(240 | (l = 65536 + (1047552 & l) | 1023 & t.charCodeAt(++o)) >>> 18), n(128 | l >>> 12 & 63), n(128 | l >>> 6 & 63), n(128 | 63 & l)) : (n(224 | l >>> 12), n(128 | l >>> 6 & 63), n(128 | 63 & l));
				}
				return As(r, 0, s);
			}(Xs(e)), { mtime: 0 });
			return {
				contentType: Ys,
				body: r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength),
				estimatedSize: r.byteLength
			};
		}
		if (i === ps.Base64) {
			var n = ((t) => "data=" + encodeURIComponent("string" == typeof t ? t : Xs(t)))(function(t) {
				return t ? btoa(encodeURIComponent(t).replace(/%([0-9A-F]{2})/g, ((t, e) => String.fromCharCode(parseInt(e, 16))))) : t;
			}(Xs(e)));
			return {
				contentType: "application/x-www-form-urlencoded",
				body: n,
				estimatedSize: new Blob([n]).size
			};
		}
		var o = Xs(e);
		return {
			contentType: "application/json",
			body: o,
			estimatedSize: new Blob([o]).size
		};
	}
}, Zs = function() {
	var t = p((function* (t) {
		var i = yield function(t, e, i) {
			return g.apply(this, arguments);
		}(Xs(t.data), v.DEBUG, { rethrow: !0 });
		if (!i) return t;
		var r = yield i.arrayBuffer();
		return f({}, t, { tr: {
			contentType: Ys,
			body: r,
			estimatedSize: r.byteLength
		} });
	}));
	return function(e) {
		return t.apply(this, arguments);
	};
}(), tn = (t, e) => Ks(t, {
	_: (/* @__PURE__ */ new Date()).getTime().toString(),
	ver: v.JS_SDK_VERSION,
	compression: e
}), en = [];
n && en.push({
	transport: "fetch",
	method(t) {
		var e, i, { contentType: r, body: s, estimatedSize: o } = null !== (e = Qs(t)) && void 0 !== e ? e : {}, l = new Headers();
		Hi(t.headers, (function(t, e) {
			l.append(e, t);
		})), r && l.append("Content-Type", r);
		var u = t.url, h = null;
		if (a) {
			var d = new a();
			h = {
				signal: d.signal,
				timeout: setTimeout((() => d.abort()), t.timeout)
			};
		}
		n(u, f({
			method: (null == t ? void 0 : t.method) || "GET",
			headers: l,
			keepalive: "POST" === t.method && 52428.8 > (o || 0),
			body: s,
			signal: null == (i = h) ? void 0 : i.signal
		}, t.fetchOptions)).then(((e) => e.text().then(((i) => {
			var r = {
				statusCode: e.status,
				text: i
			};
			if (200 === e.status) try {
				r.json = JSON.parse(i);
			} catch (t) {
				Ie.error(t);
			}
			null == t.callback || t.callback(r);
		})))).catch(((e) => {
			Ie.error(e), null == t.callback || t.callback({
				statusCode: 0,
				error: e
			});
		})).finally((() => h ? clearTimeout(h.timeout) : null));
	}
}), o && en.push({
	transport: "XHR",
	method(t) {
		var e, i = new o();
		i.open(t.method || "GET", t.url, !0);
		var { contentType: r, body: s } = null !== (e = Qs(t)) && void 0 !== e ? e : {};
		Hi(t.headers, (function(t, e) {
			i.setRequestHeader(e, t);
		})), r && i.setRequestHeader("Content-Type", r), t.timeout && (i.timeout = t.timeout), t.disableXHRCredentials || (i.withCredentials = !0), i.onreadystatechange = () => {
			if (4 === i.readyState) {
				var e = {
					statusCode: i.status,
					text: i.responseText
				};
				if (200 === i.status) try {
					e.json = JSON.parse(i.responseText);
				} catch (t) {}
				null == t.callback || t.callback(e);
			}
		}, i.send(s);
	}
}), null != i && i.sendBeacon && en.push({
	transport: "sendBeacon",
	method(t) {
		var e = Ks(t.url, { beacon: "1" });
		try {
			var r, { contentType: s, body: n } = null !== (r = Qs(t)) && void 0 !== r ? r : {};
			if (!n) return;
			var o = n instanceof Blob ? n : new Blob([n], { type: s });
			i.sendBeacon(e, o);
		} catch (t) {}
	}
});
var rn = 3e3;
var sn = class {
	constructor(t, e) {
		this.Pr = !0, this.Lr = [], this.Dr = Y((null == e ? void 0 : e.flush_interval_ms) || rn, 250, 5e3, Ie.createLogger("flush interval"), rn), this.Br = t;
	}
	enqueue(t) {
		this.Lr.push(t), this.jr || this.$r();
	}
	unload() {
		this.qr();
		var t = this.Lr.length > 0 ? this.Zr() : {}, e = Object.values(t);
		[...e.filter(((t) => 0 === t.url.indexOf("/e"))), ...e.filter(((t) => 0 !== t.url.indexOf("/e")))].map(((t) => {
			this.Br(f({}, t, { transport: "sendBeacon" }));
		}));
	}
	enable() {
		this.Pr = !1, this.$r();
	}
	$r() {
		var t = this;
		this.Pr || (this.jr = setTimeout((() => {
			if (this.qr(), this.Lr.length > 0) {
				var e = this.Zr(), i = function() {
					var i = e[r], s = (/* @__PURE__ */ new Date()).getTime();
					i.data && R(i.data) && Hi(i.data, ((t) => {
						t.offset = Math.abs(t.timestamp - s), delete t.timestamp;
					})), t.Br(i);
				};
				for (var r in e) i();
			}
		}), this.Dr));
	}
	qr() {
		clearTimeout(this.jr), this.jr = void 0;
	}
	Zr() {
		var t = {};
		return Hi(this.Lr, ((e) => {
			var i, r = e, s = (r ? r.batchKey : null) || r.url;
			C(t[s]) && (t[s] = f({}, r, { data: [] })), null == (i = t[s].data) || i.push(r.data);
		})), this.Lr = [], t;
	}
};
var nn = ["retriesPerformedSoFar"];
var on = class {
	constructor(e) {
		this.Vr = !1, this.Hr = 3e3, this.Lr = [], this._instance = e, this.Lr = [], this.zr = !0, !C(t) && "onLine" in t.navigator && (this.zr = t.navigator.onLine, this.Ur = () => {
			this.zr = !0, this.Yr();
		}, this.Gr = () => {
			this.zr = !1;
		}, Xi(t, "online", this.Ur), Xi(t, "offline", this.Gr));
	}
	get length() {
		return this.Lr.length;
	}
	retriableRequest(t) {
		var { retriesPerformedSoFar: e } = t, i = _(t, nn);
		U(e) && (i.url = Ks(i.url, { retry_count: e })), this._instance._send_request(f({}, i, { callback: (t) => {
			200 === t.statusCode || t.statusCode >= 400 && 500 > t.statusCode || (null != e ? e : 0) >= 10 ? null == i.callback || i.callback(t) : this.Wr(f({ retriesPerformedSoFar: e }, i));
		} }));
	}
	Wr(t) {
		var e = t.retriesPerformedSoFar || 0;
		t.retriesPerformedSoFar = e + 1;
		var i = function(t) {
			var e = 3e3 * Math.pow(2, t), i = e / 2, r = Math.min(18e5, e), s = Math.random() - .5;
			return Math.ceil(r + s * (r - i));
		}(e), r = Date.now() + i;
		this.Lr.push({
			retryAt: r,
			requestOptions: t
		});
		var s = "Enqueued failed request for retry in " + i;
		navigator.onLine || (s += " (Browser is offline)"), Ie.warn(s), this.Vr || (this.Vr = !0, this.Xr());
	}
	Xr() {
		if (this.Jr && clearTimeout(this.Jr), 0 === this.Lr.length) return this.Vr = !1, void (this.Jr = void 0);
		this.Jr = setTimeout((() => {
			this.zr && this.Lr.length > 0 && this.Yr(), this.Xr();
		}), this.Hr);
	}
	Yr() {
		var t = Date.now(), e = [], i = this.Lr.filter(((i) => t > i.retryAt || (e.push(i), !1)));
		if (this.Lr = e, i.length > 0) for (var { requestOptions: r } of i) this.retriableRequest(r);
	}
	unload() {
		for (var { requestOptions: e } of (this.Jr && (clearTimeout(this.Jr), this.Jr = void 0), this.Vr = !1, C(t) || (this.Ur && (t.removeEventListener("online", this.Ur), this.Ur = void 0), this.Gr && (t.removeEventListener("offline", this.Gr), this.Gr = void 0)), this.Lr)) try {
			this._instance._send_request(f({}, e, { transport: "sendBeacon" }));
		} catch (t) {
			Ie.error(t);
		}
		this.Lr = [];
	}
};
var an = class {
	constructor(t) {
		this.Kr = () => {
			var t, e, i, r;
			this.Qr || (this.Qr = {});
			var s = this.scrollElement(), n = this.scrollY(), o = s ? Math.max(0, s.scrollHeight - s.clientHeight) : 0, a = n + ((null == s ? void 0 : s.clientHeight) || 0), l = (null == s ? void 0 : s.scrollHeight) || 0;
			this.Qr.lastScrollY = Math.ceil(n), this.Qr.maxScrollY = Math.max(n, null !== (t = this.Qr.maxScrollY) && void 0 !== t ? t : 0), this.Qr.maxScrollHeight = Math.max(o, null !== (e = this.Qr.maxScrollHeight) && void 0 !== e ? e : 0), this.Qr.lastContentY = a, this.Qr.maxContentY = Math.max(a, null !== (i = this.Qr.maxContentY) && void 0 !== i ? i : 0), this.Qr.maxContentHeight = Math.max(l, null !== (r = this.Qr.maxContentHeight) && void 0 !== r ? r : 0);
		}, this._instance = t;
	}
	get ei() {
		return this._instance.config.scroll_root_selector;
	}
	getContext() {
		return this.Qr;
	}
	resetContext() {
		var t = this.Qr;
		return setTimeout(this.Kr, 0), t;
	}
	startMeasuringScrollPosition() {
		Xi(t, "scroll", this.Kr, { capture: !0 }), Xi(t, "scrollend", this.Kr, { capture: !0 }), Xi(t, "resize", this.Kr);
	}
	scrollElement() {
		if (!this.ei) return null == t ? void 0 : t.document.documentElement;
		for (var i of R(this.ei) ? this.ei : [this.ei]) {
			var r = null == t ? void 0 : t.document.querySelector(i);
			if (r) return r;
		}
	}
	scrollY() {
		if (this.ei) {
			var e = this.scrollElement();
			return e && e.scrollTop || 0;
		}
		return t && (t.scrollY || t.pageYOffset || t.document.documentElement.scrollTop) || 0;
	}
	scrollX() {
		if (this.ei) {
			var e = this.scrollElement();
			return e && e.scrollLeft || 0;
		}
		return t && (t.scrollX || t.pageXOffset || t.document.documentElement.scrollLeft) || 0;
	}
};
var ln = (t) => Hr(null == t ? void 0 : t.config.mask_personal_data_properties, null == t ? void 0 : t.config.custom_personal_data_properties);
var un = class {
	constructor(t, e, i, r) {
		this.ti = (t) => {
			var e = this.ri();
			if (!e || e.sessionId !== t) {
				var i = {
					sessionId: t,
					props: this.ii(this._instance)
				};
				this.ni.register({ [bi]: i });
			}
		}, this._instance = t, this.si = e, this.ni = i, this.ii = r || ln, this.si.onSessionId(this.ti);
	}
	ri() {
		return this.ni.props[bi];
	}
	getSetOnceProps() {
		var t, e = null == (t = this.ri()) ? void 0 : t.props;
		return e ? "r" in e ? qr(e) : {
			$referring_domain: e.referringDomain,
			$pathname: e.initialPathName,
			utm_source: e.utm_source,
			utm_campaign: e.utm_campaign,
			utm_medium: e.utm_medium,
			utm_content: e.utm_content,
			utm_term: e.utm_term
		} : {};
	}
	getSessionProps() {
		var t = {};
		return Hi(Yi(this.getSetOnceProps()), ((e, i) => {
			"$current_url" === i && (i = "url"), t["$session_entry_" + E(i)] = e;
		})), t;
	}
};
var hn = class {
	constructor() {
		this.oi = {};
	}
	on(t, e) {
		return this.oi[t] || (this.oi[t] = []), this.oi[t].push(e), () => {
			this.oi[t] = this.oi[t].filter(((t) => t !== e));
		};
	}
	emit(t, e) {
		for (var i of this.oi[t] || []) i(e);
		for (var r of this.oi["*"] || []) r(t, e);
	}
};
var dn = Ce("[SessionId]");
var vn = class {
	on(t, e) {
		return this.ai.on(t, e);
	}
	constructor(t, e, i) {
		var r;
		if (this.li = [], this.ui = void 0, this.ai = new hn(), this.hi = (t, e) => !(!U(t) || !U(e)) && Math.abs(t - e) > this.sessionTimeoutMs, !t.persistence) throw new Error("SessionIdManager requires a PostHogPersistence instance");
		if (t.config.cookieless_mode === Ci) throw new Error("SessionIdManager cannot be used with cookieless_mode=\"always\"");
		this.Bt = t.config, this.ni = t.persistence, this.ci = void 0, this.di = void 0, this._sessionStartTimestamp = null, this._sessionActivityTimestamp = null, this.vi = e || sr, this.fi = i || sr;
		var s = this.Bt.persistence_name || this.Bt.token;
		if (this._sessionTimeoutMs = 1e3 * Y(this.Bt.session_idle_timeout_seconds || 1800, 60, 36e3, dn.createLogger("session_idle_timeout_seconds"), 1800), t.register({ $configured_session_timeout_ms: this._sessionTimeoutMs }), this.pi(), this.gi = "ph_" + s + "_window_id", this.mi = "ph_" + s + "_primary_window_exists", this.yi()) {
			var n = fr.Z(this.gi), o = fr.Z(this.mi);
			n && !o ? this.ci = n : fr.F(this.gi), fr.M(this.mi, !0);
		}
		if (null != (r = this.Bt.bootstrap) && r.sessionID) try {
			var a = ((t) => {
				var e = this.Bt.bootstrap.sessionID.replace(/-/g, "");
				if (32 !== e.length) throw new Error("Not a valid UUID");
				if ("7" !== e[12]) throw new Error("Not a UUIDv7");
				return parseInt(e.substring(0, 12), 16);
			})();
			this.bi(this.Bt.bootstrap.sessionID, (/* @__PURE__ */ new Date()).getTime(), a);
		} catch (t) {
			dn.error("Invalid sessionID in bootstrap", t);
		}
		this.wi();
	}
	get sessionTimeoutMs() {
		return this._sessionTimeoutMs;
	}
	onSessionId(t) {
		return C(this.li) && (this.li = []), this.li.push(t), this.di && t(this.di, this.ci), () => {
			this.li = this.li.filter(((e) => e !== t));
		};
	}
	yi() {
		return "memory" !== this.Bt.persistence && !this.ni._r && fr.R();
	}
	Ii(t) {
		t !== this.ci && (this.ci = t, this.yi() && fr.M(this.gi, t));
	}
	Ci() {
		return this.ci ? this.ci : this.yi() ? fr.Z(this.gi) : null;
	}
	bi(t, e, i) {
		t === this.di && e === this._sessionActivityTimestamp && i === this._sessionStartTimestamp || (this._sessionStartTimestamp = i, this._sessionActivityTimestamp = e, this.di = t, this.ni.register({ [Ze]: [
			e,
			t,
			i
		] }));
	}
	Si() {
		var t = this.ni.props[Ze];
		return R(t) && 2 === t.length && t.push(t[0]), t || [
			0,
			null,
			0
		];
	}
	resetSessionId() {
		this.bi(null, null, null);
	}
	destroy() {
		clearTimeout(this.xi), this.xi = void 0, this.ui && t && (t.removeEventListener(Li, this.ui, { capture: !1 }), this.ui = void 0), this.li = [];
	}
	wi() {
		this.ui = () => {
			this.yi() && fr.F(this.mi);
		}, Xi(t, Li, this.ui, { capture: !1 });
	}
	checkAndGetSessionAndWindowId(t, e) {
		if (void 0 === t && (t = !1), void 0 === e && (e = null), this.Bt.cookieless_mode === Ci) throw new Error("checkAndGetSessionAndWindowId should not be called with cookieless_mode=\"always\"");
		var i = e || (/* @__PURE__ */ new Date()).getTime(), [r, s, n] = this.Si(), o = this.Ci(), a = U(n) && Math.abs(i - n) > 864e5, l = !1, u = !s, h = !u && !t && this.hi(i, r);
		u || h || a ? (s = this.vi(), o = this.fi(), dn.info("new session ID generated", {
			sessionId: s,
			windowId: o,
			changeReason: {
				noSessionId: u,
				activityTimeout: h,
				sessionPastMaximumLength: a
			}
		}), n = i, l = !0) : o || (o = this.fi(), l = !0);
		var d = U(r) && t && !a ? r : i, v = U(n) ? n : (/* @__PURE__ */ new Date()).getTime();
		return this.Ii(o), this.bi(s, d, v), t || this.pi(), l && this.li.forEach(((t) => t(s, o, l ? {
			noSessionId: u,
			activityTimeout: h,
			sessionPastMaximumLength: a
		} : void 0))), {
			sessionId: s,
			windowId: o,
			sessionStartTimestamp: v,
			changeReason: l ? {
				noSessionId: u,
				activityTimeout: h,
				sessionPastMaximumLength: a
			} : void 0,
			lastActivityTimestamp: r
		};
	}
	pi() {
		clearTimeout(this.xi), this.xi = setTimeout((() => {
			var [t] = this.Si();
			if (this.hi((/* @__PURE__ */ new Date()).getTime(), t)) {
				var e = this.di;
				this.resetSessionId(), this.ai.emit("forcedIdleReset", { idleSessionId: e });
			}
		}), 1.1 * this.sessionTimeoutMs);
	}
};
var cn = function(t, e) {
	if (!t) return !1;
	var i = t.userAgent;
	if (i && b(i, e)) return !0;
	try {
		var r = null == t ? void 0 : t.userAgentData;
		if (null != r && r.brands && r.brands.some(((t) => b(null == t ? void 0 : t.brand, e)))) return !0;
	} catch (t) {}
	return !!t.webdriver;
}, pn = function(t, e) {
	if (!function(t) {
		try {
			new RegExp(t);
		} catch (t) {
			return !1;
		}
		return !0;
	}(e)) return !1;
	try {
		return new RegExp(e).test(t);
	} catch (t) {
		return !1;
	}
};
function fn(t, e, i) {
	return Xs({
		distinct_id: t,
		userPropertiesToSet: e,
		userPropertiesToSetOnce: i
	});
}
var _n = {
	exact: (t, e) => e.some(((e) => t.some(((t) => e === t)))),
	is_not: (t, e) => e.every(((e) => t.every(((t) => e !== t)))),
	regex: (t, e) => e.some(((e) => t.some(((t) => pn(e, t))))),
	not_regex: (t, e) => e.every(((e) => t.every(((t) => !pn(e, t))))),
	icontains: (t, e) => e.map(gn).some(((e) => t.map(gn).some(((t) => e.includes(t))))),
	not_icontains: (t, e) => e.map(gn).every(((e) => t.map(gn).every(((t) => !e.includes(t))))),
	gt: (t, e) => e.some(((e) => {
		var i = parseFloat(e);
		return !isNaN(i) && t.some(((t) => i > parseFloat(t)));
	})),
	lt: (t, e) => e.some(((e) => {
		var i = parseFloat(e);
		return !isNaN(i) && t.some(((t) => i < parseFloat(t)));
	}))
}, gn = (t) => t.toLowerCase();
function mn(t, e) {
	return !t || Object.entries(t).every(((t) => {
		var [i, r] = t, s = null == e ? void 0 : e[i];
		if (C(s) || M(s)) return !1;
		var n = [String(s)], o = _n[r.operator];
		return !!o && o(r.values, n);
	}));
}
var bn = "custom", yn = "i.posthog.com", wn = /^\/static\//;
var xn = class {
	constructor(t) {
		this.ki = {}, this.instance = t;
	}
	get apiHost() {
		var t = this.instance.config.api_host.trim().replace(/\/$/, "");
		return "https://app.posthog.com" === t ? "https://us.i.posthog.com" : t;
	}
	get flagsApiHost() {
		var t = this.instance.config.flags_api_host;
		return t ? t.trim().replace(/\/$/, "") : this.apiHost;
	}
	get uiHost() {
		var t, e = null == (t = this.instance.config.ui_host) ? void 0 : t.replace(/\/$/, "");
		return e || (e = this.apiHost.replace("." + yn, ".posthog.com")), "https://app.posthog.com" === e ? "https://us.posthog.com" : e;
	}
	get region() {
		return this.ki[this.apiHost] || (this.ki[this.apiHost] = /https:\/\/(app|us|us-assets)(\.i)?\.posthog\.com/i.test(this.apiHost) ? "us" : /https:\/\/(eu|eu-assets)(\.i)?\.posthog\.com/i.test(this.apiHost) ? "eu" : bn), this.ki[this.apiHost];
	}
	Ti(t) {
		var e = this.instance.config.__preview_external_dependency_versioned_paths;
		if ("string" == typeof e && wn.test(t)) return e.trim().replace(/\/$/, "") || void 0;
	}
	endpointFor(t, e) {
		if (void 0 === e && (e = ""), e && (e = "/" === e[0] ? e : "/" + e), "ui" === t) return this.uiHost + e;
		if ("flags" === t) return this.flagsApiHost + e;
		if ("assets" === t) {
			var i = this.Ti(e);
			if (i) return "" + i + e;
		}
		if (this.region === bn) return this.apiHost + e;
		var r = yn + e;
		switch (t) {
			case "assets": return "https://" + this.region + "-assets." + r;
			case "api": return "https://" + this.region + "." + r;
		}
	}
};
var En = Ce("[Surveys]"), Sn = "seenSurvey_", $n = [
	Zr.Popover,
	Zr.Widget,
	Zr.API
], Tn = {
	ignoreConditions: !1,
	ignoreDelay: !1,
	displayType: ns.Popover
}, kn = Ce("[PostHog ExternalIntegrations]"), Rn = {
	intercom: "intercom-integration",
	crispChat: "crisp-chat-integration"
};
var Pn = class {
	constructor(t) {
		this._instance = t;
	}
	ur(t, e) {
		var i;
		null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, t, ((t) => {
			if (t) return kn.error("failed to load script", t);
			e();
		}));
	}
	startIfEnabledOrStop() {
		var t = this, e = function(e) {
			var i, s, n;
			!r || null != (i = h.__PosthogExtensions__) && null != (i = i.integrations) && i[e] || t.ur(Rn[e], (() => {
				var i;
				null == (i = h.__PosthogExtensions__) || null == (i = i.integrations) || null == (i = i[e]) || i.start(t._instance);
			})), !r && null != (s = h.__PosthogExtensions__) && null != (s = s.integrations) && s[e] && (null == (n = h.__PosthogExtensions__) || null == (n = n.integrations) || null == (n = n[e]) || n.stop());
		};
		for (var [i, r] of Object.entries(null !== (s = this._instance.config.integrations) && void 0 !== s ? s : {})) {
			var s;
			e(i);
		}
	}
};
var On, In = {}, Cn = 0, Fn = () => {}, An = "Consent opt in/out is not valid with cookieless_mode=\"always\" and will be ignored", Mn = "Surveys module not available", Dn = "sanitize_properties is deprecated. Use before_send instead", Ln = "Invalid value for property_denylist config: ", Un = "posthog", Nn = !Gs && -1 === (null == u ? void 0 : u.indexOf("MSIE")) && -1 === (null == u ? void 0 : u.indexOf("Mozilla")), jn = (e) => {
	var i;
	return f({
		api_host: "https://us.i.posthog.com",
		flags_api_host: null,
		ui_host: null,
		token: "",
		autocapture: !0,
		cross_subdomain_cookie: Ki(null == r ? void 0 : r.location),
		persistence: "localStorage+cookie",
		persistence_name: "",
		cookie_persisted_properties: [],
		loaded: Fn,
		save_campaign_params: !0,
		custom_campaign_params: [],
		custom_blocked_useragents: [],
		save_referrer: !0,
		capture_pageleave: "if_capture_pageview",
		defaults: null != e ? e : "unset",
		__preview_deferred_init_extensions: !1,
		__preview_external_dependency_versioned_paths: !1,
		debug: s && F(null == s ? void 0 : s.search) && -1 !== s.search.indexOf("__posthog_debug=true") || !1,
		cookie_expiration: 365,
		upgrade: !1,
		disable_session_recording: !1,
		disable_persistence: !1,
		disable_web_experiments: !0,
		disable_surveys: !1,
		disable_surveys_automatic_display: !1,
		disable_conversations: !1,
		disable_product_tours: !1,
		disable_external_dependency_loading: !1,
		enable_recording_console_log: void 0,
		secure_cookie: "https:" === (null == t || null == (i = t.location) ? void 0 : i.protocol),
		ip: !1,
		opt_out_capturing_by_default: !1,
		opt_out_persistence_by_default: !1,
		opt_out_useragent_filter: !1,
		opt_out_capturing_persistence_type: "localStorage",
		consent_persistence_name: null,
		opt_out_capturing_cookie_prefix: null,
		opt_in_site_apps: !1,
		property_denylist: [],
		respect_dnt: !1,
		sanitize_properties: null,
		request_headers: {},
		request_batching: !0,
		properties_string_max_length: 65535,
		mask_all_element_attributes: !1,
		mask_all_text: !1,
		mask_personal_data_properties: !1,
		custom_personal_data_properties: [],
		advanced_disable_flags: !1,
		advanced_disable_decide: !1,
		advanced_disable_feature_flags: !1,
		advanced_disable_feature_flags_on_first_load: !1,
		advanced_only_evaluate_survey_feature_flags: !1,
		advanced_feature_flags_dedup_per_session: !1,
		advanced_enable_surveys: !1,
		advanced_disable_toolbar_metrics: !1,
		feature_flag_request_timeout_ms: 3e3,
		surveys_request_timeout_ms: 1e4,
		on_request_error(t) {
			Ie.error("Bad HTTP status: " + t.statusCode + " " + t.text);
		},
		get_device_id: (t) => t,
		capture_performance: void 0,
		name: "posthog",
		bootstrap: {},
		disable_compression: !1,
		session_idle_timeout_seconds: 1800,
		person_profiles: Mi,
		before_send: void 0,
		request_queue_config: { flush_interval_ms: rn },
		error_tracking: {},
		_onCapture: Fn,
		__preview_eager_load_replay: !1
	}, ((t) => ({
		rageclick: !t || "2025-11-30" > t || { content_ignorelist: !0 },
		capture_pageview: !t || "2025-05-24" > t || "history_change",
		session_recording: t && t >= "2025-11-30" ? { strictMinimumDuration: !0 } : {},
		external_scripts_inject_target: t && t >= "2026-01-30" ? "head" : "body",
		internal_or_test_user_hostname: t && t >= "2026-01-30" ? /^(localhost|127\.0\.0\.1)$/ : void 0
	}))(e));
}, zn = [
	["process_person", "person_profiles"],
	["xhr_headers", "request_headers"],
	["cookie_name", "persistence_name"],
	["disable_cookie", "disable_persistence"],
	["store_google", "save_campaign_params"],
	["verbose", "debug"]
], Bn = (t) => {
	var e = {};
	for (var [i, r] of zn) C(t[i]) || (e[r] = t[i]);
	var s = qi({}, e, t);
	return R(t.property_blacklist) && (C(t.property_denylist) ? s.property_denylist = t.property_blacklist : R(t.property_denylist) ? s.property_denylist = [...t.property_blacklist, ...t.property_denylist] : Ie.error(Ln + t.property_denylist)), s;
};
var Hn = class {
	constructor() {
		this.__forceAllowLocalhost = !1;
	}
	get Ai() {
		return this.__forceAllowLocalhost;
	}
	set Ai(t) {
		Ie.error("WebPerformanceObserver is deprecated and has no impact on network capture. Use `_forceAllowLocalhostNetworkCapture` on `posthog.sessionRecording`"), this.__forceAllowLocalhost = t;
	}
};
var qn = class qn {
	Ei(t, e) {
		if (t) {
			var i = this.Ri.indexOf(t);
			-1 !== i && this.Ri.splice(i, 1);
		}
		return this.Ri.push(e), null == e.initialize || e.initialize(), e;
	}
	Ni() {
		return this.config.cookieless_mode === Ci || this.config.cookieless_mode === Ii && this.consent.isRejected();
	}
	get decideEndpointWasHit() {
		var t, e;
		return null !== (t = null == (e = this.featureFlags) ? void 0 : e.hasLoadedFlags) && void 0 !== t && t;
	}
	get flagsEndpointWasHit() {
		var t, e;
		return null !== (t = null == (e = this.featureFlags) ? void 0 : e.hasLoadedFlags) && void 0 !== t && t;
	}
	constructor() {
		var t;
		this.webPerformance = new Hn(), this.Mi = !1, this.version = v.LIB_VERSION, this.Fi = new hn(), this.Ri = [], this._calculate_event_properties = this.calculateEventProperties.bind(this), this.config = jn(), this.SentryIntegration = Sr, this.sentryIntegration = (t) => function(t, e) {
			var i = Er(t, e);
			return {
				name: xr,
				processEvent: (t) => i(t)
			};
		}(this, t), this.__request_queue = [], this.__loaded = !1, this.analyticsDefaultEndpoint = "/e/", this.Oi = !1, this.Pi = null, this.Li = null, this.Di = null, this.scrollManager = new an(this), this.pageViewManager = new $r(this), this.rateLimiter = new hs(this), this.requestRouter = new xn(this), this.consent = new _r(this), this.externalIntegrations = new Pn(this);
		var e = null !== (t = qn.__defaultExtensionClasses) && void 0 !== t ? t : {};
		this.featureFlags = e.featureFlags && new e.featureFlags(this), this.toolbar = e.toolbar && new e.toolbar(this), this.surveys = e.surveys && new e.surveys(this), this.conversations = e.conversations && new e.conversations(this), this.logs = e.logs && new e.logs(this), this.experiments = e.experiments && new e.experiments(this), this.exceptions = e.exceptions && new e.exceptions(this), this.people = {
			set: (t, e, i) => {
				var r = F(t) ? { [t]: e } : t;
				this.setPersonProperties(r), i?.({});
			},
			set_once: (t, e, i) => {
				var r = F(t) ? { [t]: e } : t;
				this.setPersonProperties(void 0, r), i?.({});
			}
		}, this.on("eventCaptured", ((t) => Ie.info("send \"" + (null == t ? void 0 : t.event) + "\"", t)));
	}
	init(t, e, i) {
		if (i && i !== Un) {
			var r, s = null !== (r = In[i]) && void 0 !== r ? r : new qn();
			return s._init(t, e, i), In[i] = s, In[Un][i] = s, s;
		}
		return this._init(t, e, i);
	}
	_init(e, i, r) {
		var s, n;
		if (void 0 === i && (i = {}), C(e) || A(e)) return Ie.critical("PostHog was initialized without a token. This likely indicates a misconfiguration. Please check the first argument passed to posthog.init()"), this;
		if (this.__loaded) return console.warn("[PostHog.js]", "You have already initialized PostHog! Re-initializing is a no-op"), this;
		this.__loaded = !0, this.config = {}, i.debug = this.Bi(i.debug), this.ji = i, this.$i = [], i.person_profiles ? this.Li = i.person_profiles : i.process_person && (this.Li = i.process_person), this.set_config(qi({}, jn(i.defaults), Bn(i), {
			name: r,
			token: e
		})), this.config.on_xhr_error && Ie.error("on_xhr_error is deprecated. Use on_request_error instead"), this.compression = i.disable_compression ? void 0 : ps.GZipJS;
		var o = this.qi();
		this.persistence = new Yr(this.config, o), this.sessionPersistence = "sessionStorage" === this.config.persistence || "memory" === this.config.persistence ? this.persistence : new Yr(f({}, this.config, { persistence: "sessionStorage" }), o);
		var a = f({}, this.persistence.props), l = f({}, this.sessionPersistence.props);
		this.register({ $initialization_time: (/* @__PURE__ */ new Date()).toISOString() }), this.Zi = new sn(((t) => this.Vi(t)), this.config.request_queue_config), this.Hi = new on(this), this.__request_queue = [];
		var u = this.Ni();
		if (u || (this.sessionManager = new vn(this), this.sessionPropsManager = new un(this, this.sessionManager, this.persistence)), this.config.__preview_deferred_init_extensions ? (Ie.info("Deferring extension initialization to improve startup performance"), setTimeout((() => {
			this.zi(u);
		}), 0)) : (Ie.info("Initializing extensions synchronously"), this.zi(u)), v.DEBUG = v.DEBUG || this.config.debug, v.DEBUG && Ie.info("Starting in debug mode", {
			this: this,
			config: i,
			thisC: f({}, this.config),
			p: a,
			s: l
		}), !this.config.identity_distinct_id || null != (s = i.bootstrap) && s.distinctID || (i.bootstrap = f({}, i.bootstrap, {
			distinctID: this.config.identity_distinct_id,
			isIdentifiedID: !0
		})), void 0 !== (null == (n = i.bootstrap) ? void 0 : n.distinctID)) {
			var h = i.bootstrap.distinctID, d = this.get_distinct_id(), c = this.persistence.get_property(mi);
			if (i.bootstrap.isIdentifiedID && null != d && d !== h && c === Fi) this.identify(h);
			else if (i.bootstrap.isIdentifiedID && null != d && d !== h && c === Ai) Ie.warn("Bootstrap distinctID differs from an already-identified user. The existing identity is preserved. Call reset() before reinitializing if you intend to switch users.");
			else {
				var p = this.config.get_device_id(sr()), _ = i.bootstrap.isIdentifiedID ? p : h;
				this.persistence.set_property(mi, i.bootstrap.isIdentifiedID ? Ai : Fi), this.register({
					distinct_id: h,
					$device_id: _
				});
			}
		}
		if (u) this.register_once({
			distinct_id: Ti,
			$device_id: null
		}, "");
		else if (!this.get_distinct_id()) {
			var g = this.config.get_device_id(sr());
			this.register_once({
				distinct_id: g,
				$device_id: g
			}, ""), this.persistence.set_property(mi, Fi);
		}
		return Xi(t, "onpagehide" in self ? "pagehide" : "unload", this._handle_unload.bind(this), { passive: !1 }), i.segment ? function(t, e) {
			var i = t.config.segment;
			if (!i) return e();
			(function(t, e) {
				var i = t.config.segment;
				if (!i) return e();
				var r = (i) => {
					var r = () => i.anonymousId() || sr();
					t.config.get_device_id = r, i.id() && (t.register({
						distinct_id: i.id(),
						$device_id: r()
					}), t.persistence.set_property(mi, Ai)), e();
				}, s = i.user();
				"then" in s && P(s.then) ? s.then(r) : r(s);
			})(t, (() => {
				i.register(((t) => {
					Promise && Promise.resolve || wr.warn("This browser does not have Promise support, and can not use the segment integration");
					var e = (e, i) => {
						if (!i) return e;
						e.event.userId || e.event.anonymousId === t.get_distinct_id() || (wr.info("No userId set, resetting PostHog"), t.reset()), e.event.userId && e.event.userId !== t.get_distinct_id() && (wr.info("UserId set, identifying with PostHog"), t.identify(e.event.userId));
						var r = t.calculateEventProperties(i, e.event.properties);
						return e.event.properties = Object.assign({}, r, e.event.properties), e;
					};
					return {
						name: "PostHog JS",
						type: "enrichment",
						version: "1.0.0",
						isLoaded: () => !0,
						load: () => Promise.resolve(),
						track: (t) => e(t, t.event.event),
						page: (t) => e(t, Ui),
						identify: (t) => e(t, ji),
						screen: (t) => e(t, "$screen")
					};
				})(t)).then((() => {
					e();
				}));
			}));
		}(this, (() => this.Ui())) : this.Ui(), P(this.config._onCapture) && this.config._onCapture !== Fn && (Ie.warn("onCapture is deprecated. Please use `before_send` instead"), this.on("eventCaptured", ((t) => this.config._onCapture(t.event, t)))), this.config.ip && Ie.warn("The `ip` config option has NO EFFECT AT ALL and has been deprecated. Use a custom transformation or \"Discard IP data\" project setting instead. See https://posthog.com/tutorials/web-redact-properties#hiding-customer-ip-address for more information."), this;
	}
	zi(t) {
		var e, i, r, s, n, o, a, l = performance.now(), u = f({}, qn.__defaultExtensionClasses, this.config.__extensionClasses), h = [];
		u.featureFlags && this.Ri.push(this.featureFlags = null !== (e = this.featureFlags) && void 0 !== e ? e : new u.featureFlags(this)), u.exceptions && this.Ri.push(this.exceptions = null !== (i = this.exceptions) && void 0 !== i ? i : new u.exceptions(this)), u.historyAutocapture && this.Ri.push(this.historyAutocapture = new u.historyAutocapture(this)), u.tracingHeaders && this.Ri.push(new u.tracingHeaders(this)), u.siteApps && this.Ri.push(this.siteApps = new u.siteApps(this)), u.sessionRecording && !t && this.Ri.push(this.sessionRecording = new u.sessionRecording(this)), this.config.disable_scroll_properties || h.push((() => {
			this.scrollManager.startMeasuringScrollPosition();
		})), u.autocapture && this.Ri.push(this.autocapture = new u.autocapture(this)), u.surveys && this.Ri.push(this.surveys = null !== (r = this.surveys) && void 0 !== r ? r : new u.surveys(this)), u.logs && this.Ri.push(this.logs = null !== (s = this.logs) && void 0 !== s ? s : new u.logs(this)), u.conversations && this.Ri.push(this.conversations = null !== (n = this.conversations) && void 0 !== n ? n : new u.conversations(this)), u.productTours && this.Ri.push(this.productTours = new u.productTours(this)), u.heatmaps && this.Ri.push(this.heatmaps = new u.heatmaps(this)), u.webVitalsAutocapture && this.Ri.push(this.webVitalsAutocapture = new u.webVitalsAutocapture(this)), u.exceptionObserver && this.Ri.push(this.exceptionObserver = new u.exceptionObserver(this)), u.deadClicksAutocapture && this.Ri.push(this.deadClicksAutocapture = new u.deadClicksAutocapture(this, br)), u.toolbar && this.Ri.push(this.toolbar = null !== (o = this.toolbar) && void 0 !== o ? o : new u.toolbar(this)), u.experiments && this.Ri.push(this.experiments = null !== (a = this.experiments) && void 0 !== a ? a : new u.experiments(this)), this.Ri.forEach(((t) => {
			t.initialize && h.push((() => {
				null == t.initialize || t.initialize();
			}));
		})), h.push((() => {
			if (this.Yi) {
				var t = this.Yi;
				this.Yi = void 0, this.Nr(t);
			}
		})), this.Gi(h, l);
	}
	Gi(t, e) {
		for (; t.length > 0;) {
			if (this.config.__preview_deferred_init_extensions && performance.now() - e >= 30 && t.length > 0) return void setTimeout((() => {
				this.Gi(t, e);
			}), 0);
			var i = t.shift();
			if (i) try {
				i();
			} catch (t) {
				Ie.error("Error initializing extension:", t);
			}
		}
		var r = Math.round(performance.now() - e);
		this.register_for_session({
			[ki]: this.config.__preview_deferred_init_extensions ? "deferred" : "synchronous",
			[Ri]: r
		}), this.config.__preview_deferred_init_extensions && Ie.info("PostHog extensions initialized (" + r + "ms)");
	}
	Nr(t) {
		var e;
		if (!r || !r.body) return Ie.info("document not ready yet, trying again in 500 milliseconds..."), void setTimeout((() => {
			this.Nr(t);
		}), 500);
		this.config.__preview_deferred_init_extensions && (this.Yi = t), this.Wi = t, this.compression = void 0, t.supportedCompression && !this.config.disable_compression && (this.compression = w(t.supportedCompression, ps.GZipJS) ? ps.GZipJS : w(t.supportedCompression, ps.Base64) ? ps.Base64 : void 0), null != (e = t.analytics) && e.endpoint && (this.analyticsDefaultEndpoint = t.analytics.endpoint), this.set_config({ person_profiles: this.Li ? this.Li : Mi }), this.Ri.forEach(((e) => null == e.onRemoteConfig ? void 0 : e.onRemoteConfig(t)));
	}
	Ui() {
		try {
			this.config.loaded(this);
		} catch (t) {
			Ie.critical("`loaded` function failed", t);
		}
		if (this.Xi(), this.config.internal_or_test_user_hostname && null != s && s.hostname) {
			var t = s.hostname, e = this.config.internal_or_test_user_hostname;
			("string" == typeof e ? t === e : e.test(t)) && this.setInternalOrTestUser();
		}
		this.config.capture_pageview && setTimeout((() => {
			(this.consent.isOptedIn() || this.Ni()) && this.Ji();
		}), 1), this.Ki = new vs(this), this.Ki.load();
	}
	Xi() {
		var t;
		this.is_capturing() && this.config.request_batching && (null == (t = this.Zi) || t.enable());
	}
	_dom_loaded() {
		this.is_capturing() && Bi(this.__request_queue, ((t) => this.Vi(t))), this.__request_queue = [], this.Xi();
	}
	_handle_unload() {
		var t, e, i, r;
		null == (t = this.surveys) || t.handlePageUnload(), this.config.request_batching ? (this.Qi() && this.capture(Ni), null == (e = this.logs) || e.flushLogs("sendBeacon"), null == (i = this.Zi) || i.unload(), null == (r = this.Hi) || r.unload()) : this.Qi() && this.capture(Ni, null, { transport: "sendBeacon" });
	}
	_send_request(t) {
		this.__loaded && (Nn ? this.__request_queue.push(t) : this.rateLimiter.isServerRateLimited(t.batchKey) || (t.transport = t.transport || this.config.api_transport, t.url = Ks(t.url, { ip: this.config.ip ? 1 : 0 }), t.headers = f({}, this.config.request_headers, t.headers), t.compression = "best-available" === t.compression ? this.compression : t.compression, t.disableXHRCredentials = this.config.__preview_disable_xhr_credentials, this.config.__preview_disable_beacon && (t.disableTransport = ["sendBeacon"]), t.fetchOptions = t.fetchOptions || this.config.fetch_options, ((t) => {
			var e, i, r, s = f({}, t);
			s.timeout = s.timeout || 6e4, s.url = tn(s.url, s.compression);
			var n = null !== (e = s.transport) && void 0 !== e ? e : "fetch", o = en.filter(((t) => !s.disableTransport || !t.transport || !s.disableTransport.includes(t.transport))), a = null !== (i = null == (r = function(t, e) {
				for (var i = 0; t.length > i; i++) if (t[i].transport === n) return t[i];
			}(o)) ? void 0 : r.method) && void 0 !== i ? i : o[0].method;
			if (!a) throw new Error("No available transport method");
			"sendBeacon" !== n && s.data && s.compression === ps.GZipJS && l && !Js ? Zs(s).then(((t) => {
				a(t);
			})).catch(((e) => {
				if (((t) => !(!t || "object" != typeof t) && "NotReadableError" === ("name" in t ? String(t.name) : ""))(e)) return Js = !0, void a(f({}, s, {
					compression: void 0,
					url: tn(t.url, void 0)
				}));
				a(s);
			})) : a(s);
		})(f({}, t, { callback: (e) => {
			var i, r;
			this.rateLimiter.checkForLimiting(e), 400 > e.statusCode || null == (i = (r = this.config).on_request_error) || i.call(r, e), null == t.callback || t.callback(e);
		} }))));
	}
	Vi(t) {
		this.Hi ? this.Hi.retriableRequest(t) : this._send_request(t);
	}
	_execute_array(t) {
		Cn++;
		try {
			var e, i = [], r = [], s = [];
			Bi(t, ((t) => {
				t && (R(e = t[0]) ? s.push(t) : P(t) ? t.call(this) : R(t) && "alias" === e ? i.push(t) : R(t) && -1 !== e.indexOf("capture") && P(this[e]) ? s.push(t) : r.push(t));
			}));
			var n = function(t, e) {
				Bi(t, (function(t) {
					if (R(t[0])) {
						var i = e;
						Hi(t, (function(t) {
							i = i[t[0]].apply(i, t.slice(1));
						}));
					} else e[t[0]].apply(e, t.slice(1));
				}));
			};
			n(i, this), n(r, this), n(s, this);
		} finally {
			Cn--;
		}
	}
	push(t) {
		if (Cn > 0 && R(t) && F(t[0])) {
			var e = qn.prototype[t[0]];
			P(e) && e.apply(this, t.slice(1));
		} else this._execute_array([t]);
	}
	capture(t, e, i) {
		var r, s, n, o, a;
		if (this.__loaded && this.persistence && this.sessionPersistence && this.Zi) {
			if (this.is_capturing()) if (!C(t) && F(t)) {
				var l = !this.config.opt_out_useragent_filter && this._is_bot();
				if (!l || this.config.__preview_capture_bot_pageviews) {
					var u = null != i && i.skip_client_rate_limiting ? void 0 : this.rateLimiter.clientRateLimitContext();
					if (null == u || !u.isRateLimited) {
						null != e && e.$current_url && !F(null == e ? void 0 : e.$current_url) && (Ie.error("Invalid `$current_url` property provided to `posthog.capture`. Input must be a string. Ignoring provided value."), null == e || delete e.$current_url), "$exception" !== t || null != i && i.en || Ie.warn("Using `posthog.capture('$exception')` is unreliable because it does not attach required metadata. Use `posthog.captureException(error)` instead, which attaches required metadata automatically."), this.sessionPersistence.update_search_keyword(), this.config.save_campaign_params && this.sessionPersistence.update_campaign_params(), this.config.save_referrer && this.sessionPersistence.update_referrer_info(), (this.config.save_campaign_params || this.config.save_referrer) && this.persistence.set_initial_person_info();
						var h = /* @__PURE__ */ new Date(), d = (null == i ? void 0 : i.timestamp) || h, v = sr(), c = {
							uuid: v,
							event: t,
							properties: this.calculateEventProperties(t, e || {}, d, v)
						};
						t === Ui && this.config.__preview_capture_bot_pageviews && l && (c.event = "$bot_pageview", c.properties.$browser_type = "bot"), u && (c.properties.$lib_rate_limit_remaining_tokens = u.remainingTokens), null != i && i.$set && (c.$set = null == i ? void 0 : i.$set);
						var p, _, g, m = this.tn(null == i ? void 0 : i.$set_once, t !== zi, t === ji);
						if (m && (c.$set_once = m), null != i && i._noTruncate || (s = this.config.properties_string_max_length, n = c, o = (t) => F(t) ? t.slice(0, s) : t, a = /* @__PURE__ */ new Set(), c = function t(e, i) {
							return e !== Object(e) ? o ? o(e) : e : a.has(e) ? void 0 : (a.add(e), R(e) ? (r = [], Bi(e, ((e) => {
								r.push(t(e));
							}))) : (r = {}, Hi(e, ((e, i) => {
								a.has(e) || (r[i] = t(e, i));
							}))), r);
							var r;
						}(n)), c.timestamp = d, C(null == i ? void 0 : i.timestamp) || (c.properties.$event_time_override_provided = !0, c.properties.$event_time_override_system_time = h), t === rs.DISMISSED || t === rs.SENT) {
							var b = null == e ? void 0 : e[ss.SURVEY_ID], y = null == e ? void 0 : e[ss.SURVEY_ITERATION];
							((t) => {
								try {
									var e = ((t) => ((t, e) => {
										var i = "" + Sn + e.id;
										return e.current_iteration && e.current_iteration > 0 && (i = "" + Sn + e.id + "_" + e.current_iteration), i;
									})(0, t))(t);
									if (localStorage.getItem(e)) return;
									localStorage.setItem(e, "true");
								} catch (t) {
									En.error("Failed to persist survey seen state", t);
								}
							})({
								id: b,
								current_iteration: y
							}), c.$set = f({}, c.$set, { [(p = {
								id: b,
								current_iteration: y
							}, _ = t === rs.SENT ? "responded" : "dismissed", g = "$survey_" + _ + "/" + p.id, p.current_iteration && p.current_iteration > 0 && (g = "$survey_" + _ + "/" + p.id + "/" + p.current_iteration), g)]: !0 });
						} else t === rs.SHOWN && (c.$set = f({}, c.$set, { [ss.SURVEY_LAST_SEEN_DATE]: (/* @__PURE__ */ new Date()).toISOString() }));
						if (t === as.SHOWN) {
							var w = null == e ? void 0 : e[ls.TOUR_TYPE];
							w && (c.$set = f({}, c.$set, { [ls.TOUR_LAST_SEEN_DATE + "/" + w]: (/* @__PURE__ */ new Date()).toISOString() }));
						}
						var x = f({}, c.properties.$set, c.$set);
						if (I(x) || this.setPersonPropertiesForFlags(x), !D(this.config.before_send)) {
							var E = this.rn(c);
							if (!E) return;
							c = E;
						}
						this.Fi.emit("eventCaptured", c);
						var S = {
							method: "POST",
							url: null !== (r = null == i ? void 0 : i._url) && void 0 !== r ? r : this.requestRouter.endpointFor("api", this.analyticsDefaultEndpoint),
							data: c,
							compression: "best-available",
							batchKey: null == i ? void 0 : i._batchKey
						};
						return !this.config.request_batching || i && (null == i || !i._batchKey) || null != i && i.send_instantly ? this.Vi(S) : this.Zi.enqueue(S), c;
					}
					Ie.critical("This capture call is ignored due to client rate limiting.");
				}
			} else Ie.error("No event name provided to posthog.capture");
		} else Ie.uninitializedWarning("posthog.capture");
	}
	_addCaptureHook(t) {
		return this.on("eventCaptured", ((e) => t(e.event, e)));
	}
	calculateEventProperties(e, i, n, o, a) {
		if (n = n || /* @__PURE__ */ new Date(), !this.persistence || !this.sessionPersistence) return i;
		var l = a ? void 0 : this.persistence.remove_event_timer(e), h = f({}, i);
		if (h.token = this.config.token, h.$config_defaults = this.config.defaults, this.Ni() && (h.$cookieless_mode = !0), "$snapshot" === e) {
			var d = f({}, this.persistence.properties(), this.sessionPersistence.properties());
			return h.distinct_id = d.distinct_id, (!F(h.distinct_id) && !L(h.distinct_id) || A(h.distinct_id)) && Ie.error("Invalid distinct_id for replay event. This indicates a bug in your implementation"), h;
		}
		var c, p = function(e, i) {
			var r, n, o, a;
			if (!u) return {};
			var l, h, d, c, p, f, _, g, m = e ? [...Fr, ...i || []] : [], [b, y] = function(t) {
				for (var e = 0; Wt.length > e; e++) {
					var [i, r] = Wt[e], s = i.exec(t), n = s && (P(r) ? r(s, t) : r);
					if (n) return n;
				}
				return ["", ""];
			}(u);
			return qi(Yi({
				$os: b,
				$os_version: y,
				$browser: Ht(u, navigator.vendor),
				$device: Gt(u),
				$device_type: (h = u, d = {
					userAgentDataPlatform: null == (r = navigator) || null == (r = r.userAgentData) ? void 0 : r.platform,
					maxTouchPoints: null == (n = navigator) ? void 0 : n.maxTouchPoints,
					screenWidth: null == t || null == (o = t.screen) ? void 0 : o.width,
					screenHeight: null == t || null == (a = t.screen) ? void 0 : a.height,
					devicePixelRatio: null == t ? void 0 : t.devicePixelRatio
				}, g = Gt(h), g === st || g === rt || "Kobo" === g || "Kindle Fire" === g || g === At ? it : g === Et || g === $t || g === St || g === It ? "Console" : g === ot ? "Wearable" : g ? Z : "Android" === (null == d ? void 0 : d.userAgentDataPlatform) && (null !== (c = null == d ? void 0 : d.maxTouchPoints) && void 0 !== c ? c : 0) > 0 ? 600 > Math.min(null !== (p = null == d ? void 0 : d.screenWidth) && void 0 !== p ? p : 0, null !== (f = null == d ? void 0 : d.screenHeight) && void 0 !== f ? f : 0) / (null !== (_ = null == d ? void 0 : d.devicePixelRatio) && void 0 !== _ ? _ : 1) ? Z : it : "Desktop"),
				$timezone: Vr(),
				$timezone_offset: Wr()
			}), {
				$current_url: Or(null == s ? void 0 : s.href, m, Mr),
				$host: null == s ? void 0 : s.host,
				$pathname: null == s ? void 0 : s.pathname,
				$raw_user_agent: u.length > 1e3 ? u.substring(0, 997) + "..." : u,
				$browser_version: Vt(u, navigator.vendor),
				$browser_language: jr(),
				$browser_language_prefix: (l = jr(), "string" == typeof l ? l.split("-")[0] : void 0),
				$screen_height: null == t ? void 0 : t.screen.height,
				$screen_width: null == t ? void 0 : t.screen.width,
				$viewport_height: null == t ? void 0 : t.innerHeight,
				$viewport_width: null == t ? void 0 : t.innerWidth,
				$lib: v.LIB_NAME,
				$lib_version: v.LIB_VERSION,
				$insert_id: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10),
				$time: Date.now() / 1e3
			});
		}(this.config.mask_personal_data_properties, this.config.custom_personal_data_properties);
		if (this.sessionManager) {
			var { sessionId: _, windowId: g } = this.sessionManager.checkAndGetSessionAndWindowId(a, n.getTime());
			h.$session_id = _, h.$window_id = g;
		}
		this.sessionPropsManager && qi(h, this.sessionPropsManager.getSessionProps());
		try {
			var m;
			this.sessionRecording && qi(h, this.sessionRecording.sdkDebugProperties), h.$sdk_debug_retry_queue_size = null == (m = this.Hi) ? void 0 : m.length;
		} catch (t) {
			h.$sdk_debug_error_capturing_properties = String(t);
		}
		if (this.requestRouter.region === bn && (h.$lib_custom_api_host = this.config.api_host), c = e !== Ui || a ? e !== Ni || a ? this.pageViewManager.doEvent() : this.pageViewManager.doPageLeave(n) : this.pageViewManager.doPageView(n, o), h = qi(h, c), e === Ui && r && (h.title = r.title), !C(l)) {
			var b = n.getTime() - l;
			h.$duration = parseFloat((b / 1e3).toFixed(3));
		}
		u && this.config.opt_out_useragent_filter && (h.$browser_type = this._is_bot() ? "bot" : "browser"), (h = qi({}, p, this.persistence.properties(), this.sessionPersistence.properties(), h)).$is_identified = this._isIdentified(), R(this.config.property_denylist) ? Hi(this.config.property_denylist, (function(t) {
			delete h[t];
		})) : Ie.error(Ln + this.config.property_denylist + " or property_blacklist config: " + this.config.property_blacklist);
		var y = this.config.sanitize_properties;
		y && (Ie.error(Dn), h = y(h, e));
		var w = this.nn();
		return h.$process_person_profile = w, w && !a && this.sn("_calculate_event_properties"), h;
	}
	tn(t, e, i) {
		var r;
		if (void 0 === e && (e = !0), void 0 === i && (i = !1), !this.persistence || !this.nn()) return t;
		if (this.Mi && !i) return t;
		var o = qi({}, this.persistence.get_initial_props(), (null == (r = this.sessionPropsManager) ? void 0 : r.getSetOnceProps()) || {}, t || {}), a = this.config.sanitize_properties;
		return a && (Ie.error(Dn), o = a(o, "$set_once")), e && (this.Mi = !0), I(o) ? void 0 : o;
	}
	register(t, e) {
		var i;
		null == (i = this.persistence) || i.register(t, e);
	}
	register_once(t, e, i) {
		var r;
		null == (r = this.persistence) || r.register_once(t, e, i);
	}
	register_for_session(t) {
		var e;
		null == (e = this.sessionPersistence) || e.register(t);
	}
	unregister(t) {
		var e;
		null == (e = this.persistence) || e.unregister(t);
	}
	unregister_for_session(t) {
		var e;
		null == (e = this.sessionPersistence) || e.unregister(t);
	}
	an(t, e) {
		this.register({ [t]: e });
	}
	getFeatureFlag(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.getFeatureFlag(t, e);
	}
	getFeatureFlagPayload(t) {
		var e;
		return null == (e = this.featureFlags) ? void 0 : e.getFeatureFlagPayload(t);
	}
	getFeatureFlagResult(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.getFeatureFlagResult(t, e);
	}
	isFeatureEnabled(t, e) {
		var i;
		return null == (i = this.featureFlags) ? void 0 : i.isFeatureEnabled(t, e);
	}
	reloadFeatureFlags() {
		var t;
		null == (t = this.featureFlags) || t.reloadFeatureFlags();
	}
	updateFlags(t, e, i) {
		var r;
		null == (r = this.featureFlags) || r.updateFlags(t, e, i);
	}
	updateEarlyAccessFeatureEnrollment(t, e, i) {
		var r;
		null == (r = this.featureFlags) || r.updateEarlyAccessFeatureEnrollment(t, e, i);
	}
	getEarlyAccessFeatures(t, e, i) {
		var r;
		return void 0 === e && (e = !1), null == (r = this.featureFlags) ? void 0 : r.getEarlyAccessFeatures(t, e, i);
	}
	on(t, e) {
		return this.Fi.on(t, e);
	}
	onFeatureFlags(t) {
		return this.featureFlags ? this.featureFlags.onFeatureFlags(t) : (t([], {}, { errorsLoading: !0 }), () => {});
	}
	onSurveysLoaded(t) {
		return this.surveys ? this.surveys.onSurveysLoaded(t) : (t([], {
			isLoaded: !1,
			error: Mn
		}), () => {});
	}
	onSessionId(t) {
		var e, i;
		return null !== (e = null == (i = this.sessionManager) ? void 0 : i.onSessionId(t)) && void 0 !== e ? e : () => {};
	}
	getSurveys(t, e) {
		void 0 === e && (e = !1), this.surveys ? this.surveys.getSurveys(t, e) : t([], {
			isLoaded: !1,
			error: Mn
		});
	}
	getActiveMatchingSurveys(t, e) {
		void 0 === e && (e = !1), this.surveys ? this.surveys.getActiveMatchingSurveys(t, e) : t([], {
			isLoaded: !1,
			error: Mn
		});
	}
	renderSurvey(t, e) {
		var i;
		null == (i = this.surveys) || i.renderSurvey(t, e);
	}
	displaySurvey(t, e) {
		var i;
		void 0 === e && (e = Tn), null == (i = this.surveys) || i.displaySurvey(t, e);
	}
	cancelPendingSurvey(t) {
		var e;
		null == (e = this.surveys) || e.cancelPendingSurvey(t);
	}
	canRenderSurvey(t) {
		var e, i;
		return null !== (e = null == (i = this.surveys) ? void 0 : i.canRenderSurvey(t)) && void 0 !== e ? e : {
			visible: !1,
			disabledReason: Mn
		};
	}
	canRenderSurveyAsync(t, e) {
		var i, r;
		return void 0 === e && (e = !1), null !== (i = null == (r = this.surveys) ? void 0 : r.canRenderSurveyAsync(t, e)) && void 0 !== i ? i : Promise.resolve({
			visible: !1,
			disabledReason: Mn
		});
	}
	ln(t) {
		return !t || A(t) ? (Ie.critical("Unique user id has not been set in posthog.identify"), !1) : t === Ti ? (Ie.critical("The string \"" + t + "\" was set in posthog.identify which indicates an error. This ID is only used as a sentinel value."), !1) : !["distinct_id", "distinctid"].includes(t.toLowerCase()) && !["undefined", "null"].includes(t.toLowerCase()) || (Ie.critical("The string \"" + t + "\" was set in posthog.identify which indicates an error. This ID should be unique to the user and not a hardcoded string."), !1);
	}
	identify(t, e, i) {
		if (!this.__loaded || !this.persistence) return Ie.uninitializedWarning("posthog.identify");
		if (L(t) && (t = t.toString(), Ie.warn("The first argument to posthog.identify was a number, but it should be a string. It has been converted to a string.")), this.ln(t) && this.sn("posthog.identify")) {
			var r = this.get_distinct_id();
			this.register({ $user_id: t }), this.get_property(De) || this.register_once({
				$had_persisted_distinct_id: !0,
				$device_id: r
			}, ""), t !== r && t !== this.get_property(Le) && (this.unregister(Le), this.register({ distinct_id: t }));
			var s, n = (this.persistence.get_property(mi) || Fi) === Fi;
			t !== r && n ? (this.persistence.set_property(mi, Ai), this.setPersonPropertiesForFlags({
				$set: e || {},
				$set_once: i || {}
			}, !1), this.capture(ji, {
				distinct_id: t,
				$anon_distinct_id: r
			}, {
				$set: e || {},
				$set_once: i || {}
			}), this.Di = fn(t, e, i), null == (s = this.featureFlags) || s.setAnonymousDistinctId(r)) : (e || i) && this.setPersonProperties(e, i), t !== r && (this.reloadFeatureFlags(), this.unregister(pi));
		}
	}
	setPersonProperties(t, e) {
		if ((t || e) && this.sn("posthog.setPersonProperties")) {
			var i = fn(this.get_distinct_id(), t, e);
			this.Di !== i ? (this.setPersonPropertiesForFlags({
				$set: t || {},
				$set_once: e || {}
			}, !0), this.capture("$set", {
				$set: t || {},
				$set_once: e || {}
			}), this.Di = i) : Ie.info("A duplicate setPersonProperties call was made with the same properties. It has been ignored.");
		}
	}
	group(t, e, i) {
		if (t && e) {
			var r = this.getGroups(), s = r[t] !== e;
			if (s && this.resetGroupPropertiesForFlags(t), this.register({ $groups: f({}, r, { [t]: e }) }), s || i) {
				var n = {
					$group_type: t,
					$group_key: e
				};
				i && (n.$group_set = i), this.capture(zi, n);
			}
			i && this.setGroupPropertiesForFlags({ [t]: i }), s && !i && this.reloadFeatureFlags();
		} else Ie.error("posthog.group requires a group type and group key");
	}
	resetGroups() {
		this.register({ $groups: {} }), this.resetGroupPropertiesForFlags(), this.reloadFeatureFlags();
	}
	setPersonPropertiesForFlags(t, e) {
		var i;
		void 0 === e && (e = !0), null == (i = this.featureFlags) || i.setPersonPropertiesForFlags(t, e);
	}
	resetPersonPropertiesForFlags() {
		var t;
		null == (t = this.featureFlags) || t.resetPersonPropertiesForFlags();
	}
	setGroupPropertiesForFlags(t, e) {
		var i;
		void 0 === e && (e = !0), this.sn("posthog.setGroupPropertiesForFlags") && (null == (i = this.featureFlags) || i.setGroupPropertiesForFlags(t, e));
	}
	resetGroupPropertiesForFlags(t) {
		var e;
		null == (e = this.featureFlags) || e.resetGroupPropertiesForFlags(t);
	}
	reset(t) {
		var e, i, r, s, n, o, a, l;
		if (Ie.info("reset"), !this.__loaded) return Ie.uninitializedWarning("posthog.reset");
		var u = this.get_property(De);
		if (this.consent.reset(), null == (e = this.persistence) || e.clear(), null == (i = this.sessionPersistence) || i.clear(), null == (r = this.surveys) || r.reset(), null == (s = this.Ki) || s.stop(), null == (n = this.featureFlags) || n.reset(), null == (o = this.conversations) || o.reset(), null == (a = this.persistence) || a.set_property(mi, Fi), null == (l = this.sessionManager) || l.resetSessionId(), this.Di = null, this.config.cookieless_mode === Ci) this.register_once({
			distinct_id: Ti,
			$device_id: null
		}, "");
		else {
			var h = this.config.get_device_id(sr());
			this.register_once({
				distinct_id: h,
				$device_id: t ? h : u
			}, "");
		}
		this.register({ $last_posthog_reset: (/* @__PURE__ */ new Date()).toISOString() }, 1), delete this.config.identity_distinct_id, delete this.config.identity_hash, this.reloadFeatureFlags();
	}
	setIdentity(t, e) {
		var i;
		this.config.identity_distinct_id = t, this.config.identity_hash = e, this.alias(t), null == (i = this.conversations) || i.un();
	}
	clearIdentity() {
		var t;
		delete this.config.identity_distinct_id, delete this.config.identity_hash, null == (t = this.conversations) || t.hn();
	}
	get_distinct_id() {
		return this.get_property("distinct_id");
	}
	getGroups() {
		return this.get_property("$groups") || {};
	}
	get_session_id() {
		var t, e;
		return null !== (t = null == (e = this.sessionManager) ? void 0 : e.checkAndGetSessionAndWindowId(!0).sessionId) && void 0 !== t ? t : "";
	}
	get_session_replay_url(t) {
		if (!this.sessionManager) return "";
		var { sessionId: e, sessionStartTimestamp: i } = this.sessionManager.checkAndGetSessionAndWindowId(!0), r = this.requestRouter.endpointFor("ui", "/project/" + this.config.token + "/replay/" + e);
		if (null != t && t.withTimestamp && i) {
			var s, n = null !== (s = t.timestampLookBack) && void 0 !== s ? s : 10;
			if (!i) return r;
			r += "?t=" + Math.max(Math.floor(((/* @__PURE__ */ new Date()).getTime() - i) / 1e3) - n, 0);
		}
		return r;
	}
	alias(t, e) {
		return t === this.get_property(Me) ? (Ie.critical("Attempting to create alias for existing People user - aborting."), -2) : this.sn("posthog.alias") ? (C(e) && (e = this.get_distinct_id()), t !== e ? (this.an(Le, t), this.capture("$create_alias", {
			alias: t,
			distinct_id: e
		})) : (Ie.warn("alias matches current distinct_id - skipping api call."), this.identify(t), -1)) : void 0;
	}
	set_config(t) {
		var e = f({}, this.config);
		if (O(t)) {
			var i, r, s, n, o, a, l, u, h, d;
			qi(this.config, Bn(t));
			var c = this.qi();
			null == (i = this.persistence) || i.update_config(this.config, e, c), this.sessionPersistence = "sessionStorage" === this.config.persistence || "memory" === this.config.persistence ? this.persistence : new Yr(f({}, this.config, { persistence: "sessionStorage" }), c);
			var p = this.Bi(this.config.debug);
			N(p) && (this.config.debug = p), N(this.config.debug) && (this.config.debug ? (v.DEBUG = !0, hr.R() && hr.M("ph_debug", !0), Ie.info("set_config", {
				config: t,
				oldConfig: e,
				newConfig: f({}, this.config)
			})) : (v.DEBUG = !1, hr.R() && hr.F("ph_debug"))), null == (r = this.exceptionObserver) || r.onConfigChange(), null == (s = this.exceptions) || s.onConfigChange(), null == (n = this.sessionRecording) || n.startIfEnabledOrStop(), null == (o = this.autocapture) || o.startIfEnabled(), null == (a = this.heatmaps) || a.startIfEnabled(), null == (l = this.exceptionObserver) || l.startIfEnabledOrStop(), null == (u = this.deadClicksAutocapture) || u.startIfEnabledOrStop(), null == (h = this.surveys) || h.loadIfEnabled(), this.cn(), null == (d = this.externalIntegrations) || d.startIfEnabledOrStop();
		}
	}
	_overrideSDKInfo(t, e) {
		v.LIB_NAME = t, v.LIB_VERSION = e;
	}
	startSessionRecording(t) {
		var e, i, r, s, n, o = !0 === t, a = {
			sampling: o || !(null == t || !t.sampling),
			linked_flag: o || !(null == t || !t.linked_flag),
			url_trigger: o || !(null == t || !t.url_trigger),
			event_trigger: o || !(null == t || !t.event_trigger)
		};
		Object.values(a).some(Boolean) && (null == (e = this.sessionManager) || e.checkAndGetSessionAndWindowId(), a.sampling && (null == (i = this.sessionRecording) || i.overrideSampling()), a.linked_flag && (null == (r = this.sessionRecording) || r.overrideLinkedFlag()), a.url_trigger && (null == (s = this.sessionRecording) || s.overrideTrigger("url")), a.event_trigger && (null == (n = this.sessionRecording) || n.overrideTrigger("event")));
		this.set_config({ disable_session_recording: !1 });
	}
	stopSessionRecording() {
		this.set_config({ disable_session_recording: !0 });
	}
	sessionRecordingStarted() {
		var t;
		return !(null == (t = this.sessionRecording) || !t.started);
	}
	captureException(t, e) {
		if (this.exceptions) {
			var i = /* @__PURE__ */ new Error("PostHog syntheticException"), r = this.exceptions.buildProperties(t, {
				handled: !0,
				syntheticException: i
			});
			return this.exceptions.sendExceptionEvent(f({}, r, e));
		}
	}
	addExceptionStep(t, e) {
		var i;
		null == (i = this.exceptions) || i.addExceptionStep(t, e);
	}
	captureLog(t) {
		var e;
		null == (e = this.logs) || e.captureLog(t);
	}
	get logger() {
		var t, e;
		return null !== (t = null == (e = this.logs) ? void 0 : e.logger) && void 0 !== t ? t : qn.dn;
	}
	startExceptionAutocapture(t) {
		this.set_config({ capture_exceptions: null == t || t });
	}
	stopExceptionAutocapture() {
		this.set_config({ capture_exceptions: !1 });
	}
	loadToolbar(t) {
		var e, i;
		return null !== (e = null == (i = this.toolbar) ? void 0 : i.loadToolbar(t)) && void 0 !== e && e;
	}
	get_property(t) {
		var e;
		return null == (e = this.persistence) ? void 0 : e.props[t];
	}
	getSessionProperty(t) {
		var e;
		return null == (e = this.sessionPersistence) ? void 0 : e.props[t];
	}
	toString() {
		var t, e = null !== (t = this.config.name) && void 0 !== t ? t : Un;
		return e !== Un && (e = Un + "." + e), e;
	}
	_isIdentified() {
		var t, e;
		return (null == (t = this.persistence) ? void 0 : t.get_property(mi)) === Ai || (null == (e = this.sessionPersistence) ? void 0 : e.get_property(mi)) === Ai;
	}
	nn() {
		var t, e;
		return !("never" === this.config.person_profiles || this.config.person_profiles === Mi && !this._isIdentified() && I(this.getGroups()) && (null == (t = this.persistence) || null == (t = t.props) || !t[Le]) && (null == (e = this.persistence) || null == (e = e.props) || !e[Si]));
	}
	Qi() {
		return !0 === this.config.capture_pageleave || "if_capture_pageview" === this.config.capture_pageleave && (!0 === this.config.capture_pageview || "history_change" === this.config.capture_pageview);
	}
	createPersonProfile() {
		this.nn() || this.sn("posthog.createPersonProfile") && this.setPersonProperties({}, {});
	}
	setInternalOrTestUser() {
		this.sn("posthog.setInternalOrTestUser") && this.setPersonProperties({ $internal_or_test_user: !0 });
	}
	sn(t) {
		return "never" === this.config.person_profiles ? (Ie.error(t + " was called, but process_person is set to \"never\". This call will be ignored."), !1) : (this.an(Si, !0), !0);
	}
	qi() {
		if ("always" === this.config.cookieless_mode) return !0;
		var t = this.consent.isOptedOut();
		return this.config.disable_persistence || t && !(!this.config.opt_out_persistence_by_default && this.config.cookieless_mode !== Ii);
	}
	cn() {
		var t, e, i, r, s = this.qi();
		return (null == (t = this.persistence) ? void 0 : t._r) !== s && (null == (i = this.persistence) || i.set_disabled(s)), (null == (e = this.sessionPersistence) ? void 0 : e._r) !== s && (null == (r = this.sessionPersistence) || r.set_disabled(s)), s;
	}
	opt_in_capturing(t) {
		var e;
		if (this.config.cookieless_mode !== Ci) {
			if (this.Ni()) {
				var i, r, s, n, o;
				this.reset(!0), null == (i = this.sessionManager) || i.destroy(), null == (r = this.pageViewManager) || r.destroy(), this.sessionManager = new vn(this), this.pageViewManager = new $r(this), this.persistence && (this.sessionPropsManager = new un(this, this.sessionManager, this.persistence));
				var a, l = null !== (s = null == (n = this.config.__extensionClasses) ? void 0 : n.sessionRecording) && void 0 !== s ? s : null == (o = qn.__defaultExtensionClasses) ? void 0 : o.sessionRecording;
				l && (this.sessionRecording = this.Ei(this.sessionRecording, new l(this)), this.Wi && (null == (a = this.sessionRecording) || null == a.onRemoteConfig || a.onRemoteConfig(this.Wi)));
			}
			var u, h;
			this.consent.optInOut(!0), this.cn(), this.Xi(), null == (e = this.sessionRecording) || e.startIfEnabledOrStop(), this.config.cookieless_mode == Ii && (null == (u = this.surveys) || u.loadIfEnabled()), (C(null == t ? void 0 : t.captureEventName) || null != t && t.captureEventName) && this.capture(null !== (h = null == t ? void 0 : t.captureEventName) && void 0 !== h ? h : "$opt_in", null == t ? void 0 : t.captureProperties, { send_instantly: !0 }), this.config.capture_pageview && this.Ji();
		} else Ie.warn(An);
	}
	opt_out_capturing() {
		var t, e, i;
		this.config.cookieless_mode !== Ci ? (this.config.cookieless_mode === Ii && this.consent.isOptedIn() && this.reset(!0), this.consent.optInOut(!1), this.cn(), this.config.cookieless_mode === Ii && (this.register({
			distinct_id: Ti,
			$device_id: null
		}), null == (t = this.sessionManager) || t.destroy(), null == (e = this.pageViewManager) || e.destroy(), this.sessionManager = void 0, this.sessionPropsManager = void 0, null == (i = this.sessionRecording) || i.stopRecording(), this.sessionRecording = void 0, this.Ji())) : Ie.warn(An);
	}
	has_opted_in_capturing() {
		return this.consent.isOptedIn();
	}
	has_opted_out_capturing() {
		return this.consent.isOptedOut();
	}
	get_explicit_consent_status() {
		var t = this.consent.consent;
		return 1 === t ? "granted" : 0 === t ? "denied" : "pending";
	}
	is_capturing() {
		return this.config.cookieless_mode === Ci || (this.config.cookieless_mode === Ii ? this.consent.isRejected() || this.consent.isOptedIn() : !this.has_opted_out_capturing());
	}
	clear_opt_in_out_capturing() {
		this.consent.reset(), this.cn();
	}
	_is_bot() {
		return i ? cn(i, this.config.custom_blocked_useragents) : void 0;
	}
	Ji() {
		r && ("visible" === r.visibilityState ? this.Oi || (this.Oi = !0, this.capture(Ui, { title: r.title }, { send_instantly: !0 }), this.Pi && (r.removeEventListener(Di, this.Pi), this.Pi = null)) : this.Pi || (this.Pi = this.Ji.bind(this), Xi(r, Di, this.Pi)));
	}
	debug(e) {
		!1 === e ? (t?.console.log("You've disabled debug mode."), this.set_config({ debug: !1 })) : (t?.console.log("You're now in debug mode. All calls to PostHog will be logged in your console.\nYou can disable this with `posthog.debug(false)`."), this.set_config({ debug: !0 }));
	}
	Fr() {
		var t, e, i, r, s, n, o = this.ji || {};
		return "advanced_disable_flags" in o ? !!o.advanced_disable_flags : !1 !== this.config.advanced_disable_flags ? !!this.config.advanced_disable_flags : !0 === this.config.advanced_disable_decide ? (Ie.warn("Config field 'advanced_disable_decide' is deprecated. Please use 'advanced_disable_flags' instead. The old field will be removed in a future major version."), !0) : (i = "advanced_disable_decide", r = Ie, s = (e = "advanced_disable_flags") in (t = o) && !D(t[e]), n = i in t && !D(t[i]), s ? t[e] : !!n && (r && r.warn("Config field '" + i + "' is deprecated. Please use '" + e + "' instead. The old field will be removed in a future major version."), t[i]));
	}
	rn(t) {
		if (D(this.config.before_send)) return t;
		var e = R(this.config.before_send) ? this.config.before_send : [this.config.before_send], i = t;
		for (var r of e) {
			if (i = r(i), D(i)) {
				var s = "Event '" + t.event + "' was rejected in beforeSend function";
				return z(t.event) ? Ie.warn(s + ". This can cause unexpected behavior.") : Ie.info(s), null;
			}
			i.properties && !I(i.properties) || Ie.warn("Event '" + t.event + "' has no properties after beforeSend function, this is likely an error.");
		}
		return i;
	}
	getPageViewId() {
		var t;
		return null == (t = this.pageViewManager.dr) ? void 0 : t.pageViewId;
	}
	captureTraceFeedback(t, e) {
		this.capture("$ai_feedback", {
			$ai_trace_id: String(t),
			$ai_feedback_text: e
		});
	}
	captureTraceMetric(t, e, i) {
		this.capture("$ai_metric", {
			$ai_trace_id: String(t),
			$ai_metric_name: e,
			$ai_metric_value: String(i)
		});
	}
	Bi(t) {
		var e = N(t) && !t, i = hr.R() && "true" === hr.O("ph_debug");
		return !e && (!!i || t);
	}
};
qn.__defaultExtensionClasses = {}, qn.dn = {
	trace: On = () => {},
	debug: On,
	info: On,
	warn: On,
	error: On,
	fatal: On
}, function(t, e) {
	for (var i = 0; e.length > i; i++) t.prototype[e[i]] = Gi(t.prototype[e[i]]);
}(qn, ["identify"]);
var Vn = 1, Wn = 3, Gn = 11;
function Yn(t) {
	return t instanceof Element && (t.id === $i || !(null == t.closest || !t.closest(".toolbar-global-fade-container")));
}
function Jn(t) {
	return !!t && t.nodeType === Vn;
}
function Kn(t, e) {
	return !!t && !!t.tagName && t.tagName.toLowerCase() === e.toLowerCase();
}
function Xn(t) {
	return !!t && t.nodeType === Wn;
}
function Qn(t) {
	return !!t && t.nodeType === Gn && Jn(t.host);
}
function Zn(t) {
	return t ? x(t).split(/\s+/) : [];
}
function to(e) {
	var i = null == t ? void 0 : t.location.href;
	return !!(i && e && e.some(((t) => i.match(t))));
}
function eo(t) {
	var e = "";
	switch (typeof t.className) {
		case "string":
			e = t.className;
			break;
		case "object":
			e = (t.className && "baseVal" in t.className ? t.className.baseVal : null) || t.getAttribute("class") || "";
			break;
		default: e = "";
	}
	return Zn(e);
}
function io(t) {
	return D(t) ? null : x(t).split(/(\s+)/).filter(((t) => wo(t))).join("").replace(/[\r\n]/g, " ").replace(/[ ]+/g, " ").substring(0, 255);
}
function ro(t) {
	var e = "";
	return co(t) && !po(t) && t.childNodes && t.childNodes.length && Hi(t.childNodes, (function(t) {
		var i;
		Xn(t) && t.textContent && (e += null !== (i = io(t.textContent)) && void 0 !== i ? i : "");
	})), x(e);
}
function so(t) {
	return C(t.target) ? t.srcElement || null : null != (e = t.target) && e.shadowRoot ? t.composedPath()[0] || null : t.target || null;
	var e;
}
var no = [
	"a",
	"button",
	"form",
	"input",
	"select",
	"textarea",
	"label"
];
function oo(t, e) {
	if (C(e)) return !0;
	var i, r = function(t) {
		if (e.some(((e) => t.matches(e)))) return { v: !0 };
	};
	for (var s of t) if (i = r(s)) return i.v;
	return !1;
}
function ao(t) {
	var e = t.parentNode;
	return !(!e || !Jn(e)) && e;
}
var lo = [
	"next",
	"previous",
	"prev",
	">",
	"<"
], uo = [".ph-no-rageclick", ".ph-no-capture"];
var ho = (t) => !t || Kn(t, "html") || !Jn(t), vo = (e, i) => {
	if (!t || ho(e)) return {
		parentIsUsefulElement: !1,
		targetElementList: []
	};
	for (var r = !1, s = [e], n = e; n.parentNode && !Kn(n, "body");) if (Qn(n.parentNode)) s.push(n.parentNode.host), n = n.parentNode.host;
	else {
		var o = ao(n);
		if (!o) break;
		if (i || no.indexOf(o.tagName.toLowerCase()) > -1) r = !0;
		else {
			var a = t.getComputedStyle(o);
			a && "pointer" === a.getPropertyValue("cursor") && (r = !0);
		}
		s.push(o), n = o;
	}
	return {
		parentIsUsefulElement: r,
		targetElementList: s
	};
};
function co(t) {
	for (var e = t; e.parentNode && !Kn(e, "body"); e = e.parentNode) {
		var i = eo(e);
		if (w(i, "ph-sensitive") || w(i, "ph-no-capture")) return !1;
	}
	if (w(eo(t), "ph-include")) return !0;
	var r = t.type || "";
	if (F(r)) switch (r.toLowerCase()) {
		case "hidden":
		case "password": return !1;
	}
	var s = t.name || t.id || "";
	return !F(s) || !/^cc|cardnum|ccnum|creditcard|csc|cvc|cvv|exp|pass|pwd|routing|seccode|securitycode|securitynum|socialsec|socsec|ssn/i.test(s.replace(/[^a-zA-Z0-9]/g, ""));
}
function po(t) {
	return !!(Kn(t, "input") && ![
		"button",
		"checkbox",
		"submit",
		"reset"
	].includes(t.type) || Kn(t, "select") || Kn(t, "textarea") || "true" === t.getAttribute("contenteditable"));
}
var fo = "(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11})", _o = new RegExp("^(?:" + fo + ")$"), go = new RegExp(fo), mo = "\\d{3}-?\\d{2}-?\\d{4}", bo = new RegExp("^(" + mo + ")$"), yo = new RegExp("(" + mo + ")");
function wo(t, e) {
	if (void 0 === e && (e = !0), D(t)) return !1;
	if (F(t)) {
		if (t = x(t), (e ? _o : go).test((t || "").replace(/[- ]/g, ""))) return !1;
		if ((e ? bo : yo).test(t)) return !1;
	}
	return !0;
}
function xo(t) {
	var e = ro(t);
	return wo(e = (e + " " + Eo(t)).trim()) ? e : "";
}
function Eo(t) {
	var e = "";
	return t && t.childNodes && t.childNodes.length && Hi(t.childNodes, (function(t) {
		var i;
		if (t && "span" === (null == (i = t.tagName) ? void 0 : i.toLowerCase())) try {
			var r = ro(t);
			e = (e + " " + r).trim(), t.childNodes && t.childNodes.length && (e = (e + " " + Eo(t)).trim());
		} catch (t) {
			Ie.error("[AutoCapture]", t);
		}
	})), e;
}
function So(t) {
	return t.replace(/"|\\"/g, "\\\"");
}
function $o(t) {
	var e = t.attr__class;
	return e ? R(e) ? e : Zn(e) : void 0;
}
var To = class {
	constructor(t) {
		this.disabled = !1 === t;
		var e = O(t) ? t : {};
		this.thresholdPx = e.threshold_px || 30, this.timeoutMs = e.timeout_ms || 1e3, this.clickCount = e.click_count || 3, this.clicks = [];
	}
	isRageClick(t, e, i) {
		if (this.disabled) return !1;
		var r = this.clicks[this.clicks.length - 1];
		if (r && Math.abs(t - r.x) + Math.abs(e - r.y) < this.thresholdPx && this.timeoutMs > i - r.timestamp) {
			if (this.clicks.push({
				x: t,
				y: e,
				timestamp: i
			}), this.clicks.length === this.clickCount) return !0;
		} else this.clicks = [{
			x: t,
			y: e,
			timestamp: i
		}];
		return !1;
	}
};
var ko = "$copy_autocapture", Ro = Ce("[AutoCapture]");
function Po(t, e) {
	return e.length > t ? e.slice(0, t) + "..." : e;
}
function Oo(t) {
	if (t.previousElementSibling) return t.previousElementSibling;
	var e = t;
	do
		e = e.previousSibling;
	while (e && !Jn(e));
	return e;
}
function Io(e, i) {
	var r, s, { e: n, maskAllElementAttributes: o, maskAllText: a, elementAttributeIgnoreList: l, elementsChainAsString: u } = i;
	if (!Jn(e)) return { props: {} };
	for (var h = [e], d = e; d.parentNode && !Kn(d, "body");) if (Qn(d.parentNode)) h.push(d.parentNode.host), d = d.parentNode.host;
	else {
		if (!Jn(d.parentNode)) break;
		h.push(d.parentNode), d = d.parentNode;
	}
	var v, c, p = [], _ = {}, g = !1, m = !1;
	if (Hi(h, ((t) => {
		var e = co(t);
		if (Kn(t, "a")) {
			var i = t.getAttribute("href");
			g = e && !!i && wo(i) && i;
		}
		w(eo(t), "ph-no-capture") && (m = !0), p.push(function(t, e, i, r) {
			var s = t.tagName.toLowerCase(), n = { tag_name: s };
			no.indexOf(s) > -1 && !i && (n.$el_text = "a" === s.toLowerCase() || "button" === s.toLowerCase() ? Po(1024, xo(t)) : Po(1024, ro(t)));
			var o = eo(t);
			o.length > 0 && (n.classes = o.filter((function(t) {
				return "" !== t;
			}))), Hi(t.attributes, (function(i) {
				var s;
				if ((!po(t) || -1 !== [
					"name",
					"id",
					"class",
					"aria-label"
				].indexOf(i.name)) && (null == r || !r.includes(i.name)) && !e && wo(i.value) && (!F(s = i.name) || "_ngcontent" !== s.substring(0, 10) && "_nghost" !== s.substring(0, 7))) {
					var o = i.value;
					"class" === i.name && (o = Zn(o).join(" ")), n["attr__" + i.name] = Po(1024, o);
				}
			}));
			for (var a = 1, l = 1, u = t; u = Oo(u);) a++, u.tagName === t.tagName && l++;
			return n.nth_child = a, n.nth_of_type = l, n;
		}(t, o, a, l));
		qi(_, function(t) {
			if (!co(t)) return {};
			var e = {};
			return Hi(t.attributes, (function(t) {
				if (t.name && 0 === t.name.indexOf("data-ph-capture-attribute")) {
					var i = t.name.replace("data-ph-capture-attribute-", ""), r = t.value;
					i && r && wo(r) && (e[i] = r);
				}
			})), e;
		}(t));
	})), m) return {
		props: {},
		explicitNoCapture: m
	};
	if (a || (p[0].$el_text = Kn(e, "a") || Kn(e, "button") ? xo(e) : ro(e)), g) {
		var b, y;
		p[0].attr__href = g;
		var x = null == (b = Rr(g)) ? void 0 : b.host, E = null == t || null == (y = t.location) ? void 0 : y.host;
		x && E && x !== E && (v = g);
	}
	return { props: qi({
		$event_type: n.type,
		$ce_version: 1
	}, u ? {} : { $elements: p }, { $elements_chain: (c = p, function(t) {
		return t.map(((t) => {
			var e, i, r = "";
			if (t.tag_name && (r += t.tag_name), t.attr_class) for (var s of (t.attr_class.sort(), t.attr_class)) r += "." + s.replace(/"/g, "");
			var n = f({}, t.text ? { text: t.text } : {}, {
				"nth-child": null !== (e = t.nth_child) && void 0 !== e ? e : 0,
				"nth-of-type": null !== (i = t.nth_of_type) && void 0 !== i ? i : 0
			}, t.href ? { href: t.href } : {}, t.attr_id ? { attr_id: t.attr_id } : {}, t.attributes), o = {};
			return Vi(n).sort(((t, e) => {
				var [i] = t, [r] = e;
				return i.localeCompare(r);
			})).forEach(((t) => {
				var [e, i] = t;
				return o[So(e.toString())] = So(i.toString());
			})), (r += ":") + Vi(o).map(((t) => {
				var [e, i] = t;
				return e + "=\"" + i + "\"";
			})).join("");
		})).join(";");
	}(function(t) {
		return t.map(((t) => {
			var e, i, r = {
				text: null == (e = t.$el_text) ? void 0 : e.slice(0, 400),
				tag_name: t.tag_name,
				href: null == (i = t.attr__href) ? void 0 : i.slice(0, 2048),
				attr_class: $o(t),
				attr_id: t.attr__id,
				nth_child: t.nth_child,
				nth_of_type: t.nth_of_type,
				attributes: {}
			};
			return Vi(t).filter(((t) => {
				var [e] = t;
				return 0 === e.indexOf("attr__");
			})).forEach(((t) => {
				var [e, i] = t;
				return r.attributes[e] = i;
			})), r;
		}));
	}(c))) }, null != (r = p[0]) && r.$el_text ? { $el_text: null == (s = p[0]) ? void 0 : s.$el_text } : {}, v && "click" === n.type ? { $external_click_url: v } : {}, _) };
}
var Co = Ce("[ExceptionAutocapture]");
function Fo(t, e, i) {
	try {
		if (!(e in t)) return () => {};
		var r = t[e], s = i(r);
		return P(s) && (s.prototype = s.prototype || {}, Object.defineProperties(s, { __posthog_wrapped__: {
			enumerable: !1,
			value: !0
		} })), t[e] = s, () => {
			t[e] = r;
		};
	} catch (t) {
		return () => {};
	}
}
var Ao = Ce("[TracingHeaders]"), Mo = Ce("[Web Vitals]"), Do = 9e5, Lo = "disabled", Uo = "lazy_loading", No = "awaiting_config", jo = "missing_config";
Ce("[SessionRecording]"), Ce("[SessionRecording]");
var zo = "[SessionRecording]", Bo = Ce(zo), Ho = Ce("[Heatmaps]");
function qo(t) {
	return O(t) && "clientX" in t && "clientY" in t && L(t.clientX) && L(t.clientY);
}
var Vo = Ce("[Product Tours]"), Wo = ["$set_once", "$set"], Go = Ce("[SiteApps]"), Yo = "Error while initializing PostHog app with config id ";
function Jo(t, e, i) {
	if (D(t)) return !1;
	switch (i) {
		case "exact": return t === e;
		case "contains":
			var r = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".").replace(/%/g, ".*");
			return new RegExp(r, "i").test(t);
		case "regex": try {
			return new RegExp(e).test(t);
		} catch (t) {
			return !1;
		}
		default: return !1;
	}
}
var Ko = class {
	constructor(t) {
		this.vn = new hn(), this.fn = (t, e) => this.pn(t, e) && this.gn(t, e) && this.mn(t, e) && this.yn(t, e), this.pn = (t, e) => null == e || !e.event || (null == t ? void 0 : t.event) === (null == e ? void 0 : e.event), this._instance = t, this.bn = /* @__PURE__ */ new Set(), this._n = /* @__PURE__ */ new Set();
	}
	init() {
		var t, e;
		C(null == (t = this._instance) ? void 0 : t._addCaptureHook) || null == (e = this._instance) || e._addCaptureHook(((t, e) => {
			this.on(t, e);
		}));
	}
	register(t) {
		var e, i;
		if (!C(null == (e = this._instance) ? void 0 : e._addCaptureHook) && (t.forEach(((t) => {
			var e, i;
			null == (e = this._n) || e.add(t), null == (i = t.steps) || i.forEach(((t) => {
				var e;
				null == (e = this.bn) || e.add((null == t ? void 0 : t.event) || "");
			}));
		})), null != (i = this._instance) && i.autocapture)) {
			var r, s = /* @__PURE__ */ new Set();
			t.forEach(((t) => {
				var e;
				null == (e = t.steps) || e.forEach(((t) => {
					null != t && t.selector && s.add(null == t ? void 0 : t.selector);
				}));
			})), null == (r = this._instance) || r.autocapture.setElementSelectors(s);
		}
	}
	on(t, e) {
		var i;
		null != e && 0 != t.length && (this.bn.has(t) || this.bn.has(null == e ? void 0 : e.event)) && this._n && (null == (i = this._n) ? void 0 : i.size) > 0 && this._n.forEach(((t) => {
			this.wn(e, t) && this.vn.emit("actionCaptured", t.name);
		}));
	}
	In(t) {
		this.onAction("actionCaptured", ((e) => t(e)));
	}
	wn(t, e) {
		if (null == (null == e ? void 0 : e.steps)) return !1;
		for (var i of e.steps) if (this.fn(t, i)) return !0;
		return !1;
	}
	onAction(t, e) {
		return this.vn.on(t, e);
	}
	gn(t, e) {
		if (null != e && e.url) {
			var i, r = null == t || null == (i = t.properties) ? void 0 : i.$current_url;
			if (!r || "string" != typeof r) return !1;
			if (!Jo(r, e.url, e.url_matching || "contains")) return !1;
		}
		return !0;
	}
	mn(t, e) {
		return !!this.Cn(t, e) && !!this.Sn(t, e) && !!this.xn(t, e);
	}
	Cn(t, e) {
		var i;
		if (null == e || !e.href) return !0;
		var r = this.kn(t);
		if (r.length > 0) return r.some(((t) => Jo(t.href, e.href, e.href_matching || "exact")));
		var s, n = (null == t || null == (i = t.properties) ? void 0 : i.$elements_chain) || "";
		return !!n && Jo((s = n.match(/(?::|")href="(.*?)"/)) ? s[1] : "", e.href, e.href_matching || "exact");
	}
	Sn(t, e) {
		var i;
		if (null == e || !e.text) return !0;
		var r = this.kn(t);
		if (r.length > 0) return r.some(((t) => Jo(t.text, e.text, e.text_matching || "exact") || Jo(t.$el_text, e.text, e.text_matching || "exact")));
		var s, n, o, a = (null == t || null == (i = t.properties) ? void 0 : i.$elements_chain) || "";
		return !!a && (s = function(t) {
			for (var e, i = [], r = /(?::|")text="(.*?)"/g; !D(e = r.exec(t));) i.includes(e[1]) || i.push(e[1]);
			return i;
		}(a), n = e.text, o = e.text_matching || "exact", s.some(((t) => Jo(t, n, o))));
	}
	xn(t, e) {
		var i, r;
		if (null == e || !e.selector) return !0;
		var s = null == t || null == (i = t.properties) ? void 0 : i.$element_selectors;
		if (null != s && s.includes(e.selector)) return !0;
		var n = (null == t || null == (r = t.properties) ? void 0 : r.$elements_chain) || "";
		if (e.selector_regex && n) try {
			return new RegExp(e.selector_regex).test(n);
		} catch (t) {
			return !1;
		}
		return !1;
	}
	kn(t) {
		var e;
		return null == (null == t || null == (e = t.properties) ? void 0 : e.$elements) ? [] : null == t ? void 0 : t.properties.$elements;
	}
	yn(t, e) {
		return null == e || !e.properties || 0 === e.properties.length || mn(e.properties.reduce(((t, e) => {
			var i = R(e.value) ? e.value.map(String) : null != e.value ? [String(e.value)] : [];
			return t[e.key] = {
				values: i,
				operator: e.operator || "exact"
			}, t;
		}), {}), null == t ? void 0 : t.properties);
	}
};
var Xo = class {
	constructor(t) {
		this._instance = t, this.Tn = /* @__PURE__ */ new Map(), this.An = /* @__PURE__ */ new Map(), this.En = /* @__PURE__ */ new Map();
	}
	Rn(t, e) {
		return !!t && mn(t.propertyFilters, null == e ? void 0 : e.properties);
	}
	Nn(t, e) {
		var i = /* @__PURE__ */ new Map();
		return t.forEach(((t) => {
			var r;
			null == (r = t.conditions) || null == (r = r[e]) || null == (r = r.values) || r.forEach(((e) => {
				if (null != e && e.name) {
					var r = i.get(e.name) || [];
					r.push(t.id), i.set(e.name, r);
				}
			}));
		})), i;
	}
	Mn(t, e, i) {
		var r = (i === Jr.Activation ? this.Tn : this.An).get(t), s = [];
		return this.Fn(((t) => {
			s = t.filter(((t) => null == r ? void 0 : r.includes(t.id)));
		})), s.filter(((r) => {
			var s, n = null == (s = r.conditions) || null == (s = s[i]) || null == (s = s.values) ? void 0 : s.find(((e) => e.name === t));
			return this.Rn(n, e);
		}));
	}
	register(t) {
		var e;
		C(null == (e = this._instance) ? void 0 : e._addCaptureHook) || (this.On(t), this.Pn(t));
	}
	Pn(t) {
		var e = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.actions) && (null == (i = t.conditions) || null == (i = i.actions) || null == (i = i.values) ? void 0 : i.length) > 0;
		}));
		0 !== e.length && (this.Ln ?? (this.Ln = new Ko(this._instance), this.Ln.init(), this.Ln.In(((t) => {
			this.onAction(t);
		}))), e.forEach(((t) => {
			var e, i, r, s, n;
			t.conditions && null != (e = t.conditions) && e.actions && null != (i = t.conditions) && null != (i = i.actions) && i.values && (null == (r = t.conditions) || null == (r = r.actions) || null == (r = r.values) ? void 0 : r.length) > 0 && (null == (s = this.Ln) || s.register(t.conditions.actions.values), null == (n = t.conditions) || null == (n = n.actions) || null == (n = n.values) || n.forEach(((e) => {
				if (e && e.name) {
					var i = this.En.get(e.name);
					i && i.push(t.id), this.En.set(e.name, i || [t.id]);
				}
			})));
		})));
	}
	On(t) {
		var e, i = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.events) && (null == (i = t.conditions) || null == (i = i.events) || null == (i = i.values) ? void 0 : i.length) > 0;
		})), r = t.filter(((t) => {
			var e, i;
			return (null == (e = t.conditions) ? void 0 : e.cancelEvents) && (null == (i = t.conditions) || null == (i = i.cancelEvents) || null == (i = i.values) ? void 0 : i.length) > 0;
		}));
		0 === i.length && 0 === r.length || (null == (e = this._instance) || e._addCaptureHook(((t, e) => {
			this.onEvent(t, e);
		})), this.Tn = this.Nn(t, Jr.Activation), this.An = this.Nn(t, Jr.Cancellation));
	}
	onEvent(t, e) {
		var i, r = this.le(), s = this.Dn(), n = this.Bn(), o = (null == (i = this._instance) || null == (i = i.persistence) ? void 0 : i.props[s]) || [];
		if (n === t && e && o.length > 0) {
			var a, l;
			r.info("event matched, removing item from activated items", {
				event: t,
				eventPayload: e,
				existingActivatedItems: o
			});
			var u = (null == e || null == (a = e.properties) ? void 0 : a.$survey_id) || (null == e || null == (l = e.properties) ? void 0 : l.$product_tour_id);
			if (u) {
				var h = o.indexOf(u);
				0 > h || (o.splice(h, 1), this.jn(o));
			}
		} else {
			if (this.An.has(t)) {
				var d = this.Mn(t, e, Jr.Cancellation);
				d.length > 0 && (r.info("cancel event matched, cancelling items", {
					event: t,
					itemsToCancel: d.map(((t) => t.id))
				}), d.forEach(((t) => {
					var e = o.indexOf(t.id);
					0 > e || o.splice(e, 1), this.$n(t.id);
				})), this.jn(o));
			}
			if (this.Tn.has(t)) {
				r.info("event name matched", {
					event: t,
					eventPayload: e,
					items: this.Tn.get(t)
				});
				var v = this.Mn(t, e, Jr.Activation);
				this.jn(o.concat(v.map(((t) => t.id)) || []));
			}
		}
	}
	onAction(t) {
		var e, i = this.Dn(), r = (null == (e = this._instance) || null == (e = e.persistence) ? void 0 : e.props[i]) || [];
		this.En.has(t) && this.jn(r.concat(this.En.get(t) || []));
	}
	jn(t) {
		var e = this.le(), i = [...new Set(t)].filter(((t) => !this.qn(t)));
		e.info("updating activated items", { activatedItems: i }), this.Zn(i);
	}
	getActivatedIds() {
		var t, e = this.Dn();
		return (null == (t = this._instance) || null == (t = t.persistence) ? void 0 : t.props[e]) || [];
	}
	getEventToItemsMap() {
		return this.Tn;
	}
	Vn() {
		return this.Ln;
	}
};
var Qo = class extends Xo {
	constructor(t) {
		super(t);
	}
	Dn() {
		return vi;
	}
	Bn() {
		return rs.SHOWN;
	}
	Fn(t) {
		var e;
		null == (e = this._instance) || e.getSurveys(t);
	}
	$n(t) {
		var e;
		null == (e = this._instance) || e.cancelPendingSurvey(t);
	}
	le() {
		return En;
	}
	Zn(t) {
		var e;
		null == (e = this._instance) || null == (e = e.persistence) || e.register({ [vi]: t });
	}
	qn() {
		return !1;
	}
	getSurveys() {
		return this.getActivatedIds();
	}
	getEventToSurveys() {
		return this.getEventToItemsMap();
	}
};
var Zo = "SDK is not enabled or survey functionality is not yet loaded", ta = "Disabled. Not loading surveys.", ea = null != t && t.location ? Ir(t.location.hash, "__posthog") || Ir(location.hash, "state") : null, ia = "_postHogToolbarParams", ra = Ce("[Toolbar]"), sa = Ce("[FeatureFlags]"), na = Ce("[FeatureFlags]", { debugEnabled: !0 }), oa = "\" failed. Feature flags didn't load in time.", aa = (t) => {
	for (var e = {}, i = 0; t.length > i; i++) e[t[i]] = !0;
	return e;
}, la = (t) => {
	var e = {};
	for (var [i, r] of Vi(t || {})) r && (e[i] = r);
	return e;
}, ua = Ce("[Error tracking]"), ha = "Refusing to render web experiment since the viewer is a likely bot", da = {
	icontains: (e, i) => !!t && i.href.toLowerCase().indexOf(e.toLowerCase()) > -1,
	not_icontains: (e, i) => !!t && -1 === i.href.toLowerCase().indexOf(e.toLowerCase()),
	regex: (e, i) => !!t && pn(i.href, e),
	not_regex: (e, i) => !!t && !pn(i.href, e),
	exact: (t, e) => e.href === t,
	is_not: (t, e) => e.href !== t
};
var va = class va {
	get Bt() {
		return this._instance.config;
	}
	constructor(t) {
		var e = this;
		this.getWebExperimentsAndEvaluateDisplayLogic = function(t) {
			void 0 === t && (t = !1), e.getWebExperiments(((t) => {
				va.Hn("retrieved web experiments from the server"), e.zn = /* @__PURE__ */ new Map(), t.forEach(((t) => {
					if (t.feature_flag_key) {
						var i;
						e.zn && (va.Hn("setting flag key ", t.feature_flag_key, " to web experiment ", t), null == (i = e.zn) || i.set(t.feature_flag_key, t));
						var r = e._instance.getFeatureFlag(t.feature_flag_key);
						F(r) && t.variants[r] && e.Un(t.name, r, t.variants[r].transforms);
					} else if (t.variants) for (var s in t.variants) {
						var n = t.variants[s];
						va.Yn(n) && e.Un(t.name, s, n.transforms);
					}
				}));
			}), t);
		}, this._instance = t, this._instance.onFeatureFlags(((t) => {
			this.onFeatureFlags(t);
		}));
	}
	initialize() {}
	onFeatureFlags(t) {
		if (this._is_bot()) va.Hn(ha);
		else if (!this.Bt.disable_web_experiments) {
			if (D(this.zn)) return this.zn = /* @__PURE__ */ new Map(), this.loadIfEnabled(), void this.previewWebExperiment();
			va.Hn("applying feature flags", t), t.forEach(((t) => {
				var e;
				if (this.zn && null != (e = this.zn) && e.has(t)) {
					var i, r = this._instance.getFeatureFlag(t), s = null == (i = this.zn) ? void 0 : i.get(t);
					r && null != s && s.variants[r] && this.Un(s.name, r, s.variants[r].transforms);
				}
			}));
		}
	}
	previewWebExperiment() {
		var t = va.getWindowLocation();
		if (null != t && t.search) {
			var e = Pr(null == t ? void 0 : t.search, "__experiment_id"), i = Pr(null == t ? void 0 : t.search, "__experiment_variant");
			e && i && (va.Hn("previewing web experiments " + e + " && " + i), this.getWebExperiments(((t) => {
				this.Gn(parseInt(e), i, t);
			}), !1, !0));
		}
	}
	loadIfEnabled() {
		this.Bt.disable_web_experiments || this.getWebExperimentsAndEvaluateDisplayLogic();
	}
	getWebExperiments(t, e, i) {
		if (this.Bt.disable_web_experiments && !i) return t([]);
		var r = this._instance.get_property("$web_experiments");
		if (r && !e) return t(r);
		this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/web_experiments/?token=" + this.Bt.token),
			method: "GET",
			callback: (e) => t(200 === e.statusCode && e.json && e.json.experiments || [])
		});
	}
	Gn(t, e, i) {
		var r = i.filter(((e) => e.id === t));
		r && r.length > 0 && (va.Hn("Previewing web experiment [" + r[0].name + "] with variant [" + e + "]"), this.Un(r[0].name, e, r[0].variants[e].transforms));
	}
	static Yn(t) {
		return !D(t.conditions) && va.Wn(t) && va.Xn(t);
	}
	static Wn(t) {
		var e;
		if (D(t.conditions) || D(null == (e = t.conditions) ? void 0 : e.url)) return !0;
		var i, r, s, n = va.getWindowLocation();
		return !!n && (null == (i = t.conditions) || !i.url || da[null !== (r = null == (s = t.conditions) ? void 0 : s.urlMatchType) && void 0 !== r ? r : "icontains"](t.conditions.url, n));
	}
	static getWindowLocation() {
		return null == t ? void 0 : t.location;
	}
	static Xn(t) {
		var e;
		if (D(t.conditions) || D(null == (e = t.conditions) ? void 0 : e.utm)) return !0;
		var i = Lr();
		if (i.utm_source) {
			var r, s, n, o, a, l, u, h, d = null == (r = t.conditions) || null == (r = r.utm) || !r.utm_campaign || (null == (s = t.conditions) || null == (s = s.utm) ? void 0 : s.utm_campaign) == i.utm_campaign, v = null == (n = t.conditions) || null == (n = n.utm) || !n.utm_source || (null == (o = t.conditions) || null == (o = o.utm) ? void 0 : o.utm_source) == i.utm_source, c = null == (a = t.conditions) || null == (a = a.utm) || !a.utm_medium || (null == (l = t.conditions) || null == (l = l.utm) ? void 0 : l.utm_medium) == i.utm_medium, p = null == (u = t.conditions) || null == (u = u.utm) || !u.utm_term || (null == (h = t.conditions) || null == (h = h.utm) ? void 0 : h.utm_term) == i.utm_term;
			return d && c && p && v;
		}
		return !1;
	}
	static Hn(t) {
		for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
		Ie.info("[WebExperiments] " + t, i);
	}
	Un(t, e, i) {
		this._is_bot() ? va.Hn(ha) : "control" !== e ? i.forEach(((i) => {
			if (i.selector) {
				var r;
				va.Hn("applying transform of variant " + e + " for experiment " + t + " ", i);
				(null == (r = document) ? void 0 : r.querySelectorAll(i.selector))?.forEach(((t) => {
					var e = t;
					i.html && (e.innerHTML = i.html), i.css && e.setAttribute("style", i.css);
				}));
			}
		})) : va.Hn("Control variants leave the page unmodified.");
	}
	_is_bot() {
		return i && this._instance ? cn(i, this.Bt.custom_blocked_useragents) : void 0;
	}
};
var ca = Ce("[Conversations]"), pa = "Conversations not available yet.", fa = { featureFlags: class {
	constructor(t) {
		this.Jn = !1, this.Kn = !1, this.Qn = !1, this.es = !1, this.ts = !1, this.rs = !1, this.ns = !1, this.ss = !1, this._instance = t, this.featureFlagEventHandlers = [];
	}
	get Bt() {
		return this._instance.config;
	}
	get ni() {
		return this._instance.persistence;
	}
	os(t) {
		return this._instance.get_property(t);
	}
	ls() {
		var t, e;
		return null !== (t = null == (e = this.ni) ? void 0 : e.wr(this.Bt.feature_flag_cache_ttl_ms)) && void 0 !== t && t;
	}
	us() {
		return !!this.ls() && (this.ss || this.Qn || (this.ss = !0, sa.warn("Feature flag cache is stale, triggering refresh..."), this.reloadFeatureFlags()), !0);
	}
	hs() {
		var t, e = null !== (t = this.Bt.evaluation_contexts) && void 0 !== t ? t : this.Bt.evaluation_environments;
		return !this.Bt.evaluation_environments || this.Bt.evaluation_contexts || this.ns || (sa.warn("evaluation_environments is deprecated. Use evaluation_contexts instead. evaluation_environments will be removed in a future version."), this.ns = !0), null != e && e.length ? e.filter(((t) => {
			var e = t && "string" == typeof t && t.trim().length > 0;
			return e || sa.error("Invalid evaluation context found:", t, "Expected non-empty string"), e;
		})) : [];
	}
	cs() {
		return this.hs().length > 0;
	}
	initialize() {
		var t, e, { config: i } = this._instance, r = null !== (t = null == (e = i.bootstrap) ? void 0 : e.featureFlags) && void 0 !== t ? t : {};
		if (Object.keys(r).length) {
			var s, n, o = null !== (s = null == (n = i.bootstrap) ? void 0 : n.featureFlagPayloads) && void 0 !== s ? s : {}, a = Object.keys(r).filter(((t) => !!r[t])).reduce(((t, e) => (t[e] = r[e] || !1, t)), {}), l = Object.keys(o).filter(((t) => a[t])).reduce(((t, e) => (o[e] && (t[e] = o[e]), t)), {});
			this.receivedFeatureFlags({
				featureFlags: a,
				featureFlagPayloads: l
			});
		}
	}
	updateFlags(t, e, i) {
		var r = null != i && i.merge ? this.getFlagVariants() : {}, s = null != i && i.merge ? this.getFlagPayloads() : {}, n = f({}, r, t), o = f({}, s, e), a = {};
		for (var [l, u] of Object.entries(n)) {
			var h = "string" == typeof u;
			a[l] = {
				key: l,
				enabled: !!h || Boolean(u),
				variant: h ? u : void 0,
				reason: void 0,
				metadata: C(null == o ? void 0 : o[l]) ? void 0 : {
					id: 0,
					version: void 0,
					description: void 0,
					payload: o[l]
				}
			};
		}
		this.receivedFeatureFlags({ flags: a });
	}
	get hasLoadedFlags() {
		return this.Kn;
	}
	getFlags() {
		return Object.keys(this.getFlagVariants());
	}
	getFlagsWithDetails() {
		var t = this.os(si), e = this.os(ai), i = this.os(li);
		if (!i && !e) return t || {};
		var r = qi({}, t || {});
		for (var n of [...new Set([...Object.keys(i || {}), ...Object.keys(e || {})])]) {
			var o, a, l = r[n], u = null == e ? void 0 : e[n], h = C(u) ? null !== (o = null == l ? void 0 : l.enabled) && void 0 !== o && o : !!u, d = C(u) ? l.variant : "string" == typeof u ? u : void 0, v = null == i ? void 0 : i[n], c = f({}, l, {
				enabled: h,
				variant: h ? null != d ? d : null == l ? void 0 : l.variant : void 0
			});
			h !== (null == l ? void 0 : l.enabled) && (c.original_enabled = null == l ? void 0 : l.enabled), d !== (null == l ? void 0 : l.variant) && (c.original_variant = null == l ? void 0 : l.variant), v && (c.metadata = f({}, null == l ? void 0 : l.metadata, {
				payload: v,
				original_payload: null == l || null == (a = l.metadata) ? void 0 : a.payload
			})), r[n] = c;
		}
		return this.Jn || (sa.warn(" Overriding feature flag details!", {
			flagDetails: t,
			overriddenPayloads: i,
			finalDetails: r
		}), this.Jn = !0), r;
	}
	getFlagVariants() {
		var t = this.os(ei), e = this.os(ai);
		if (!e) return t || {};
		for (var i = qi({}, t), r = Object.keys(e), s = 0; r.length > s; s++) i[r[s]] = e[r[s]];
		return this.Jn || (sa.warn(" Overriding feature flags!", {
			enabledFlags: t,
			overriddenFlags: e,
			finalFlags: i
		}), this.Jn = !0), i;
	}
	getFlagPayloads() {
		var t = this.os(ni), e = this.os(li);
		if (!e) return t || {};
		for (var i = qi({}, t || {}), r = Object.keys(e), s = 0; r.length > s; s++) i[r[s]] = e[r[s]];
		return this.Jn || (sa.warn(" Overriding feature flag payloads!", {
			flagPayloads: t,
			overriddenPayloads: e,
			finalPayloads: i
		}), this.Jn = !0), i;
	}
	reloadFeatureFlags() {
		this.es || this.Bt.advanced_disable_feature_flags || this.ds || (this._instance.Fi.emit("featureFlagsReloading", !0), this.ds = setTimeout((() => {
			this.vs();
		}), 5));
	}
	fs() {
		clearTimeout(this.ds), this.ds = void 0;
	}
	ensureFlagsLoaded() {
		this.Kn || this.Qn || this.ds || this.reloadFeatureFlags();
	}
	setAnonymousDistinctId(t) {
		this.$anon_distinct_id = t;
	}
	setReloadingPaused(t) {
		this.es = t;
	}
	vs(t) {
		var e;
		if (this.fs(), !this._instance.Fr()) if (this.Qn) this.ts = !0;
		else {
			var i = this.Bt.token, r = this.os(De), s = {
				token: i,
				distinct_id: this._instance.get_distinct_id(),
				groups: this._instance.getGroups(),
				$anon_distinct_id: this.$anon_distinct_id,
				person_properties: f({}, (null == (e = this.ni) ? void 0 : e.get_initial_props()) || {}, this.os(ui) || {}),
				group_properties: this.os(hi),
				timezone: Vr()
			};
			M(r) || C(r) || (s.$device_id = r), (null != t && t.disableFlags || this.Bt.advanced_disable_feature_flags) && (s.disable_flags = !0), this.cs() && (s.evaluation_contexts = this.hs());
			var n = this._instance.requestRouter.endpointFor("flags", "/flags/?v=2" + (this.Bt.advanced_only_evaluate_survey_feature_flags ? "&only_evaluate_survey_feature_flags=true" : ""));
			this.Qn = !0, this._instance._send_request({
				method: "POST",
				url: n,
				data: s,
				compression: this.Bt.disable_compression ? void 0 : ps.Base64,
				timeout: this.Bt.feature_flag_request_timeout_ms,
				callback: (t) => {
					var e, i, r, n = !0;
					if (200 === t.statusCode && (this.ts || (this.$anon_distinct_id = void 0), n = !1), this.Qn = !1, !s.disable_flags || this.ts) {
						this.rs = !n;
						var o = [];
						t.error ? t.error instanceof Error ? o.push("AbortError" === t.error.name ? "timeout" : "connection_error") : o.push("unknown_error") : 200 !== t.statusCode && o.push("api_error_" + t.statusCode), null != (e = t.json) && e.errorsWhileComputingFlags && o.push("errors_while_computing_flags");
						var a, l = !(null == (i = t.json) || null == (i = i.quotaLimited) || !i.includes("feature_flags"));
						if (l && o.push("quota_limited"), null == (r = this.ni) || r.register({ [_i]: o }), l) sa.warn("You have hit your feature flags quota limit, and will not be able to load feature flags until the quota is reset.  Please visit https://posthog.com/docs/billing/limits-alerts to learn more.");
						else s.disable_flags || this.receivedFeatureFlags(null !== (a = t.json) && void 0 !== a ? a : {}, n, { partialResponse: !!this.Bt.advanced_only_evaluate_survey_feature_flags }), this.ts && (this.ts = !1, this.vs());
					}
				}
			});
		}
	}
	getFeatureFlag(t, e) {
		var i;
		if (void 0 === e && (e = {}), !e.fresh || this.rs) if (this.Kn || this.getFlags() && this.getFlags().length > 0) {
			if (!this.us()) {
				var r = this.getFeatureFlagResult(t, e);
				return null !== (i = null == r ? void 0 : r.variant) && void 0 !== i ? i : null == r ? void 0 : r.enabled;
			}
		} else sa.warn("getFeatureFlag for key \"" + t + oa);
	}
	getFeatureFlagDetails(t) {
		return this.getFlagsWithDetails()[t];
	}
	getFeatureFlagPayload(t) {
		var e = this.getFeatureFlagResult(t, { send_event: !1 });
		return null == e ? void 0 : e.payload;
	}
	getFeatureFlagResult(t, e) {
		if (void 0 === e && (e = {}), !e.fresh || this.rs) if (this.Kn || this.getFlags() && this.getFlags().length > 0) {
			if (!this.us()) {
				var i = this.getFlagVariants(), r = t in i, s = i[t], n = this.getFlagPayloads()[t], o = String(s), a = this.os(oi) || void 0, l = this.os(gi) || void 0, u = this.os(pi) || {};
				if (this.Bt.advanced_feature_flags_dedup_per_session) {
					var h, d = this._instance.get_session_id(), v = this.os(fi);
					d && d !== v && (u = {}, null == (h = this.ni) || h.register({
						[pi]: u,
						[fi]: d
					}));
				}
				if ((e.send_event || !("send_event" in e)) && (!(t in u) || !u[t].includes(o))) {
					var c, p, f, _, g, m, b, y, w, x;
					R(u[t]) ? u[t].push(o) : u[t] = [o], null == (c = this.ni) || c.register({ [pi]: u });
					var E = this.getFeatureFlagDetails(t), S = [...null !== (p = this.os(_i)) && void 0 !== p ? p : []];
					C(s) && S.push("flag_missing");
					var T = {
						$feature_flag: t,
						$feature_flag_response: s,
						$feature_flag_payload: n || null,
						$feature_flag_request_id: a,
						$feature_flag_evaluated_at: l,
						$feature_flag_bootstrapped_response: (null == (f = this.Bt.bootstrap) || null == (f = f.featureFlags) ? void 0 : f[t]) || null,
						$feature_flag_bootstrapped_payload: (null == (_ = this.Bt.bootstrap) || null == (_ = _.featureFlagPayloads) ? void 0 : _[t]) || null,
						$used_bootstrap_value: !this.rs
					};
					C(null == E || null == (g = E.metadata) ? void 0 : g.version) || (T.$feature_flag_version = E.metadata.version);
					var k, P = null !== (m = null == E || null == (b = E.reason) ? void 0 : b.description) && void 0 !== m ? m : null == E || null == (y = E.reason) ? void 0 : y.code;
					P && (T.$feature_flag_reason = P), null != E && null != (w = E.metadata) && w.id && (T.$feature_flag_id = E.metadata.id), C(null == E ? void 0 : E.original_variant) && C(null == E ? void 0 : E.original_enabled) || (T.$feature_flag_original_response = C(E.original_variant) ? E.original_enabled : E.original_variant), null != E && null != (x = E.metadata) && x.original_payload && (T.$feature_flag_original_payload = null == E || null == (k = E.metadata) ? void 0 : k.original_payload), S.length && (T.$feature_flag_error = S.join(",")), this._instance.capture("$feature_flag_called", T);
				}
				if (r) {
					var O = n;
					if (!C(n)) try {
						O = JSON.parse(n);
					} catch (t) {}
					return {
						key: t,
						enabled: !!s,
						variant: "string" == typeof s ? s : void 0,
						payload: O
					};
				}
			}
		} else sa.warn("getFeatureFlagResult for key \"" + t + oa);
	}
	getRemoteConfigPayload(t, e) {
		var i = this.Bt.token, r = {
			distinct_id: this._instance.get_distinct_id(),
			token: i
		};
		this.cs() && (r.evaluation_contexts = this.hs()), this._instance._send_request({
			method: "POST",
			url: this._instance.requestRouter.endpointFor("flags", "/flags/?v=2"),
			data: r,
			compression: this.Bt.disable_compression ? void 0 : ps.Base64,
			timeout: this.Bt.feature_flag_request_timeout_ms,
			callback(i) {
				var r, s = null == (r = i.json) ? void 0 : r.featureFlagPayloads;
				e((null == s ? void 0 : s[t]) || void 0);
			}
		});
	}
	isFeatureEnabled(t, e) {
		if (void 0 === e && (e = {}), !e.fresh || this.rs) {
			if (this.Kn || this.getFlags() && this.getFlags().length > 0) {
				var i = this.getFeatureFlag(t, e);
				return C(i) ? void 0 : !!i;
			}
			sa.warn("isFeatureEnabled for key \"" + t + oa);
		}
	}
	addFeatureFlagsHandler(t) {
		this.featureFlagEventHandlers.push(t);
	}
	removeFeatureFlagsHandler(t) {
		this.featureFlagEventHandlers = this.featureFlagEventHandlers.filter(((e) => e !== t));
	}
	receivedFeatureFlags(t, e, i) {
		if (this.ni) {
			this.Kn = !0;
			var r = this.getFlagVariants(), s = this.getFlagPayloads(), n = this.getFlagsWithDetails();
			(function(t, e, i, r, s, n) {
				void 0 === i && (i = {}), void 0 === r && (r = {}), void 0 === s && (s = {});
				var o = ((t) => {
					var e = t.flags;
					return e ? (t.featureFlags = Object.fromEntries(Object.keys(e).map(((t) => {
						var i;
						return [t, null !== (i = e[t].variant) && void 0 !== i ? i : e[t].enabled];
					}))), t.featureFlagPayloads = Object.fromEntries(Object.keys(e).filter(((t) => e[t].enabled)).filter(((t) => {
						var i;
						return null == (i = e[t].metadata) ? void 0 : i.payload;
					})).map(((t) => {
						var i;
						return [t, null == (i = e[t].metadata) ? void 0 : i.payload];
					})))) : sa.warn("Using an older version of the feature flags endpoint. Please upgrade your PostHog server to the latest version"), t;
				})(t), a = o.flags, l = o.featureFlags, u = o.featureFlagPayloads;
				if (l) {
					var h = t.requestId, d = t.evaluatedAt;
					if (R(l)) {
						sa.warn("v1 of the feature flags endpoint is deprecated. Please use the latest version.");
						var v = {};
						if (l) for (var c = 0; l.length > c; c++) v[l[c]] = !0;
						e && e.register({
							[ii]: l,
							[ei]: v
						});
					} else {
						var p = l, _ = u, g = a;
						if (null != n && n.partialResponse) p = f({}, i, p), _ = f({}, r, _), g = f({}, s, g);
						else if (t.errorsWhileComputingFlags) if (a) {
							var m = new Set(Object.keys(a).filter(((t) => {
								var e;
								return !(null != (e = a[t]) && e.failed);
							})));
							p = f({}, i, Object.fromEntries(Object.entries(p).filter(((t) => {
								var [e] = t;
								return m.has(e);
							})))), _ = f({}, r, Object.fromEntries(Object.entries(_ || {}).filter(((t) => {
								var [e] = t;
								return m.has(e);
							})))), g = f({}, s, Object.fromEntries(Object.entries(g || {}).filter(((t) => {
								var [e] = t;
								return m.has(e);
							}))));
						} else p = f({}, i, p), _ = f({}, r, _), g = f({}, s, g);
						e && e.register(f({
							[ii]: Object.keys(la(p)),
							[ei]: p || {},
							[ni]: _ || {},
							[si]: g || {}
						}, h ? { [oi]: h } : {}, d ? { [gi]: d } : {}));
					}
				}
			})(t, this.ni, r, s, n, i), e || (this.ss = !1), this.ps(e);
		}
	}
	override(t, e) {
		void 0 === e && (e = !1), sa.warn("override is deprecated. Please use overrideFeatureFlags instead."), this.overrideFeatureFlags({
			flags: t,
			suppressWarning: e
		});
	}
	overrideFeatureFlags(t) {
		if (!this._instance.__loaded || !this.ni) return sa.uninitializedWarning("posthog.featureFlags.overrideFeatureFlags");
		if (!1 === t) return this.ni.unregister(ai), this.ni.unregister(li), this.ps(), na.info("All overrides cleared");
		if (R(t)) {
			var e = aa(t);
			return this.ni.register({ [ai]: e }), this.ps(), na.info("Flag overrides set", { flags: t });
		}
		if (t && "object" == typeof t && ("flags" in t || "payloads" in t)) {
			var i, r = t;
			if (this.Jn = Boolean(null !== (i = r.suppressWarning) && void 0 !== i && i), "flags" in r) {
				if (!1 === r.flags) this.ni.unregister(ai), na.info("Flag overrides cleared");
				else if (r.flags) {
					if (R(r.flags)) {
						var s = aa(r.flags);
						this.ni.register({ [ai]: s });
					} else this.ni.register({ [ai]: r.flags });
					na.info("Flag overrides set", { flags: r.flags });
				}
			}
			"payloads" in r && (!1 === r.payloads ? (this.ni.unregister(li), na.info("Payload overrides cleared")) : r.payloads && (this.ni.register({ [li]: r.payloads }), na.info("Payload overrides set", { payloads: r.payloads }))), this.ps();
			return;
		}
		if (t && "object" == typeof t) return this.ni.register({ [ai]: t }), this.ps(), na.info("Flag overrides set", { flags: t });
		sa.warn("Invalid overrideOptions provided to overrideFeatureFlags", { overrideOptions: t });
	}
	onFeatureFlags(t) {
		if (this.addFeatureFlagsHandler(t), this.Kn) {
			var { flags: e, flagVariants: i } = this.gs();
			t(e, i);
		}
		return () => this.removeFeatureFlagsHandler(t);
	}
	updateEarlyAccessFeatureEnrollment(t, e, i) {
		var r, s = (this.os(ri) || []).find(((e) => e.flagKey === t)), n = { ["$feature_enrollment/" + t]: e }, o = {
			$feature_flag: t,
			$feature_enrollment: e,
			$set: n
		};
		s && (o.$early_access_feature_name = s.name), i && (o.$feature_enrollment_stage = i), this._instance.capture("$feature_enrollment_update", o), this.setPersonPropertiesForFlags(n, !1);
		var a = f({}, this.getFlagVariants(), { [t]: e });
		null == (r = this.ni) || r.register({
			[ii]: Object.keys(la(a)),
			[ei]: a
		}), this.ps();
	}
	getEarlyAccessFeatures(t, e, i) {
		void 0 === e && (e = !1);
		var r = this.os(ri), s = i ? "&" + i.map(((t) => "stage=" + t)).join("&") : "";
		if (r && !e) return t(r);
		this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/early_access_features/?token=" + this.Bt.token + s),
			method: "GET",
			callback: (e) => {
				var i, r;
				if (e.json) {
					var s = e.json.earlyAccessFeatures;
					return null == (i = this.ni) || i.unregister(ri), null == (r = this.ni) || r.register({ [ri]: s }), t(s);
				}
			}
		});
	}
	gs() {
		var t = this.getFlags(), e = this.getFlagVariants();
		return {
			flags: t.filter(((t) => e[t])),
			flagVariants: Object.keys(e).filter(((t) => e[t])).reduce(((t, i) => (t[i] = e[i], t)), {})
		};
	}
	ps(t) {
		var { flags: e, flagVariants: i } = this.gs();
		this.featureFlagEventHandlers.forEach(((r) => r(e, i, { errorsLoading: t })));
	}
	setPersonPropertiesForFlags(t, e) {
		void 0 === e && (e = !0);
		var i = this.os(ui) || {}, r = (null == t ? void 0 : t.$set) || (null != t && t.$set_once ? {} : t), s = null == t ? void 0 : t.$set_once, n = {};
		if (s) for (var o in s) ({}).hasOwnProperty.call(s, o) && (o in i || (n[o] = s[o]));
		this._instance.register({ [ui]: f({}, i, n, r) }), e && this._instance.reloadFeatureFlags();
	}
	resetPersonPropertiesForFlags() {
		this._instance.unregister(ui);
	}
	setGroupPropertiesForFlags(t, e) {
		void 0 === e && (e = !0);
		var i = this.os(hi) || {};
		0 !== Object.keys(i).length && Object.keys(i).forEach(((e) => {
			i[e] = f({}, i[e], t[e]), delete t[e];
		})), this._instance.register({ [hi]: f({}, i, t) }), e && this._instance.reloadFeatureFlags();
	}
	resetGroupPropertiesForFlags(t) {
		if (t) {
			var e = this.os(hi) || {};
			this._instance.register({ [hi]: f({}, e, { [t]: {} }) });
		} else this._instance.unregister(hi);
	}
	reset() {
		this.Kn = !1, this.Qn = !1, this.es = !1, this.ts = !1, this.rs = !1, this.$anon_distinct_id = void 0, this.fs(), this.Jn = !1;
	}
} }, _a = { sessionRecording: class {
	get Bt() {
		return this._instance.config;
	}
	get ni() {
		return this._instance.persistence;
	}
	get started() {
		var t;
		return !(null == (t = this.ys) || !t.isStarted);
	}
	get status() {
		var t, e;
		return this.bs === No || this.bs === jo ? this.bs : null !== (t = null == (e = this.ys) ? void 0 : e.status) && void 0 !== t ? t : this.bs;
	}
	constructor(t) {
		if (this._forceAllowLocalhostNetworkCapture = !1, this.bs = Lo, this._s = void 0, this._instance = t, !this._instance.sessionManager) throw Bo.error("started without valid sessionManager"), /* @__PURE__ */ new Error(zo + " started without valid sessionManager. This is a bug.");
		if (this.Bt.cookieless_mode === Ci) throw new Error(zo + " cannot be used with cookieless_mode=\"always\"");
	}
	initialize() {
		this.startIfEnabledOrStop();
	}
	get ws() {
		var e, i = !(null == (e = this._instance.get_property(Ye)) || !e.enabled), r = !this.Bt.disable_session_recording, s = this.Bt.disable_session_recording || this._instance.consent.isOptedOut();
		return t && i && r && !s;
	}
	startIfEnabledOrStop(t) {
		var e;
		if (!this.ws || null == (e = this.ys) || !e.isStarted) {
			var i = !C(Object.assign) && !C(Array.from);
			this.ws && i ? (this.Is(t), Bo.info("starting")) : (this.bs = Lo, this.stopRecording());
		}
	}
	Is(t) {
		var e, i, r;
		this.ws && (this.bs !== No && this.bs !== jo && (this.bs = Uo), null != h && null != (e = h.__PosthogExtensions__) && null != (e = e.rrweb) && e.record && null != (i = h.__PosthogExtensions__) && i.initSessionRecording ? this.Cs(t) : null == (r = h.__PosthogExtensions__) || null == r.loadExternalDependency || r.loadExternalDependency(this._instance, this.Ss, ((e) => {
			if (e) return Bo.error("could not load recorder", e);
			this.Cs(t);
		})));
	}
	stopRecording() {
		var t, e;
		null == (t = this._s) || t.call(this), this._s = void 0, null == (e = this.ys) || e.stop();
	}
	xs() {
		var t, e;
		null == (t = this._s) || t.call(this), this._s = void 0, null == (e = this.ys) || e.discard();
	}
	ks() {
		var t;
		null == (t = this.ni) || t.unregister(ti);
	}
	Ts(t, e) {
		if (D(t)) return null;
		var i, r = L(t) ? t : parseFloat(t);
		return "number" != typeof (i = r) || !Number.isFinite(i) || 0 > i || i > 1 ? (Bo.warn(e + " must be between 0 and 1. Ignoring invalid value:", t), null) : r;
	}
	As(t) {
		if (this.ni) {
			var e, i, r = this.ni, s = () => {
				var e, i = !1 === t.sessionRecording ? void 0 : t.sessionRecording, s = this.Ts(null == (e = this.Bt.session_recording) ? void 0 : e.sampleRate, "session_recording.sampleRate"), n = this.Ts(null == i ? void 0 : i.sampleRate, "remote config sampleRate"), o = null != s ? s : n;
				D(o) && this.ks();
				var a = null == i ? void 0 : i.minimumDurationMilliseconds;
				r.register({ [Ye]: f({
					cache_timestamp: Date.now(),
					enabled: !!i
				}, i, {
					networkPayloadCapture: f({ capturePerformance: t.capturePerformance }, null == i ? void 0 : i.networkPayloadCapture),
					canvasRecording: {
						enabled: null == i ? void 0 : i.recordCanvas,
						fps: null == i ? void 0 : i.canvasFps,
						quality: null == i ? void 0 : i.canvasQuality
					},
					sampleRate: o,
					minimumDurationMilliseconds: C(a) ? null : a,
					endpoint: null == i ? void 0 : i.endpoint,
					triggerMatchType: null == i ? void 0 : i.triggerMatchType,
					masking: null == i ? void 0 : i.masking,
					urlTriggers: null == i ? void 0 : i.urlTriggers,
					version: null == i ? void 0 : i.version,
					triggerGroups: null == i ? void 0 : i.triggerGroups
				}) });
			};
			s(), null == (e = this._s) || e.call(this), this._s = null == (i = this._instance.sessionManager) ? void 0 : i.onSessionId(s);
		}
	}
	onRemoteConfig(t) {
		"sessionRecording" in t ? !1 === t.sessionRecording ? (this.As(t), this.xs()) : (this.As(t), this.startIfEnabledOrStop()) : (this.bs === No && (this.bs = jo, Bo.warn("config refresh failed, recording will not start until page reload")), this.startIfEnabledOrStop());
	}
	log(t, e) {
		var i;
		void 0 === e && (e = "log"), null != (i = this.ys) && i.log ? this.ys.log(t, e) : Bo.warn("log called before recorder was ready");
	}
	get Ss() {
		var t, e, i = null == (t = this._instance) || null == (t = t.persistence) ? void 0 : t.get_property(Ye);
		return (null == i || null == (e = i.scriptConfig) ? void 0 : e.script) || "lazy-recorder";
	}
	Es() {
		var t, e = this._instance.get_property(Ye);
		if (!e) return !1;
		var i = null !== (t = ("object" == typeof e ? e : JSON.parse(e)).cache_timestamp) && void 0 !== t ? t : Date.now();
		return 36e5 >= Date.now() - i;
	}
	Cs(t) {
		var e, i;
		if (null == (e = h.__PosthogExtensions__) || !e.initSessionRecording) return Bo.warn("Called on script loaded before session recording is available. This can be caused by adblockers."), void this._instance.register_for_session({ [Pi]: !0 });
		if (this.ys || (this.ys = null == (i = h.__PosthogExtensions__) ? void 0 : i.initSessionRecording(this._instance), this.ys._forceAllowLocalhostNetworkCapture = this._forceAllowLocalhostNetworkCapture), !this.Es()) {
			if (this.bs === jo || this.bs === No) return;
			this.bs = No, Bo.info("persisted remote config is stale, requesting fresh config before starting"), new vs(this._instance).load();
			return;
		}
		this.bs = Uo, this.ys.start(t);
	}
	onRRwebEmit(t) {
		var e;
		null == (e = this.ys) || null == e.onRRwebEmit || e.onRRwebEmit(t);
	}
	overrideLinkedFlag() {
		var t, e;
		this.ys || null == (e = this.ni) || e.register({ [Ke]: !0 }), null == (t = this.ys) || t.overrideLinkedFlag();
	}
	overrideSampling() {
		var t, e;
		this.ys || null == (e = this.ni) || e.register({ [Je]: !0 }), null == (t = this.ys) || t.overrideSampling();
	}
	overrideTrigger(t) {
		var e, i;
		this.ys || null == (i = this.ni) || i.register({ ["url" === t ? Xe : Qe]: !0 }), null == (e = this.ys) || e.overrideTrigger(t);
	}
	get sdkDebugProperties() {
		var t;
		return (null == (t = this.ys) ? void 0 : t.sdkDebugProperties) || { $recording_status: this.status };
	}
	tryAddCustomEvent(t, e) {
		var i;
		return !(null == (i = this.ys) || !i.tryAddCustomEvent(t, e));
	}
} }, ga = {
	autocapture: class {
		constructor(t) {
			this.Rs = !1, this.Ns = null, this.Ms = !1, this.instance = t, this.rageclicks = new To(t.config.rageclick), this.Fs = null;
		}
		initialize() {
			this.startIfEnabled();
		}
		get Bt() {
			var t, e, i = O(this.instance.config.autocapture) ? this.instance.config.autocapture : {};
			return i.url_allowlist = null == (t = i.url_allowlist) ? void 0 : t.map(((t) => new RegExp(t))), i.url_ignorelist = null == (e = i.url_ignorelist) ? void 0 : e.map(((t) => new RegExp(t))), i;
		}
		Os() {
			if (this.isBrowserSupported()) {
				if (t && r) {
					var e = (e) => {
						e = e || (null == t ? void 0 : t.event);
						try {
							this.Ps(e);
						} catch (t) {
							Ro.error("Failed to capture event", t);
						}
					};
					if (Xi(r, "submit", e, { capture: !0 }), Xi(r, "change", e, { capture: !0 }), Xi(r, "click", e, { capture: !0 }), this.Bt.capture_copied_text) {
						var i = (e) => {
							e = e || (null == t ? void 0 : t.event);
							try {
								this.Ps(e, ko);
							} catch (t) {
								Ro.error("Failed to capture copy/cut event", t);
							}
						};
						Xi(r, "copy", i, { capture: !0 }), Xi(r, "cut", i, { capture: !0 });
					}
				}
			} else Ro.info("Disabling Automatic Event Collection because this browser is not supported");
		}
		startIfEnabled() {
			this.isEnabled && !this.Rs && (this.Os(), this.Rs = !0);
		}
		onRemoteConfig(t) {
			t.elementsChainAsString && (this.Ms = t.elementsChainAsString), this.instance.persistence && this.instance.persistence.register({ [Ne]: !!t.autocapture_opt_out }), this.Ns = !!t.autocapture_opt_out, this.startIfEnabled();
		}
		setElementSelectors(t) {
			this.Fs = t;
		}
		getElementSelectors(t) {
			var e, i = [];
			return null == (e = this.Fs) || e.forEach(((e) => {
				(null == r ? void 0 : r.querySelectorAll(e))?.forEach(((r) => {
					t === r && i.push(e);
				}));
			})), i;
		}
		get isEnabled() {
			var t, e, i = null == (t = this.instance.persistence) ? void 0 : t.props[Ne];
			if (M(this.Ns) && !N(i) && !this.instance.Fr()) return !1;
			var r = null !== (e = this.Ns) && void 0 !== e ? e : !!i;
			return !!this.instance.config.autocapture && !r;
		}
		Ps(e, i) {
			if (void 0 === i && (i = "$autocapture"), this.isEnabled) {
				var r, s = so(e);
				Xn(s) && (s = s.parentNode || null), "$autocapture" === i && "click" === e.type && e instanceof MouseEvent && this.instance.config.rageclick && null != (r = this.rageclicks) && r.isRageClick(e.clientX, e.clientY, e.timeStamp || (/* @__PURE__ */ new Date()).getTime()) && function(e, i) {
					if (!t || ho(e)) return !1;
					var r, s, n;
					if (N(i) ? (r = !!i && uo, s = void 0) : (r = null !== (n = null == i ? void 0 : i.css_selector_ignorelist) && void 0 !== n ? n : uo, s = null == i ? void 0 : i.content_ignorelist), !1 === r) return !1;
					var { targetElementList: o } = vo(e, !1);
					return !function(t, e) {
						if (!1 === t || C(t)) return !1;
						var i;
						if (!0 === t) i = lo;
						else {
							if (!R(t)) return !1;
							if (t.length > 10) return Ie.error("[PostHog] content_ignorelist array cannot exceed 10 items. Use css_selector_ignorelist for more complex matching."), !1;
							i = t.map(((t) => t.toLowerCase()));
						}
						return e.some(((t) => {
							var { safeText: e, ariaLabel: r } = t;
							return i.some(((t) => e.includes(t) || r.includes(t)));
						}));
					}(s, o.map(((t) => {
						var e;
						return {
							safeText: ro(t).toLowerCase(),
							ariaLabel: (null == (e = t.getAttribute("aria-label")) ? void 0 : e.toLowerCase().trim()) || ""
						};
					}))) && !oo(o, r);
				}(s, this.instance.config.rageclick) && this.Ps(e, "$rageclick");
				var n = i === ko;
				if (s && function(e, i, r, s, n) {
					var o, a, l, u;
					if (void 0 === r && (r = void 0), !t || ho(e)) return !1;
					if (null != (o = r) && o.url_allowlist && !to(r.url_allowlist)) return !1;
					if (null != (a = r) && a.url_ignorelist && to(r.url_ignorelist)) return !1;
					if (null != (l = r) && l.dom_event_allowlist) {
						var h = r.dom_event_allowlist;
						if (h && !h.some(((t) => i.type === t))) return !1;
					}
					var { parentIsUsefulElement: d, targetElementList: v } = vo(e, s);
					if (!function(t, e) {
						var i = null == e ? void 0 : e.element_allowlist;
						if (C(i)) return !0;
						var r, s = function(t) {
							if (i.some(((e) => t.tagName.toLowerCase() === e))) return { v: !0 };
						};
						for (var n of t) if (r = s(n)) return r.v;
						return !1;
					}(v, r)) return !1;
					if (!oo(v, null == (u = r) ? void 0 : u.css_selector_allowlist)) return !1;
					var c = t.getComputedStyle(e);
					if (c && "pointer" === c.getPropertyValue("cursor") && "click" === i.type) return !0;
					var p = e.tagName.toLowerCase();
					switch (p) {
						case "html": return !1;
						case "form": return (n || ["submit"]).indexOf(i.type) >= 0;
						case "input":
						case "select":
						case "textarea": return (n || ["change", "click"]).indexOf(i.type) >= 0;
						default: return d ? (n || ["click"]).indexOf(i.type) >= 0 : (n || ["click"]).indexOf(i.type) >= 0 && (no.indexOf(p) > -1 || "true" === e.getAttribute("contenteditable"));
					}
				}(s, e, this.Bt, n, n ? ["copy", "cut"] : void 0)) {
					var { props: o, explicitNoCapture: a } = Io(s, {
						e,
						maskAllElementAttributes: this.instance.config.mask_all_element_attributes,
						maskAllText: this.instance.config.mask_all_text,
						elementAttributeIgnoreList: this.Bt.element_attribute_ignorelist,
						elementsChainAsString: this.Ms
					});
					if (a) return !1;
					var l = this.getElementSelectors(s);
					if (l && l.length > 0 && (o.$element_selectors = l), i === ko) {
						var u, h = io(null == t || null == (u = t.getSelection()) ? void 0 : u.toString()), d = e.type || "clipboard";
						if (!h) return !1;
						o.$selected_content = h, o.$copy_type = d;
					}
					return this.instance.capture(i, o), !0;
				}
			}
		}
		isBrowserSupported() {
			return P(null == r ? void 0 : r.querySelectorAll);
		}
	},
	historyAutocapture: class {
		constructor(e) {
			var i;
			this._instance = e, this.Ls = (null == t || null == (i = t.location) ? void 0 : i.pathname) || "";
		}
		initialize() {
			this.startIfEnabled();
		}
		get isEnabled() {
			return "history_change" === this._instance.config.capture_pageview;
		}
		startIfEnabled() {
			this.isEnabled && (Ie.info("History API monitoring enabled, starting..."), this.monitorHistoryChanges());
		}
		stop() {
			this.Ds && this.Ds(), this.Ds = void 0, Ie.info("History API monitoring stopped");
		}
		monitorHistoryChanges() {
			var e, i;
			if (t && t.history) {
				var r = this;
				null != (e = t.history.pushState) && e.__posthog_wrapped__ || Fo(t.history, "pushState", ((t) => function(e, i, s) {
					t.call(this, e, i, s), r.Bs("pushState");
				})), null != (i = t.history.replaceState) && i.__posthog_wrapped__ || Fo(t.history, "replaceState", ((t) => function(e, i, s) {
					t.call(this, e, i, s), r.Bs("replaceState");
				})), this.js();
			}
		}
		Bs(e) {
			try {
				var i, r = null == t || null == (i = t.location) ? void 0 : i.pathname;
				if (!r) return;
				r !== this.Ls && this.isEnabled && this._instance.capture(Ui, { navigation_type: e }), this.Ls = r;
			} catch (t) {
				Ie.error("Error capturing " + e + " pageview", t);
			}
		}
		js() {
			if (!this.Ds) {
				var e = () => {
					this.Bs("popstate");
				};
				Xi(t, "popstate", e), this.Ds = () => {
					t && t.removeEventListener("popstate", e);
				};
			}
		}
	},
	heatmaps: class {
		get Bt() {
			return this.instance.config;
		}
		constructor(t) {
			var e;
			this.$s = !1, this.Rs = !1, this.qs = null, this.instance = t, this.$s = !(null == (e = this.instance.persistence) || !e.props[je]), this.rageclicks = new To(t.config.rageclick);
		}
		initialize() {
			this.startIfEnabled();
		}
		get flushIntervalMilliseconds() {
			var t = 5e3;
			return O(this.Bt.capture_heatmaps) && this.Bt.capture_heatmaps.flush_interval_milliseconds && (t = this.Bt.capture_heatmaps.flush_interval_milliseconds), t;
		}
		get isEnabled() {
			return D(this.Bt.capture_heatmaps) ? D(this.Bt.enable_heatmaps) ? this.$s : this.Bt.enable_heatmaps : !1 !== this.Bt.capture_heatmaps;
		}
		startIfEnabled() {
			if (this.isEnabled) {
				if (this.Rs) return;
				Ho.info("starting..."), this.Zs(), this.Ft();
			} else {
				var t;
				clearInterval(null !== (t = this.qs) && void 0 !== t ? t : void 0), this.Vs(), this.getAndClearBuffer();
			}
		}
		onRemoteConfig(t) {
			if ("heatmaps" in t) {
				var e = !!t.heatmaps;
				this.instance.persistence && this.instance.persistence.register({ [je]: e }), this.$s = e, this.startIfEnabled();
			}
		}
		getAndClearBuffer() {
			var t = this.T;
			return this.T = void 0, t;
		}
		Hs(t) {
			this.Tt(t.originalEvent, "deadclick");
		}
		Ft() {
			this.qs && clearInterval(this.qs), this.qs = "visible" === (null == r ? void 0 : r.visibilityState) ? setInterval(this.Yr.bind(this), this.flushIntervalMilliseconds) : null;
		}
		Zs() {
			t && r && (this.zs = this.Yr.bind(this), Xi(t, Li, this.zs), this.Us = (e) => this.Tt(e || (null == t ? void 0 : t.event)), Xi(r, "click", this.Us, { capture: !0 }), this.Ys = (e) => this.Gs(e || (null == t ? void 0 : t.event)), Xi(r, "mousemove", this.Ys, { capture: !0 }), this.Ws = new yr(this.instance, mr, this.Hs.bind(this)), this.Ws.startIfEnabledOrStop(), this.Xs = this.Ft.bind(this), Xi(r, Di, this.Xs), this.Rs = !0);
		}
		Vs() {
			var e;
			t && r && (this.zs && t.removeEventListener(Li, this.zs), this.Us && r.removeEventListener("click", this.Us, { capture: !0 }), this.Ys && r.removeEventListener("mousemove", this.Ys, { capture: !0 }), this.Xs && r.removeEventListener(Di, this.Xs), clearTimeout(this.Js), null == (e = this.Ws) || e.stop(), this.Rs = !1);
		}
		Ks(e, i) {
			var r = this.instance.scrollManager.scrollY(), s = this.instance.scrollManager.scrollX(), n = this.instance.scrollManager.scrollElement(), o = function(e, i, r) {
				for (var s = e; s && Jn(s) && !Kn(s, "body");) {
					if (s === r) return !1;
					if (w(i, null == t ? void 0 : t.getComputedStyle(s).position)) return !0;
					s = ao(s);
				}
				return !1;
			}(so(e), ["fixed", "sticky"], n);
			return {
				x: e.clientX + (o ? 0 : s),
				y: e.clientY + (o ? 0 : r),
				target_fixed: o,
				type: i
			};
		}
		Tt(t, e) {
			var i;
			if (void 0 === e && (e = "click"), !Yn(t.target) && qo(t)) {
				var r = this.Ks(t, e);
				null != (i = this.rageclicks) && i.isRageClick(t.clientX, t.clientY, (/* @__PURE__ */ new Date()).getTime()) && this.Qs(f({}, r, { type: "rageclick" })), this.Qs(r);
			}
		}
		Gs(t) {
			!Yn(t.target) && qo(t) && (clearTimeout(this.Js), this.Js = setTimeout((() => {
				this.Qs(this.Ks(t, "mousemove"));
			}), 500));
		}
		Qs(e) {
			if (t) {
				var i = t.location.href, r = this.Bt.custom_personal_data_properties, n = Or(i, this.Bt.mask_personal_data_properties ? [...Fr, ...r || []] : [], Mr);
				this.T = this.T || {}, this.T[n] || (this.T[n] = []), this.T[n].push(e);
			}
		}
		Yr() {
			this.T && !I(this.T) && this.instance.capture("$$heatmap", { $heatmap_data: this.getAndClearBuffer() });
		}
	},
	deadClicksAutocapture: yr,
	webVitalsAutocapture: class {
		constructor(t) {
			var e;
			this.$s = !1, this.Rs = !1, this.T = {
				url: void 0,
				metrics: [],
				firstMetricTimestamp: void 0
			}, this.eo = () => {
				clearTimeout(this.ro), 0 !== this.T.metrics.length && (this._instance.capture("$web_vitals", this.T.metrics.reduce(((t, e) => f({}, t, {
					["$web_vitals_" + e.name + "_event"]: f({}, e),
					["$web_vitals_" + e.name + "_value"]: e.value
				})), {})), this.T = {
					url: void 0,
					metrics: [],
					firstMetricTimestamp: void 0
				});
			}, this.ht = (t) => {
				var e, i = null == (e = this._instance.sessionManager) ? void 0 : e.checkAndGetSessionAndWindowId(!0);
				if (C(i)) Mo.error("Could not read session ID. Dropping metrics!");
				else {
					this.T = this.T || {
						url: void 0,
						metrics: [],
						firstMetricTimestamp: void 0
					};
					var r = this.io();
					C(r) || (D(null == t ? void 0 : t.name) || D(null == t ? void 0 : t.value) ? Mo.error("Invalid metric received", t) : !this.no || this.no > t.value ? (this.T.url !== r && (this.eo(), this.ro = setTimeout(this.eo, this.flushToCaptureTimeoutMs)), C(this.T.url) && (this.T.url = r), this.T.firstMetricTimestamp = C(this.T.firstMetricTimestamp) ? Date.now() : this.T.firstMetricTimestamp, t.attribution && t.attribution.interactionTargetElement && (t.attribution.interactionTargetElement = void 0), this.T.metrics.push(f({}, t, {
						$current_url: r,
						$session_id: i.sessionId,
						$window_id: i.windowId,
						timestamp: Date.now()
					})), this.T.metrics.length === this.allowedMetrics.length && this.eo()) : Mo.error("Ignoring metric with value >= " + this.no, t));
				}
			}, this.so = () => {
				if (!this.Rs) {
					var t, e, i, r, s = h.__PosthogExtensions__;
					C(s) || C(s.postHogWebVitalsCallbacks) || ({onLCP: t, onCLS: e, onFCP: i, onINP: r} = s.postHogWebVitalsCallbacks), t && e && i && r ? (this.allowedMetrics.indexOf("LCP") > -1 && t(this.ht.bind(this)), this.allowedMetrics.indexOf("CLS") > -1 && e(this.ht.bind(this)), this.allowedMetrics.indexOf("FCP") > -1 && i(this.ht.bind(this)), this.allowedMetrics.indexOf("INP") > -1 && r(this.ht.bind(this)), this.Rs = !0) : Mo.error("web vitals callbacks not loaded - not starting");
				}
			}, this._instance = t, this.$s = !(null == (e = this._instance.persistence) || !e.props[qe]), this.startIfEnabled();
		}
		get oo() {
			return this._instance.config.capture_performance;
		}
		get allowedMetrics() {
			var t, e, i = O(this.oo) ? null == (t = this.oo) ? void 0 : t.web_vitals_allowed_metrics : void 0;
			return D(i) ? (null == (e = this._instance.persistence) ? void 0 : e.props[Ge]) || [
				"CLS",
				"FCP",
				"INP",
				"LCP"
			] : i;
		}
		get flushToCaptureTimeoutMs() {
			return (O(this.oo) ? this.oo.web_vitals_delayed_flush_ms : void 0) || 5e3;
		}
		get useAttribution() {
			var t = O(this.oo) ? this.oo.web_vitals_attribution : void 0;
			return null != t && t;
		}
		get no() {
			var t = O(this.oo) && L(this.oo.__web_vitals_max_value) ? this.oo.__web_vitals_max_value : Do;
			return t > 0 && 6e4 >= t ? Do : t;
		}
		get isEnabled() {
			var t = null == s ? void 0 : s.protocol;
			if ("http:" !== t && "https:" !== t) return Mo.info("Web Vitals are disabled on non-http/https protocols"), !1;
			var e = O(this.oo) ? this.oo.web_vitals : N(this.oo) ? this.oo : void 0;
			return N(e) ? e : this.$s;
		}
		startIfEnabled() {
			this.isEnabled && !this.Rs && (Mo.info("enabled, starting..."), this.ur(this.so));
		}
		onRemoteConfig(t) {
			if ("capturePerformance" in t) {
				var e = O(t.capturePerformance) && !!t.capturePerformance.web_vitals, i = O(t.capturePerformance) ? t.capturePerformance.web_vitals_allowed_metrics : void 0;
				this._instance.persistence && (this._instance.persistence.register({ [qe]: e }), this._instance.persistence.register({ [Ge]: i })), this.$s = e, this.startIfEnabled();
			}
		}
		ur(t) {
			var e, i;
			null != (e = h.__PosthogExtensions__) && e.postHogWebVitalsCallbacks ? t() : null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, this.useAttribution ? "web-vitals-with-attribution" : "web-vitals", ((e) => {
				e ? Mo.error("failed to load script", e) : t();
			}));
		}
		io() {
			var e = t ? t.location.href : void 0;
			if (e) {
				var i = this._instance.config.custom_personal_data_properties;
				return Or(e, this._instance.config.mask_personal_data_properties ? [...Fr, ...i || []] : [], Mr);
			}
			Mo.error("Could not determine current URL");
		}
	}
}, ma = {
	exceptionObserver: class {
		constructor(e) {
			var i, r, s;
			this.so = () => {
				var e;
				if (t && this.isEnabled && null != (e = h.__PosthogExtensions__) && e.errorWrappingFunctions) {
					var i = h.__PosthogExtensions__.errorWrappingFunctions.wrapOnError, r = h.__PosthogExtensions__.errorWrappingFunctions.wrapUnhandledRejection, s = h.__PosthogExtensions__.errorWrappingFunctions.wrapConsoleError;
					try {
						!this.ao && this.Bt.capture_unhandled_errors && (this.ao = i(this.captureException.bind(this))), !this.lo && this.Bt.capture_unhandled_rejections && (this.lo = r(this.captureException.bind(this))), !this.uo && this.Bt.capture_console_errors && (this.uo = s(this.captureException.bind(this)));
					} catch (t) {
						Co.error("failed to start", t), this.ho();
					}
				}
			}, this._instance = e, this.co = !(null == (i = this._instance.persistence) || !i.props[ze]), this.do = new J({
				refillRate: null !== (r = this._instance.config.error_tracking.__exceptionRateLimiterRefillRate) && void 0 !== r ? r : 1,
				bucketSize: null !== (s = this._instance.config.error_tracking.__exceptionRateLimiterBucketSize) && void 0 !== s ? s : 10,
				refillInterval: 1e4,
				Gt: Co
			}), this.Bt = this.vo(), this.startIfEnabledOrStop();
		}
		vo() {
			var t = this._instance.config.capture_exceptions, e = {
				capture_unhandled_errors: !1,
				capture_unhandled_rejections: !1,
				capture_console_errors: !1
			};
			return O(t) ? e = f({}, e, t) : (C(t) ? this.co : t) && (e = f({}, e, {
				capture_unhandled_errors: !0,
				capture_unhandled_rejections: !0
			})), e;
		}
		get isEnabled() {
			return this.Bt.capture_console_errors || this.Bt.capture_unhandled_errors || this.Bt.capture_unhandled_rejections;
		}
		startIfEnabledOrStop() {
			this.isEnabled ? (Co.info("enabled"), this.ho(), this.ur(this.so)) : this.ho();
		}
		ur(t) {
			var e, i;
			null != (e = h.__PosthogExtensions__) && e.errorWrappingFunctions && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "exception-autocapture", ((e) => {
				if (e) return Co.error("failed to load script", e);
				t();
			}));
		}
		ho() {
			var t, e, i;
			null == (t = this.ao) || t.call(this), this.ao = void 0, null == (e = this.lo) || e.call(this), this.lo = void 0, null == (i = this.uo) || i.call(this), this.uo = void 0;
		}
		onRemoteConfig(t) {
			"autocaptureExceptions" in t && (this.co = !!t.autocaptureExceptions || !1, this._instance.persistence && this._instance.persistence.register({ [ze]: this.co }), this.Bt = this.vo(), this.startIfEnabledOrStop());
		}
		onConfigChange() {
			this.Bt = this.vo();
		}
		captureException(t) {
			var e, i, r, s = null !== (e = null == t || null == (i = t.$exception_list) || null == (i = i[0]) ? void 0 : i.type) && void 0 !== e ? e : "Exception";
			this.do.consumeRateLimit(s) ? Co.info("Skipping exception capture because of client rate limiting.", { exception: s }) : null == (r = this._instance.exceptions) || r.sendExceptionEvent(t);
		}
	},
	exceptions: class {
		constructor(t) {
			var e, i;
			this.fo = [], this.po = new te([
				new ve(),
				new xe(),
				new pe(),
				new ce(),
				new ye(),
				new be(),
				new _e(),
				new we()
			], function(t) {
				for (var e = arguments.length, i = new Array(e > 1 ? e - 1 : 0), r = 1; e > r; r++) i[r - 1] = arguments[r];
				return function(e, r) {
					void 0 === r && (r = 0);
					for (var s = [], n = e.split("\n"), o = r; n.length > o; o++) {
						var a = n[o];
						if (1024 >= a.length) {
							var l = de.test(a) ? a.replace(de, "$1") : a;
							if (!l.match(/\S*Error: /)) {
								for (var u of i) {
									var h = u(l, t);
									if (h) {
										s.push(h);
										break;
									}
								}
								if (s.length >= 50) break;
							}
						}
					}
					return function(t) {
						if (!t.length) return [];
						var e = Array.from(t);
						return e.reverse(), e.slice(0, 50).map(((t) => {
							return f({}, t, {
								filename: t.filename || (i = e, i[i.length - 1] || {}).filename,
								function: t.function || ee
							});
							var i;
						}));
					}(s);
				};
			}("web:javascript", ae, he)), this._instance = t, this.fo = null !== (e = null == (i = this._instance.persistence) ? void 0 : i.get_property(Be)) && void 0 !== e ? e : [], this.mo = ke(this.yo()), this.bo = new Re(this.mo);
		}
		onConfigChange() {
			this.mo = ke(this.yo()), this.bo.setConfig(this.mo);
		}
		onRemoteConfig(t) {
			var e, i, r;
			if ("errorTracking" in t) {
				var s = null !== (e = null == (i = t.errorTracking) ? void 0 : i.suppressionRules) && void 0 !== e ? e : [], n = null == (r = t.errorTracking) ? void 0 : r.captureExtensionExceptions;
				this.fo = s, this._instance.persistence && this._instance.persistence.register({
					[Be]: this.fo,
					[He]: n
				});
			}
		}
		get _o() {
			var t, e = !!this._instance.get_property(He), i = this._instance.config.error_tracking.captureExtensionExceptions;
			return null !== (t = null != i ? i : e) && void 0 !== t && t;
		}
		buildProperties(t, e) {
			return this.po.buildFromUnknown(t, {
				syntheticException: null == e ? void 0 : e.syntheticException,
				mechanism: { handled: null == e ? void 0 : e.handled }
			});
		}
		addExceptionStep(t, e) {
			if (this.mo.enabled) try {
				if (!F(t) || 0 === t.trim().length) return void ua.warn("Ignoring exception step because message must be a non-empty string");
				var { sanitizedProperties: r, droppedKeys: s } = function(t) {
					if (!t) return {
						sanitizedProperties: {},
						droppedKeys: []
					};
					var e = [];
					return {
						sanitizedProperties: Object.keys(t).reduce(((i, r) => $e.has(r) ? (e.push(r), i) : (i[r] = t[r], i)), {}),
						droppedKeys: e
					};
				}(this.wo(e));
				s.length > 0 && ua.warn("Ignoring reserved exception step fields", { droppedKeys: s }), this.bo.add(f({
					[Ee]: t,
					[Se]: (/* @__PURE__ */ new Date()).toISOString()
				}, r));
			} catch (t) {
				ua.error("Failed to add exception step. Ignoring breadcrumb.", t);
			}
		}
		sendExceptionEvent(t) {
			try {
				var e = t.$exception_list;
				if (this.Io(e)) {
					if (this.Co(e)) return this.So("Exception dropped: matched a suppression rule"), void ua.info("Skipping exception capture because a suppression rule matched");
					if (!this._o && this.xo(e)) return this.So("Exception dropped: thrown by a browser extension"), void ua.info("Skipping exception capture because it was thrown by an extension");
					if (!this._instance.config.error_tracking.__capturePostHogExceptions && this.ko(e)) return this.So("Exception dropped: thrown by the PostHog SDK"), void ua.info("Skipping exception capture because it was thrown by the PostHog SDK");
				}
				var i = this.mo.enabled && D(t.$exception_steps) ? this.To(t) : t;
				try {
					var r = this._instance.capture("$exception", i, {
						_noTruncate: !0,
						_batchKey: "exceptionEvent",
						en: !0
					});
					return r && this.bo.clear(), r;
				} catch (t) {
					ua.error("Failed to capture exception event. Dropping this exception.", t), this.bo.clear();
					return;
				}
			} catch (t) {
				ua.error("Failed to process exception event. Ignoring this exception.", t);
				return;
			}
		}
		To(t) {
			try {
				var e = this.bo.getAttachable();
				return 0 === e.length ? t : f({}, t, { $exception_steps: e });
			} catch (e) {
				return ua.error("Failed to read buffered exception steps. Capturing exception without steps.", e), t;
			}
		}
		So(t) {
			this.mo.enabled && this.bo.add({
				[Ee]: t,
				[Se]: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		wo(t) {
			return O(t) ? f({}, t) : {};
		}
		yo() {
			var t, e;
			return null !== (t = null == (e = this._instance.config.error_tracking) ? void 0 : e.exception_steps) && void 0 !== t ? t : {};
		}
		Co(t) {
			if (0 === t.length) return !1;
			var e = t.reduce(((t, e) => {
				var { type: i, value: r } = e;
				return F(i) && i.length > 0 && t.$exception_types.push(i), F(r) && r.length > 0 && t.$exception_values.push(r), t;
			}), {
				$exception_types: [],
				$exception_values: []
			});
			return this.fo.some(((t) => {
				var i = t.values.map(((t) => {
					var i, r = _n[t.operator], s = R(t.value) ? t.value : [t.value], n = null !== (i = e[t.key]) && void 0 !== i ? i : [];
					return s.length > 0 && r(s, n);
				}));
				return "OR" === t.type ? i.some(Boolean) : i.every(Boolean);
			}));
		}
		xo(t) {
			return t.flatMap(((t) => {
				var e, i;
				return null !== (e = null == (i = t.stacktrace) ? void 0 : i.frames) && void 0 !== e ? e : [];
			})).some(((t) => t.filename && t.filename.startsWith("chrome-extension://")));
		}
		ko(t) {
			if (t.length > 0) {
				var e, i, r, s, n = null !== (e = null == (i = t[0].stacktrace) ? void 0 : i.frames) && void 0 !== e ? e : [], o = n[n.length - 1];
				return null !== (r = null == o || null == (s = o.filename) ? void 0 : s.includes("posthog.com/static")) && void 0 !== r && r;
			}
			return !1;
		}
		Io(t) {
			return !D(t) && R(t);
		}
	}
}, ba = f({ productTours: class {
	get ni() {
		return this._instance.persistence;
	}
	constructor(t) {
		this.Ao = null, this.Eo = null, this._instance = t;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		"productTours" in t && (this.ni && this.ni.register({ [We]: !!t.productTours }), this.loadIfEnabled());
	}
	loadIfEnabled() {
		var t, e;
		this.Ao || (t = this._instance).config.disable_product_tours || null == (e = t.persistence) || !e.get_property(We) || this.ur((() => this.Ro()));
	}
	ur(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.generateProductTours ? t() : null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "product-tours", ((e) => {
			e ? Vo.error("Could not load product tours script", e) : t();
		}));
	}
	Ro() {
		var t;
		!this.Ao && null != (t = h.__PosthogExtensions__) && t.generateProductTours && (this.Ao = h.__PosthogExtensions__.generateProductTours(this._instance, !0));
	}
	getProductTours(t, e) {
		if (void 0 === e && (e = !1), !R(this.Eo) || e) {
			var i = this.ni;
			if (i) {
				var r = i.props[ci];
				if (R(r) && !e) return this.Eo = r, void t(r, { isLoaded: !0 });
			}
			this._instance._send_request({
				url: this._instance.requestRouter.endpointFor("api", "/api/product_tours/?token=" + this._instance.config.token),
				method: "GET",
				callback: (e) => {
					var r = e.statusCode;
					if (200 !== r || !e.json) {
						var s = "Product Tours API could not be loaded, status: " + r;
						Vo.error(s), t([], {
							isLoaded: !1,
							error: s
						});
						return;
					}
					var n = R(e.json.product_tours) ? e.json.product_tours : [];
					this.Eo = n, i && i.register({ [ci]: n }), t(n, { isLoaded: !0 });
				}
			});
		} else t(this.Eo, { isLoaded: !0 });
	}
	getActiveProductTours(t) {
		D(this.Ao) ? t([], {
			isLoaded: !1,
			error: "Product tours not loaded"
		}) : this.Ao.getActiveProductTours(t);
	}
	showProductTour(t) {
		var e;
		null == (e = this.Ao) || e.showTourById(t);
	}
	previewTour(t) {
		this.Ao ? this.Ao.previewTour(t) : this.ur((() => {
			var e;
			this.Ro(), null == (e = this.Ao) || e.previewTour(t);
		}));
	}
	dismissProductTour() {
		var t;
		null == (t = this.Ao) || t.dismissTour("user_clicked_skip");
	}
	nextStep() {
		var t;
		null == (t = this.Ao) || t.nextStep();
	}
	previousStep() {
		var t;
		null == (t = this.Ao) || t.previousStep();
	}
	clearCache() {
		var t;
		this.Eo = null, null == (t = this.ni) || t.unregister(ci);
	}
	resetTour(t) {
		var e;
		null == (e = this.Ao) || e.resetTour(t);
	}
	resetAllTours() {
		var t;
		null == (t = this.Ao) || t.resetAllTours();
	}
	cancelPendingTour(t) {
		var e;
		null == (e = this.Ao) || e.cancelPendingTour(t);
	}
} }, fa), ya = { siteApps: class {
	constructor(t) {
		this._instance = t, this.No = [], this.apps = {};
	}
	get isEnabled() {
		return !!this._instance.config.opt_in_site_apps;
	}
	Mo(t, e) {
		if (e) {
			var i = this.globalsForEvent(e);
			this.No.push(i), this.No.length > 1e3 && (this.No = this.No.slice(10));
		}
	}
	get siteAppLoaders() {
		var t;
		return null == (t = h._POSTHOG_REMOTE_CONFIG) || null == (t = t[this._instance.config.token]) ? void 0 : t.siteApps;
	}
	initialize() {
		if (this.isEnabled) {
			var t = this._instance._addCaptureHook(this.Mo.bind(this));
			this.Fo = () => {
				t(), this.No = [], this.Fo = void 0;
			};
		}
	}
	globalsForEvent(t) {
		var e, i, r, s, n, o, a;
		if (!t) throw new Error("Event payload is required");
		var l = {}, u = this._instance.get_property("$groups") || [], h = this._instance.get_property("$stored_group_properties") || {};
		for (var [d, v] of Object.entries(h)) l[d] = {
			id: u[d],
			type: d,
			properties: v
		};
		var { $set_once: c, $set: p } = t;
		return {
			event: f({}, _(t, Wo), {
				properties: f({}, t.properties, p ? { $set: f({}, null !== (e = null == (i = t.properties) ? void 0 : i.$set) && void 0 !== e ? e : {}, p) } : {}, c ? { $set_once: f({}, null !== (r = null == (s = t.properties) ? void 0 : s.$set_once) && void 0 !== r ? r : {}, c) } : {}),
				elements_chain: null !== (n = null == (o = t.properties) ? void 0 : o.$elements_chain) && void 0 !== n ? n : "",
				distinct_id: null == (a = t.properties) ? void 0 : a.distinct_id
			}),
			person: { properties: this._instance.get_property("$stored_person_properties") },
			groups: l
		};
	}
	setupSiteApp(t) {
		var e = this.apps[t.id], i = () => {
			var i;
			!e.errored && this.No.length && (Go.info("Processing " + this.No.length + " events for site app with id " + t.id), this.No.forEach(((t) => null == e.processEvent ? void 0 : e.processEvent(t))), e.processedBuffer = !0), Object.values(this.apps).every(((t) => t.processedBuffer || t.errored)) && (null == (i = this.Fo) || i.call(this));
		}, r = !1, s = (s) => {
			e.errored = !s, e.loaded = !0, Go.info("Site app with id " + t.id + " " + (s ? "loaded" : "errored")), r && i();
		};
		try {
			var { processEvent: n } = t.init({
				posthog: this._instance,
				callback(t) {
					s(t);
				}
			});
			n && (e.processEvent = n), r = !0;
		} catch (e) {
			Go.error(Yo + t.id, e), s(!1);
		}
		if (r && e.loaded) try {
			i();
		} catch (i) {
			Go.error("Error while processing buffered events PostHog app with config id " + t.id, i), e.errored = !0;
		}
	}
	Oo() {
		var t = this.siteAppLoaders || [];
		for (var e of t) this.apps[e.id] = {
			id: e.id,
			loaded: !1,
			errored: !1,
			processedBuffer: !1
		};
		for (var i of t) this.setupSiteApp(i);
	}
	Po(t) {
		if (0 !== Object.keys(this.apps).length) {
			var e = this.globalsForEvent(t);
			for (var i of Object.values(this.apps)) try {
				null == i.processEvent || i.processEvent(e);
			} catch (e) {
				Go.error("Error while processing event " + t.event + " for site app " + i.id, e);
			}
		}
	}
	onRemoteConfig(t) {
		var e, i, r, s = this;
		if (null != (e = this.siteAppLoaders) && e.length) return this.isEnabled ? (this.Oo(), void this._instance.on("eventCaptured", ((t) => this.Po(t)))) : void Go.error("PostHog site apps are disabled. Enable the \"opt_in_site_apps\" config to proceed.");
		if (null == (i = this.Fo) || i.call(this), null != (r = t.siteApps) && r.length) if (this.isEnabled) {
			var n = function(t) {
				var e;
				h["__$$ph_site_app_" + t] = s._instance, null == (e = h.__PosthogExtensions__) || null == e.loadSiteApp || e.loadSiteApp(s._instance, a, ((e) => {
					if (e) return Go.error(Yo + t, e);
				}));
			};
			for (var { id: o, url: a } of t.siteApps) n(o);
		} else Go.error("PostHog site apps are disabled. Enable the \"opt_in_site_apps\" config to proceed.");
	}
} }, wa = { tracingHeaders: class {
	constructor(t) {
		this.Lo = void 0, this.Do = void 0, this.so = () => {
			var t, e, i = this.Bo() || [];
			C(this.Lo) && (null == (t = h.__PosthogExtensions__) || null == (t = t.tracingHeadersPatchFns) || t._patchXHR(i, this._instance.get_distinct_id(), this._instance.sessionManager)), C(this.Do) && (null == (e = h.__PosthogExtensions__) || null == (e = e.tracingHeadersPatchFns) || e._patchFetch(i, this._instance.get_distinct_id(), this._instance.sessionManager));
		}, this._instance = t;
	}
	initialize() {
		this.startIfEnabledOrStop();
	}
	ur(t) {
		var e, i;
		null != (e = h.__PosthogExtensions__) && e.tracingHeadersPatchFns && t(), null == (i = h.__PosthogExtensions__) || null == i.loadExternalDependency || i.loadExternalDependency(this._instance, "tracing-headers", ((e) => {
			if (e) return Ao.error("failed to load script", e);
			t();
		}));
	}
	Bo() {
		var t;
		return null !== (t = this._instance.config.addTracingHeaders) && void 0 !== t ? t : this._instance.config.__add_tracing_headers;
	}
	startIfEnabledOrStop() {
		var t, e;
		this.Bo() ? this.ur(this.so) : (null == (t = this.Lo) || t.call(this), null == (e = this.Do) || e.call(this), this.Lo = void 0, this.Do = void 0);
	}
} }, xa = f({ surveys: class {
	get Bt() {
		return this._instance.config;
	}
	constructor(t) {
		this.jo = void 0, this._surveyManager = null, this.$o = !1, this.qo = [], this.Zo = null, this._instance = t, this._surveyEventReceiver = null;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		if (!this.Bt.disable_surveys) {
			var e = t.surveys;
			if (D(e)) return En.warn("Flags not loaded yet. Not loading surveys.");
			var i = R(e);
			this.jo = i ? e.length > 0 : e, En.info("flags response received, isSurveysEnabled: " + this.jo), this.loadIfEnabled();
		}
	}
	reset() {
		localStorage.removeItem("lastSeenSurveyDate");
		for (var t = [], e = 0; e < localStorage.length; e++) {
			var i = localStorage.key(e);
			(null != i && i.startsWith(Sn) || null != i && i.startsWith("inProgressSurvey_")) && t.push(i);
		}
		t.forEach(((t) => localStorage.removeItem(t)));
	}
	loadIfEnabled() {
		if (!this._surveyManager) if (this.$o) En.info("Already initializing surveys, skipping...");
		else if (this.Bt.disable_surveys) En.info(ta);
		else if (this.Bt.cookieless_mode && this._instance.consent.isOptedOut()) En.info("Not loading surveys in cookieless mode without consent.");
		else {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t) {
				if (!C(this.jo) || this.Bt.advanced_enable_surveys) {
					var e = this.jo || this.Bt.advanced_enable_surveys;
					this.$o = !0;
					try {
						var i = t.generateSurveys;
						if (i) return void this.Vo(i, e);
						var r = t.loadExternalDependency;
						if (!r) return void this.Ho(Oi);
						r(this._instance, "surveys", ((i) => {
							i || !t.generateSurveys ? this.Ho("Could not load surveys script", i) : this.Vo(t.generateSurveys, e);
						}));
					} catch (t) {
						throw this.Ho("Error initializing surveys", t), t;
					} finally {
						this.$o = !1;
					}
				}
			} else En.error("PostHog Extensions not found.");
		}
	}
	Vo(t, e) {
		this._surveyManager = t(this._instance, e), this._surveyEventReceiver = new Qo(this._instance), En.info("Surveys loaded successfully"), this.zo({ isLoaded: !0 });
	}
	Ho(t, e) {
		En.error(t, e), this.zo({
			isLoaded: !1,
			error: t
		});
	}
	onSurveysLoaded(t) {
		return this.qo.push(t), this._surveyManager && this.zo({ isLoaded: !0 }), () => {
			this.qo = this.qo.filter(((e) => e !== t));
		};
	}
	getSurveys(t, e) {
		if (void 0 === e && (e = !1), this.Bt.disable_surveys) return En.info(ta), t([]);
		var i, r = this._instance.get_property(di);
		if (r && !e) return t(r, { isLoaded: !0 });
		"undefined" != typeof Promise && this.Zo ? this.Zo.then(((e) => {
			var { surveys: i, context: r } = e;
			return t(i, r);
		})) : ("undefined" != typeof Promise && (this.Zo = new Promise(((t) => {
			i = t;
		}))), this._instance._send_request({
			url: this._instance.requestRouter.endpointFor("api", "/api/surveys/?token=" + this.Bt.token),
			method: "GET",
			timeout: this.Bt.surveys_request_timeout_ms,
			callback: (e) => {
				var r;
				this.Zo = null;
				var s = e.statusCode;
				if (200 !== s || !e.json) {
					var n = "Surveys API could not be loaded, status: " + s;
					En.error(n);
					var o = {
						isLoaded: !1,
						error: n
					};
					t([], o), i?.({
						surveys: [],
						context: o
					});
					return;
				}
				var a, l = e.json.surveys || [], u = l.filter(((t) => function(t) {
					return !(!t.start_date || t.end_date);
				}(t) && (function(t) {
					var e;
					return !(null == (e = t.conditions) || null == (e = e.events) || null == (e = e.values) || !e.length);
				}(t) || function(t) {
					var e;
					return !(null == (e = t.conditions) || null == (e = e.actions) || null == (e = e.values) || !e.length);
				}(t))));
				u.length > 0 && (null == (a = this._surveyEventReceiver) || a.register(u)), null == (r = this._instance.persistence) || r.register({ [di]: l });
				var h = { isLoaded: !0 };
				t(l, h), i?.({
					surveys: l,
					context: h
				});
			}
		}));
	}
	zo(t) {
		for (var e of this.qo) try {
			if (!t.isLoaded) return e([], t);
			this.getSurveys(e);
		} catch (t) {
			En.error("Error in survey callback", t);
		}
	}
	getActiveMatchingSurveys(t, e) {
		if (void 0 === e && (e = !1), !D(this._surveyManager)) return this._surveyManager.getActiveMatchingSurveys(t, e);
		En.warn("init was not called");
	}
	Uo(t) {
		var e = null;
		return this.getSurveys(((i) => {
			var r;
			e = null !== (r = i.find(((e) => e.id === t))) && void 0 !== r ? r : null;
		})), e;
	}
	Yo(t) {
		if (D(this._surveyManager)) return {
			eligible: !1,
			reason: Zo
		};
		var e = "string" == typeof t ? this.Uo(t) : t;
		return e ? this._surveyManager.checkSurveyEligibility(e) : {
			eligible: !1,
			reason: "Survey not found"
		};
	}
	canRenderSurvey(t) {
		if (D(this._surveyManager)) return En.warn("init was not called"), {
			visible: !1,
			disabledReason: Zo
		};
		var e = this.Yo(t);
		return {
			visible: e.eligible,
			disabledReason: e.reason
		};
	}
	canRenderSurveyAsync(t, e) {
		return D(this._surveyManager) ? (En.warn("init was not called"), Promise.resolve({
			visible: !1,
			disabledReason: Zo
		})) : new Promise(((i) => {
			this.getSurveys(((e) => {
				var r, s = null !== (r = e.find(((e) => e.id === t))) && void 0 !== r ? r : null;
				if (s) {
					var n = this.Yo(s);
					i({
						visible: n.eligible,
						disabledReason: n.reason
					});
				} else i({
					visible: !1,
					disabledReason: "Survey not found"
				});
			}), e);
		}));
	}
	renderSurvey(t, e, i) {
		var s;
		if (D(this._surveyManager)) En.warn("init was not called");
		else {
			var n = "string" == typeof t ? this.Uo(t) : t;
			if (null != n && n.id) if ($n.includes(n.type)) {
				var o = null == r ? void 0 : r.querySelector(e);
				if (o) return null != (s = n.appearance) && s.surveyPopupDelaySeconds ? (En.info("Rendering survey " + n.id + " with delay of " + n.appearance.surveyPopupDelaySeconds + " seconds"), void setTimeout((() => {
					var t, e;
					En.info("Rendering survey " + n.id + " with delay of " + (null == (t = n.appearance) ? void 0 : t.surveyPopupDelaySeconds) + " seconds"), null == (e = this._surveyManager) || e.renderSurvey(n, o, i), En.info("Survey " + n.id + " rendered");
				}), 1e3 * n.appearance.surveyPopupDelaySeconds)) : void this._surveyManager.renderSurvey(n, o, i);
				En.warn("Survey element not found");
			} else En.warn("Surveys of type " + n.type + " cannot be rendered in the app");
			else En.warn("Survey not found");
		}
	}
	displaySurvey(t, e) {
		var i;
		if (D(this._surveyManager)) En.warn("init was not called");
		else {
			var r = this.Uo(t);
			if (r) {
				var s = r;
				if (null != (i = r.appearance) && i.surveyPopupDelaySeconds && e.ignoreDelay && (s = f({}, r, { appearance: f({}, r.appearance, { surveyPopupDelaySeconds: 0 }) })), e.displayType !== ns.Popover && e.initialResponses && En.warn("initialResponses is only supported for popover surveys. prefill will not be applied."), !1 === e.ignoreConditions) {
					var n = this.canRenderSurvey(r);
					if (!n.visible) return void En.warn("Survey is not eligible to be displayed: ", n.disabledReason);
				}
				e.displayType !== ns.Inline ? this._surveyManager.handlePopoverSurvey(s, e) : this.renderSurvey(s, e.selector, e.properties);
			} else En.warn("Survey not found");
		}
	}
	cancelPendingSurvey(t) {
		D(this._surveyManager) ? En.warn("init was not called") : this._surveyManager.cancelSurvey(t);
	}
	handlePageUnload() {
		var t;
		null == (t = this._surveyManager) || t.handlePageUnload();
	}
} }, fa), Ea = { toolbar: class {
	constructor(t) {
		this.instance = t;
	}
	Go(t) {
		h.ph_toolbar_state = t;
	}
	Wo() {
		var t;
		return null !== (t = h.ph_toolbar_state) && void 0 !== t ? t : 0;
	}
	initialize() {
		return this.maybeLoadToolbar();
	}
	maybeLoadToolbar(e, i, s) {
		if (void 0 === e && (e = void 0), void 0 === i && (i = void 0), void 0 === s && (s = void 0), Qi(this.instance.config)) return !1;
		if (!t || !r) return !1;
		e = null != e ? e : t.location, s = null != s ? s : t.history;
		try {
			if (!i) {
				try {
					t.localStorage.setItem("test", "test"), t.localStorage.removeItem("test");
				} catch (t) {
					return !1;
				}
				i = null == t ? void 0 : t.localStorage;
			}
			var n, o = ea || Ir(e.hash, "__posthog") || Ir(e.hash, "state"), a = o ? Wi((() => JSON.parse(atob(decodeURIComponent(o))))) || Wi((() => JSON.parse(decodeURIComponent(o)))) : null;
			return a && "ph_authorize" === a.action ? ((n = a).source = "url", n && Object.keys(n).length > 0 && (a.desiredHash ? e.hash = a.desiredHash : s ? s.replaceState(s.state, "", e.pathname + e.search) : e.hash = "")) : ((n = JSON.parse(i.getItem(ia) || "{}")).source = "localstorage", delete n.userIntent), !(!n.token || this.instance.config.token !== n.token || (this.loadToolbar(n), 0));
		} catch (t) {
			return !1;
		}
	}
	Xo(t) {
		var e = h.ph_load_toolbar || h.ph_load_editor;
		!D(e) && P(e) ? e(t, this.instance) : ra.warn("No toolbar load function found");
	}
	loadToolbar(e) {
		var i = !(null == r || !r.getElementById($i));
		if (!t || i) return !1;
		var s = "custom" === this.instance.requestRouter.region && this.instance.config.advanced_disable_toolbar_metrics, n = f({ token: this.instance.config.token }, e, { apiURL: this.instance.requestRouter.endpointFor("ui") }, s ? { instrument: !1 } : {});
		if (t.localStorage.setItem(ia, JSON.stringify(f({}, n, { source: void 0 }))), 2 === this.Wo()) this.Xo(n);
		else if (0 === this.Wo()) {
			var o;
			this.Go(1), null == (o = h.__PosthogExtensions__) || null == o.loadExternalDependency || o.loadExternalDependency(this.instance, "toolbar", ((t) => {
				if (t) return ra.error("[Toolbar] Failed to load", t), void this.Go(0);
				this.Go(2), this.Xo(n);
			})), Xi(t, "turbolinks:load", (() => {
				this.Go(0), this.loadToolbar(n);
			}));
		}
		return !0;
	}
	Jo(t) {
		return this.loadToolbar(t);
	}
	maybeLoadEditor(t, e, i) {
		return void 0 === t && (t = void 0), void 0 === e && (e = void 0), void 0 === i && (i = void 0), this.maybeLoadToolbar(t, e, i);
	}
} }, Sa = f({ experiments: va }, fa), ka = f({}, fa, _a, ga, ma, ba, ya, xa, wa, Ea, Sa, { conversations: class {
	constructor(t) {
		this.Ko = void 0, this._conversationsManager = null, this.Qo = !1, this.ea = null, this._instance = t;
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		if (!this._instance.config.disable_conversations) {
			var e = t.conversations;
			D(e) || (N(e) ? this.Ko = e : (this.Ko = e.enabled, this.ea = e), this.loadIfEnabled());
		}
	}
	reset() {
		var t;
		null == (t = this._conversationsManager) || t.reset(), this._conversationsManager = null, this.Ko = void 0, this.ea = null;
	}
	loadIfEnabled() {
		if (!(this._conversationsManager || this.Qo || this._instance.config.disable_conversations || Qi(this._instance.config) || this._instance.config.cookieless_mode && this._instance.consent.isOptedOut())) {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t && !C(this.Ko) && this.Ko) if (this.ea && this.ea.token) {
				this.Qo = !0;
				try {
					var e = t.initConversations;
					if (e) return this.ta(e), void (this.Qo = !1);
					var i = t.loadExternalDependency;
					if (!i) return void this.ra(Oi);
					i(this._instance, "conversations", ((e) => {
						e || !t.initConversations ? this.ra("Could not load conversations script", e) : this.ta(t.initConversations), this.Qo = !1;
					}));
				} catch (t) {
					this.ra("Error initializing conversations", t), this.Qo = !1;
				}
			} else ca.error("Conversations enabled but missing token in remote config.");
		}
	}
	ta(t) {
		if (this.ea) try {
			this._conversationsManager = t(this.ea, this._instance), ca.info("Conversations loaded successfully");
		} catch (t) {
			this.ra("Error completing conversations initialization", t);
		}
		else ca.error("Cannot complete initialization: remote config is null");
	}
	ra(t, e) {
		ca.error(t, e), this._conversationsManager = null, this.Qo = !1;
	}
	show() {
		this._conversationsManager ? this._conversationsManager.show() : ca.warn("Conversations not loaded yet.");
	}
	hide() {
		this._conversationsManager && this._conversationsManager.hide();
	}
	isAvailable() {
		return !0 === this.Ko && !M(this._conversationsManager);
	}
	isVisible() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.isVisible()) && void 0 !== t && t;
	}
	sendMessage(t, e, i) {
		var r = this;
		return p((function* () {
			return r._conversationsManager ? r._conversationsManager.sendMessage(t, e, i) : (ca.warn(pa), null);
		}))();
	}
	getMessages(t, e) {
		var i = this;
		return p((function* () {
			return i._conversationsManager ? i._conversationsManager.getMessages(t, e) : (ca.warn(pa), null);
		}))();
	}
	markAsRead(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.markAsRead(t) : (ca.warn(pa), null);
		}))();
	}
	getTickets(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.getTickets(t) : (ca.warn(pa), null);
		}))();
	}
	requestRestoreLink(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.requestRestoreLink(t) : (ca.warn(pa), null);
		}))();
	}
	restoreFromToken(t) {
		var e = this;
		return p((function* () {
			return e._conversationsManager ? e._conversationsManager.restoreFromToken(t) : (ca.warn(pa), null);
		}))();
	}
	restoreFromUrlToken() {
		var t = this;
		return p((function* () {
			return t._conversationsManager ? t._conversationsManager.restoreFromUrlToken() : (ca.warn(pa), null);
		}))();
	}
	getCurrentTicketId() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.getCurrentTicketId()) && void 0 !== t ? t : null;
	}
	getWidgetSessionId() {
		var t, e;
		return null !== (t = null == (e = this._conversationsManager) ? void 0 : e.getWidgetSessionId()) && void 0 !== t ? t : null;
	}
	un() {
		var t;
		null == (t = this._conversationsManager) || t.setIdentity();
	}
	hn() {
		var t;
		null == (t = this._conversationsManager) || t.clearIdentity();
	}
} }, { logs: class {
	constructor(t) {
		var e;
		this.ia = !1, this.na = !1, this.Gt = Ce("[logs]"), this.sa = [], this.oa = 0, this.aa = 0, this.la = !1, this._instance = t, this._instance && null != (e = this._instance.config.logs) && e.captureConsoleLogs && (this.ia = !0);
	}
	initialize() {
		this.loadIfEnabled();
	}
	onRemoteConfig(t) {
		var e, i = null == (e = t.logs) ? void 0 : e.captureConsoleLogs;
		!D(i) && i && (this.ia = !0, this.loadIfEnabled());
	}
	reset() {
		this.sa = [], this.jr && (clearTimeout(this.jr), this.jr = void 0), this.oa = 0, this.aa = 0, this.la = !1;
	}
	loadIfEnabled() {
		if (this.ia && !this.na) {
			var t = null == h ? void 0 : h.__PosthogExtensions__;
			if (t) {
				var e = t.loadExternalDependency;
				e ? e(this._instance, "logs", ((e) => {
					var i;
					e || null == (i = t.logs) || !i.initializeLogs ? this.Gt.error("Could not load logs script", e) : (t.logs.initializeLogs(this._instance), this.na = !0);
				})) : this.Gt.error(Oi);
			} else this.Gt.error("PostHog Extensions not found.");
		}
	}
	captureLog(t) {
		var e, i, r, s, n, o;
		if (this._instance.is_capturing()) if (t && t.body) {
			var a = null !== (e = null == (i = this._instance.config.logs) ? void 0 : i.flushIntervalMs) && void 0 !== e ? e : 3e3, l = null !== (r = null == (s = this._instance.config.logs) ? void 0 : s.maxLogsPerInterval) && void 0 !== r ? r : 1e3, u = Date.now();
			if (a > u - this.aa || (this.aa = u, this.oa = 0, this.la = !1), l > this.oa) {
				this.oa++;
				var h = function(t, e) {
					var { text: r, number: s } = Jt[t.level || "info"] || Kt, n = String(Date.now()) + "000000", o = {};
					e.distinctId && (o.posthogDistinctId = e.distinctId), e.sessionId && (o.sessionId = e.sessionId), e.currentUrl && (o["url.full"] = e.currentUrl), e.screenName && (o["screen.name"] = e.screenName), e.appState && (o["app.state"] = e.appState), e.activeFeatureFlags && e.activeFeatureFlags.length > 0 && (o.feature_flags = e.activeFeatureFlags);
					var a = f({}, o, t.attributes || {}), l = {
						timeUnixNano: n,
						observedTimeUnixNano: n,
						severityNumber: s,
						severityText: r,
						body: { stringValue: t.body },
						attributes: Qt(a)
					};
					return t.trace_id && (l.traceId = t.trace_id), t.span_id && (l.spanId = t.span_id), C(t.trace_flags) || (l.flags = t.trace_flags), l;
				}(t, this.ua());
				this.sa.push({ record: h }), (null !== (n = null == (o = this._instance.config.logs) ? void 0 : o.maxBufferSize) && void 0 !== n ? n : 100) > this.sa.length ? this.ha() : this.flushLogs();
			} else this.la || (this.Gt.warn("captureLog dropping logs: exceeded " + l + " logs per " + a + "ms"), this.la = !0);
		} else this.Gt.warn("captureLog requires a body");
	}
	get logger() {
		return this.ca || (this.ca = {
			trace: (t, e) => this.captureLog({
				body: t,
				level: "trace",
				attributes: e
			}),
			debug: (t, e) => this.captureLog({
				body: t,
				level: "debug",
				attributes: e
			}),
			info: (t, e) => this.captureLog({
				body: t,
				level: "info",
				attributes: e
			}),
			warn: (t, e) => this.captureLog({
				body: t,
				level: "warn",
				attributes: e
			}),
			error: (t, e) => this.captureLog({
				body: t,
				level: "error",
				attributes: e
			}),
			fatal: (t, e) => this.captureLog({
				body: t,
				level: "fatal",
				attributes: e
			})
		}), this.ca;
	}
	flushLogs(t) {
		if (this.jr && (clearTimeout(this.jr), this.jr = void 0), 0 !== this.sa.length) {
			var e = this.sa;
			this.sa = [];
			var i = this._instance.config.logs, r = f({ "service.name": (null == i ? void 0 : i.serviceName) || "unknown_service" }, (null == i ? void 0 : i.environment) && { "deployment.environment": i.environment }, (null == i ? void 0 : i.serviceVersion) && { "service.version": i.serviceVersion }, null == i ? void 0 : i.resourceAttributes), s = function(t, e, i, r) {
				return { resourceLogs: [{
					resource: { attributes: Qt(e) },
					scopeLogs: [{
						scope: {
							name: i,
							version: r
						},
						logRecords: t
					}]
				}] };
			}(e.map(((t) => t.record)), r, v.LIB_NAME, v.LIB_VERSION), n = this._instance.requestRouter.endpointFor("api", "/i/v1/logs") + "?token=" + encodeURIComponent(this._instance.config.token);
			this._instance.Vi({
				method: "POST",
				url: n,
				data: s,
				compression: "best-available",
				batchKey: "logs",
				transport: t
			});
		}
	}
	ha() {
		var t, e;
		this.jr || (this.jr = setTimeout((() => {
			this.jr = void 0, this.flushLogs();
		}), null !== (t = null == (e = this._instance.config.logs) ? void 0 : e.flushIntervalMs) && void 0 !== t ? t : 3e3));
	}
	ua() {
		var t, e = {};
		if (e.distinctId = this._instance.get_distinct_id(), this._instance.sessionManager) {
			var { sessionId: i } = this._instance.sessionManager.checkAndGetSessionAndWindowId(!0);
			e.sessionId = i;
		}
		if (null != h && null != (t = h.location) && t.href && (e.currentUrl = h.location.href), this._instance.featureFlags) {
			var r = this._instance.featureFlags.getFlags();
			r && r.length > 0 && (e.activeFeatureFlags = r);
		}
		return e;
	}
} });
qn.__defaultExtensionClasses = f({}, ka);
var Ra, Pa = (Ra = In[Un] = new qn(), function() {
	function e() {
		e.done || (e.done = !0, Nn = !1, Hi(In, (function(t) {
			t._dom_loaded();
		})));
	}
	null != r && r.addEventListener ? "complete" === r.readyState ? e() : Xi(r, "DOMContentLoaded", e, { capture: !1 }) : t && Ie.error("Browser doesn't support `document.addEventListener` so PostHog couldn't be initialized");
}(), Ra);
//#endregion
//#region ../send/frontend/src/plugins/posthog.js
var posthog_default = {
	install(app) {
		app.config.globalProperties.$posthog = Pa;
	},
	rest: Pa
};
//#endregion
//#region ../send/frontend/src/stores/metrics.ts
var initializeClientMetrics = (uid) => {
	if (!uid) return;
	posthog_default.rest.identify(uid);
};
var useMetricsStore = defineStore("metrics", () => {
	return {
		metrics: posthog_default.rest,
		initializeClientMetrics
	};
});
//#endregion
//#region ../send/frontend/src/lib/validations.ts
var validateToken = async (api) => {
	try {
		try {
			const authStore = await Promise.resolve().then(() => auth_store_exports).then((m) => m.useAuthStore());
			const isExtension = await Promise.resolve().then(() => stores_exports).then((m) => m.useConfigStore().isExtension);
			const accessToken = await authStore.getAccessToken();
			if (isExtension) await authStore.loadUser();
			if (accessToken) {
				if ((await api.call("auth/oidc/me", {}, "GET", { Authorization: `Bearer ${accessToken}` }, { fullResponse: true }))?.ok) return true;
				console.log("OIDC token appears invalid, attempting refresh...");
				const newToken = await authStore.refreshToken();
				if (newToken) return !!(await api.call("auth/oidc/me", {}, "GET", { Authorization: `Bearer ${newToken}` }, { fullResponse: true }))?.ok;
			}
		} catch (error) {
			console.debug("OIDC validation failed, falling back to JWT:", error);
		}
		return !!await api.call("auth/me", {}, "GET", {}, { fullResponse: true });
	} catch (err) {
		console.error("Error validating session", err);
		return false;
	}
};
var validateUser = async (api) => {
	try {
		const userResponse = await api.call(`users/me`);
		if (userResponse?.user) return userResponse;
	} catch (error) {
		console.error("Error validating user", error);
		return null;
	}
};
var validateBackedUpKeys = async (getBackup, keychain) => {
	const keybackup = await getBackup();
	const hasBackedUpKeys = keychain.getPassphraseValue();
	if (!keybackup || !hasBackedUpKeys) return false;
	return true;
};
/**
* Checks local storage for a user object
*/
var validateLocalStorageSession = ({ user }) => {
	if (user?.id != void 0) return true;
	else return false;
};
var validator = async ({ api, keychain, userStore }) => {
	const validations = {
		hasBackedUpKeys: false,
		hasLocalStorageSession: false,
		isTokenValid: false,
		hasCorrectKeys: false,
		hasForcedLogin: false
	};
	let shouldClearSessionAndStorage = false;
	const userIDFromBackend = (await validateUser(api))?.user?.id;
	const userIDFromStore = userStore?.user?.id;
	try {
		await restoreKeysUsingLocalStorage(keychain, api);
		validations.hasCorrectKeys = true;
	} catch {
		validations.hasCorrectKeys = false;
		shouldClearSessionAndStorage = true;
		console.error("Incorrect passphrase. Removing local storage data.");
	}
	if (userIDFromStore && userIDFromBackend && userIDFromBackend !== userIDFromStore) {
		console.error("User ID mismatch. Removing local storage data.");
		shouldClearSessionAndStorage = true;
	} else {
		validations.hasLocalStorageSession = validateLocalStorageSession(userStore);
		validations.isTokenValid = await validateToken(api);
		validations.hasBackedUpKeys = await validateBackedUpKeys(userStore.getBackup, keychain);
	}
	if (shouldClearSessionAndStorage) {
		await userStore.clearUserFromStorage();
		validations.hasForcedLogin = true;
		try {
			location.reload();
		} catch {
			console.warn("Failed to reload page");
		}
	}
	return validations;
};
//#endregion
//#region ../../node_modules/.pnpm/@vueuse+shared@10.11.1_vue@3.5.33_typescript@5.9.3_/node_modules/@vueuse/shared/index.mjs
function toValue(r) {
	return typeof r === "function" ? r() : unref(r);
}
typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope;
var noop = () => {};
function createFilterWrapper(filter, fn) {
	function wrapper(...args) {
		return new Promise((resolve, reject) => {
			Promise.resolve(filter(() => fn.apply(this, args), {
				fn,
				thisArg: this,
				args
			})).then(resolve).catch(reject);
		});
	}
	return wrapper;
}
function debounceFilter(ms, options = {}) {
	let timer;
	let maxTimer;
	let lastRejector = noop;
	const _clearTimeout = (timer2) => {
		clearTimeout(timer2);
		lastRejector();
		lastRejector = noop;
	};
	const filter = (invoke) => {
		const duration = toValue(ms);
		const maxDuration = toValue(options.maxWait);
		if (timer) _clearTimeout(timer);
		if (duration <= 0 || maxDuration !== void 0 && maxDuration <= 0) {
			if (maxTimer) {
				_clearTimeout(maxTimer);
				maxTimer = null;
			}
			return Promise.resolve(invoke());
		}
		return new Promise((resolve, reject) => {
			lastRejector = options.rejectOnCancel ? reject : resolve;
			if (maxDuration && !maxTimer) maxTimer = setTimeout(() => {
				if (timer) _clearTimeout(timer);
				maxTimer = null;
				resolve(invoke());
			}, maxDuration);
			timer = setTimeout(() => {
				if (maxTimer) _clearTimeout(maxTimer);
				maxTimer = null;
				resolve(invoke());
			}, duration);
		});
	};
	return filter;
}
function useDebounceFn(fn, ms = 200, options = {}) {
	return createFilterWrapper(debounceFilter(ms, options), fn);
}
//#endregion
//#region ../send/frontend/src/apps/send/stores/status-store.ts
var useStatusStore = defineStore("status", () => {
	const { api } = useApiStore();
	const userStore = useUserStore();
	const { keychain } = useKeychainStore();
	const total = /* @__PURE__ */ ref(0);
	const progressed = /* @__PURE__ */ ref(0);
	const error = /* @__PURE__ */ ref("");
	const text = /* @__PURE__ */ ref("");
	const fileName = /* @__PURE__ */ ref("");
	const processStage = /* @__PURE__ */ ref("idle");
	const isRouterLoading = /* @__PURE__ */ ref(false);
	const debouncedUpdate = useDebounceFn((updatedValue) => {
		progressed.value = updatedValue;
	}, 1);
	function setText(message) {
		text.value = message;
	}
	function setUploadSize(size) {
		total.value = size;
	}
	function setProgress(number) {
		console.info("setting progress", number);
		debouncedUpdate(number);
	}
	function setFileName(name) {
		fileName.value = name;
	}
	function setProcessStage(stage) {
		processStage.value = stage;
	}
	function initialize() {
		total.value = 0;
		progressed.value = 0;
		error.value = "";
		text.value = "";
		fileName.value = "";
		processStage.value = "idle";
	}
	function setRouterLoading(loading) {
		isRouterLoading.value = loading;
	}
	const percentage = computed(() => {
		const result = progressed.value * 100 / total.value;
		if (Number.isNaN(result)) return 0;
		if (result > 100) return 100;
		return Math.round(result);
	});
	const validators = () => validator({
		api,
		keychain,
		userStore
	});
	return {
		validators,
		setProgress,
		setUploadSize,
		setText,
		setFileName,
		setProcessStage,
		setRouterLoading,
		isRouterLoading,
		progress: {
			total,
			progressed,
			percentage,
			error,
			text,
			fileName,
			processStage,
			initialize,
			setProgress,
			setUploadSize,
			setText,
			setFileName,
			setProcessStage
		}
	};
});
//#endregion
//#region ../send/frontend/src/apps/send/stores/folder-store.ts
var useFolderStore = defineStore("folderManager", () => {
	const { api } = useApiStore();
	const { user, populateFromBackend } = useUserStore();
	const { progress } = useStatusStore();
	const { metrics } = useMetricsStore();
	const { keychain } = useKeychainStore();
	const uploader = new Uploader(user, keychain, api);
	const downloader = new Downloader(keychain, api);
	const folders = /* @__PURE__ */ ref([]);
	const rootFolder = /* @__PURE__ */ ref(null);
	const msg = /* @__PURE__ */ ref("");
	const selectedFolderId = /* @__PURE__ */ ref(null);
	const selectedFileId = /* @__PURE__ */ ref(null);
	const rootFolderId = /* @__PURE__ */ ref(null);
	onMounted(async () => {
		await getDefaultFolderId();
	});
	async function getDefaultFolderId() {
		try {
			const result = (await trpc.getDefaultFolder.query()).id || null;
			rootFolderId.value = result;
			return result;
		} catch {
			console.info("No default folder set for user");
			return null;
		}
	}
	const defaultFolder = computed(() => {
		if (!folders?.value) return null;
		const total = folders.value.length;
		return total === 0 ? null : folders.value[total - 1];
	});
	const visibleFolders = computed(() => {
		if (folders.value.length === 0) return [];
		return calculateFolderSizes(folders.value);
	});
	const selectedFolder = computed(() => {
		if (!selectedFolderId.value) return null;
		return findContainer(selectedFolderId.value, folders.value);
	});
	const selectedFile = computed(() => {
		if (!selectedFileId.value || !rootFolder.value?.items) return null;
		return findItem(selectedFileId.value, rootFolder.value.items);
	});
	function init() {
		console.log(`initializing the folderStore`);
		folders.value = [];
		rootFolder.value = null;
		selectedFolderId.value = null;
		selectedFileId.value = null;
	}
	async function fetchSubtree(rootFolderId) {
		const tree = await api.call(`containers/${rootFolderId}/`);
		folders.value = tree.children;
		rootFolder.value = tree;
	}
	async function fetchUserFolders() {
		folders.value = await api.call(`users/folders`);
		rootFolder.value = null;
	}
	async function goToRootFolder(folderId) {
		if (folderId) await fetchSubtree(folderId);
		else {
			await fetchUserFolders();
			selectedFolderId.value = null;
			selectedFileId.value = null;
		}
	}
	function setSelectedFolder(folderId) {
		selectedFolderId.value = folderId;
		selectedFileId.value = null;
	}
	async function setSelectedFile(itemId) {
		selectedFolderId.value = null;
		selectedFileId.value = itemId;
	}
	async function createFolder(name = "Default", parentId, shareOnly = false) {
		if (rootFolder.value) parentId = rootFolder.value.id;
		const containerResponse = await api.call(`containers`, {
			name,
			type: CONTAINER_TYPE.FOLDER,
			parentId,
			shareOnly
		}, "POST");
		if (containerResponse?.container) {
			const { container } = containerResponse;
			try {
				await keychain.newKeyForContainer(container.id);
				await backupKeys(keychain, api, msg);
				await keychain.store();
				folders.value = [...folders.value, container];
				return container;
			} catch (error) {
				console.error(`Failed to set up key for container ${container.id}, rolling back`, error);
				try {
					await api.call(`containers/${container.id}`, {}, "DELETE");
				} catch (deleteError) {
					console.error("Failed to roll back container creation", deleteError);
				}
				return null;
			}
		}
		return null;
	}
	async function renameFolder(folderId, name) {
		const result = await api.call(`containers/${folderId}/rename`, { name }, "POST");
		if (result) {
			const node = findContainer(folderId, folders.value);
			if (node) node.name = result.name;
		}
		return result;
	}
	async function renameItem(folderId, itemId, name) {
		const result = await api.call(`containers/${folderId}/item/${itemId}/rename`, { name }, "POST");
		if (result && rootFolder.value?.items) {
			const node = findItem(itemId, rootFolder.value.items);
			if (node) node.name = result.name;
		}
		return result;
	}
	async function uploadItem(fileBlob, folderId, api) {
		progress.error = "";
		if (!user.id) {
			console.warn("uploadItem: user.id missing; re-populating from backend");
			await populateFromBackend();
		}
		if (!user.id) {
			progress.error = "You are not fully signed in. Please sign in again.";
			throw new Error("Cannot upload: user session is missing a user id (ownerId would be empty).");
		}
		const canUpload = await checkBlobSize(fileBlob);
		if (await canUserUpload(fileBlob.size)) {
			progress.error = CLIENT_MESSAGES.STORAGE_LIMIT_EXCEEDED;
			alert(`Error uploading ${fileBlob.name}; ${CLIENT_MESSAGES.STORAGE_LIMIT_EXCEEDED}`);
			throw new Error("Uploading this file would exceed your storage limit.");
		}
		if (!canUpload) {
			progress.error = CLIENT_MESSAGES.FILE_TOO_BIG;
			throw new Error("Too big");
		}
		const formattedBlob = await formatBlob(fileBlob);
		progress.setFileName(formattedBlob.name);
		try {
			const newItems = await uploader.doUpload(formattedBlob, folderId, api, progress);
			if (!newItems || newItems.length === 0) throw new Error(`Upload failed for ${formattedBlob.name}`);
			if (rootFolder.value) rootFolder.value.items = [...rootFolder.value.items, ...newItems];
			return newItems;
		} catch (error) {
			console.error("Upload failed in uploadItem:", error);
			const message = error instanceof Error ? error.message : "Unknown error";
			progress.error = message;
			progress.setProcessStage("error");
			throw new Error(`Upload failed: ${message}`);
		}
	}
	async function deleteFolder(folderId) {
		if ((await api.call(`containers/${folderId}`, {}, "DELETE"))?.result.length > 0) folders.value = [...folders.value.filter((f) => f.id !== folderId)];
	}
	async function deleteItem(itemId, folderId) {
		const result = await api.call(`containers/${folderId}/item/${itemId}`, { shouldDeleteContent: true }, "DELETE");
		if (result) {
			if (selectedFileId.value === itemId) setSelectedFile(null);
			if (rootFolder.value?.items) {
				const deletedKey = result.wrappedKey;
				rootFolder.value.items = [...rootFolder.value.items.filter((i) => i.wrappedKey !== deletedKey)];
			}
		}
	}
	/**
	* Memory-Optimized Multipart Download Implementation
	*
	* This implementation replaces the previous memory-intensive approach that loaded all file pieces
	* into ArrayBuffer objects simultaneously. The key improvements include:
	*
	* 1. **Streaming Processing**: Each piece is processed as a stream, reducing peak memory usage
	* 2. **Sequential Download**: Pieces are downloaded and processed one at a time rather than all at once
	* 3. **Chunked Output**: Large pieces are streamed in 64KB chunks to prevent memory spikes
	* 4. **Progressive Enhancement**: Uses File System Access API when available for true streaming saves
	* 5. **Efficient Concatenation**: Combines pieces using ReadableStream without intermediate buffers
	*
	* For a 2GB file split into 10 pieces:
	* - Old approach: ~4GB+ peak memory usage (original + combined + intermediate buffers)
	* - New approach: ~200MB peak memory usage (single piece + processing overhead)
	*/
	async function downloadMultipart(upload, containerId, wrappedKeyStr, name, api, keychain, progressTracker) {
		const isBucketStorage = api.isBucketStorage;
		let combinedType = "";
		const _uploads = await api.call(`uploads/${upload.at(0).id}/parts`);
		const wrappingKey = await keychain.get(containerId);
		if (!wrappingKey) throw new Error("Wrapping key not found");
		const contentKey = await keychain.container.unwrapContentKey(wrappedKeyStr, wrappingKey);
		const validMetadata = (await Promise.all(_uploads.map(async ({ id, part }) => {
			if (!id) return null;
			const { size, type } = await api.call(`uploads/${id}/metadata`);
			if (!size) return null;
			if (!combinedType && type) combinedType = type;
			return {
				id,
				part,
				size,
				type
			};
		}))).filter((meta) => meta !== null);
		if (validMetadata.length === 0) throw new Error("No valid pieces found");
		const sortedMetadata = validMetadata.sort((a, b) => a.part - b.part);
		const totalSize = sortedMetadata.reduce((sum, meta) => sum + meta.size, 0);
		progressTracker.setUploadSize(totalSize);
		progressTracker.setProcessStage("downloading");
		progressTracker.setText("Downloading file");
		const multipartTracker = createMultipartDownloadProgressTracker(progressTracker, sortedMetadata, sortedMetadata.length > 1);
		const createPieceStream = async (metadata, partTracker) => {
			let downloadedBlob;
			if (!isBucketStorage) {
				downloadedBlob = await _download({
					id: metadata.id,
					progressTracker: partTracker
				});
				if (!downloadedBlob) throw new Error("DOWNLOAD_FAILED");
			} else {
				const bucketResponse = await api.call(`download/${metadata.id}/signed`);
				if (!bucketResponse?.url) throw new Error("BUCKET_URL_NOT_FOUND");
				downloadedBlob = await _download({
					url: bucketResponse.url,
					progressTracker: partTracker
				});
			}
			let pieceStream;
			if (contentKey) pieceStream = decryptStream(blobStream(downloadedBlob), contentKey);
			else pieceStream = blobStream(downloadedBlob);
			return new ReadableStream({ async start(controller) {
				const reader = pieceStream.getReader();
				const chunks = [];
				let totalSize = 0;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
						totalSize += value.length;
					}
					const pieceBuffer = new Uint8Array(totalSize);
					let offset = 0;
					for (const chunk of chunks) {
						pieceBuffer.set(chunk, offset);
						offset += chunk.length;
					}
					const { content: unzippedContent } = await unzipMultipartPiece(pieceBuffer.buffer);
					const chunkSize = 64 * 1024;
					const unzippedView = new Uint8Array(unzippedContent);
					for (let i = 0; i < unzippedView.length; i += chunkSize) {
						const chunk = unzippedView.slice(i, i + chunkSize);
						controller.enqueue(chunk);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			} });
		};
		return await _saveFileStream({
			stream: new ReadableStream({ async start(controller) {
				try {
					for (let index = 0; index < sortedMetadata.length; index++) {
						const metadata = sortedMetadata[index];
						const reader = (await createPieceStream(metadata, multipartTracker.getPartTracker(index))).getReader();
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;
							controller.enqueue(value);
						}
						multipartTracker.markPartComplete(index);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			} }),
			name: decodeURIComponent(name),
			type: combinedType
		});
	}
	async function downloadContent(uploadId, containerId, wrappedKeyStr, name) {
		return await downloader.doDownload(uploadId, containerId, wrappedKeyStr, name, metrics, progress);
	}
	function print() {
		console.log(`rootFolder: ${rootFolder.value}`);
		console.log(`defaultFolder: ${defaultFolder.value}`);
		console.log(`visibleFolders: ${visibleFolders.value}`);
		console.log(`selectedFolder: ${selectedFolder.value}`);
		console.log(`selectedFile: ${selectedFile.value}`);
	}
	/**
	* Creates a multipart download progress tracker that manages overall progress across all parts
	*/
	function createMultipartDownloadProgressTracker(mainTracker, metadata, isMultipart) {
		const partSizes = metadata.map((meta) => meta.size);
		const totalSize = partSizes.reduce((sum, size) => sum + size, 0);
		let completedParts = 0;
		return {
			getPartTracker: (partIndex) => {
				const partSize = partSizes[partIndex];
				return {
					total: mainTracker.total,
					progressed: mainTracker.progressed,
					percentage: mainTracker.percentage,
					error: mainTracker.error,
					text: mainTracker.text,
					fileName: mainTracker.fileName,
					processStage: mainTracker.processStage,
					initialize: () => {},
					setUploadSize: () => {},
					setFileName: (name) => {
						mainTracker.setFileName(name);
					},
					setProcessStage: (stage) => {
						mainTracker.setProcessStage(stage);
					},
					setText: (message) => {
						if (isMultipart) if (message.includes("Downloading")) mainTracker.setText("Downloading file");
						else if (message.includes("Decrypting")) mainTracker.setText("Decrypting file");
						else mainTracker.setText(message);
						else mainTracker.setText(message);
					},
					setProgress: (partProgress) => {
						const overallProgress = completedParts / metadata.length * totalSize + Math.min(partProgress / partSize, 1) * (totalSize / metadata.length);
						mainTracker.setProgress(Math.min(overallProgress, totalSize));
					}
				};
			},
			markPartComplete: (partIndex) => {
				completedParts = partIndex + 1;
				const progress = completedParts / metadata.length * totalSize;
				mainTracker.setProgress(progress);
			}
		};
	}
	return {
		rootFolder: computed(() => {
			const rootFolderValue = rootFolder.value;
			if (!rootFolderValue) return null;
			return {
				...rootFolderValue,
				items: organizeFiles(rootFolderValue?.items || [])
			};
		}),
		defaultFolder: computed(() => {
			const defaultFolderValue = defaultFolder.value;
			if (!defaultFolderValue) return null;
			return defaultFolderValue ? {
				...defaultFolderValue,
				items: organizeFiles(defaultFolderValue.items || [])
			} : null;
		}),
		visibleFolders: computed(() => visibleFolders.value),
		selectedFolder: computed(() => selectedFolder.value),
		selectedFile: computed(() => {
			if (!selectedFileId.value || !rootFolder.value?.items) return null;
			return organizeFiles([selectedFile.value])[0] || null;
		}),
		rootFolderId: computed(() => rootFolderId.value),
		getDefaultFolderId,
		print,
		init,
		fetchSubtree,
		fetchUserFolders,
		goToRootFolder,
		sync: async () => await goToRootFolder(null),
		setSelectedFolder,
		setSelectedFile,
		createFolder,
		renameFolder,
		deleteFolder,
		renameItem,
		uploadItem,
		deleteItem,
		downloadContent,
		downloadMultipart
	};
});
function calculateFolderSizes(folders) {
	return folders.map((folder) => {
		folder.size = folder.items?.reduce((total, { upload }) => total + upload?.size || 0, 0) || 0;
		return folder;
	});
}
function findContainer(id, containers) {
	if (!containers) return null;
	return containers.find((container) => container.id === id) || null;
}
function findItem(id, items) {
	if (!items) return null;
	return items.find((item) => item.id === id) || null;
}
//#endregion
//#region ../send/frontend/src/lib/challenge.ts
async function getContainerKeyFromChallenge(hash, password, api, keychain) {
	const resp = await api.call(`sharing/${hash}/challenge`);
	if (!resp) return null;
	const { challengeKey: challengeKeyStr, challengeSalt: challengeSaltStr, challengeCiphertext } = resp;
	let challengeSalt;
	try {
		challengeSalt = Util.base64ToArrayBuffer(challengeSaltStr);
	} catch (e) {
		return null;
	}
	try {
		const unwrappedChallengeKey = await keychain.password.unwrapContentKey(challengeKeyStr, password, challengeSalt);
		const challengePlaintext = await keychain.challenge.decryptChallenge(challengeCiphertext, unwrappedChallengeKey, challengeSalt);
		const challengeResp = await api.call(`sharing/${hash}/challenge`, { challengePlaintext }, "POST");
		if (!challengeResp.containerId) throw Error("Challenge unsuccessful");
		const { containerId, wrappedKey: wrappedKeyStr, salt: saltStr } = challengeResp;
		return {
			unwrappedKey: await keychain.password.unwrapContainerKey(wrappedKeyStr, password, Util.base64ToArrayBuffer(saltStr)),
			containerId
		};
	} catch (e) {
		console.log(e);
		return null;
	}
}
//#endregion
//#region ../send/frontend/src/lib/share.ts
var Sharer = class {
	constructor(user, keychain, api) {
		this.user = user;
		this.keychain = keychain;
		this.api = api;
	}
	async handleMultipartItems(item) {
		const ids = (await this.api.call(`uploads/parts`, { wrappedKey: item.wrappedKey }, "POST")).map((u) => u.id);
		console.log(`ids:`, ids);
		const _items = await this.api.call(`uploads/items`, {
			ids,
			wrappedKey: item.wrappedKey
		}, "POST");
		console.log(`_items:`, _items);
		return _items;
	}
	async shareItemsWithPassword(items, password, expiration) {
		const __items = [];
		for (const item of items) if (item.multipart) {
			const _items = await this.handleMultipartItems(item);
			__items.push(..._items);
		} else __items.push(item);
		const containerId = await this.createShareOnlyContainer(__items, null);
		return await this.requestAccessLink(containerId, password, expiration);
	}
	async shareContainerWithInvitation(containerId, email) {
		const user = await this.api.call(`users/lookup/${email}/`);
		if (user) {
			let publicKey = user.publicKey;
			const recipientId = user.id;
			if (!publicKey) console.log(`Could not find public key for user ${email}`);
			console.warn("SOMETHING WEIRD IS HAPPENING WITH PUBLIC KEYS ON SERVER");
			while (typeof publicKey !== "object") publicKey = JSON.parse(publicKey);
			const importedPublicKey = await crypto.subtle.importKey("jwk", publicKey, {
				name: "RSA-OAEP",
				hash: { name: "SHA-256" }
			}, true, ["wrapKey"]);
			const key = await this.keychain.get(containerId);
			const wrappedKey = await this.keychain.rsa.wrapContainerKey(key, importedPublicKey);
			if (!wrappedKey) {
				console.log(`no wrapped key for the invitation`);
				return null;
			}
			const resp = await this.api.call(`containers/${containerId}/member/invite`, {
				wrappedKey,
				recipientId,
				senderId: this.user.id
			}, "POST");
			console.log(`Invitation creation response:`);
			console.log(resp);
			return resp;
		}
	}
	async createShareOnlyContainer(items = [], containerId = null) {
		if (items.length === 0 && !containerId) return null;
		if (!this.api?.call || !this.keychain?.store) return null;
		const itemsToShare = [...items];
		let currentContainer = { name: "default" };
		if (containerId) currentContainer = await this.api.call(`containers/${containerId}/info`);
		const response = await this.api.call(`containers`, {
			name: currentContainer.name,
			type: CONTAINER_TYPE.FOLDER,
			parentId: 0,
			shareOnly: true
		}, "POST");
		if (!response.container?.id) return null;
		const { id: newContainerId } = response.container;
		await this.keychain.newKeyForContainer(newContainerId);
		await this.keychain.store();
		await Promise.all(itemsToShare.map(async (item) => {
			const containerId = item.containerId ?? item.folderId;
			const filename = item.name ?? item.filename;
			const currentWrappingKey = await this.keychain.get(containerId);
			const { uploadId, wrappedKey, type } = item;
			const contentKey = await this.keychain.container.unwrapContentKey(wrappedKey, currentWrappingKey);
			const newWrappingKey = await this.keychain.get(newContainerId);
			const wrappedKeyStr = await this.keychain.container.wrapContentKey(contentKey, newWrappingKey);
			return await this.api.call(`containers/${newContainerId}/item`, {
				uploadId,
				name: filename,
				type,
				wrappedKey: wrappedKeyStr,
				multipart: item.multipart ?? false,
				totalSize: item.totalSize ?? void 0
			}, "POST");
		}));
		return newContainerId;
	}
	async requestAccessLink(containerId, password, expiration) {
		if (!(await this.api.call(`sharing/${containerId}/canCreateAccessLink`))?.canCreateLink) throw new Error("Cannot create access link for this container because it contains files that have been reported for abuse.");
		const unwrappedKey = await this.keychain.get(containerId);
		const salt = Util.generateSalt();
		const passwordWrappedKeyStr = await this.keychain.password.wrapContainerKey(unwrappedKey, password, salt);
		const challengeKey = await this.keychain.challenge.generateKey();
		const challengeSalt = Util.generateSalt();
		const passwordWrappedChallengeKeyStr = await this.keychain.password.wrapContentKey(challengeKey, password, challengeSalt);
		const challengePlaintext = this.keychain.challenge.createChallenge();
		const challengeCiphertext = await this.keychain.challenge.encryptChallenge(challengePlaintext, challengeKey, challengeSalt);
		const saltStr = Util.arrayBufferToBase64(salt);
		const challengeSaltStr = Util.arrayBufferToBase64(challengeSalt);
		const resp = await this.api.call(`sharing`, {
			containerId,
			wrappedKey: passwordWrappedKeyStr,
			salt: saltStr,
			challengeKey: passwordWrappedChallengeKeyStr,
			challengeSalt: challengeSaltStr,
			senderId: this.user.id,
			challengePlaintext,
			challengeCiphertext,
			expiration
		}, "POST");
		if (!resp?.id) return null;
		return `https://send.tb.pro/share/${resp.id}`;
	}
};
defineStore("sharingManager", () => {
	const { api } = useApiStore();
	const { user } = useUserStore();
	const { keychain } = useKeychainStore();
	const sharer = new Sharer(user, keychain, api);
	const _links = /* @__PURE__ */ ref([]);
	const links = computed(() => {
		return [..._links.value];
	});
	async function createAccessLink(folderId, password, expiration) {
		let shouldAddPasswordAsHash = false;
		if (password.length === 0) {
			password = Util.generateRandomPassword();
			shouldAddPasswordAsHash = true;
		}
		let url = await sharer.requestAccessLink(folderId, password, expiration);
		if (!url) return null;
		if (shouldAddPasswordAsHash) url = `${url}#${password}`;
		return url;
	}
	async function acceptAccessLink(linkId, password) {
		const containerKey = await getContainerKeyFromChallenge(linkId, password, api, keychain);
		if (!containerKey?.unwrappedKey) {
			await trpc.incrementPasswordRetryCount.mutate({ linkId });
			return false;
		}
		const { unwrappedKey, containerId } = containerKey;
		await keychain.rsa.generateKeyPair();
		await keychain.add(containerId, unwrappedKey);
		await keychain.store();
		return true;
	}
	async function isAccessLinkValid(linkId) {
		return await api.call(`sharing/exists/${linkId}`);
	}
	async function fetchFolderAccessLinks(folderId) {
		_links.value = await api.call(`containers/${folderId}/links`);
	}
	async function fetchFileAccessLinks(uploadId) {
		_links.value = await api.call(`sharing/${uploadId}/links?type=file`);
	}
	async function shareItems(itemsArray, password, expiration) {
		let shouldAddPasswordAsHash = false;
		if (password.length === 0) {
			password = Util.generateRandomPassword();
			shouldAddPasswordAsHash = true;
		}
		let url = await sharer.shareItemsWithPassword(itemsArray, password, expiration);
		if (!url) return null;
		if (shouldAddPasswordAsHash) url = `${url}#${password}`;
		return url;
	}
	async function getSharedFolder(hash) {
		return await api.call(`sharing/${hash}/`);
	}
	async function getInvitations(userId) {
		return await api.call(`users/${userId}/invitations/`);
	}
	async function getFoldersSharedWithUser(userId) {
		return await api.call(`users/${userId}/folders/sharedWithUser`);
	}
	async function getFoldersSharedByUser(userId) {
		return await api.call(`users/${userId}/folders/sharedByUser`);
	}
	async function getSharesForFolder(containerId, userId) {
		return await api.call(`containers/${containerId}/shares`, { userId });
	}
	async function acceptInvitation(invitationId, containerId) {
		return await api.call(`containers/${containerId}/member/accept/${invitationId}`, {}, "POST");
	}
	async function updateInvitationPermissions(containerId, userId, invitationId, permission) {
		return await api.call(`containers/${containerId}/shares/invitation/update`, {
			userId,
			invitationId,
			permission
		}, "POST");
	}
	async function updateAccessLinkPermissions(containerId, userId, accessLinkId, permission) {
		return await api.call(`containers/${containerId}/shares/accessLink/update`, {
			userId,
			accessLinkId,
			permission
		}, "POST");
	}
	return {
		links,
		createAccessLink,
		isAccessLinkValid,
		acceptAccessLink,
		fetchFolderAccessLinks,
		fetchFileAccessLinks,
		shareItems,
		getSharedFolder,
		getInvitations,
		getFoldersSharedWithUser,
		getFoldersSharedByUser,
		getSharesForFolder,
		acceptInvitation,
		updateInvitationPermissions,
		updateAccessLinkPermissions
	};
});
//#endregion
//#region ../../node_modules/.pnpm/jwt-decode@4.0.0/node_modules/jwt-decode/build/esm/index.js
var InvalidTokenError = class extends Error {};
InvalidTokenError.prototype.name = "InvalidTokenError";
function b64DecodeUnicode(str) {
	return decodeURIComponent(atob(str).replace(/(.)/g, (m, p) => {
		let code = p.charCodeAt(0).toString(16).toUpperCase();
		if (code.length < 2) code = "0" + code;
		return "%" + code;
	}));
}
function base64UrlDecode(str) {
	let output = str.replace(/-/g, "+").replace(/_/g, "/");
	switch (output.length % 4) {
		case 0: break;
		case 2:
			output += "==";
			break;
		case 3:
			output += "=";
			break;
		default: throw new Error("base64 string is not of the correct length");
	}
	try {
		return b64DecodeUnicode(output);
	} catch (err) {
		return atob(output);
	}
}
function jwtDecode(token, options) {
	if (typeof token !== "string") throw new InvalidTokenError("Invalid token specified: must be a string");
	options || (options = {});
	const pos = options.header === true ? 0 : 1;
	const part = token.split(".")[pos];
	if (typeof part !== "string") throw new InvalidTokenError(`Invalid token specified: missing part #${pos + 1}`);
	let decoded;
	try {
		decoded = base64UrlDecode(part);
	} catch (e) {
		throw new InvalidTokenError(`Invalid token specified: invalid base64 for part #${pos + 1} (${e.message})`);
	}
	try {
		return JSON.parse(decoded);
	} catch (e) {
		throw new InvalidTokenError(`Invalid token specified: invalid json for part #${pos + 1} (${e.message})`);
	}
}
//#endregion
//#region ../../node_modules/.pnpm/oidc-client-ts@3.5.0/node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js
var nopLogger = {
	debug: () => void 0,
	info: () => void 0,
	warn: () => void 0,
	error: () => void 0
};
var level;
var logger;
var Log = /* @__PURE__ */ ((Log2) => {
	Log2[Log2["NONE"] = 0] = "NONE";
	Log2[Log2["ERROR"] = 1] = "ERROR";
	Log2[Log2["WARN"] = 2] = "WARN";
	Log2[Log2["INFO"] = 3] = "INFO";
	Log2[Log2["DEBUG"] = 4] = "DEBUG";
	return Log2;
})(Log || {});
((Log2) => {
	function reset() {
		level = 3;
		logger = nopLogger;
	}
	Log2.reset = reset;
	function setLevel(value) {
		if (!(0 <= value && value <= 4)) throw new Error("Invalid log level");
		level = value;
	}
	Log2.setLevel = setLevel;
	function setLogger(value) {
		logger = value;
	}
	Log2.setLogger = setLogger;
})(Log || (Log = {}));
var Logger = class _Logger {
	constructor(_name) {
		this._name = _name;
	}
	debug(...args) {
		if (level >= 4) logger.debug(_Logger._format(this._name, this._method), ...args);
	}
	info(...args) {
		if (level >= 3) logger.info(_Logger._format(this._name, this._method), ...args);
	}
	warn(...args) {
		if (level >= 2) logger.warn(_Logger._format(this._name, this._method), ...args);
	}
	error(...args) {
		if (level >= 1) logger.error(_Logger._format(this._name, this._method), ...args);
	}
	throw(err) {
		this.error(err);
		throw err;
	}
	create(method) {
		const methodLogger = Object.create(this);
		methodLogger._method = method;
		methodLogger.debug("begin");
		return methodLogger;
	}
	static createStatic(name, staticMethod) {
		const staticLogger = new _Logger(`${name}.${staticMethod}`);
		staticLogger.debug("begin");
		return staticLogger;
	}
	static _format(name, method) {
		const prefix = `[${name}]`;
		return method ? `${prefix} ${method}:` : prefix;
	}
	static debug(name, ...args) {
		if (level >= 4) logger.debug(_Logger._format(name), ...args);
	}
	static info(name, ...args) {
		if (level >= 3) logger.info(_Logger._format(name), ...args);
	}
	static warn(name, ...args) {
		if (level >= 2) logger.warn(_Logger._format(name), ...args);
	}
	static error(name, ...args) {
		if (level >= 1) logger.error(_Logger._format(name), ...args);
	}
};
Log.reset();
var JwtUtils = class {
	static decode(token) {
		try {
			return jwtDecode(token);
		} catch (err) {
			Logger.error("JwtUtils.decode", err);
			throw err;
		}
	}
	static async generateSignedJwt(header, payload, privateKey) {
		const encodedToken = `${CryptoUtils.encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)))}.${CryptoUtils.encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
		const signature = await window.crypto.subtle.sign({
			name: "ECDSA",
			hash: { name: "SHA-256" }
		}, privateKey, new TextEncoder().encode(encodedToken));
		return `${encodedToken}.${CryptoUtils.encodeBase64Url(new Uint8Array(signature))}`;
	}
	static async generateSignedJwtWithHmac(header, payload, secretKey) {
		const encodedToken = `${CryptoUtils.encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)))}.${CryptoUtils.encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}`;
		const signature = await window.crypto.subtle.sign("HMAC", secretKey, new TextEncoder().encode(encodedToken));
		return `${encodedToken}.${CryptoUtils.encodeBase64Url(new Uint8Array(signature))}`;
	}
};
var UUID_V4_TEMPLATE = "10000000-1000-4000-8000-100000000000";
var toBase64 = (val) => btoa([...new Uint8Array(val)].map((chr) => String.fromCharCode(chr)).join(""));
var _CryptoUtils = class _CryptoUtils {
	static _randomWord() {
		const arr = new Uint32Array(1);
		crypto.getRandomValues(arr);
		return arr[0];
	}
	/**
	* Generates RFC4122 version 4 guid
	*/
	static generateUUIDv4() {
		return UUID_V4_TEMPLATE.replace(/[018]/g, (c) => (+c ^ _CryptoUtils._randomWord() & 15 >> +c / 4).toString(16)).replace(/-/g, "");
	}
	/**
	* PKCE: Generate a code verifier
	*/
	static generateCodeVerifier() {
		return _CryptoUtils.generateUUIDv4() + _CryptoUtils.generateUUIDv4() + _CryptoUtils.generateUUIDv4();
	}
	/**
	* PKCE: Generate a code challenge
	*/
	static async generateCodeChallenge(code_verifier) {
		if (!crypto.subtle) throw new Error("Crypto.subtle is available only in secure contexts (HTTPS).");
		try {
			const data = new TextEncoder().encode(code_verifier);
			return toBase64(await crypto.subtle.digest("SHA-256", data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		} catch (err) {
			Logger.error("CryptoUtils.generateCodeChallenge", err);
			throw err;
		}
	}
	/**
	* Generates a base64-encoded string for a basic auth header
	*/
	static generateBasicAuth(client_id, client_secret) {
		return toBase64(new TextEncoder().encode([client_id, client_secret].join(":")));
	}
	/**
	* Generates a hash of a string using a given algorithm
	* @param alg
	* @param message
	*/
	static async hash(alg, message) {
		const msgUint8 = new TextEncoder().encode(message);
		const hashBuffer = await crypto.subtle.digest(alg, msgUint8);
		return new Uint8Array(hashBuffer);
	}
	/**
	* Generates a rfc7638 compliant jwk thumbprint
	* @param jwk
	*/
	static async customCalculateJwkThumbprint(jwk) {
		let jsonObject;
		switch (jwk.kty) {
			case "RSA":
				jsonObject = {
					"e": jwk.e,
					"kty": jwk.kty,
					"n": jwk.n
				};
				break;
			case "EC":
				jsonObject = {
					"crv": jwk.crv,
					"kty": jwk.kty,
					"x": jwk.x,
					"y": jwk.y
				};
				break;
			case "OKP":
				jsonObject = {
					"crv": jwk.crv,
					"kty": jwk.kty,
					"x": jwk.x
				};
				break;
			case "oct":
				jsonObject = {
					"crv": jwk.k,
					"kty": jwk.kty
				};
				break;
			default: throw new Error("Unknown jwk type");
		}
		const utf8encodedAndHashed = await _CryptoUtils.hash("SHA-256", JSON.stringify(jsonObject));
		return _CryptoUtils.encodeBase64Url(utf8encodedAndHashed);
	}
	static async generateDPoPProof({ url, accessToken, httpMethod, keyPair, nonce }) {
		let hashedToken;
		let encodedHash;
		const payload = {
			"jti": window.crypto.randomUUID(),
			"htm": httpMethod != null ? httpMethod : "GET",
			"htu": url,
			"iat": Math.floor(Date.now() / 1e3)
		};
		if (accessToken) {
			hashedToken = await _CryptoUtils.hash("SHA-256", accessToken);
			encodedHash = _CryptoUtils.encodeBase64Url(hashedToken);
			payload.ath = encodedHash;
		}
		if (nonce) payload.nonce = nonce;
		try {
			const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
			const header = {
				"alg": "ES256",
				"typ": "dpop+jwt",
				"jwk": {
					"crv": publicJwk.crv,
					"kty": publicJwk.kty,
					"x": publicJwk.x,
					"y": publicJwk.y
				}
			};
			return await JwtUtils.generateSignedJwt(header, payload, keyPair.privateKey);
		} catch (err) {
			if (err instanceof TypeError) throw new Error(`Error exporting dpop public key: ${err.message}`);
			else throw err;
		}
	}
	static async generateDPoPJkt(keyPair) {
		try {
			const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
			return await _CryptoUtils.customCalculateJwkThumbprint(publicJwk);
		} catch (err) {
			if (err instanceof TypeError) throw new Error(`Could not retrieve dpop keys from storage: ${err.message}`);
			else throw err;
		}
	}
	static async generateDPoPKeys() {
		return await window.crypto.subtle.generateKey({
			name: "ECDSA",
			namedCurve: "P-256"
		}, false, ["sign", "verify"]);
	}
	/**
	* Generates a client assertion JWT for client_secret_jwt authentication
	* @param client_id The client identifier
	* @param client_secret The client secret
	* @param audience The token endpoint URL (audience)
	* @param algorithm The HMAC algorithm to use (HS256, HS384, HS512). Defaults to HS256
	*/
	static async generateClientAssertionJwt(client_id, client_secret, audience, algorithm = "HS256") {
		const now = Math.floor(Date.now() / 1e3);
		const header = {
			"alg": algorithm,
			"typ": "JWT"
		};
		const payload = {
			"iss": client_id,
			"sub": client_id,
			"aud": audience,
			"jti": _CryptoUtils.generateUUIDv4(),
			"exp": now + 300,
			"iat": now
		};
		const hashFunction = {
			"HS256": "SHA-256",
			"HS384": "SHA-384",
			"HS512": "SHA-512"
		}[algorithm];
		if (!hashFunction) throw new Error(`Unsupported algorithm: ${algorithm}. Supported algorithms are: HS256, HS384, HS512`);
		const encoder = new TextEncoder();
		const secretKey = await crypto.subtle.importKey("raw", encoder.encode(client_secret), {
			name: "HMAC",
			hash: hashFunction
		}, false, ["sign"]);
		return await JwtUtils.generateSignedJwtWithHmac(header, payload, secretKey);
	}
};
/**
* Generates a base64url encoded string
*/
_CryptoUtils.encodeBase64Url = (input) => {
	return toBase64(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};
var CryptoUtils = _CryptoUtils;
var Event$1 = class {
	constructor(_name) {
		this._name = _name;
		this._callbacks = [];
		this._logger = new Logger(`Event('${this._name}')`);
	}
	addHandler(cb) {
		this._callbacks.push(cb);
		return () => this.removeHandler(cb);
	}
	removeHandler(cb) {
		const idx = this._callbacks.lastIndexOf(cb);
		if (idx >= 0) this._callbacks.splice(idx, 1);
	}
	async raise(...ev) {
		this._logger.debug("raise:", ...ev);
		for (const cb of this._callbacks) await cb(...ev);
	}
};
var PopupUtils = class {
	/**
	* Populates a map of window features with a placement centered in front of
	* the current window. If no explicit width is given, a default value is
	* binned into [800, 720, 600, 480, 360] based on the current window's width.
	*/
	static center({ ...features }) {
		var _a;
		if (features.width == null) features.width = (_a = [
			800,
			720,
			600,
			480
		].find((width) => width <= window.outerWidth / 1.618)) != null ? _a : 360;
		features.left ??= Math.max(0, Math.round(window.screenX + (window.outerWidth - features.width) / 2));
		if (features.height != null) features.top ??= Math.max(0, Math.round(window.screenY + (window.outerHeight - features.height) / 2));
		return features;
	}
	static serialize(features) {
		return Object.entries(features).filter(([, value]) => value != null).map(([key, value]) => `${key}=${typeof value !== "boolean" ? value : value ? "yes" : "no"}`).join(",");
	}
};
var Timer = class _Timer extends Event$1 {
	constructor() {
		super(...arguments);
		this._logger = new Logger(`Timer('${this._name}')`);
		this._timerHandle = null;
		this._expiration = 0;
		this._callback = () => {
			const diff = this._expiration - _Timer.getEpochTime();
			this._logger.debug("timer completes in", diff);
			if (this._expiration <= _Timer.getEpochTime()) {
				this.cancel();
				super.raise();
			}
		};
	}
	static getEpochTime() {
		return Math.floor(Date.now() / 1e3);
	}
	init(durationInSeconds) {
		const logger2 = this._logger.create("init");
		durationInSeconds = Math.max(Math.floor(durationInSeconds), 1);
		const expiration = _Timer.getEpochTime() + durationInSeconds;
		if (this.expiration === expiration && this._timerHandle) {
			logger2.debug("skipping since already initialized for expiration at", this.expiration);
			return;
		}
		this.cancel();
		logger2.debug("using duration", durationInSeconds);
		this._expiration = expiration;
		const timerDurationInSeconds = Math.min(durationInSeconds, 5);
		this._timerHandle = setInterval(this._callback, timerDurationInSeconds * 1e3);
	}
	get expiration() {
		return this._expiration;
	}
	cancel() {
		this._logger.create("cancel");
		if (this._timerHandle) {
			clearInterval(this._timerHandle);
			this._timerHandle = null;
		}
	}
};
var UrlUtils = class {
	static readParams(url, responseMode = "query") {
		if (!url) throw new TypeError("Invalid URL");
		const params = new URL(url, "http://127.0.0.1")[responseMode === "fragment" ? "hash" : "search"];
		return new URLSearchParams(params.slice(1));
	}
};
var URL_STATE_DELIMITER = ";";
var ErrorResponse = class extends Error {
	constructor(args, form) {
		var _a, _b, _c;
		super(args.error_description || args.error || "");
		this.form = form;
		/** Marker to detect class: "ErrorResponse" */
		this.name = "ErrorResponse";
		if (!args.error) {
			Logger.error("ErrorResponse", "No error passed");
			throw new Error("No error passed");
		}
		this.error = args.error;
		this.error_description = (_a = args.error_description) != null ? _a : null;
		this.error_uri = (_b = args.error_uri) != null ? _b : null;
		this.state = args.userState;
		this.session_state = (_c = args.session_state) != null ? _c : null;
		this.url_state = args.url_state;
	}
};
var ErrorTimeout = class extends Error {
	constructor(message) {
		super(message);
		/** Marker to detect class: "ErrorTimeout" */
		this.name = "ErrorTimeout";
	}
};
var AccessTokenEvents = class {
	constructor(args) {
		this._logger = new Logger("AccessTokenEvents");
		this._expiringTimer = new Timer("Access token expiring");
		this._expiredTimer = new Timer("Access token expired");
		this._expiringNotificationTimeInSeconds = args.expiringNotificationTimeInSeconds;
	}
	async load(container) {
		const logger2 = this._logger.create("load");
		if (container.access_token && container.expires_in !== void 0) {
			const duration = container.expires_in;
			logger2.debug("access token present, remaining duration:", duration);
			if (duration > 0) {
				let expiring = duration - this._expiringNotificationTimeInSeconds;
				if (expiring <= 0) expiring = 1;
				logger2.debug("registering expiring timer, raising in", expiring, "seconds");
				this._expiringTimer.init(expiring);
			} else {
				logger2.debug("canceling existing expiring timer because we're past expiration.");
				this._expiringTimer.cancel();
			}
			const expired = duration + 1;
			logger2.debug("registering expired timer, raising in", expired, "seconds");
			this._expiredTimer.init(expired);
		} else {
			this._expiringTimer.cancel();
			this._expiredTimer.cancel();
		}
	}
	async unload() {
		this._logger.debug("unload: canceling existing access token timers");
		this._expiringTimer.cancel();
		this._expiredTimer.cancel();
	}
	/**
	* Add callback: Raised prior to the access token expiring.
	*/
	addAccessTokenExpiring(cb) {
		return this._expiringTimer.addHandler(cb);
	}
	/**
	* Remove callback: Raised prior to the access token expiring.
	*/
	removeAccessTokenExpiring(cb) {
		this._expiringTimer.removeHandler(cb);
	}
	/**
	* Add callback: Raised after the access token has expired.
	*/
	addAccessTokenExpired(cb) {
		return this._expiredTimer.addHandler(cb);
	}
	/**
	* Remove callback: Raised after the access token has expired.
	*/
	removeAccessTokenExpired(cb) {
		this._expiredTimer.removeHandler(cb);
	}
};
var CheckSessionIFrame = class {
	constructor(_callback, _client_id, url, _intervalInSeconds, _stopOnError) {
		this._callback = _callback;
		this._client_id = _client_id;
		this._intervalInSeconds = _intervalInSeconds;
		this._stopOnError = _stopOnError;
		this._logger = new Logger("CheckSessionIFrame");
		this._timer = null;
		this._session_state = null;
		this._message = (e) => {
			if (e.origin === this._frame_origin && e.source === this._frame.contentWindow) if (e.data === "error") {
				this._logger.error("error message from check session op iframe");
				if (this._stopOnError) this.stop();
			} else if (e.data === "changed") {
				this._logger.debug("changed message from check session op iframe");
				this.stop();
				this._callback();
			} else this._logger.debug(e.data + " message from check session op iframe");
		};
		const parsedUrl = new URL(url);
		this._frame_origin = parsedUrl.origin;
		this._frame = window.document.createElement("iframe");
		this._frame.style.visibility = "hidden";
		this._frame.style.position = "fixed";
		this._frame.style.left = "-1000px";
		this._frame.style.top = "0";
		this._frame.width = "0";
		this._frame.height = "0";
		this._frame.src = parsedUrl.href;
	}
	load() {
		return new Promise((resolve) => {
			this._frame.onload = () => {
				resolve();
			};
			window.document.body.appendChild(this._frame);
			window.addEventListener("message", this._message, false);
		});
	}
	start(session_state) {
		if (this._session_state === session_state) return;
		this._logger.create("start");
		this.stop();
		this._session_state = session_state;
		const send = () => {
			if (!this._frame.contentWindow || !this._session_state) return;
			this._frame.contentWindow.postMessage(this._client_id + " " + this._session_state, this._frame_origin);
		};
		send();
		this._timer = setInterval(send, this._intervalInSeconds * 1e3);
	}
	stop() {
		this._logger.create("stop");
		this._session_state = null;
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
	}
};
var InMemoryWebStorage = class {
	constructor() {
		this._logger = new Logger("InMemoryWebStorage");
		this._data = {};
	}
	clear() {
		this._logger.create("clear");
		this._data = {};
	}
	getItem(key) {
		this._logger.create(`getItem('${key}')`);
		return this._data[key];
	}
	setItem(key, value) {
		this._logger.create(`setItem('${key}')`);
		this._data[key] = value;
	}
	removeItem(key) {
		this._logger.create(`removeItem('${key}')`);
		delete this._data[key];
	}
	get length() {
		return Object.getOwnPropertyNames(this._data).length;
	}
	key(index) {
		return Object.getOwnPropertyNames(this._data)[index];
	}
};
var ErrorDPoPNonce = class extends Error {
	constructor(nonce, message) {
		super(message);
		/** Marker to detect class: "ErrorDPoPNonce" */
		this.name = "ErrorDPoPNonce";
		this.nonce = nonce;
	}
};
var JsonService = class {
	constructor(additionalContentTypes = [], _jwtHandler = null, _extraHeaders = {}) {
		this._jwtHandler = _jwtHandler;
		this._extraHeaders = _extraHeaders;
		this._logger = new Logger("JsonService");
		this._contentTypes = [];
		this._contentTypes.push(...additionalContentTypes, "application/json");
		if (_jwtHandler) this._contentTypes.push("application/jwt");
	}
	async fetchWithTimeout(input, init = {}) {
		const { timeoutInSeconds, ...initFetch } = init;
		if (!timeoutInSeconds) return await fetch(input, initFetch);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutInSeconds * 1e3);
		try {
			return await fetch(input, {
				...init,
				signal: controller.signal
			});
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") throw new ErrorTimeout("Network timed out");
			throw err;
		} finally {
			clearTimeout(timeoutId);
		}
	}
	async getJson(url, { token, credentials, timeoutInSeconds } = {}) {
		const logger2 = this._logger.create("getJson");
		const headers = { "Accept": this._contentTypes.join(", ") };
		if (token) {
			logger2.debug("token passed, setting Authorization header");
			headers["Authorization"] = "Bearer " + token;
		}
		this._appendExtraHeaders(headers);
		let response;
		try {
			logger2.debug("url:", url);
			response = await this.fetchWithTimeout(url, {
				method: "GET",
				headers,
				timeoutInSeconds,
				credentials
			});
		} catch (err) {
			logger2.error("Network Error");
			throw err;
		}
		logger2.debug("HTTP response received, status", response.status);
		const contentType = response.headers.get("Content-Type");
		if (contentType && !this._contentTypes.find((item) => contentType.startsWith(item))) logger2.throw(/* @__PURE__ */ new Error(`Invalid response Content-Type: ${contentType != null ? contentType : "undefined"}, from URL: ${url}`));
		if (response.ok && this._jwtHandler && (contentType == null ? void 0 : contentType.startsWith("application/jwt"))) return await this._jwtHandler(await response.text());
		let json;
		try {
			json = await response.json();
		} catch (err) {
			logger2.error("Error parsing JSON response", err);
			if (response.ok) throw err;
			throw new Error(`${response.statusText} (${response.status})`);
		}
		if (!response.ok) {
			logger2.error("Error from server:", json);
			if (json.error) throw new ErrorResponse(json);
			throw new Error(`${response.statusText} (${response.status}): ${JSON.stringify(json)}`);
		}
		return json;
	}
	async postForm(url, { body, basicAuth, timeoutInSeconds, initCredentials, extraHeaders }) {
		const logger2 = this._logger.create("postForm");
		const headers = {
			"Accept": this._contentTypes.join(", "),
			"Content-Type": "application/x-www-form-urlencoded",
			...extraHeaders
		};
		if (basicAuth !== void 0) headers["Authorization"] = "Basic " + basicAuth;
		this._appendExtraHeaders(headers);
		let response;
		try {
			logger2.debug("url:", url);
			response = await this.fetchWithTimeout(url, {
				method: "POST",
				headers,
				body,
				timeoutInSeconds,
				credentials: initCredentials
			});
		} catch (err) {
			logger2.error("Network error");
			throw err;
		}
		logger2.debug("HTTP response received, status", response.status);
		const contentType = response.headers.get("Content-Type");
		if (contentType && !this._contentTypes.find((item) => contentType.startsWith(item))) throw new Error(`Invalid response Content-Type: ${contentType != null ? contentType : "undefined"}, from URL: ${url}`);
		const responseText = await response.text();
		let json = {};
		if (responseText) try {
			json = JSON.parse(responseText);
		} catch (err) {
			logger2.error("Error parsing JSON response", err);
			if (response.ok) throw err;
			throw new Error(`${response.statusText} (${response.status})`);
		}
		if (!response.ok) {
			logger2.error("Error from server:", json);
			if (response.headers.has("dpop-nonce")) throw new ErrorDPoPNonce(response.headers.get("dpop-nonce"), `${JSON.stringify(json)}`);
			if (json.error) throw new ErrorResponse(json, body);
			throw new Error(`${response.statusText} (${response.status}): ${JSON.stringify(json)}`);
		}
		return json;
	}
	_appendExtraHeaders(headers) {
		const logger2 = this._logger.create("appendExtraHeaders");
		const customKeys = Object.keys(this._extraHeaders);
		const protectedHeaders = ["accept", "content-type"];
		const preventOverride = ["authorization"];
		if (customKeys.length === 0) return;
		customKeys.forEach((headerName) => {
			if (protectedHeaders.includes(headerName.toLocaleLowerCase())) {
				logger2.warn("Protected header could not be set", headerName, protectedHeaders);
				return;
			}
			if (preventOverride.includes(headerName.toLocaleLowerCase()) && Object.keys(headers).includes(headerName)) {
				logger2.warn("Header could not be overridden", headerName, preventOverride);
				return;
			}
			const content = typeof this._extraHeaders[headerName] === "function" ? this._extraHeaders[headerName]() : this._extraHeaders[headerName];
			if (content && content !== "") headers[headerName] = content;
		});
	}
};
var MetadataService = class {
	constructor(_settings) {
		this._settings = _settings;
		this._logger = new Logger("MetadataService");
		this._signingKeys = null;
		this._metadata = null;
		this._metadataUrl = this._settings.metadataUrl;
		this._jsonService = new JsonService(["application/jwk-set+json"], null, this._settings.extraHeaders);
		if (this._settings.signingKeys) {
			this._logger.debug("using signingKeys from settings");
			this._signingKeys = this._settings.signingKeys;
		}
		if (this._settings.metadata) {
			this._logger.debug("using metadata from settings");
			this._metadata = this._settings.metadata;
		}
		if (this._settings.fetchRequestCredentials) {
			this._logger.debug("using fetchRequestCredentials from settings");
			this._fetchRequestCredentials = this._settings.fetchRequestCredentials;
		}
	}
	resetSigningKeys() {
		this._signingKeys = null;
	}
	async getMetadata() {
		const logger2 = this._logger.create("getMetadata");
		if (this._metadata) {
			logger2.debug("using cached values");
			return this._metadata;
		}
		if (!this._metadataUrl) {
			logger2.throw(/* @__PURE__ */ new Error("No authority or metadataUrl configured on settings"));
			throw null;
		}
		logger2.debug("getting metadata from", this._metadataUrl);
		const metadata = await this._jsonService.getJson(this._metadataUrl, {
			credentials: this._fetchRequestCredentials,
			timeoutInSeconds: this._settings.requestTimeoutInSeconds
		});
		logger2.debug("merging remote JSON with seed metadata");
		this._metadata = Object.assign({}, metadata, this._settings.metadataSeed);
		return this._metadata;
	}
	getIssuer() {
		return this._getMetadataProperty("issuer");
	}
	getAuthorizationEndpoint() {
		return this._getMetadataProperty("authorization_endpoint");
	}
	getUserInfoEndpoint() {
		return this._getMetadataProperty("userinfo_endpoint");
	}
	getTokenEndpoint(optional = true) {
		return this._getMetadataProperty("token_endpoint", optional);
	}
	getCheckSessionIframe() {
		return this._getMetadataProperty("check_session_iframe", true);
	}
	getEndSessionEndpoint() {
		return this._getMetadataProperty("end_session_endpoint", true);
	}
	getRevocationEndpoint(optional = true) {
		return this._getMetadataProperty("revocation_endpoint", optional);
	}
	getKeysEndpoint(optional = true) {
		return this._getMetadataProperty("jwks_uri", optional);
	}
	async _getMetadataProperty(name, optional = false) {
		const logger2 = this._logger.create(`_getMetadataProperty('${name}')`);
		const metadata = await this.getMetadata();
		logger2.debug("resolved");
		if (metadata[name] === void 0) {
			if (optional === true) {
				logger2.warn("Metadata does not contain optional property");
				return;
			}
			logger2.throw(/* @__PURE__ */ new Error("Metadata does not contain property " + name));
		}
		return metadata[name];
	}
	async getSigningKeys() {
		const logger2 = this._logger.create("getSigningKeys");
		if (this._signingKeys) {
			logger2.debug("returning signingKeys from cache");
			return this._signingKeys;
		}
		const jwks_uri = await this.getKeysEndpoint(false);
		logger2.debug("got jwks_uri", jwks_uri);
		const keySet = await this._jsonService.getJson(jwks_uri, { timeoutInSeconds: this._settings.requestTimeoutInSeconds });
		logger2.debug("got key set", keySet);
		if (!Array.isArray(keySet.keys)) {
			logger2.throw(/* @__PURE__ */ new Error("Missing keys on keyset"));
			throw null;
		}
		this._signingKeys = keySet.keys;
		return this._signingKeys;
	}
};
var WebStorageStateStore = class {
	constructor({ prefix = "oidc.", store = localStorage } = {}) {
		this._logger = new Logger("WebStorageStateStore");
		this._store = store;
		this._prefix = prefix;
	}
	async set(key, value) {
		this._logger.create(`set('${key}')`);
		key = this._prefix + key;
		await this._store.setItem(key, value);
	}
	async get(key) {
		this._logger.create(`get('${key}')`);
		key = this._prefix + key;
		return await this._store.getItem(key);
	}
	async remove(key) {
		this._logger.create(`remove('${key}')`);
		key = this._prefix + key;
		const item = await this._store.getItem(key);
		await this._store.removeItem(key);
		return item;
	}
	async getAllKeys() {
		this._logger.create("getAllKeys");
		const len = await this._store.length;
		const keys = [];
		for (let index = 0; index < len; index++) {
			const key = await this._store.key(index);
			if (key && key.indexOf(this._prefix) === 0) keys.push(key.substr(this._prefix.length));
		}
		return keys;
	}
};
var DefaultResponseType = "code";
var DefaultScope = "openid";
var DefaultClientAuthentication = "client_secret_post";
var DefaultStaleStateAgeInSeconds = 900;
var OidcClientSettingsStore = class {
	constructor({ authority, metadataUrl, metadata, signingKeys, metadataSeed, client_id, client_secret, response_type = DefaultResponseType, scope = DefaultScope, redirect_uri, post_logout_redirect_uri, client_authentication = DefaultClientAuthentication, token_endpoint_auth_signing_alg = "HS256", prompt, display, max_age, ui_locales, acr_values, resource, response_mode, filterProtocolClaims = true, loadUserInfo = false, requestTimeoutInSeconds, staleStateAgeInSeconds = DefaultStaleStateAgeInSeconds, mergeClaimsStrategy = { array: "replace" }, disablePKCE = false, stateStore, revokeTokenAdditionalContentTypes, fetchRequestCredentials, refreshTokenAllowedScope, extraQueryParams = {}, extraTokenParams = {}, extraHeaders = {}, dpop, omitScopeWhenRequesting = false }) {
		var _a;
		this.authority = authority;
		if (metadataUrl) this.metadataUrl = metadataUrl;
		else {
			this.metadataUrl = authority;
			if (authority) {
				if (!this.metadataUrl.endsWith("/")) this.metadataUrl += "/";
				this.metadataUrl += ".well-known/openid-configuration";
			}
		}
		this.metadata = metadata;
		this.metadataSeed = metadataSeed;
		this.signingKeys = signingKeys;
		this.client_id = client_id;
		this.client_secret = client_secret;
		this.response_type = response_type;
		this.scope = scope;
		this.redirect_uri = redirect_uri;
		this.post_logout_redirect_uri = post_logout_redirect_uri;
		this.client_authentication = client_authentication;
		this.token_endpoint_auth_signing_alg = token_endpoint_auth_signing_alg;
		this.prompt = prompt;
		this.display = display;
		this.max_age = max_age;
		this.ui_locales = ui_locales;
		this.acr_values = acr_values;
		this.resource = resource;
		this.response_mode = response_mode;
		this.filterProtocolClaims = filterProtocolClaims != null ? filterProtocolClaims : true;
		this.loadUserInfo = !!loadUserInfo;
		this.staleStateAgeInSeconds = staleStateAgeInSeconds;
		this.mergeClaimsStrategy = mergeClaimsStrategy;
		this.omitScopeWhenRequesting = omitScopeWhenRequesting;
		this.disablePKCE = !!disablePKCE;
		this.revokeTokenAdditionalContentTypes = revokeTokenAdditionalContentTypes;
		this.fetchRequestCredentials = fetchRequestCredentials ? fetchRequestCredentials : "same-origin";
		this.requestTimeoutInSeconds = requestTimeoutInSeconds;
		if (stateStore) this.stateStore = stateStore;
		else {
			const store = typeof window !== "undefined" ? window.localStorage : new InMemoryWebStorage();
			this.stateStore = new WebStorageStateStore({ store });
		}
		this.refreshTokenAllowedScope = refreshTokenAllowedScope;
		this.extraQueryParams = extraQueryParams;
		this.extraTokenParams = extraTokenParams;
		this.extraHeaders = extraHeaders;
		this.dpop = dpop;
		if (this.dpop && !((_a = this.dpop) == null ? void 0 : _a.store)) throw new Error("A DPoPStore is required when dpop is enabled");
	}
};
var UserInfoService = class {
	constructor(_settings, _metadataService) {
		this._settings = _settings;
		this._metadataService = _metadataService;
		this._logger = new Logger("UserInfoService");
		this._getClaimsFromJwt = async (responseText) => {
			const logger2 = this._logger.create("_getClaimsFromJwt");
			try {
				const payload = JwtUtils.decode(responseText);
				logger2.debug("JWT decoding successful");
				return payload;
			} catch (err) {
				logger2.error("Error parsing JWT response");
				throw err;
			}
		};
		this._jsonService = new JsonService(void 0, this._getClaimsFromJwt, this._settings.extraHeaders);
	}
	async getClaims(token) {
		const logger2 = this._logger.create("getClaims");
		if (!token) this._logger.throw(/* @__PURE__ */ new Error("No token passed"));
		const url = await this._metadataService.getUserInfoEndpoint();
		logger2.debug("got userinfo url", url);
		const claims = await this._jsonService.getJson(url, {
			token,
			credentials: this._settings.fetchRequestCredentials,
			timeoutInSeconds: this._settings.requestTimeoutInSeconds
		});
		logger2.debug("got claims", claims);
		return claims;
	}
};
var TokenClient = class {
	constructor(_settings, _metadataService) {
		this._settings = _settings;
		this._metadataService = _metadataService;
		this._logger = new Logger("TokenClient");
		this._jsonService = new JsonService(this._settings.revokeTokenAdditionalContentTypes, null, this._settings.extraHeaders);
	}
	/**
	* Exchange code.
	*
	* @see https://www.rfc-editor.org/rfc/rfc6749#section-4.1.3
	*/
	async exchangeCode({ grant_type = "authorization_code", redirect_uri = this._settings.redirect_uri, client_id = this._settings.client_id, client_secret = this._settings.client_secret, extraHeaders, ...args }) {
		const logger2 = this._logger.create("exchangeCode");
		if (!client_id) logger2.throw(/* @__PURE__ */ new Error("A client_id is required"));
		if (!redirect_uri) logger2.throw(/* @__PURE__ */ new Error("A redirect_uri is required"));
		if (!args.code) logger2.throw(/* @__PURE__ */ new Error("A code is required"));
		const params = new URLSearchParams({
			grant_type,
			redirect_uri
		});
		for (const [key, value] of Object.entries(args)) if (value != null) params.set(key, value);
		if ((this._settings.client_authentication === "client_secret_basic" || this._settings.client_authentication === "client_secret_jwt") && (client_secret === void 0 || client_secret === null)) {
			logger2.throw(/* @__PURE__ */ new Error("A client_secret is required"));
			throw null;
		}
		let basicAuth;
		const url = await this._metadataService.getTokenEndpoint(false);
		switch (this._settings.client_authentication) {
			case "client_secret_basic":
				basicAuth = CryptoUtils.generateBasicAuth(client_id, client_secret);
				break;
			case "client_secret_post":
				params.append("client_id", client_id);
				if (client_secret) params.append("client_secret", client_secret);
				break;
			case "client_secret_jwt": {
				const clientAssertion = await CryptoUtils.generateClientAssertionJwt(client_id, client_secret, url, this._settings.token_endpoint_auth_signing_alg);
				params.append("client_id", client_id);
				params.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
				params.append("client_assertion", clientAssertion);
				break;
			}
		}
		logger2.debug("got token endpoint");
		const response = await this._jsonService.postForm(url, {
			body: params,
			basicAuth,
			timeoutInSeconds: this._settings.requestTimeoutInSeconds,
			initCredentials: this._settings.fetchRequestCredentials,
			extraHeaders
		});
		logger2.debug("got response");
		return response;
	}
	/**
	* Exchange credentials.
	*
	* @see https://www.rfc-editor.org/rfc/rfc6749#section-4.3.2
	*/
	async exchangeCredentials({ grant_type = "password", client_id = this._settings.client_id, client_secret = this._settings.client_secret, scope = this._settings.scope, ...args }) {
		const logger2 = this._logger.create("exchangeCredentials");
		if (!client_id) logger2.throw(/* @__PURE__ */ new Error("A client_id is required"));
		const params = new URLSearchParams({ grant_type });
		if (!this._settings.omitScopeWhenRequesting) params.set("scope", scope);
		for (const [key, value] of Object.entries(args)) if (value != null) params.set(key, value);
		if ((this._settings.client_authentication === "client_secret_basic" || this._settings.client_authentication === "client_secret_jwt") && (client_secret === void 0 || client_secret === null)) {
			logger2.throw(/* @__PURE__ */ new Error("A client_secret is required"));
			throw null;
		}
		let basicAuth;
		const url = await this._metadataService.getTokenEndpoint(false);
		switch (this._settings.client_authentication) {
			case "client_secret_basic":
				basicAuth = CryptoUtils.generateBasicAuth(client_id, client_secret);
				break;
			case "client_secret_post":
				params.append("client_id", client_id);
				if (client_secret) params.append("client_secret", client_secret);
				break;
			case "client_secret_jwt": {
				const clientAssertion = await CryptoUtils.generateClientAssertionJwt(client_id, client_secret, url, this._settings.token_endpoint_auth_signing_alg);
				params.append("client_id", client_id);
				params.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
				params.append("client_assertion", clientAssertion);
				break;
			}
		}
		logger2.debug("got token endpoint");
		const response = await this._jsonService.postForm(url, {
			body: params,
			basicAuth,
			timeoutInSeconds: this._settings.requestTimeoutInSeconds,
			initCredentials: this._settings.fetchRequestCredentials
		});
		logger2.debug("got response");
		return response;
	}
	/**
	* Exchange a refresh token.
	*
	* @see https://www.rfc-editor.org/rfc/rfc6749#section-6
	*/
	async exchangeRefreshToken({ grant_type = "refresh_token", client_id = this._settings.client_id, client_secret = this._settings.client_secret, timeoutInSeconds, extraHeaders, ...args }) {
		const logger2 = this._logger.create("exchangeRefreshToken");
		if (!client_id) logger2.throw(/* @__PURE__ */ new Error("A client_id is required"));
		if (!args.refresh_token) logger2.throw(/* @__PURE__ */ new Error("A refresh_token is required"));
		const params = new URLSearchParams({ grant_type });
		for (const [key, value] of Object.entries(args)) if (Array.isArray(value)) value.forEach((param) => params.append(key, param));
		else if (value != null) params.set(key, value);
		if ((this._settings.client_authentication === "client_secret_basic" || this._settings.client_authentication === "client_secret_jwt") && (client_secret === void 0 || client_secret === null)) {
			logger2.throw(/* @__PURE__ */ new Error("A client_secret is required"));
			throw null;
		}
		let basicAuth;
		const url = await this._metadataService.getTokenEndpoint(false);
		switch (this._settings.client_authentication) {
			case "client_secret_basic":
				basicAuth = CryptoUtils.generateBasicAuth(client_id, client_secret);
				break;
			case "client_secret_post":
				params.append("client_id", client_id);
				if (client_secret) params.append("client_secret", client_secret);
				break;
			case "client_secret_jwt": {
				const clientAssertion = await CryptoUtils.generateClientAssertionJwt(client_id, client_secret, url, this._settings.token_endpoint_auth_signing_alg);
				params.append("client_id", client_id);
				params.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
				params.append("client_assertion", clientAssertion);
				break;
			}
		}
		logger2.debug("got token endpoint");
		const response = await this._jsonService.postForm(url, {
			body: params,
			basicAuth,
			timeoutInSeconds,
			initCredentials: this._settings.fetchRequestCredentials,
			extraHeaders
		});
		logger2.debug("got response");
		return response;
	}
	/**
	* Revoke an access or refresh token.
	*
	* @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
	*/
	async revoke(args) {
		var _a;
		const logger2 = this._logger.create("revoke");
		if (!args.token) logger2.throw(/* @__PURE__ */ new Error("A token is required"));
		const url = await this._metadataService.getRevocationEndpoint(false);
		logger2.debug(`got revocation endpoint, revoking ${(_a = args.token_type_hint) != null ? _a : "default token type"}`);
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(args)) if (value != null) params.set(key, value);
		params.set("client_id", this._settings.client_id);
		if (this._settings.client_secret) params.set("client_secret", this._settings.client_secret);
		await this._jsonService.postForm(url, {
			body: params,
			timeoutInSeconds: this._settings.requestTimeoutInSeconds
		});
		logger2.debug("got response");
	}
};
var ResponseValidator = class {
	constructor(_settings, _metadataService, _claimsService) {
		this._settings = _settings;
		this._metadataService = _metadataService;
		this._claimsService = _claimsService;
		this._logger = new Logger("ResponseValidator");
		this._userInfoService = new UserInfoService(this._settings, this._metadataService);
		this._tokenClient = new TokenClient(this._settings, this._metadataService);
	}
	async validateSigninResponse(response, state, extraHeaders) {
		const logger2 = this._logger.create("validateSigninResponse");
		this._processSigninState(response, state);
		logger2.debug("state processed");
		await this._processCode(response, state, extraHeaders);
		logger2.debug("code processed");
		if (response.isOpenId) this._validateIdTokenAttributes(response, "", state.nonce);
		logger2.debug("tokens validated");
		await this._processClaims(response, state == null ? void 0 : state.skipUserInfo, response.isOpenId);
		logger2.debug("claims processed");
	}
	async validateCredentialsResponse(response, skipUserInfo) {
		const logger2 = this._logger.create("validateCredentialsResponse");
		const shouldValidateSubClaim = response.isOpenId && !!response.id_token;
		if (shouldValidateSubClaim) this._validateIdTokenAttributes(response);
		logger2.debug("tokens validated");
		await this._processClaims(response, skipUserInfo, shouldValidateSubClaim);
		logger2.debug("claims processed");
	}
	async validateRefreshResponse(response, state) {
		const logger2 = this._logger.create("validateRefreshResponse");
		response.userState = state.data;
		response.session_state ??= state.session_state;
		response.scope ??= state.scope;
		if (response.isOpenId && !!response.id_token) {
			this._validateIdTokenAttributes(response, state.id_token);
			logger2.debug("ID Token validated");
		}
		if (!response.id_token) {
			response.id_token = state.id_token;
			response.profile = state.profile;
		}
		const hasIdToken = response.isOpenId && !!response.id_token;
		await this._processClaims(response, false, hasIdToken);
		logger2.debug("claims processed");
	}
	validateSignoutResponse(response, state) {
		const logger2 = this._logger.create("validateSignoutResponse");
		if (state.id !== response.state) logger2.throw(/* @__PURE__ */ new Error("State does not match"));
		logger2.debug("state validated");
		response.userState = state.data;
		if (response.error) {
			logger2.warn("Response was error", response.error);
			throw new ErrorResponse(response);
		}
	}
	_processSigninState(response, state) {
		const logger2 = this._logger.create("_processSigninState");
		if (state.id !== response.state) logger2.throw(/* @__PURE__ */ new Error("State does not match"));
		if (!state.client_id) logger2.throw(/* @__PURE__ */ new Error("No client_id on state"));
		if (!state.authority) logger2.throw(/* @__PURE__ */ new Error("No authority on state"));
		if (this._settings.authority !== state.authority) logger2.throw(/* @__PURE__ */ new Error("authority mismatch on settings vs. signin state"));
		if (this._settings.client_id && this._settings.client_id !== state.client_id) logger2.throw(/* @__PURE__ */ new Error("client_id mismatch on settings vs. signin state"));
		logger2.debug("state validated");
		response.userState = state.data;
		response.url_state = state.url_state;
		response.scope ??= state.scope;
		if (response.error) {
			logger2.warn("Response was error", response.error);
			throw new ErrorResponse(response);
		}
		if (state.code_verifier && !response.code) logger2.throw(/* @__PURE__ */ new Error("Expected code in response"));
	}
	async _processClaims(response, skipUserInfo = false, validateSub = true) {
		const logger2 = this._logger.create("_processClaims");
		response.profile = this._claimsService.filterProtocolClaims(response.profile);
		if (skipUserInfo || !this._settings.loadUserInfo || !response.access_token) {
			logger2.debug("not loading user info");
			return;
		}
		logger2.debug("loading user info");
		const claims = await this._userInfoService.getClaims(response.access_token);
		logger2.debug("user info claims received from user info endpoint");
		if (validateSub && claims.sub !== response.profile.sub) logger2.throw(/* @__PURE__ */ new Error("subject from UserInfo response does not match subject in ID Token"));
		response.profile = this._claimsService.mergeClaims(response.profile, this._claimsService.filterProtocolClaims(claims));
		logger2.debug("user info claims received, updated profile:", response.profile);
	}
	async _processCode(response, state, extraHeaders) {
		const logger2 = this._logger.create("_processCode");
		if (response.code) {
			logger2.debug("Validating code");
			const tokenResponse = await this._tokenClient.exchangeCode({
				client_id: state.client_id,
				client_secret: state.client_secret,
				code: response.code,
				redirect_uri: state.redirect_uri,
				code_verifier: state.code_verifier,
				extraHeaders,
				...state.extraTokenParams
			});
			Object.assign(response, tokenResponse);
		} else logger2.debug("No code to process");
	}
	_validateIdTokenAttributes(response, existingToken, nonce) {
		var _a;
		const logger2 = this._logger.create("_validateIdTokenAttributes");
		logger2.debug("decoding ID Token JWT");
		const incoming = JwtUtils.decode((_a = response.id_token) != null ? _a : "");
		if (!incoming.sub) logger2.throw(/* @__PURE__ */ new Error("ID Token is missing a subject claim"));
		if (nonce && incoming.nonce !== nonce) logger2.throw(/* @__PURE__ */ new Error("nonce in id_token does not match nonce in client storage"));
		if (existingToken) {
			const existing = JwtUtils.decode(existingToken);
			if (incoming.sub !== existing.sub) logger2.throw(/* @__PURE__ */ new Error("sub in id_token does not match current sub"));
			if (incoming.auth_time && incoming.auth_time !== existing.auth_time) logger2.throw(/* @__PURE__ */ new Error("auth_time in id_token does not match original auth_time"));
			if (incoming.azp && incoming.azp !== existing.azp) logger2.throw(/* @__PURE__ */ new Error("azp in id_token does not match original azp"));
			if (!incoming.azp && existing.azp) logger2.throw(/* @__PURE__ */ new Error("azp not in id_token, but present in original id_token"));
		}
		response.profile = incoming;
	}
};
var State = class _State {
	constructor(args) {
		this.id = args.id || CryptoUtils.generateUUIDv4();
		this.data = args.data;
		if (args.created && args.created > 0) this.created = args.created;
		else this.created = Timer.getEpochTime();
		this.request_type = args.request_type;
		this.url_state = args.url_state;
	}
	toStorageString() {
		new Logger("State").create("toStorageString");
		return JSON.stringify({
			id: this.id,
			data: this.data,
			created: this.created,
			request_type: this.request_type,
			url_state: this.url_state
		});
	}
	static fromStorageString(storageString) {
		Logger.createStatic("State", "fromStorageString");
		return Promise.resolve(new _State(JSON.parse(storageString)));
	}
	static async clearStaleState(storage, age) {
		const logger2 = Logger.createStatic("State", "clearStaleState");
		const cutoff = Timer.getEpochTime() - age;
		const keys = await storage.getAllKeys();
		logger2.debug("got keys", keys);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const item = await storage.get(key);
			let remove = false;
			if (item) try {
				const state = await _State.fromStorageString(item);
				logger2.debug("got item from key:", key, state.created);
				if (state.created <= cutoff) remove = true;
			} catch (err) {
				logger2.error("Error parsing state for key:", key, err);
				remove = true;
			}
			else {
				logger2.debug("no item in storage for key:", key);
				remove = true;
			}
			if (remove) {
				logger2.debug("removed item for key:", key);
				storage.remove(key);
			}
		}
	}
};
var SigninState = class _SigninState extends State {
	constructor(args) {
		super(args);
		this.code_verifier = args.code_verifier;
		this.code_challenge = args.code_challenge;
		this.authority = args.authority;
		this.client_id = args.client_id;
		this.redirect_uri = args.redirect_uri;
		this.scope = args.scope;
		this.client_secret = args.client_secret;
		this.extraTokenParams = args.extraTokenParams;
		this.response_mode = args.response_mode;
		this.skipUserInfo = args.skipUserInfo;
		this.nonce = args.nonce;
	}
	static async create(args) {
		const code_verifier = args.code_verifier === true ? CryptoUtils.generateCodeVerifier() : args.code_verifier || void 0;
		const code_challenge = code_verifier ? await CryptoUtils.generateCodeChallenge(code_verifier) : void 0;
		return new _SigninState({
			...args,
			code_verifier,
			code_challenge
		});
	}
	toStorageString() {
		new Logger("SigninState").create("toStorageString");
		return JSON.stringify({
			id: this.id,
			data: this.data,
			created: this.created,
			request_type: this.request_type,
			url_state: this.url_state,
			code_verifier: this.code_verifier,
			authority: this.authority,
			client_id: this.client_id,
			redirect_uri: this.redirect_uri,
			scope: this.scope,
			client_secret: this.client_secret,
			extraTokenParams: this.extraTokenParams,
			response_mode: this.response_mode,
			skipUserInfo: this.skipUserInfo,
			nonce: this.nonce
		});
	}
	static fromStorageString(storageString) {
		Logger.createStatic("SigninState", "fromStorageString");
		const data = JSON.parse(storageString);
		return _SigninState.create(data);
	}
};
var _SigninRequest = class _SigninRequest {
	constructor(args) {
		this.url = args.url;
		this.state = args.state;
	}
	static async create({ url, authority, client_id, redirect_uri, response_type, scope, state_data, response_mode, request_type, client_secret, nonce, url_state, resource, skipUserInfo, extraQueryParams, extraTokenParams, disablePKCE, dpopJkt, omitScopeWhenRequesting, ...optionalParams }) {
		if (!url) {
			this._logger.error("create: No url passed");
			throw new Error("url");
		}
		if (!client_id) {
			this._logger.error("create: No client_id passed");
			throw new Error("client_id");
		}
		if (!redirect_uri) {
			this._logger.error("create: No redirect_uri passed");
			throw new Error("redirect_uri");
		}
		if (!response_type) {
			this._logger.error("create: No response_type passed");
			throw new Error("response_type");
		}
		if (!scope) {
			this._logger.error("create: No scope passed");
			throw new Error("scope");
		}
		if (!authority) {
			this._logger.error("create: No authority passed");
			throw new Error("authority");
		}
		const state = await SigninState.create({
			data: state_data,
			request_type,
			url_state,
			code_verifier: !disablePKCE,
			client_id,
			authority,
			redirect_uri,
			response_mode,
			client_secret,
			scope,
			extraTokenParams,
			skipUserInfo,
			nonce
		});
		const parsedUrl = new URL(url);
		parsedUrl.searchParams.append("client_id", client_id);
		parsedUrl.searchParams.append("redirect_uri", redirect_uri);
		parsedUrl.searchParams.append("response_type", response_type);
		if (!omitScopeWhenRequesting) parsedUrl.searchParams.append("scope", scope);
		if (nonce) parsedUrl.searchParams.append("nonce", nonce);
		if (dpopJkt) parsedUrl.searchParams.append("dpop_jkt", dpopJkt);
		let stateParam = state.id;
		if (url_state) stateParam = `${stateParam}${URL_STATE_DELIMITER}${url_state}`;
		parsedUrl.searchParams.append("state", stateParam);
		if (state.code_challenge) {
			parsedUrl.searchParams.append("code_challenge", state.code_challenge);
			parsedUrl.searchParams.append("code_challenge_method", "S256");
		}
		if (resource) (Array.isArray(resource) ? resource : [resource]).forEach((r) => parsedUrl.searchParams.append("resource", r));
		for (const [key, value] of Object.entries({
			response_mode,
			...optionalParams,
			...extraQueryParams
		})) if (value != null) parsedUrl.searchParams.append(key, value.toString());
		return new _SigninRequest({
			url: parsedUrl.href,
			state
		});
	}
};
_SigninRequest._logger = new Logger("SigninRequest");
var SigninRequest = _SigninRequest;
var OidcScope = "openid";
var SigninResponse = class {
	constructor(params) {
		/** @see {@link User.access_token} */
		this.access_token = "";
		/** @see {@link User.token_type} */
		this.token_type = "";
		/** @see {@link User.profile} */
		this.profile = {};
		this.state = params.get("state");
		this.session_state = params.get("session_state");
		if (this.state) {
			const splitState = decodeURIComponent(this.state).split(URL_STATE_DELIMITER);
			this.state = splitState[0];
			if (splitState.length > 1) this.url_state = splitState.slice(1).join(URL_STATE_DELIMITER);
		}
		this.error = params.get("error");
		this.error_description = params.get("error_description");
		this.error_uri = params.get("error_uri");
		this.code = params.get("code");
	}
	get expires_in() {
		if (this.expires_at === void 0) return;
		return this.expires_at - Timer.getEpochTime();
	}
	set expires_in(value) {
		if (typeof value === "string") value = Number(value);
		if (value !== void 0 && value >= 0) this.expires_at = Math.floor(value) + Timer.getEpochTime();
	}
	get isOpenId() {
		var _a;
		return ((_a = this.scope) == null ? void 0 : _a.split(" ").includes(OidcScope)) || !!this.id_token;
	}
};
var SignoutRequest = class {
	constructor({ url, state_data, id_token_hint, post_logout_redirect_uri, extraQueryParams, request_type, client_id, url_state }) {
		this._logger = new Logger("SignoutRequest");
		if (!url) {
			this._logger.error("ctor: No url passed");
			throw new Error("url");
		}
		const parsedUrl = new URL(url);
		if (id_token_hint) parsedUrl.searchParams.append("id_token_hint", id_token_hint);
		if (client_id) parsedUrl.searchParams.append("client_id", client_id);
		if (post_logout_redirect_uri) {
			parsedUrl.searchParams.append("post_logout_redirect_uri", post_logout_redirect_uri);
			if (state_data || url_state) {
				this.state = new State({
					data: state_data,
					request_type,
					url_state
				});
				let stateParam = this.state.id;
				if (url_state) stateParam = `${stateParam}${URL_STATE_DELIMITER}${url_state}`;
				parsedUrl.searchParams.append("state", stateParam);
			}
		}
		for (const [key, value] of Object.entries({ ...extraQueryParams })) if (value != null) parsedUrl.searchParams.append(key, value.toString());
		this.url = parsedUrl.href;
	}
};
var SignoutResponse = class {
	constructor(params) {
		this.state = params.get("state");
		if (this.state) {
			const splitState = decodeURIComponent(this.state).split(URL_STATE_DELIMITER);
			this.state = splitState[0];
			if (splitState.length > 1) this.url_state = splitState.slice(1).join(URL_STATE_DELIMITER);
		}
		this.error = params.get("error");
		this.error_description = params.get("error_description");
		this.error_uri = params.get("error_uri");
	}
};
var DefaultProtocolClaims = [
	"nbf",
	"jti",
	"auth_time",
	"nonce",
	"acr",
	"amr",
	"azp",
	"at_hash"
];
var InternalRequiredProtocolClaims = [
	"sub",
	"iss",
	"aud",
	"exp",
	"iat"
];
var ClaimsService = class {
	constructor(_settings) {
		this._settings = _settings;
		this._logger = new Logger("ClaimsService");
	}
	filterProtocolClaims(claims) {
		const result = { ...claims };
		if (this._settings.filterProtocolClaims) {
			let protocolClaims;
			if (Array.isArray(this._settings.filterProtocolClaims)) protocolClaims = this._settings.filterProtocolClaims;
			else protocolClaims = DefaultProtocolClaims;
			for (const claim of protocolClaims) if (!InternalRequiredProtocolClaims.includes(claim)) delete result[claim];
		}
		return result;
	}
	mergeClaims(claims1, claims2) {
		const result = { ...claims1 };
		for (const [claim, values] of Object.entries(claims2)) if (result[claim] !== values) if (Array.isArray(result[claim]) || Array.isArray(values)) if (this._settings.mergeClaimsStrategy.array == "replace") result[claim] = values;
		else {
			const mergedValues = Array.isArray(result[claim]) ? result[claim] : [result[claim]];
			for (const value of Array.isArray(values) ? values : [values]) if (!mergedValues.includes(value)) mergedValues.push(value);
			result[claim] = mergedValues;
		}
		else if (typeof result[claim] === "object" && typeof values === "object") result[claim] = this.mergeClaims(result[claim], values);
		else result[claim] = values;
		return result;
	}
};
var DPoPState = class {
	constructor(keys, nonce) {
		this.keys = keys;
		this.nonce = nonce;
	}
};
var OidcClient = class {
	constructor(settings, metadataService) {
		this._logger = new Logger("OidcClient");
		this.settings = settings instanceof OidcClientSettingsStore ? settings : new OidcClientSettingsStore(settings);
		this.metadataService = metadataService != null ? metadataService : new MetadataService(this.settings);
		this._claimsService = new ClaimsService(this.settings);
		this._validator = new ResponseValidator(this.settings, this.metadataService, this._claimsService);
		this._tokenClient = new TokenClient(this.settings, this.metadataService);
	}
	async createSigninRequest({ state, request, request_uri, request_type, id_token_hint, login_hint, skipUserInfo, nonce, url_state, response_type = this.settings.response_type, scope = this.settings.scope, redirect_uri = this.settings.redirect_uri, prompt = this.settings.prompt, display = this.settings.display, max_age = this.settings.max_age, ui_locales = this.settings.ui_locales, acr_values = this.settings.acr_values, resource = this.settings.resource, response_mode = this.settings.response_mode, extraQueryParams = this.settings.extraQueryParams, extraTokenParams = this.settings.extraTokenParams, dpopJkt, omitScopeWhenRequesting = this.settings.omitScopeWhenRequesting }) {
		const logger2 = this._logger.create("createSigninRequest");
		if (response_type !== "code") throw new Error("Only the Authorization Code flow (with PKCE) is supported");
		const url = await this.metadataService.getAuthorizationEndpoint();
		logger2.debug("Received authorization endpoint", url);
		const signinRequest = await SigninRequest.create({
			url,
			authority: this.settings.authority,
			client_id: this.settings.client_id,
			redirect_uri,
			response_type,
			scope,
			state_data: state,
			url_state,
			prompt,
			display,
			max_age,
			ui_locales,
			id_token_hint,
			login_hint,
			acr_values,
			dpopJkt,
			resource,
			request,
			request_uri,
			extraQueryParams,
			extraTokenParams,
			request_type,
			response_mode,
			client_secret: this.settings.client_secret,
			skipUserInfo,
			nonce,
			disablePKCE: this.settings.disablePKCE,
			omitScopeWhenRequesting
		});
		await this.clearStaleState();
		const signinState = signinRequest.state;
		await this.settings.stateStore.set(signinState.id, signinState.toStorageString());
		return signinRequest;
	}
	async readSigninResponseState(url, removeState = false) {
		const logger2 = this._logger.create("readSigninResponseState");
		const response = new SigninResponse(UrlUtils.readParams(url, this.settings.response_mode));
		if (!response.state) {
			logger2.throw(/* @__PURE__ */ new Error("No state in response"));
			throw null;
		}
		const storedStateString = await this.settings.stateStore[removeState ? "remove" : "get"](response.state);
		if (!storedStateString) {
			logger2.throw(/* @__PURE__ */ new Error("No matching state found in storage"));
			throw null;
		}
		return {
			state: await SigninState.fromStorageString(storedStateString),
			response
		};
	}
	async processSigninResponse(url, extraHeaders, removeState = true) {
		const logger2 = this._logger.create("processSigninResponse");
		const { state, response } = await this.readSigninResponseState(url, removeState);
		logger2.debug("received state from storage; validating response");
		if (this.settings.dpop && this.settings.dpop.store) {
			const dpopProof = await this.getDpopProof(this.settings.dpop.store);
			extraHeaders = {
				...extraHeaders,
				"DPoP": dpopProof
			};
		}
		try {
			await this._validator.validateSigninResponse(response, state, extraHeaders);
		} catch (err) {
			if (err instanceof ErrorDPoPNonce && this.settings.dpop) {
				const dpopProof = await this.getDpopProof(this.settings.dpop.store, err.nonce);
				extraHeaders["DPoP"] = dpopProof;
				await this._validator.validateSigninResponse(response, state, extraHeaders);
			} else throw err;
		}
		return response;
	}
	async getDpopProof(dpopStore, nonce) {
		let keyPair;
		let dpopState;
		if (!(await dpopStore.getAllKeys()).includes(this.settings.client_id)) {
			keyPair = await CryptoUtils.generateDPoPKeys();
			dpopState = new DPoPState(keyPair, nonce);
			await dpopStore.set(this.settings.client_id, dpopState);
		} else {
			dpopState = await dpopStore.get(this.settings.client_id);
			if (dpopState.nonce !== nonce && nonce) {
				dpopState.nonce = nonce;
				await dpopStore.set(this.settings.client_id, dpopState);
			}
		}
		return await CryptoUtils.generateDPoPProof({
			url: await this.metadataService.getTokenEndpoint(false),
			httpMethod: "POST",
			keyPair: dpopState.keys,
			nonce: dpopState.nonce
		});
	}
	async processResourceOwnerPasswordCredentials({ username, password, skipUserInfo = false, extraTokenParams = {} }) {
		const tokenResponse = await this._tokenClient.exchangeCredentials({
			username,
			password,
			...extraTokenParams
		});
		const signinResponse = new SigninResponse(new URLSearchParams());
		Object.assign(signinResponse, tokenResponse);
		await this._validator.validateCredentialsResponse(signinResponse, skipUserInfo);
		return signinResponse;
	}
	async useRefreshToken({ state, redirect_uri, resource, timeoutInSeconds, extraHeaders, extraTokenParams }) {
		var _a;
		const logger2 = this._logger.create("useRefreshToken");
		let scope;
		if (this.settings.refreshTokenAllowedScope === void 0) scope = state.scope;
		else {
			const allowableScopes = this.settings.refreshTokenAllowedScope.split(" ");
			scope = (((_a = state.scope) == null ? void 0 : _a.split(" ")) || []).filter((s) => allowableScopes.includes(s)).join(" ");
		}
		if (this.settings.dpop && this.settings.dpop.store) {
			const dpopProof = await this.getDpopProof(this.settings.dpop.store);
			extraHeaders = {
				...extraHeaders,
				"DPoP": dpopProof
			};
		}
		let result;
		try {
			result = await this._tokenClient.exchangeRefreshToken({
				refresh_token: state.refresh_token,
				scope,
				redirect_uri,
				resource,
				timeoutInSeconds,
				extraHeaders,
				...extraTokenParams
			});
		} catch (err) {
			if (err instanceof ErrorDPoPNonce && this.settings.dpop) {
				extraHeaders["DPoP"] = await this.getDpopProof(this.settings.dpop.store, err.nonce);
				result = await this._tokenClient.exchangeRefreshToken({
					refresh_token: state.refresh_token,
					scope,
					redirect_uri,
					resource,
					timeoutInSeconds,
					extraHeaders,
					...extraTokenParams
				});
			} else throw err;
		}
		const response = new SigninResponse(new URLSearchParams());
		Object.assign(response, result);
		logger2.debug("validating response", response);
		await this._validator.validateRefreshResponse(response, {
			...state,
			scope
		});
		return response;
	}
	async createSignoutRequest({ state, id_token_hint, client_id, request_type, url_state, post_logout_redirect_uri = this.settings.post_logout_redirect_uri, extraQueryParams = this.settings.extraQueryParams } = {}) {
		const logger2 = this._logger.create("createSignoutRequest");
		const url = await this.metadataService.getEndSessionEndpoint();
		if (!url) {
			logger2.throw(/* @__PURE__ */ new Error("No end session endpoint"));
			throw null;
		}
		logger2.debug("Received end session endpoint", url);
		if (!client_id && post_logout_redirect_uri && !id_token_hint) client_id = this.settings.client_id;
		const request = new SignoutRequest({
			url,
			id_token_hint,
			client_id,
			post_logout_redirect_uri,
			state_data: state,
			extraQueryParams,
			request_type,
			url_state
		});
		await this.clearStaleState();
		const signoutState = request.state;
		if (signoutState) {
			logger2.debug("Signout request has state to persist");
			await this.settings.stateStore.set(signoutState.id, signoutState.toStorageString());
		}
		return request;
	}
	async readSignoutResponseState(url, removeState = false) {
		const logger2 = this._logger.create("readSignoutResponseState");
		const response = new SignoutResponse(UrlUtils.readParams(url, this.settings.response_mode));
		if (!response.state) {
			logger2.debug("No state in response");
			if (response.error) {
				logger2.warn("Response was error:", response.error);
				throw new ErrorResponse(response);
			}
			return {
				state: void 0,
				response
			};
		}
		const storedStateString = await this.settings.stateStore[removeState ? "remove" : "get"](response.state);
		if (!storedStateString) {
			logger2.throw(/* @__PURE__ */ new Error("No matching state found in storage"));
			throw null;
		}
		return {
			state: await State.fromStorageString(storedStateString),
			response
		};
	}
	async processSignoutResponse(url) {
		const logger2 = this._logger.create("processSignoutResponse");
		const { state, response } = await this.readSignoutResponseState(url, true);
		if (state) {
			logger2.debug("Received state from storage; validating response");
			this._validator.validateSignoutResponse(response, state);
		} else logger2.debug("No state from storage; skipping response validation");
		return response;
	}
	clearStaleState() {
		this._logger.create("clearStaleState");
		return State.clearStaleState(this.settings.stateStore, this.settings.staleStateAgeInSeconds);
	}
	async revokeToken(token, type) {
		this._logger.create("revokeToken");
		return await this._tokenClient.revoke({
			token,
			token_type_hint: type
		});
	}
};
var SessionMonitor = class {
	constructor(_userManager) {
		this._userManager = _userManager;
		this._logger = new Logger("SessionMonitor");
		this._start = async (user) => {
			const session_state = user.session_state;
			if (!session_state) return;
			const logger2 = this._logger.create("_start");
			if (user.profile) {
				this._sub = user.profile.sub;
				logger2.debug("session_state", session_state, ", sub", this._sub);
			} else {
				this._sub = void 0;
				logger2.debug("session_state", session_state, ", anonymous user");
			}
			if (this._checkSessionIFrame) {
				this._checkSessionIFrame.start(session_state);
				return;
			}
			try {
				const url = await this._userManager.metadataService.getCheckSessionIframe();
				if (url) {
					logger2.debug("initializing check session iframe");
					const client_id = this._userManager.settings.client_id;
					const intervalInSeconds = this._userManager.settings.checkSessionIntervalInSeconds;
					const stopOnError = this._userManager.settings.stopCheckSessionOnError;
					const checkSessionIFrame = new CheckSessionIFrame(this._callback, client_id, url, intervalInSeconds, stopOnError);
					await checkSessionIFrame.load();
					this._checkSessionIFrame = checkSessionIFrame;
					checkSessionIFrame.start(session_state);
				} else logger2.warn("no check session iframe found in the metadata");
			} catch (err) {
				logger2.error("Error from getCheckSessionIframe:", err instanceof Error ? err.message : err);
			}
		};
		this._stop = () => {
			const logger2 = this._logger.create("_stop");
			this._sub = void 0;
			if (this._checkSessionIFrame) this._checkSessionIFrame.stop();
			if (this._userManager.settings.monitorAnonymousSession) {
				const timerHandle = setInterval(async () => {
					clearInterval(timerHandle);
					try {
						const session = await this._userManager.querySessionStatus();
						if (session) {
							const tmpUser = {
								session_state: session.session_state,
								profile: session.sub ? { sub: session.sub } : null
							};
							this._start(tmpUser);
						}
					} catch (err) {
						logger2.error("error from querySessionStatus", err instanceof Error ? err.message : err);
					}
				}, 1e3);
			}
		};
		this._callback = async () => {
			const logger2 = this._logger.create("_callback");
			try {
				const session = await this._userManager.querySessionStatus();
				let raiseEvent = true;
				if (session && this._checkSessionIFrame) if (session.sub === this._sub) {
					raiseEvent = false;
					this._checkSessionIFrame.start(session.session_state);
					logger2.debug("same sub still logged in at OP, session state has changed, restarting check session iframe; session_state", session.session_state);
					await this._userManager.events._raiseUserSessionChanged();
				} else logger2.debug("different subject signed into OP", session.sub);
				else logger2.debug("subject no longer signed into OP");
				if (raiseEvent) if (this._sub) await this._userManager.events._raiseUserSignedOut();
				else await this._userManager.events._raiseUserSignedIn();
				else logger2.debug("no change in session detected, no event to raise");
			} catch (err) {
				if (this._sub) {
					logger2.debug("Error calling queryCurrentSigninSession; raising signed out event", err);
					await this._userManager.events._raiseUserSignedOut();
				}
			}
		};
		if (!_userManager) this._logger.throw(/* @__PURE__ */ new Error("No user manager passed"));
		this._userManager.events.addUserLoaded(this._start);
		this._userManager.events.addUserUnloaded(this._stop);
		this._init().catch((err) => {
			this._logger.error(err);
		});
	}
	async _init() {
		this._logger.create("_init");
		const user = await this._userManager.getUser();
		if (user) this._start(user);
		else if (this._userManager.settings.monitorAnonymousSession) {
			const session = await this._userManager.querySessionStatus();
			if (session) {
				const tmpUser = {
					session_state: session.session_state,
					profile: session.sub ? { sub: session.sub } : null
				};
				this._start(tmpUser);
			}
		}
	}
};
var User = class _User {
	constructor(args) {
		var _a;
		this.id_token = args.id_token;
		this.session_state = (_a = args.session_state) != null ? _a : null;
		this.access_token = args.access_token;
		this.refresh_token = args.refresh_token;
		this.token_type = args.token_type;
		this.scope = args.scope;
		this.profile = args.profile;
		this.expires_at = args.expires_at;
		this.state = args.userState;
		this.url_state = args.url_state;
	}
	/** Computed number of seconds the access token has remaining. */
	get expires_in() {
		if (this.expires_at === void 0) return;
		return this.expires_at - Timer.getEpochTime();
	}
	set expires_in(value) {
		if (value !== void 0) this.expires_at = Math.floor(value) + Timer.getEpochTime();
	}
	/** Computed value indicating if the access token is expired. */
	get expired() {
		const expires_in = this.expires_in;
		if (expires_in === void 0) return;
		return expires_in <= 0;
	}
	/** Array representing the parsed values from the `scope`. */
	get scopes() {
		var _a, _b;
		return (_b = (_a = this.scope) == null ? void 0 : _a.split(" ")) != null ? _b : [];
	}
	toStorageString() {
		new Logger("User").create("toStorageString");
		return JSON.stringify({
			id_token: this.id_token,
			session_state: this.session_state,
			access_token: this.access_token,
			refresh_token: this.refresh_token,
			token_type: this.token_type,
			scope: this.scope,
			profile: this.profile,
			expires_at: this.expires_at
		});
	}
	static fromStorageString(storageString) {
		Logger.createStatic("User", "fromStorageString");
		return new _User(JSON.parse(storageString));
	}
};
var messageSource = "oidc-client";
var AbstractChildWindow = class {
	constructor() {
		this._abort = new Event$1("Window navigation aborted");
		this._disposeHandlers = /* @__PURE__ */ new Set();
		this._window = null;
	}
	async navigate(params) {
		const logger2 = this._logger.create("navigate");
		if (!this._window) throw new Error("Attempted to navigate on a disposed window");
		logger2.debug("setting URL in window");
		this._window.location.replace(params.url);
		const { url, keepOpen } = await new Promise((resolve, reject) => {
			const listener = (e) => {
				var _a;
				const data = e.data;
				const origin = (_a = params.scriptOrigin) != null ? _a : window.location.origin;
				if (e.origin !== origin || (data == null ? void 0 : data.source) !== messageSource) return;
				try {
					const state = UrlUtils.readParams(data.url, params.response_mode).get("state");
					if (!state) logger2.warn("no state found in response url");
					if (e.source !== this._window && state !== params.state) return;
				} catch {
					this._dispose();
					reject(/* @__PURE__ */ new Error("Invalid response from window"));
				}
				resolve(data);
			};
			window.addEventListener("message", listener, false);
			this._disposeHandlers.add(() => window.removeEventListener("message", listener, false));
			const channel = new BroadcastChannel(`oidc-client-popup-${params.state}`);
			channel.addEventListener("message", listener, false);
			this._disposeHandlers.add(() => channel.close());
			this._disposeHandlers.add(this._abort.addHandler((reason) => {
				this._dispose();
				reject(reason);
			}));
		});
		logger2.debug("got response from window");
		this._dispose();
		if (!keepOpen) this.close();
		return { url };
	}
	_dispose() {
		this._logger.create("_dispose");
		for (const dispose of this._disposeHandlers) dispose();
		this._disposeHandlers.clear();
	}
	static _notifyParent(parent, url, keepOpen = false, targetOrigin = window.location.origin) {
		const msgData = {
			source: messageSource,
			url,
			keepOpen
		};
		const logger2 = new Logger("_notifyParent");
		if (parent) {
			logger2.debug("With parent. Using parent.postMessage.");
			parent.postMessage(msgData, targetOrigin);
		} else {
			logger2.debug("No parent. Using BroadcastChannel.");
			const state = new URL(url).searchParams.get("state");
			if (!state) throw new Error("No parent and no state in URL. Can't complete notification.");
			const channel = new BroadcastChannel(`oidc-client-popup-${state}`);
			channel.postMessage(msgData);
			channel.close();
		}
	}
};
var DefaultPopupWindowFeatures = {
	location: false,
	toolbar: false,
	height: 640,
	closePopupWindowAfterInSeconds: -1
};
var DefaultPopupTarget = "_blank";
var DefaultAccessTokenExpiringNotificationTimeInSeconds = 60;
var DefaultCheckSessionIntervalInSeconds = 2;
var DefaultSilentRequestTimeoutInSeconds = 10;
var UserManagerSettingsStore = class extends OidcClientSettingsStore {
	constructor(args) {
		const { popup_redirect_uri = args.redirect_uri, popup_post_logout_redirect_uri = args.post_logout_redirect_uri, popupWindowFeatures = DefaultPopupWindowFeatures, popupWindowTarget = DefaultPopupTarget, redirectMethod = "assign", redirectTarget = "self", iframeNotifyParentOrigin = args.iframeNotifyParentOrigin, iframeScriptOrigin = args.iframeScriptOrigin, requestTimeoutInSeconds, silent_redirect_uri = args.redirect_uri, silentRequestTimeoutInSeconds, automaticSilentRenew = true, validateSubOnSilentRenew = true, includeIdTokenInSilentRenew = false, monitorSession = false, monitorAnonymousSession = false, checkSessionIntervalInSeconds = DefaultCheckSessionIntervalInSeconds, query_status_response_type = "code", stopCheckSessionOnError = true, revokeTokenTypes = ["access_token", "refresh_token"], revokeTokensOnSignout = false, includeIdTokenInSilentSignout = false, accessTokenExpiringNotificationTimeInSeconds = DefaultAccessTokenExpiringNotificationTimeInSeconds, maxSilentRenewTimeoutRetries, userStore } = args;
		super(args);
		this.popup_redirect_uri = popup_redirect_uri;
		this.popup_post_logout_redirect_uri = popup_post_logout_redirect_uri;
		this.popupWindowFeatures = popupWindowFeatures;
		this.popupWindowTarget = popupWindowTarget;
		this.redirectMethod = redirectMethod;
		this.redirectTarget = redirectTarget;
		this.iframeNotifyParentOrigin = iframeNotifyParentOrigin;
		this.iframeScriptOrigin = iframeScriptOrigin;
		this.silent_redirect_uri = silent_redirect_uri;
		this.silentRequestTimeoutInSeconds = silentRequestTimeoutInSeconds || requestTimeoutInSeconds || DefaultSilentRequestTimeoutInSeconds;
		this.automaticSilentRenew = automaticSilentRenew;
		this.validateSubOnSilentRenew = validateSubOnSilentRenew;
		this.includeIdTokenInSilentRenew = includeIdTokenInSilentRenew;
		this.monitorSession = monitorSession;
		this.monitorAnonymousSession = monitorAnonymousSession;
		this.checkSessionIntervalInSeconds = checkSessionIntervalInSeconds;
		this.stopCheckSessionOnError = stopCheckSessionOnError;
		this.query_status_response_type = query_status_response_type;
		this.revokeTokenTypes = revokeTokenTypes;
		this.revokeTokensOnSignout = revokeTokensOnSignout;
		this.includeIdTokenInSilentSignout = includeIdTokenInSilentSignout;
		this.accessTokenExpiringNotificationTimeInSeconds = accessTokenExpiringNotificationTimeInSeconds;
		this.maxSilentRenewTimeoutRetries = maxSilentRenewTimeoutRetries;
		if (userStore) this.userStore = userStore;
		else {
			const store = typeof window !== "undefined" ? window.sessionStorage : new InMemoryWebStorage();
			this.userStore = new WebStorageStateStore({ store });
		}
	}
};
var IFrameWindow = class _IFrameWindow extends AbstractChildWindow {
	constructor({ silentRequestTimeoutInSeconds = DefaultSilentRequestTimeoutInSeconds }) {
		super();
		this._logger = new Logger("IFrameWindow");
		this._timeoutInSeconds = silentRequestTimeoutInSeconds;
		this._frame = _IFrameWindow.createHiddenIframe();
		this._window = this._frame.contentWindow;
	}
	static createHiddenIframe() {
		const iframe = window.document.createElement("iframe");
		iframe.style.visibility = "hidden";
		iframe.style.position = "fixed";
		iframe.style.left = "-1000px";
		iframe.style.top = "0";
		iframe.width = "0";
		iframe.height = "0";
		window.document.body.appendChild(iframe);
		return iframe;
	}
	async navigate(params) {
		this._logger.debug("navigate: Using timeout of:", this._timeoutInSeconds);
		const timer = setTimeout(() => void this._abort.raise(new ErrorTimeout("IFrame timed out without a response")), this._timeoutInSeconds * 1e3);
		this._disposeHandlers.add(() => clearTimeout(timer));
		return await super.navigate(params);
	}
	close() {
		var _a;
		if (this._frame) {
			if (this._frame.parentNode) {
				this._frame.addEventListener("load", (ev) => {
					var _a2;
					const frame = ev.target;
					(_a2 = frame.parentNode) == null || _a2.removeChild(frame);
					this._abort.raise(/* @__PURE__ */ new Error("IFrame removed from DOM"));
				}, true);
				(_a = this._frame.contentWindow) == null || _a.location.replace("about:blank");
			}
			this._frame = null;
		}
		this._window = null;
	}
	static notifyParent(url, targetOrigin) {
		return super._notifyParent(window.parent, url, false, targetOrigin);
	}
};
var IFrameNavigator = class {
	constructor(_settings) {
		this._settings = _settings;
		this._logger = new Logger("IFrameNavigator");
	}
	async prepare({ silentRequestTimeoutInSeconds = this._settings.silentRequestTimeoutInSeconds }) {
		return new IFrameWindow({ silentRequestTimeoutInSeconds });
	}
	async callback(url) {
		this._logger.create("callback");
		IFrameWindow.notifyParent(url, this._settings.iframeNotifyParentOrigin);
	}
};
var checkForPopupClosedInterval = 500;
var second = 1e3;
var PopupWindow = class extends AbstractChildWindow {
	constructor({ popupWindowTarget = DefaultPopupTarget, popupWindowFeatures = {}, popupSignal, popupAbortOnClose }) {
		super();
		this._logger = new Logger("PopupWindow");
		const centeredPopup = PopupUtils.center({
			...DefaultPopupWindowFeatures,
			...popupWindowFeatures
		});
		this._window = window.open(void 0, popupWindowTarget, PopupUtils.serialize(centeredPopup));
		this.abortOnClose = Boolean(popupAbortOnClose);
		if (popupSignal) popupSignal.addEventListener("abort", () => {
			var _a;
			this._abort.raise(new Error((_a = popupSignal.reason) != null ? _a : "Popup aborted"));
		});
		if (popupWindowFeatures.closePopupWindowAfterInSeconds && popupWindowFeatures.closePopupWindowAfterInSeconds > 0) setTimeout(() => {
			if (!this._window || typeof this._window.closed !== "boolean" || this._window.closed) {
				this._abort.raise(/* @__PURE__ */ new Error("Popup blocked by user"));
				return;
			}
			this.close();
		}, popupWindowFeatures.closePopupWindowAfterInSeconds * second);
	}
	async navigate(params) {
		var _a;
		(_a = this._window) == null || _a.focus();
		const popupClosedInterval = setInterval(() => {
			if (!this._window || this._window.closed) {
				this._logger.debug("Popup closed by user or isolated by redirect");
				clearPopupClosedInterval();
				this._disposeHandlers.delete(clearPopupClosedInterval);
				if (this.abortOnClose) this._abort.raise(/* @__PURE__ */ new Error("Popup closed by user"));
			}
		}, checkForPopupClosedInterval);
		const clearPopupClosedInterval = () => clearInterval(popupClosedInterval);
		this._disposeHandlers.add(clearPopupClosedInterval);
		return await super.navigate(params);
	}
	close() {
		if (this._window) {
			if (!this._window.closed) {
				this._window.close();
				this._abort.raise(/* @__PURE__ */ new Error("Popup closed"));
			}
		}
		this._window = null;
	}
	static notifyOpener(url, keepOpen) {
		super._notifyParent(window.opener, url, keepOpen);
		if (!keepOpen && !window.opener) window.close();
	}
};
var PopupNavigator = class {
	constructor(_settings) {
		this._settings = _settings;
		this._logger = new Logger("PopupNavigator");
	}
	async prepare({ popupWindowFeatures = this._settings.popupWindowFeatures, popupWindowTarget = this._settings.popupWindowTarget, popupSignal, popupAbortOnClose }) {
		return new PopupWindow({
			popupWindowFeatures,
			popupWindowTarget,
			popupSignal,
			popupAbortOnClose
		});
	}
	async callback(url, { keepOpen = false }) {
		this._logger.create("callback");
		PopupWindow.notifyOpener(url, keepOpen);
	}
};
var RedirectNavigator = class {
	constructor(_settings) {
		this._settings = _settings;
		this._logger = new Logger("RedirectNavigator");
	}
	async prepare({ redirectMethod = this._settings.redirectMethod, redirectTarget = this._settings.redirectTarget }) {
		var _a;
		this._logger.create("prepare");
		let targetWindow = window.self;
		if (redirectTarget === "top") targetWindow = (_a = window.top) != null ? _a : window.self;
		const redirect = targetWindow.location[redirectMethod].bind(targetWindow.location);
		let abort;
		return {
			navigate: async (params) => {
				this._logger.create("navigate");
				return await new Promise((resolve, reject) => {
					abort = reject;
					window.addEventListener("pageshow", () => resolve(window.location.href));
					redirect(params.url);
				});
			},
			close: () => {
				this._logger.create("close");
				abort?.(/* @__PURE__ */ new Error("Redirect aborted"));
				targetWindow.stop();
			}
		};
	}
	async callback() {}
};
var UserManagerEvents = class extends AccessTokenEvents {
	constructor(settings) {
		super({ expiringNotificationTimeInSeconds: settings.accessTokenExpiringNotificationTimeInSeconds });
		this._logger = new Logger("UserManagerEvents");
		this._userLoaded = new Event$1("User loaded");
		this._userUnloaded = new Event$1("User unloaded");
		this._silentRenewError = new Event$1("Silent renew error");
		this._userSignedIn = new Event$1("User signed in");
		this._userSignedOut = new Event$1("User signed out");
		this._userSessionChanged = new Event$1("User session changed");
	}
	async load(user, raiseEvent = true) {
		await super.load(user);
		if (raiseEvent) await this._userLoaded.raise(user);
	}
	async unload() {
		await super.unload();
		await this._userUnloaded.raise();
	}
	/**
	* Add callback: Raised when a user session has been established (or re-established).
	*/
	addUserLoaded(cb) {
		return this._userLoaded.addHandler(cb);
	}
	/**
	* Remove callback: Raised when a user session has been established (or re-established).
	*/
	removeUserLoaded(cb) {
		return this._userLoaded.removeHandler(cb);
	}
	/**
	* Add callback: Raised when a user session has been terminated.
	*/
	addUserUnloaded(cb) {
		return this._userUnloaded.addHandler(cb);
	}
	/**
	* Remove callback: Raised when a user session has been terminated.
	*/
	removeUserUnloaded(cb) {
		return this._userUnloaded.removeHandler(cb);
	}
	/**
	* Add callback: Raised when the automatic silent renew has failed.
	*/
	addSilentRenewError(cb) {
		return this._silentRenewError.addHandler(cb);
	}
	/**
	* Remove callback: Raised when the automatic silent renew has failed.
	*/
	removeSilentRenewError(cb) {
		return this._silentRenewError.removeHandler(cb);
	}
	/**
	* @internal
	*/
	async _raiseSilentRenewError(e) {
		await this._silentRenewError.raise(e);
	}
	/**
	* Add callback: Raised when the user is signed in (when `monitorSession` is set).
	* @see {@link UserManagerSettings.monitorSession}
	*/
	addUserSignedIn(cb) {
		return this._userSignedIn.addHandler(cb);
	}
	/**
	* Remove callback: Raised when the user is signed in (when `monitorSession` is set).
	*/
	removeUserSignedIn(cb) {
		this._userSignedIn.removeHandler(cb);
	}
	/**
	* @internal
	*/
	async _raiseUserSignedIn() {
		await this._userSignedIn.raise();
	}
	/**
	* Add callback: Raised when the user's sign-in status at the OP has changed (when `monitorSession` is set).
	* @see {@link UserManagerSettings.monitorSession}
	*/
	addUserSignedOut(cb) {
		return this._userSignedOut.addHandler(cb);
	}
	/**
	* Remove callback: Raised when the user's sign-in status at the OP has changed (when `monitorSession` is set).
	*/
	removeUserSignedOut(cb) {
		this._userSignedOut.removeHandler(cb);
	}
	/**
	* @internal
	*/
	async _raiseUserSignedOut() {
		await this._userSignedOut.raise();
	}
	/**
	* Add callback: Raised when the user session changed (when `monitorSession` is set).
	* @see {@link UserManagerSettings.monitorSession}
	*/
	addUserSessionChanged(cb) {
		return this._userSessionChanged.addHandler(cb);
	}
	/**
	* Remove callback: Raised when the user session changed (when `monitorSession` is set).
	*/
	removeUserSessionChanged(cb) {
		this._userSessionChanged.removeHandler(cb);
	}
	/**
	* @internal
	*/
	async _raiseUserSessionChanged() {
		await this._userSessionChanged.raise();
	}
};
var SilentRenewService = class {
	constructor(_userManager) {
		this._userManager = _userManager;
		this._logger = new Logger("SilentRenewService");
		this._isStarted = false;
		this._retryTimer = new Timer("Retry Silent Renew");
		this._timeoutRetryCount = 0;
		this._tokenExpiring = async () => {
			const logger2 = this._logger.create("_tokenExpiring");
			try {
				await this._userManager.signinSilent();
				this._timeoutRetryCount = 0;
				logger2.debug("silent token renewal successful");
			} catch (err) {
				if (err instanceof ErrorTimeout) {
					this._timeoutRetryCount++;
					const maxRetries = this._userManager.settings.maxSilentRenewTimeoutRetries;
					if (maxRetries !== void 0 && this._timeoutRetryCount > maxRetries) {
						logger2.error(`Timeout retry limit reached (${this._timeoutRetryCount} > ${maxRetries}), raising silentRenewError:`, err);
						this._timeoutRetryCount = 0;
						await this._userManager.events._raiseSilentRenewError(err);
						return;
					}
					logger2.warn(`ErrorTimeout from signinSilent (attempt ${this._timeoutRetryCount}), retry in 5s:`, err);
					this._retryTimer.init(5);
					return;
				}
				logger2.error("Error from signinSilent:", err);
				this._timeoutRetryCount = 0;
				await this._userManager.events._raiseSilentRenewError(err);
			}
		};
	}
	async start() {
		const logger2 = this._logger.create("start");
		if (!this._isStarted) {
			this._isStarted = true;
			this._userManager.events.addAccessTokenExpiring(this._tokenExpiring);
			this._retryTimer.addHandler(this._tokenExpiring);
			try {
				await this._userManager.getUser();
			} catch (err) {
				logger2.error("getUser error", err);
			}
		}
	}
	stop() {
		if (this._isStarted) {
			this._retryTimer.cancel();
			this._retryTimer.removeHandler(this._tokenExpiring);
			this._userManager.events.removeAccessTokenExpiring(this._tokenExpiring);
			this._isStarted = false;
		}
	}
};
var RefreshState = class {
	constructor(args) {
		this.refresh_token = args.refresh_token;
		this.id_token = args.id_token;
		this.session_state = args.session_state;
		this.scope = args.scope;
		this.profile = args.profile;
		this.data = args.state;
	}
};
var UserManager = class {
	constructor(settings, redirectNavigator, popupNavigator, iframeNavigator) {
		this._logger = new Logger("UserManager");
		this.settings = new UserManagerSettingsStore(settings);
		this._client = new OidcClient(settings);
		this._redirectNavigator = redirectNavigator != null ? redirectNavigator : new RedirectNavigator(this.settings);
		this._popupNavigator = popupNavigator != null ? popupNavigator : new PopupNavigator(this.settings);
		this._iframeNavigator = iframeNavigator != null ? iframeNavigator : new IFrameNavigator(this.settings);
		this._events = new UserManagerEvents(this.settings);
		this._silentRenewService = new SilentRenewService(this);
		if (this.settings.automaticSilentRenew) this.startSilentRenew();
		this._sessionMonitor = null;
		if (this.settings.monitorSession) this._sessionMonitor = new SessionMonitor(this);
	}
	/**
	* Get object used to register for events raised by the `UserManager`.
	*/
	get events() {
		return this._events;
	}
	/**
	* Get object used to access the metadata configuration of the identity provider.
	*/
	get metadataService() {
		return this._client.metadataService;
	}
	/**
	* Load the `User` object for the currently authenticated user.
	*
	* @param raiseEvent - If `true`, the `UserLoaded` event will be raised. Defaults to false.
	* @returns A promise
	*/
	async getUser(raiseEvent = false) {
		const logger2 = this._logger.create("getUser");
		const user = await this._loadUser();
		if (user) {
			logger2.info("user loaded");
			await this._events.load(user, raiseEvent);
			return user;
		}
		logger2.info("user not found in storage");
		return null;
	}
	/**
	* Remove from any storage the currently authenticated user.
	*
	* @returns A promise
	*/
	async removeUser() {
		const logger2 = this._logger.create("removeUser");
		await this.storeUser(null);
		logger2.info("user removed from storage");
		await this._events.unload();
	}
	/**
	* Trigger a redirect of the current window to the authorization endpoint.
	*
	* @returns A promise
	*
	* @throws `Error` In cases of wrong authentication.
	*/
	async signinRedirect(args = {}) {
		var _a;
		this._logger.create("signinRedirect");
		const { redirectMethod, ...requestArgs } = args;
		let dpopJkt;
		if ((_a = this.settings.dpop) == null ? void 0 : _a.bind_authorization_code) dpopJkt = await this.generateDPoPJkt(this.settings.dpop);
		const handle = await this._redirectNavigator.prepare({ redirectMethod });
		await this._signinStart({
			request_type: "si:r",
			dpopJkt,
			...requestArgs
		}, handle);
	}
	/**
	* Process the response (callback) from the authorization endpoint.
	* It is recommended to use {@link UserManager.signinCallback} instead.
	*
	* @returns A promise containing the authenticated `User`.
	*
	* @see {@link UserManager.signinCallback}
	*/
	async signinRedirectCallback(url = window.location.href) {
		const logger2 = this._logger.create("signinRedirectCallback");
		const user = await this._signinEnd(url);
		if (user.profile && user.profile.sub) logger2.info("success, signed in subject", user.profile.sub);
		else logger2.info("no subject");
		return user;
	}
	/**
	* Trigger the signin with user/password.
	*
	* @returns A promise containing the authenticated `User`.
	* @throws {@link ErrorResponse} In cases of wrong authentication.
	*/
	async signinResourceOwnerCredentials({ username, password, skipUserInfo = false }) {
		const logger2 = this._logger.create("signinResourceOwnerCredential");
		const signinResponse = await this._client.processResourceOwnerPasswordCredentials({
			username,
			password,
			skipUserInfo,
			extraTokenParams: this.settings.extraTokenParams
		});
		logger2.debug("got signin response");
		const user = await this._buildUser(signinResponse);
		if (user.profile && user.profile.sub) logger2.info("success, signed in subject", user.profile.sub);
		else logger2.info("no subject");
		return user;
	}
	/**
	* Trigger a request (via a popup window) to the authorization endpoint.
	*
	* @returns A promise containing the authenticated `User`.
	* @throws `Error` In cases of wrong authentication.
	*/
	async signinPopup(args = {}) {
		var _a;
		const logger2 = this._logger.create("signinPopup");
		let dpopJkt;
		if ((_a = this.settings.dpop) == null ? void 0 : _a.bind_authorization_code) dpopJkt = await this.generateDPoPJkt(this.settings.dpop);
		const { popupWindowFeatures, popupWindowTarget, popupSignal, popupAbortOnClose, ...requestArgs } = args;
		const url = this.settings.popup_redirect_uri;
		if (!url) logger2.throw(/* @__PURE__ */ new Error("No popup_redirect_uri configured"));
		const handle = await this._popupNavigator.prepare({
			popupWindowFeatures,
			popupWindowTarget,
			popupSignal,
			popupAbortOnClose
		});
		const user = await this._signin({
			request_type: "si:p",
			redirect_uri: url,
			display: "popup",
			dpopJkt,
			...requestArgs
		}, handle);
		if (user) if (user.profile && user.profile.sub) logger2.info("success, signed in subject", user.profile.sub);
		else logger2.info("no subject");
		return user;
	}
	/**
	* Notify the opening window of response (callback) from the authorization endpoint.
	* It is recommended to use {@link UserManager.signinCallback} instead.
	*
	* @returns A promise
	*
	* @see {@link UserManager.signinCallback}
	*/
	async signinPopupCallback(url = window.location.href, keepOpen = false) {
		const logger2 = this._logger.create("signinPopupCallback");
		await this._popupNavigator.callback(url, { keepOpen });
		logger2.info("success");
	}
	/**
	* Trigger a silent request (via refresh token or an iframe) to the authorization endpoint.
	*
	* @returns A promise that contains the authenticated `User`.
	*/
	async signinSilent(args = {}) {
		var _a, _b;
		const logger2 = this._logger.create("signinSilent");
		const { silentRequestTimeoutInSeconds, ...requestArgs } = args;
		let user = await this._loadUser();
		if (!args.forceIframeAuth && (user == null ? void 0 : user.refresh_token)) {
			logger2.debug("using refresh token");
			const state = new RefreshState(user);
			return await this._useRefreshToken({
				state,
				redirect_uri: requestArgs.redirect_uri,
				resource: requestArgs.resource,
				extraTokenParams: requestArgs.extraTokenParams,
				timeoutInSeconds: silentRequestTimeoutInSeconds
			});
		}
		let dpopJkt;
		if ((_a = this.settings.dpop) == null ? void 0 : _a.bind_authorization_code) dpopJkt = await this.generateDPoPJkt(this.settings.dpop);
		const url = this.settings.silent_redirect_uri;
		if (!url) logger2.throw(/* @__PURE__ */ new Error("No silent_redirect_uri configured"));
		let verifySub;
		if (user && this.settings.validateSubOnSilentRenew) {
			logger2.debug("subject prior to silent renew:", user.profile.sub);
			verifySub = user.profile.sub;
		}
		const handle = await this._iframeNavigator.prepare({ silentRequestTimeoutInSeconds });
		user = await this._signin({
			request_type: "si:s",
			redirect_uri: url,
			prompt: "none",
			id_token_hint: this.settings.includeIdTokenInSilentRenew ? user == null ? void 0 : user.id_token : void 0,
			dpopJkt,
			...requestArgs
		}, handle, verifySub);
		if (user) if ((_b = user.profile) == null ? void 0 : _b.sub) logger2.info("success, signed in subject", user.profile.sub);
		else logger2.info("no subject");
		return user;
	}
	async _useRefreshToken(args) {
		const response = await this._client.useRefreshToken({
			timeoutInSeconds: this.settings.silentRequestTimeoutInSeconds,
			...args
		});
		const user = new User({
			...args.state,
			...response
		});
		await this.storeUser(user);
		await this._events.load(user);
		return user;
	}
	/**
	*
	* Notify the parent window of response (callback) from the authorization endpoint.
	* It is recommended to use {@link UserManager.signinCallback} instead.
	*
	* @returns A promise
	*
	* @see {@link UserManager.signinCallback}
	*/
	async signinSilentCallback(url = window.location.href) {
		const logger2 = this._logger.create("signinSilentCallback");
		await this._iframeNavigator.callback(url);
		logger2.info("success");
	}
	/**
	* Process any response (callback) from the authorization endpoint, by dispatching the request_type
	* and executing one of the following functions:
	* - {@link UserManager.signinRedirectCallback}
	* - {@link UserManager.signinPopupCallback}
	* - {@link UserManager.signinSilentCallback}
	*
	* @throws `Error` If request_type is unknown or signin cannot be processed.
	*/
	async signinCallback(url = window.location.href) {
		const { state } = await this._client.readSigninResponseState(url);
		switch (state.request_type) {
			case "si:r": return await this.signinRedirectCallback(url);
			case "si:p":
				await this.signinPopupCallback(url);
				break;
			case "si:s":
				await this.signinSilentCallback(url);
				break;
			default: throw new Error("invalid request_type in state");
		}
	}
	/**
	* Process any response (callback) from the end session endpoint, by dispatching the request_type
	* and executing one of the following functions:
	* - {@link UserManager.signoutRedirectCallback}
	* - {@link UserManager.signoutPopupCallback}
	* - {@link UserManager.signoutSilentCallback}
	*
	* @throws `Error` If request_type is unknown or signout cannot be processed.
	*/
	async signoutCallback(url = window.location.href, keepOpen = false) {
		const { state } = await this._client.readSignoutResponseState(url);
		if (!state) return;
		switch (state.request_type) {
			case "so:r": return await this.signoutRedirectCallback(url);
			case "so:p":
				await this.signoutPopupCallback(url, keepOpen);
				break;
			case "so:s":
				await this.signoutSilentCallback(url);
				break;
			default: throw new Error("invalid request_type in state");
		}
	}
	/**
	* Query OP for user's current signin status.
	*
	* @returns A promise object with session_state and subject identifier.
	*/
	async querySessionStatus(args = {}) {
		const logger2 = this._logger.create("querySessionStatus");
		const { silentRequestTimeoutInSeconds, ...requestArgs } = args;
		const url = this.settings.silent_redirect_uri;
		if (!url) logger2.throw(/* @__PURE__ */ new Error("No silent_redirect_uri configured"));
		const user = await this._loadUser();
		const handle = await this._iframeNavigator.prepare({ silentRequestTimeoutInSeconds });
		const navResponse = await this._signinStart({
			request_type: "si:s",
			redirect_uri: url,
			prompt: "none",
			id_token_hint: this.settings.includeIdTokenInSilentRenew ? user == null ? void 0 : user.id_token : void 0,
			response_type: this.settings.query_status_response_type,
			scope: "openid",
			skipUserInfo: true,
			...requestArgs
		}, handle);
		try {
			const signinResponse = await this._client.processSigninResponse(navResponse.url, {});
			logger2.debug("got signin response");
			if (signinResponse.session_state && signinResponse.profile.sub) {
				logger2.info("success for subject", signinResponse.profile.sub);
				return {
					session_state: signinResponse.session_state,
					sub: signinResponse.profile.sub
				};
			}
			logger2.info("success, user not authenticated");
			return null;
		} catch (err) {
			if (this.settings.monitorAnonymousSession && err instanceof ErrorResponse) switch (err.error) {
				case "login_required":
				case "consent_required":
				case "interaction_required":
				case "account_selection_required":
					logger2.info("success for anonymous user");
					return { session_state: err.session_state };
			}
			throw err;
		}
	}
	async _signin(args, handle, verifySub) {
		const navResponse = await this._signinStart(args, handle);
		return await this._signinEnd(navResponse.url, verifySub);
	}
	async _signinStart(args, handle) {
		const logger2 = this._logger.create("_signinStart");
		try {
			const signinRequest = await this._client.createSigninRequest(args);
			logger2.debug("got signin request");
			return await handle.navigate({
				url: signinRequest.url,
				state: signinRequest.state.id,
				response_mode: signinRequest.state.response_mode,
				scriptOrigin: this.settings.iframeScriptOrigin
			});
		} catch (err) {
			logger2.debug("error after preparing navigator, closing navigator window");
			handle.close();
			throw err;
		}
	}
	async _signinEnd(url, verifySub) {
		const logger2 = this._logger.create("_signinEnd");
		const signinResponse = await this._client.processSigninResponse(url, {});
		logger2.debug("got signin response");
		return await this._buildUser(signinResponse, verifySub);
	}
	async _buildUser(signinResponse, verifySub) {
		const logger2 = this._logger.create("_buildUser");
		const user = new User(signinResponse);
		if (verifySub) {
			if (verifySub !== user.profile.sub) {
				logger2.debug("current user does not match user returned from signin. sub from signin:", user.profile.sub);
				throw new ErrorResponse({
					...signinResponse,
					error: "login_required"
				});
			}
			logger2.debug("current user matches user returned from signin");
		}
		await this.storeUser(user);
		logger2.debug("user stored");
		await this._events.load(user);
		return user;
	}
	/**
	* Trigger a redirect of the current window to the end session endpoint.
	*
	* @returns A promise
	*/
	async signoutRedirect(args = {}) {
		const logger2 = this._logger.create("signoutRedirect");
		const { redirectMethod, ...requestArgs } = args;
		const handle = await this._redirectNavigator.prepare({ redirectMethod });
		await this._signoutStart({
			request_type: "so:r",
			post_logout_redirect_uri: this.settings.post_logout_redirect_uri,
			...requestArgs
		}, handle);
		logger2.info("success");
	}
	/**
	* Process response (callback) from the end session endpoint.
	* It is recommended to use {@link UserManager.signoutCallback} instead.
	*
	* @returns A promise containing signout response
	*
	* @see {@link UserManager.signoutCallback}
	*/
	async signoutRedirectCallback(url = window.location.href) {
		const logger2 = this._logger.create("signoutRedirectCallback");
		const response = await this._signoutEnd(url);
		logger2.info("success");
		return response;
	}
	/**
	* Trigger a redirect of a popup window to the end session endpoint.
	*
	* @returns A promise
	*/
	async signoutPopup(args = {}) {
		const logger2 = this._logger.create("signoutPopup");
		const { popupWindowFeatures, popupWindowTarget, popupSignal, ...requestArgs } = args;
		const url = this.settings.popup_post_logout_redirect_uri;
		const handle = await this._popupNavigator.prepare({
			popupWindowFeatures,
			popupWindowTarget,
			popupSignal
		});
		await this._signout({
			request_type: "so:p",
			post_logout_redirect_uri: url,
			state: url == null ? void 0 : {},
			...requestArgs
		}, handle);
		logger2.info("success");
	}
	/**
	* Process response (callback) from the end session endpoint from a popup window.
	* It is recommended to use {@link UserManager.signoutCallback} instead.
	*
	* @returns A promise
	*
	* @see {@link UserManager.signoutCallback}
	*/
	async signoutPopupCallback(url = window.location.href, keepOpen = false) {
		const logger2 = this._logger.create("signoutPopupCallback");
		await this._popupNavigator.callback(url, { keepOpen });
		logger2.info("success");
	}
	async _signout(args, handle) {
		const navResponse = await this._signoutStart(args, handle);
		return await this._signoutEnd(navResponse.url);
	}
	async _signoutStart(args = {}, handle) {
		var _a;
		const logger2 = this._logger.create("_signoutStart");
		try {
			const user = await this._loadUser();
			logger2.debug("loaded current user from storage");
			if (this.settings.revokeTokensOnSignout) await this._revokeInternal(user);
			const id_token = args.id_token_hint || user && user.id_token;
			if (id_token) {
				logger2.debug("setting id_token_hint in signout request");
				args.id_token_hint = id_token;
			}
			await this.removeUser();
			logger2.debug("user removed, creating signout request");
			const signoutRequest = await this._client.createSignoutRequest(args);
			logger2.debug("got signout request");
			return await handle.navigate({
				url: signoutRequest.url,
				state: (_a = signoutRequest.state) == null ? void 0 : _a.id,
				scriptOrigin: this.settings.iframeScriptOrigin
			});
		} catch (err) {
			logger2.debug("error after preparing navigator, closing navigator window");
			handle.close();
			throw err;
		}
	}
	async _signoutEnd(url) {
		const logger2 = this._logger.create("_signoutEnd");
		const signoutResponse = await this._client.processSignoutResponse(url);
		logger2.debug("got signout response");
		return signoutResponse;
	}
	/**
	* Trigger a silent request (via an iframe) to the end session endpoint.
	*
	* @returns A promise
	*/
	async signoutSilent(args = {}) {
		var _a;
		const logger2 = this._logger.create("signoutSilent");
		const { silentRequestTimeoutInSeconds, ...requestArgs } = args;
		const id_token_hint = this.settings.includeIdTokenInSilentSignout ? (_a = await this._loadUser()) == null ? void 0 : _a.id_token : void 0;
		const url = this.settings.popup_post_logout_redirect_uri;
		const handle = await this._iframeNavigator.prepare({ silentRequestTimeoutInSeconds });
		await this._signout({
			request_type: "so:s",
			post_logout_redirect_uri: url,
			id_token_hint,
			...requestArgs
		}, handle);
		logger2.info("success");
	}
	/**
	* Notify the parent window of response (callback) from the end session endpoint.
	* It is recommended to use {@link UserManager.signoutCallback} instead.
	*
	* @returns A promise
	*
	* @see {@link UserManager.signoutCallback}
	*/
	async signoutSilentCallback(url = window.location.href) {
		const logger2 = this._logger.create("signoutSilentCallback");
		await this._iframeNavigator.callback(url);
		logger2.info("success");
	}
	async revokeTokens(types) {
		const user = await this._loadUser();
		await this._revokeInternal(user, types);
	}
	async _revokeInternal(user, types = this.settings.revokeTokenTypes) {
		const logger2 = this._logger.create("_revokeInternal");
		if (!user) return;
		const typesPresent = types.filter((type) => typeof user[type] === "string");
		if (!typesPresent.length) {
			logger2.debug("no need to revoke due to no token(s)");
			return;
		}
		for (const type of typesPresent) {
			await this._client.revokeToken(user[type], type);
			logger2.info(`${type} revoked successfully`);
			if (type !== "access_token") user[type] = null;
		}
		await this.storeUser(user);
		logger2.debug("user stored");
		await this._events.load(user);
	}
	/**
	* Enables silent renew for the `UserManager`.
	*/
	startSilentRenew() {
		this._logger.create("startSilentRenew");
		this._silentRenewService.start();
	}
	/**
	* Disables silent renew for the `UserManager`.
	*/
	stopSilentRenew() {
		this._silentRenewService.stop();
	}
	get _userStoreKey() {
		return `user:${this.settings.authority}:${this.settings.client_id}`;
	}
	async _loadUser() {
		const logger2 = this._logger.create("_loadUser");
		const storageString = await this.settings.userStore.get(this._userStoreKey);
		if (storageString) {
			logger2.debug("user storageString loaded");
			return User.fromStorageString(storageString);
		}
		logger2.debug("no user storageString");
		return null;
	}
	async storeUser(user) {
		const logger2 = this._logger.create("storeUser");
		if (user) {
			logger2.debug("storing user");
			const storageString = user.toStorageString();
			await this.settings.userStore.set(this._userStoreKey, storageString);
		} else {
			this._logger.debug("removing user");
			await this.settings.userStore.remove(this._userStoreKey);
			if (this.settings.dpop) await this.settings.dpop.store.remove(this.settings.client_id);
		}
	}
	/**
	* Removes stale state entries in storage for incomplete authorize requests.
	*/
	async clearStaleState() {
		await this._client.clearStaleState();
	}
	/**
	* Dynamically generates a DPoP proof for a given user, URL and optional Http method.
	* This method is useful when you need to make a request to a resource server
	* with fetch or similar, and you need to include a DPoP proof in a DPoP header.
	* @param url - The URL to generate the DPoP proof for
	* @param user - The user to generate the DPoP proof for
	* @param httpMethod - Optional, defaults to "GET"
	* @param nonce - Optional nonce provided by the resource server
	*
	* @returns A promise containing the DPoP proof or undefined if DPoP is not enabled/no user is found.
	*/
	async dpopProof(url, user, httpMethod, nonce) {
		var _a, _b;
		const dpopState = await ((_b = (_a = this.settings.dpop) == null ? void 0 : _a.store) == null ? void 0 : _b.get(this.settings.client_id));
		if (dpopState) return await CryptoUtils.generateDPoPProof({
			url,
			accessToken: user == null ? void 0 : user.access_token,
			httpMethod,
			keyPair: dpopState.keys,
			nonce
		});
	}
	async generateDPoPJkt(dpopSettings) {
		let dpopState = await dpopSettings.store.get(this.settings.client_id);
		if (!dpopState) {
			dpopState = new DPoPState(await CryptoUtils.generateDPoPKeys());
			await dpopSettings.store.set(this.settings.client_id, dpopState);
		}
		return await CryptoUtils.generateDPoPJkt(dpopState.keys);
	}
};
//#endregion
//#region ../send/frontend/src/stores/auth-store.ts
var auth_store_exports = /* @__PURE__ */ __exportAll({ useAuthStore: () => useAuthStore });
var settings = {
	authority: "https://auth.tb.pro/realms/tbpro/",
	client_id: "desktop",
	redirect_uri: `${window.location.origin}/post-login`,
	post_logout_redirect_uri: `https://send.tb.pro/logout`,
	response_type: "code",
	scope: "openid profile email offline_access",
	automaticSilentRenew: false,
	filterProtocolClaims: true,
	loadUserInfo: false
};
var userManager = new UserManager(settings);
/**
* OIDC error codes that mean the session is genuinely over — the refresh token
* was revoked or has expired. Any other failure (network, timeout, userinfo)
* is transient and must NOT drop the user out of a still-valid session.
*/
var GENUINE_AUTH_FAILURE_CODES = [
	"invalid_grant",
	"login_required",
	"session_expired"
];
function isGenuineAuthFailure(error) {
	const code = error?.error;
	return typeof code === "string" && GENUINE_AUTH_FAILURE_CODES.includes(code);
}
var forcedLogoutInProgress = false;
var useAuthStore = defineStore("auth", () => {
	const { api } = useApiStore();
	const { isExtension, isThunderbirdHost } = useConfigStore();
	const isLoggedIn = /* @__PURE__ */ ref(false);
	const currentUser = /* @__PURE__ */ ref(null);
	watch(isLoggedIn, (newValue) => {
		console.info("isLoggedIn changed", newValue);
	});
	let inFlightRefresh = null;
	let lastRefreshFailedGenuinely = false;
	/**
	* Notify the add-on background that the session is over so its menu reverts
	* to logged-out. Only meaningful inside Thunderbird, where the token-bridge
	* content script forwards window messages to background.ts — the same path
	* UserMenu.vue uses on explicit logout.
	*/
	function notifyAddonSignedOut() {
		if (!isThunderbirdHost) return;
		try {
			window.postMessage({ type: SIGN_OUT }, window.location.origin);
		} catch (error) {
			console.error("Failed to notify add-on of sign-out:", error);
		}
	}
	/**
	* Refresh the access token via the refresh_token, deduping concurrent callers.
	*
	* Returns the refreshed User on success. On a genuine auth failure (refresh
	* token revoked/expired) it clears local login state, notifies the add-on,
	* and returns null. On a transient failure (network/timeout) it leaves the
	* session intact and returns null so a later call can retry — we do not log
	* the user out over a blip.
	*/
	async function refreshAccessToken() {
		if (inFlightRefresh) return inFlightRefresh;
		inFlightRefresh = (async () => {
			lastRefreshFailedGenuinely = false;
			try {
				const user = await userManager.signinSilent();
				currentUser.value = user;
				if (isExtension && user) await browser.storage.local.set({ [STORAGE_KEY_AUTH]: user });
				return user;
			} catch (error) {
				if (isGenuineAuthFailure(error)) {
					lastRefreshFailedGenuinely = true;
					console.warn(`Silent token refresh failed — session ended (${error.error}). Signing out.`);
					isLoggedIn.value = false;
					currentUser.value = null;
					notifyAddonSignedOut();
				} else console.warn("Silent token refresh hit a transient error; keeping session:", error);
				return null;
			} finally {
				inFlightRefresh = null;
			}
		})();
		return inFlightRefresh;
	}
	async function getOIDCUser() {
		try {
			return await userManager.getUser();
		} catch (error) {
			console.error("Failed to get OIDC user:", error);
			return null;
		}
	}
	/**
	* Web to add-on — Step 2: Start the OIDC login process.
	*
	* Redirects the browser (or extension popup) to accounts.tb.pro.
	* The OIDC provider authenticates the user and redirects back to
	* /post-login (or /post-login?isExtension=true) with an authorization code.
	*
	* Web flow  : redirect_uri = <origin>/post-login
	* Extension : redirect_uri = <origin>/post-login?isExtension=true
	*             The isExtension flag is read by PostLoginPage / the router
	*             guard after login to skip the key-backup prompt.
	*/
	async function loginToOIDC({ onSuccess, isExtension }) {
		try {
			if (isExtension) await userManager.signinRedirect({ redirect_uri: `${window.location.origin}/post-login?isExtension=${isExtension}` });
			else await userManager.signinRedirect();
			if (onSuccess) onSuccess();
		} catch (error) {
			console.error("OIDC login failed:", error);
			throw error;
		}
	}
	/**
	* Web to add-on — Steps 5–8: Handle the OIDC redirect callback.
	*
	* Called by PostLoginPage.vue after accounts.tb.pro redirects back to
	* /post-login with an authorization code in the URL.
	*
	* Step 5 — Token exchange:
	*   signinCallback() reads the code from the URL and exchanges it with
	*   the OIDC token endpoint for access_token, refresh_token, and id_token.
	*
	* Step 6 — Notify the background script via the token-bridge:
	*   Because this page runs as a normal web tab, we cannot call
	*   browser.runtime.sendMessage() directly. Instead we use window.postMessage
	*   and rely on token-bridge.js (a content script injected into every tab)
	*   to forward the messages to background.ts.
	*   • OIDC_TOKEN  → background creates/updates the Thundermail mail account
	*                   using the refresh token as the OAuth2 credential.
	*   • OIDC_USER   → background stores the full User object in
	*                   browser.storage.local[STORAGE_KEY_AUTH] so the add-on
	*                   popup/menu can read it back via loadUser().
	*
	* Step 7 — Update background state (handled by background.ts, see there).
	*
	* Step 8 — Authenticate with the backend:
	*   POSTs the access_token as a Bearer token to auth/oidc/authenticate.
	*   The backend introspects it against the OIDC provider, finds or creates
	*   the user record, and responds with httpOnly JWT session cookies that
	*   all subsequent API calls use.
	*/
	async function handleOIDCCallback() {
		try {
			const user = await userManager.signinCallback();
			currentUser.value = user;
			window.addEventListener("message", (e) => {
				if (e.origin === window.location.origin && e.data?.type === "TB/BRIDGE_READY") console.log("[web app] bridge says: ready");
			});
			window.postMessage({
				type: BRIDGE_PING,
				text: "hello from auth store 👋"
			}, window.location.origin);
			window.postMessage({
				type: OIDC_TOKEN,
				token: user.refresh_token,
				email: user.profile.preferred_username,
				name: user.profile.name || user.profile.given_name
			}, window.location.origin);
			window.postMessage({
				type: OIDC_USER,
				user
			}, window.location.origin);
			const response = await api.call("auth/oidc/authenticate", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${user.access_token}`,
					"Content-Type": "application/json"
				}
			});
			if (response?.user) {
				isLoggedIn.value = true;
				return response.user;
			} else throw new Error("Backend authentication failed");
		} catch (error) {
			console.error("OIDC callback handling failed:", error);
			throw error;
		}
	}
	/**
	* Check if user is currently authenticated and get user info
	*/
	async function checkAuthStatus() {
		try {
			if (isExtension) await loadUser();
			let user = await userManager.getUser();
			if (user?.expired) {
				user = await refreshAccessToken();
				if (!user) return null;
			}
			if (user && !user.expired) {
				currentUser.value = user;
				const response = await api.call("auth/oidc/me", { headers: { Authorization: `Bearer ${user.access_token}` } });
				if (response?.user) {
					isLoggedIn.value = true;
					return response.user;
				}
			}
			isLoggedIn.value = false;
			currentUser.value = null;
			return null;
		} catch (error) {
			console.error("Auth status check failed:", error);
			isLoggedIn.value = false;
			currentUser.value = null;
			return null;
		}
	}
	/**
	* Get the current access token for API requests.
	* Transparently refreshes the token if it has expired.
	*/
	async function getAccessToken() {
		try {
			let user = await userManager.getUser();
			if (!user) return null;
			if (user.expired) user = await refreshAccessToken();
			return user?.access_token || null;
		} catch (error) {
			console.error("Failed to get access token:", error);
			return null;
		}
	}
	/**
	* Forced logout in response to the backend's x-logout header (#960): the
	* session was ended server-side (logout elsewhere, password change, admin
	* revoke). Clear local auth and return to a clean state. Deliberately does
	* NOT call the API (that path is what surfaced x-logout, so calling it again
	* would loop); it only clears client state and redirects.
	*/
	async function handleForcedLogout() {
		if (forcedLogoutInProgress) return;
		forcedLogoutInProgress = true;
		try {
			isLoggedIn.value = false;
			currentUser.value = null;
			try {
				await userManager.removeUser();
			} catch {}
			try {
				if (typeof browser !== "undefined") {
					await browser.storage.local.remove(STORAGE_KEY_AUTH);
					browser.runtime.sendMessage({ type: SIGN_OUT });
				}
			} catch {}
			if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tbpro:force-logout"));
		} finally {
			forcedLogoutInProgress = false;
		}
	}
	/**
	* Logout from OIDC and clear local state
	*/
	async function logoutFromOIDC() {
		try {
			await api.call("auth/oidc/logout", {}, "POST");
			await userManager.signoutRedirect();
		} catch (error) {
			console.error("OIDC logout failed:", error);
			isLoggedIn.value = false;
			currentUser.value = null;
		} finally {
			await browser.storage.local.remove(STORAGE_KEY_AUTH);
			browser.runtime.sendMessage({ type: SIGN_OUT });
		}
	}
	/**
	* Silent refresh of the access token. Delegates to the deduped
	* refreshAccessToken(), which owns state/notification on genuine failure and
	* preserves the session on transient errors.
	*/
	async function refreshToken() {
		return (await refreshAccessToken())?.access_token ?? null;
	}
	/**
	* The backend reported the current access token revoked (x-logout, #960).
	* Before tearing the session down, try a silent refresh: a revoked/expired
	* *access* token can often be replaced using a still-valid *refresh* token,
	* so the session keeps rolling instead of bouncing the user to login (PR #974
	* review). Only force logout when the refresh token is also gone; on a
	* transient refresh error keep the session (fail open).
	*
	* Goes through refreshAccessToken() — an unconditional signinSilent — rather
	* than getAccessToken(), because the token behind x-logout is still within
	* its lifetime (the backend exp-gates the signal), so getAccessToken() would
	* hand back the same stale, revoked token without refreshing.
	*
	* @returns `true` if the session was recovered — the caller should retry the
	* request with the fresh token — and `false` otherwise (forced logout on a
	* genuine failure, or session kept on a transient error).
	*/
	async function recoverOrForceLogout() {
		const user = await refreshAccessToken();
		if (user && !user.expired) return true;
		if (lastRefreshFailedGenuinely) await handleForcedLogout();
		return false;
	}
	async function loadUser() {
		try {
			const result = await browser.storage.local.get(STORAGE_KEY_AUTH);
			if (result["STORAGE_KEY_AUTH"]) {
				const userInstance = new User(result[STORAGE_KEY_AUTH]);
				await userManager.storeUser(userInstance);
			} else {
				await userManager.removeUser();
				isLoggedIn.value = false;
				currentUser.value = null;
			}
		} catch (e) {
			console.log(`No error. Only works if running in add-on.`);
			console.log(e);
		}
	}
	/**
	* Add-On to Web — Steps 3–8: Authenticate using a token set provided by the add-on.
	*
	* Called by AddonAuthPage.vue when the /addon-auth route loads. The add-on
	* already obtained an OIDC token set from accounts.tb.pro and staged it in
	* browser.storage.local via triggerAddonLogin(). Because this page runs as a
	* normal web tab, it cannot access browser.storage.local directly — instead
	* it requests the token via message-passing through the token-bridge content
	* script, then uses it to authenticate with the backend.
	*
	* Full flow (Add-On to Web):
	*  1.  background.ts – triggerAddonLogin() stores token, opens /addon-auth
	*  2.  AddonAuthPage.vue loads, calls this function
	*  3.  POST GET_PENDING_ADDON_TOKEN → token-bridge → background
	*  4.  background reads storage, responds with PENDING_ADDON_TOKEN_RESPONSE,
	*      then deletes the staging key
	*  5.  token-bridge forwards response → window.postMessage → Promise resolves
	*  6.  User object is reconstructed (or obtained via signinSilent)
	*  7.  OIDC_TOKEN + OIDC_USER are posted so the background keeps its own
	*      state in sync (Thundermail account setup, STORAGE_KEY_AUTH)
	*  8.  POST auth/oidc/authenticate — backend issues session cookies
	*  9.  AddonAuthPage posts SIGN_IN_COMPLETE → background closes tab
	*/
	async function authenticateWithAddonToken() {
		const tokenSet = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				window.removeEventListener("message", handler);
				reject(/* @__PURE__ */ new Error("Timed out waiting for pending addon token"));
			}, 5e3);
			function handler(e) {
				if (e.origin === window.location.origin && e.data?.type === "TB/PENDING_ADDON_TOKEN_RESPONSE") {
					clearTimeout(timeout);
					window.removeEventListener("message", handler);
					resolve(e.data.tokenSet ?? null);
				}
			}
			window.addEventListener("message", handler);
			window.postMessage({ type: GET_PENDING_ADDON_TOKEN }, window.location.origin);
		});
		if (!tokenSet?.refresh_token) throw new Error("No pending addon token found in storage");
		let user;
		if (tokenSet.access_token && tokenSet.id_token) {
			const idTokenPayload = JSON.parse(atob(tokenSet.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
			user = new User({
				access_token: tokenSet.access_token,
				refresh_token: tokenSet.refresh_token,
				id_token: tokenSet.id_token,
				token_type: "Bearer",
				scope: tokenSet.scope ?? "openid profile email offline_access",
				expires_at: tokenSet.expires_at ?? idTokenPayload.exp,
				profile: idTokenPayload
			});
			await userManager.storeUser(user);
			if (user.expired) user = await userManager.signinSilent();
		} else {
			await userManager.storeUser(new User({
				access_token: "",
				token_type: "Bearer",
				refresh_token: tokenSet.refresh_token,
				scope: tokenSet.scope ?? "openid profile email offline_access",
				expires_at: 0,
				profile: {
					sub: "",
					iss: settings.authority ?? "",
					aud: settings.client_id ?? "",
					exp: 0,
					iat: 0
				}
			}));
			user = await userManager.signinSilent();
		}
		currentUser.value = user;
		window.postMessage({
			type: OIDC_TOKEN,
			token: user.refresh_token,
			email: user.profile.preferred_username ?? user.profile.email,
			name: user.profile.name ?? user.profile.given_name
		}, window.location.origin);
		window.postMessage({
			type: OIDC_USER,
			user
		}, window.location.origin);
		const response = await api.call("auth/oidc/authenticate", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${user.access_token}`,
				"Content-Type": "application/json"
			}
		});
		if (response?.user) {
			isLoggedIn.value = true;
			return response.user;
		} else throw new Error("Backend authentication failed");
	}
	return {
		isLoggedIn,
		currentUser,
		loginToOIDC,
		handleOIDCCallback,
		checkAuthStatus,
		getAccessToken,
		logoutFromOIDC,
		handleForcedLogout,
		recoverOrForceLogout,
		refreshToken,
		loginToKeyCloak: loginToOIDC,
		loadUser,
		getOIDCUser,
		authenticateWithAddonToken
	};
});
//#endregion
//#region ../send/frontend/src/stores/index.ts
var stores_exports = /* @__PURE__ */ __exportAll({ useConfigStore: () => useConfigStore });
//#endregion
//#region ../send/frontend/src/composables/useIsExtension.ts
function useIsExtension() {
	const { isThunderbirdHost } = useConfigStore();
	const isExtension = computed(() => {
		if (window.location.href.includes("https://send.tb.pro") && !isThunderbirdHost) return false;
		return true;
	});
	const isRunningInsideThunderbird = computed(() => {
		return isThunderbirdHost;
	});
	const isUrlMozExtension = computed(() => {
		return location.href.includes("moz-extension:");
	});
	const isAppNameAddon = computed(() => {
		return true;
	});
	return {
		isExtension,
		isRunningInsideThunderbird,
		isAppNameAddon,
		isUrlMozExtension,
		environmentType: computed(() => {
			if (!isUrlMozExtension.value && isRunningInsideThunderbird.value) return "WEB APP INSIDE THUNDERBIRD";
			if (isUrlMozExtension.value && isRunningInsideThunderbird.value) return "EXTENSION INSIDE THUNDERBIRD";
			if (!isAppNameAddon.value && !isRunningInsideThunderbird.value) return "WEB APP OUTSIDE THUNDERBIRD";
			return "UNKNOWN ENVIRONMENT";
		})
	};
}
//#endregion
//#region ../send/frontend/src/apps/send/stores/extension-store.ts
var SERVER = `server`;
var useExtensionStore = defineStore("extension", () => {
	const { serverUrl, setServerUrl, getAddonId } = useConfigStore();
	const { isRunningInsideThunderbird } = useIsExtension();
	const accountId = new URL(location.href).searchParams.get("accountId");
	function setAccountConfigured(accountId) {
		try {
			browser.cloudFile.updateAccount(accountId, { configured: true });
		} catch {
			console.log(`setAccountConfigured: You're probably running this outside of Thundebird`);
		}
	}
	async function configureExtension(id = accountId) {
		if (!isRunningInsideThunderbird.value) return;
		try {
			const result = await browser.CloudFileAccounts.createAccount(getAddonId(), true);
			if (!result.success) console.warn(`[extension-store] Failed to create cloud file account: ${result.error}`);
			else if (result.alreadyExists) console.log(`[extension-store] Cloud file account already exists: ${result.accountId}`);
			else console.log(`[extension-store] Cloud file account created: ${result.accountId}`);
		} catch (error) {
			console.warn(`[extension-store] Error creating cloud file account:`, error);
		}
		if (!id) {
			console.log(`[extension-store] No id provided to configureExtension()`);
			return;
		}
		return browser.storage.local.set({ [id]: { [SERVER]: serverUrl.value } }).catch((error) => {
			console.log(error);
		}).then(() => {
			setAccountConfigured(id);
			setServerUrl(serverUrl.value);
			browser.storage.local.get(id).then((accountInfo) => {
				if (accountInfo[id] && SERVER in accountInfo[id]) {
					setServerUrl(accountInfo[id][SERVER]);
					setAccountConfigured(id);
				} else console.log(`You probably need to wait longer`);
			});
		});
	}
	const sendMessageToBridge = (message) => {
		window.postMessage({
			type: SEND_MESSAGE_TO_BRIDGE,
			value: message
		}, window.location.origin);
	};
	return {
		configureExtension,
		sendMessageToBridge,
		serverUrl,
		setServerUrl
	};
});
//#endregion
//#region ../send/frontend/src/lib/shared-pinia.ts
var piniaInstance = null;
/**
* Gets or creates the shared Pinia instance.
* This ensures both background.ts and extension contexts use the same instance.
*/
function getSharedPinia() {
	if (!piniaInstance) {
		piniaInstance = createPinia();
		setActivePinia(piniaInstance);
	}
	return piniaInstance;
}
/**
* Initializes the shared Pinia instance and sets it as active.
* Call this once at the start of background.ts or extension entry point.
*/
function initSharedPinia() {
	const pinia = getSharedPinia();
	setActivePinia(pinia);
	return pinia;
}
//#endregion
//#region src/addonIds.ts
/**
* Single source of truth for the add-on's extension ids.
*
* The same add-on is shipped under three ids:
*   - PROD   — the standalone production add-on (AMO/ATN, manual install).
*   - STAGE  — the standalone staging add-on.
*   - SYSTEM — the built-in (a.k.a. system) add-on bundled into Thunderbird and
*              enabled by default for every user. comm-central packaging
*              rewrites the manifest id to this when extracting the build.
*
* This module has no runtime dependencies so it can be imported both by the
* extension bundle (e.g. installGate.ts, selfUninstall.ts) and by the
* build/packaging scripts (scripts/config.ts, scripts/set-system-id.ts) — so the
* ids never have to be hard-coded in more than one place, including CI.
*/
var ADDON_ID_PROD = "tbpro-add-on@thunderbird.net";
var ADDON_ID_STAGE = "tbpro-addon-stage@thunderbird.net";
var ADDON_ID_SYSTEM = "tbpro-system-add-on@thunderbird.net";
//#endregion
//#region src/installGate.ts
/**
* Whether to auto-open the login tab when the add-on is installed.
*
* Only the regular (standalone) add-on does first-run onboarding by opening
* BASE_URL/login. The built-in system add-on is enabled by default for every
* Thunderbird user, so it must make zero outbound connections on a fresh,
* never-signed-in profile: opening the login URL is a network connection that
* fatally aborts under automation (the non-local-connection guard crashes the
* process — Bug 2036665). For the system add-on, login stays user-initiated via
* the menu.
*/
function shouldAutoOpenLoginOnInstall(reason, runtimeId) {
	if (reason !== "install") return false;
	if (!runtimeId) return false;
	return runtimeId !== ADDON_ID_SYSTEM;
}
//#endregion
//#region src/menu.ts
/** URL for Thunderbird Pro account dashboard (switches between staging and production) */
var THUNDERBIRD_ACCOUNTS_URL = `https://accounts${!(getEnvName() === "production") ? "-stage" : ""}.tb.pro/dashboard`;
/**
* Available menu actions that can be triggered via the TBPro menu system.
* Use these constants to ensure type safety and discoverability.
*/
var MENU_ACTIONS = {
	ROOT: "root",
	LOGOUT: "logout",
	MANAGE_DASHBOARD: "manageDashboard",
	MANAGE_SEND: "manageSend",
	OPEN_APPOINTMENT: "openAppointment"
};
var loginTabId = null;
/**
* Opens the login page in a new tab when user clicks the root menu item.
* Includes extension flag to enable proper authentication flow.
*/
async function menuLogin() {
	loginTabId = (await browser.tabs.create({ url: `${BASE_URL}/login?isExtension=true` })).id;
}
/**
* Opens the Thunderbird Pro account dashboard in a new tab.
* Users can manage their account settings, subscriptions, and profile here.
*/
async function menuManageDashboard() {
	await browser.tabs.create({ url: THUNDERBIRD_ACCOUNTS_URL });
}
/**
* Opens the Thunderbird Send application in a new tab.
* Users can access their files and manage Send settings.
*/
async function menuManageSend() {
	await browser.tabs.create({ url: `${BASE_URL}/send/profile?showDashboard=true` });
}
/**
* Updates the menu to reflect logged-in state with user-specific options.
* Shows username and adds menu items for managing dashboard, Send, and logout.
*/
async function menuLoggedIn({ username }) {
	await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
		title: "",
		secondaryTitle: username,
		tooltip: browser.i18n.getMessage("menuSignedInTooltip")
	});
	await browser.TBProMenu.create(MENU_ACTIONS.MANAGE_DASHBOARD, {
		title: browser.i18n.getMessage("menuManageDashboard"),
		parentId: MENU_ACTIONS.ROOT
	});
	await browser.TBProMenu.create(MENU_ACTIONS.MANAGE_SEND, {
		title: browser.i18n.getMessage("menuManageSend"),
		parentId: MENU_ACTIONS.ROOT
	});
	await browser.TBProMenu.create(MENU_ACTIONS.OPEN_APPOINTMENT, {
		title: browser.i18n.getMessage("menuOpenAppointment"),
		parentId: MENU_ACTIONS.ROOT
	});
	await browser.TBProMenu.create(MENU_ACTIONS.LOGOUT, {
		title: browser.i18n.getMessage("menuSignout"),
		parentId: MENU_ACTIONS.ROOT
	});
}
/**
* Handles logout process by resetting menu to logged-out state and opening logout page.
* Clears the username and removes authenticated menu items.
* Also clears all localStorage and extension storage data.
*/
async function menuLogout() {
	await browser.TBProMenu.update(MENU_ACTIONS.ROOT, {
		title: browser.i18n.getMessage("menuSignInTo"),
		secondaryTitle: browser.i18n.getMessage("thunderbirdPro"),
		tooltip: ""
	});
	console.log("🧹 Clearing menu items and storage");
	await browser.TBProMenu.clear("root");
	await browser.storage.local.clear();
	try {
		localStorage.clear();
		console.log("✅ Cleared localStorage");
	} catch {
		console.log("ℹ️ localStorage not available in this context");
	}
	console.log("✅ Cleared extension storage");
	await closeAllAddOnTabs();
	await browser.tabs.create({ url: `${BASE_URL}/logout` });
}
async function closeAllAddOnTabs() {
	const tabs = await browser.tabs.query({});
	for (const tab of tabs) if (tab.id && tab.url?.startsWith("https://send.tb.pro")) try {
		await browser.tabs.remove(tab.id);
	} catch {
		console.warn(`Could not close Send tab with id ${tab.id}`);
	}
}
async function getLoginState() {
	try {
		const auth = (await browser.storage.local.get(STORAGE_KEY_AUTH))[STORAGE_KEY_AUTH];
		if (!auth) return {
			isLoggedIn: false,
			username: null
		};
		const username = auth?.profile?.preferred_username || auth?.profile?.email;
		if (auth.refresh_token && username) {
			await menuLoggedIn({ username });
			return {
				isLoggedIn: true,
				username
			};
		}
		return {
			isLoggedIn: false,
			username: null
		};
	} catch (error) {
		console.error("Error retrieving auth state from storage:", error);
		return {
			isLoggedIn: false,
			username: null
		};
	}
}
async function closeLoginTab() {
	console.log(`[menu.ts] Attempting to close login tab with id ${loginTabId}`);
	if (loginTabId) try {
		await browser.tabs.get(loginTabId);
		await browser.tabs.remove(loginTabId);
	} catch {
		console.warn(`Could not close login tab with id ${loginTabId}`);
	}
}
function checkLoginStateOnInterval() {
	setInterval(async () => {
		await getLoginState();
	}, 60 * 1e3);
}
/**
* Initializes the TBPro menu system and sets up click event handlers.
* Creates the root menu item and registers listeners for all menu actions.
*/
function init() {
	browser.runtime.onInstalled.addListener(async (details) => {
		if (shouldAutoOpenLoginOnInstall(details.reason, browser.runtime.id)) await menuLogin();
	});
	browser.TBProMenu.onClicked.addListener(async (action) => {
		switch (action) {
			case MENU_ACTIONS.ROOT:
				await menuLogin();
				break;
			case MENU_ACTIONS.LOGOUT:
				await menuLogout();
				break;
			case MENU_ACTIONS.MANAGE_DASHBOARD:
				await menuManageDashboard();
				break;
			case MENU_ACTIONS.MANAGE_SEND:
				await menuManageSend();
				break;
			case MENU_ACTIONS.OPEN_APPOINTMENT:
				await browser.tabs.create({ url: APPOINTMENT_URL });
				break;
		}
	});
	browser.TBProMenu.create(MENU_ACTIONS.ROOT, {
		title: browser.i18n.getMessage("menuSignInTo"),
		secondaryTitle: browser.i18n.getMessage("thunderbirdPro"),
		tooltip: ""
	});
	getLoginState();
	checkLoginStateOnInterval();
}
//#endregion
//#region src/cloudFileGate.ts
/**
* Whether to create/register the Thunderbird Send cloudfile account eagerly on
* background startup.
*
* The Send cloudfile account must only exist once the user has actually signed
* in. The built-in system add-on is enabled by default for every Thunderbird
* user, so on a fresh, never-signed-in profile (including under automation) it
* must not touch the cloudfile account list at all. Otherwise it leaves a
* "Thunderbird Send" account in the default profile and breaks Thunderbird's own
* cloudfile tests — browser_ext_cloudFile.js, browser_repeat_upload.js and the
* addRemoveAccounts checks — which assert a clean account baseline (e.g.
* "Should have no cloudfile accounts starting off. - 1 == 0"). See Bug 2036665.
*
* The account is still created on explicit sign-in via the SIGN_IN_COMPLETE
* flow in background.ts, so signed-in users (standalone or system) keep the Send
* cloudfile provider configured.
*
* The manifest `cloud_file` key also makes Thunderbird register the Send
* provider itself on every startup, independently of the account. When this
* returns false, background.ts additionally unregisters that provider (via the
* CloudFileAccounts experiment API) so a signed-out profile shows no Send entry
* in the cloud file provider list at all; it is re-registered on sign-in.
*/
function shouldInitCloudFileOnStartup(isLoggedIn) {
	return isLoggedIn;
}
//#endregion
//#region src/selfUninstall.ts
var DEPRECATION_ADDON_IDS = [ADDON_ID_STAGE, ADDON_ID_PROD];
/**
* Compare two semver strings. Returns true if `a >= b`.
* Handles standard MAJOR.MINOR.PATCH format.
*/
function semverGte(a, b) {
	const parse = (v) => v.split(".").map(Number);
	const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
	const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
	if (aMaj !== bMaj) return aMaj > bMaj;
	if (aMin !== bMin) return aMin > bMin;
	return aPatch >= bPatch;
}
/**
* On startup, checks whether this addon instance should uninstall itself.
*
* Uninstall conditions (all must be true):
* 1. `VITE_DEPRECATION_VERSION` env var is set at build time.
* 2. The running addon ID matches the designated deprecation ID.
* 3. The Thunderbird (Gecko) version is >= the deprecation cutoff version.
*
* Production builds are unaffected because their addon ID differs.
*/
async function checkAndUninstallIfDeprecated() {
	const cutoffVersion = "153.0.0";
	const currentId = browser.runtime.id;
	if (!DEPRECATION_ADDON_IDS.includes(currentId)) {
		console.log(`[self-uninstall] Addon ID "${currentId}" does not match any deprecation ID — skipping.`);
		return;
	}
	const { version: geckoVersion } = await browser.runtime.getBrowserInfo();
	console.log(`[self-uninstall] Gecko version: ${geckoVersion}, cutoff: ${cutoffVersion}`);
	if (!semverGte(geckoVersion, cutoffVersion)) {
		console.log(`[self-uninstall] Version ${geckoVersion} is below cutoff ${cutoffVersion} — skipping.`);
		return;
	}
	console.warn(`[self-uninstall] Gecko ${geckoVersion} >= cutoff ${cutoffVersion} and ID matches — uninstalling addon.`);
	await browser.management.uninstallSelf({ showConfirmDialog: false });
}
//#endregion
//#region src/background.ts
initSharedPinia();
var folderStore = useFolderStore();
var userStore = useUserStore();
var { keychain } = useKeychainStore();
var { api } = useApiStore();
var { configureExtension } = useExtensionStore();
var { isProd, getAddonId } = useConfigStore();
console.log("hello from the background.js!", (/* @__PURE__ */ new Date()).getTime());
async function setupCloudFileAccountWorkaround() {
	try {
		const allAccounts = await browser.cloudFile.getAllAccounts();
		if (allAccounts.length > 0) for (const { id } of allAccounts) {
			console.log(`[background.td] passing ${id} to configureExtension()`);
			await configureExtension(id);
		}
		else for (let i = 0; i < 100; i++) await configureExtension(`account${i}`);
	} catch (error) {
		console.warn("Error configuring cloudFile:", error);
	}
}
function logAccountCreationResult(result) {
	if (!result.success) console.error(`[extension-store] Failed to create cloud file account: ${result.error}`);
	else if (result.alreadyExists) console.log(`[extension-store] Cloud file account already exists: ${result.accountId}`);
	else console.log(`[extension-store] Cloud file account created: ${result.accountId}`);
}
async function initCloudFile() {
	try {
		await browser.CloudFileAccounts.registerProvider();
	} catch (error) {
		console.warn("Error registering cloud file provider:", error);
	}
	try {
		const result = await browser.CloudFileAccounts.createAccount(getAddonId(), true);
		logAccountCreationResult(result);
		if (result?.accountId) await configureExtension(result.accountId);
		else await setupCloudFileAccountWorkaround();
	} catch (error) {
		console.error(`[extension-store] Error creating cloud file account:`, error);
	}
	try {
		await restoreKeysUsingLocalStorage(keychain, api);
	} catch (error) {
		console.warn("Error restoring keys from local storage on background.js:", error);
	}
	try {
		await init$1(userStore, keychain, folderStore);
	} catch (error) {
		console.warn("Error during initialization of userStore, keychain, folderStore:", error);
	}
}
browser.webRequest.onBeforeSendHeaders.addListener((details) => {
	const origin = browser.runtime.getURL("").slice(0, -1);
	const requestHeaders = details.requestHeaders.filter(({ name, value }) => !(name.toLowerCase() === "origin" && value === origin));
	const hostName = requestHeaders.find(({ name }) => name === "Host")?.value;
	console.log(`altered a request for host ${hostName}`, {
		requestHeaders,
		origin
	});
	return { requestHeaders };
}, { urls: ["https://*.backblazeb2.com/*"] }, ["blocking", "requestHeaders"]);
var uploadInfoQueue = [];
var uploadPromiseMap = /* @__PURE__ */ new Map();
var popupTimer = null;
var popupWindowId = null;
browser.cloudFile.onFileUpload.addListener(async (_, fileInfo) => {
	const { id, name, data } = fileInfo;
	console.log(`[onFileUpload] Received file: ${name} (ID: ${id})`);
	if (popupTimer) clearTimeout(popupTimer);
	const abortController = new AbortController();
	uploadInfoQueue.push({
		id,
		name,
		data
	});
	const uploadPromise = new Promise((resolve, reject) => {
		uploadPromiseMap.set(id, {
			resolve,
			reject,
			abortController
		});
	});
	popupTimer = setTimeout(openUnifiedPopup, 250);
	return uploadPromise;
});
/**
* Opens a single popup window for all queued files.
*/
async function openUnifiedPopup() {
	if (uploadInfoQueue.length === 0 || popupWindowId) {
		console.log(`[openUnifiedPopup] Aborting: Queue is empty or popup exists.`);
		return;
	}
	console.log(`[openUnifiedPopup] Timer expired. Opening popup for ${uploadInfoQueue.length} files.`);
	try {
		popupWindowId = (await browser.windows.create({
			url: browser.runtime.getURL("index.extension.html"),
			type: "popup",
			width: 480,
			height: 600,
			allowScriptsToClose: true
		})).id;
	} catch (error) {
		console.error(`[openUnifiedPopup] Error creating popup:`, error);
		rejectAllInQueue(/* @__PURE__ */ new Error("Popup window could not be opened."));
	}
}
var THUNDERMAIL_HOST = `mail.${!isProd ? "stage-" : ""}thundermail.com`;
var THUNDERMAIL_DISPLAY_NAME = "Thundermail";
browser.runtime.onMessage.addListener(async (message, sender) => {
	let ftueResponse = null;
	const { email, name, token } = message;
	switch (message.type) {
		case PING:
			console.log("[background] got the ping from the bridge");
			break;
		case OIDC_USER:
			await browser.storage.local.set({ [STORAGE_KEY_AUTH]: message.user });
			console.log(`🎯 user auth stored in add-on context.`);
			console.log(`updating the 🍔 menu.`);
			menuLoggedIn({ username: email });
			break;
		case OIDC_TOKEN:
			if (!email || !token) {
				console.log(`Did not get info back from login`);
				return;
			}
			console.log(`Attempting to create with token as password`);
			console.log(token);
			try {
				await createThundermailAccount(email, name, THUNDERMAIL_HOST, THUNDERMAIL_DISPLAY_NAME);
			} catch (e) {
				console.log(e);
			}
			try {
				await addThundermailToken(token, email, THUNDERMAIL_HOST);
			} catch (e) {
				console.log(e);
			}
			menuLoggedIn({ username: email });
			break;
		case SIGN_OUT:
			menuLogout();
			try {
				await browser.CloudFileAccounts.unregisterProvider();
			} catch (e) {
				console.warn("Error unregistering cloud file provider on sign-out:", e);
			}
			break;
		case SIGN_IN:
			console.log(`[onMessage] background.ts received sign-in message.`);
			await browser.windows.create({
				url: `${BASE_URL}/login?isExtension=true`,
				type: "popup",
				allowScriptsToClose: true,
				height: 750,
				width: 980,
				linkHandler: "relaxed"
			});
			break;
		case SIGN_IN_COMPLETE:
			console.log(`[onMessage] background.ts received SIGN_IN_COMPLETE. Telling menu.ts to close tab.`);
			try {
				ftueResponse = await api.call("users/ftue");
			} catch {
				console.error("Error fetching FTUE status");
			}
			if (!ftueResponse?.isFTUEComplete) {
				browser.tabs.create({ url: `${BASE_URL}/ftue` });
				await initCloudFile();
				break;
			}
			try {
				await closeLoginTab();
				await initCloudFile();
			} catch (e) {
				console.error("Error during SIGN_IN_COMPLETE handling:", e);
			}
			break;
		case SEND_MESSAGE_TO_BRIDGE:
			await browser.storage.local.set({ SEND_MESSAGE_TO_BRIDGE: message.value });
			console.log(`✅ SEND_MESSAGE_TO_BRIDGE value stored in browser storage`);
			(await browser.tabs.query({})).forEach((tab) => {
				if (tab.id) browser.tabs.sendMessage(tab.id, { type: "TRANSFER_BRIDGE_MESSAGE" }).catch(() => {});
			});
			break;
		case GET_LOGIN_STATE: {
			const loginState = await getLoginState();
			console.log(`[onMessage] Login state:`, loginState);
			(await browser.tabs.query({})).forEach((tab) => {
				if (tab.id) browser.tabs.sendMessage(tab.id, {
					type: LOGIN_STATE_RESPONSE,
					isLoggedIn: loginState.isLoggedIn,
					username: loginState.username
				}).catch(() => {});
			});
			break;
		}
		case GET_TELEMETRY_STATE: {
			if (!sender?.tab?.url?.startsWith("https://send.tb.pro")) break;
			let enabled = false;
			try {
				enabled = await browser.thundermailTelemetry.isTelemetryEnabled();
			} catch (e) {
				console.warn("[onMessage] Failed to read telemetry state:", e);
			}
			return {
				type: TELEMETRY_STATE_RESPONSE,
				enabled
			};
		}
		case GET_PENDING_ADDON_TOKEN: {
			const pendingToken = await browser.storage.local.get(PENDING_ADDON_TOKEN);
			if (sender?.tab?.id) browser.tabs.sendMessage(sender.tab.id, {
				type: PENDING_ADDON_TOKEN_RESPONSE,
				tokenSet: pendingToken["tbpro-pending-addon-token"] ?? null
			}).catch(() => {});
			await browser.storage.local.remove(PENDING_ADDON_TOKEN);
			break;
		}
		case FORCE_CLOSE_WINDOW:
			console.log(`[onMessage] Received FORCE_CLOSE_WINDOW request`);
			if (sender?.tab?.id) {
				console.log(`[onMessage] Closing tab ${sender.tab.id}`);
				await browser.tabs.remove(sender.tab.id);
			}
			break;
		case OPEN_MANAGEMENT_PAGE:
			console.log(`[onMessage] Received OPEN_MANAGEMENT_PAGE request`);
			break;
		case POPUP_READY:
			console.log(`[onMessage] Popup is ready. Sending file list.`);
			browser.runtime.sendMessage({
				type: FILE_LIST,
				files: uploadInfoQueue
			});
			uploadInfoQueue = [];
			break;
		case ALL_UPLOADS_COMPLETE: {
			console.log(`[onMessage] Received message that files were uploaded.`);
			const { url } = message;
			message.results.forEach(({ originalId: id }) => {
				if (uploadPromiseMap.has(id)) {
					uploadPromiseMap.get(id).resolve({
						aborted: false,
						url
					});
					uploadPromiseMap.delete(id);
				}
			});
			const isPasswordProtected = !url.includes("#");
			try {
				if (!isPasswordProtected) {
					const [_url, hash] = url.split("share/")[1].split("#");
					await api.call(`sharing/${_url}/add-password`, {
						linkId: _url,
						password: hash
					}, "POST");
				}
			} catch (error) {
				console.error(`[onMessage] Error handling ALL_UPLOADS_COMPLETE:`, error);
			}
			break;
		}
		case ALL_UPLOADS_ABORTED:
			console.log(`[onMessage] User aborted all uploads.`);
			rejectAllInQueue(/* @__PURE__ */ new Error("User aborted the operation."));
			break;
	}
	return new Promise((resolve) => {
		resolve(true);
	});
});
browser.windows.onRemoved.addListener((windowId) => {
	if (windowId === popupWindowId) {
		console.log(`[onRemoved] Popup window closed.`);
		popupWindowId = null;
		rejectAllInQueue(/* @__PURE__ */ new Error("Popup window was closed prematurely."));
	}
});
browser.cloudFile.onFileUploadAbort.addListener((_, id) => {
	const uploadInfo = uploadPromiseMap.get(id);
	if (uploadInfo && uploadInfo.abortController) {
		console.log(`aborting upload:`);
		console.log(uploadInfo);
		uploadInfo.abortController.abort();
	}
});
/**
* Add-On to Web — Step 1: Initiate an add-on-driven login.
*
* ┌─────────────────── Add-On to Web flow ───────────────────────────────┐
* │ 1. add-on obtains a full OIDC token set from accounts.tb.pro      │
* │    (e.g. via AccountHub.onAccountAdded).                          │
* │ 2. triggerAddonLogin() stages the token set in                    │
* │    browser.storage.local[PENDING_ADDON_TOKEN] and opens a new     │
* │    browser tab pointing at BASE_URL/addon-auth.                   │
* │ 3. The /addon-auth page loads and AddonAuthPage.vue calls         │
* │    authenticateWithAddonToken() in the auth store.                │
* │ 4. auth-store posts GET_PENDING_ADDON_TOKEN via window.postMessage.│
* │ 5. token-bridge.js (content script) receives it and forwards it   │
* │    to background via browser.runtime.sendMessage.                 │
* │ 6. Background reads PENDING_ADDON_TOKEN from storage, sends       │
* │    PENDING_ADDON_TOKEN_RESPONSE back to the tab, then cleans up.  │
* │ 7. token-bridge.js relays the response to the page.               │
* │ 8. auth-store reconstructs the User, hits POST auth/oidc/auth-    │
* │    enticate, and marks the user as logged in.                     │
* │ 9. AddonAuthPage posts SIGN_IN_COMPLETE → background closes the   │
* │    tab, runs initCloudFile, and opens the options page.           │
* └───────────────────────────────────────────────────────────────────┘
*
* @param tokenSet - OIDC token set received from accounts.tb.pro.
* @param tokenSet.access_token - Access token for the account, if available.
* @param tokenSet.expires_at - Token expiration timestamp, if available.
* @param tokenSet.id_token - ID token for the account, if available.
* @param tokenSet.refresh_token - Refresh token for the account.
* @param tokenSet.scope - Token scope, if available.
*   access_token and id_token are optional: when only a refresh_token is
*   available (AccountHub case), auth-store will call signinSilent() to
*   exchange it for a full token set before hitting the backend.
*/
async function triggerAddonLogin(tokenSet) {
	await browser.storage.local.set({ [PENDING_ADDON_TOKEN]: tokenSet });
	await browser.tabs.create({ url: `${BASE_URL}/addon-auth` });
}
/**
* Helper function to clean up pending uploads if something goes wrong.
* Calls the reject() and abort() functions for each file id.
* This is used for cleanup on errors or cancellations.
* @param {Error} reason - The reason for the rejection.
*/
function rejectAllInQueue(reason) {
	const remainingIds = Array.from(uploadPromiseMap.keys());
	if (remainingIds.length > 0) {
		console.log(`[rejectAllInQueue] Rejecting ${remainingIds.length} pending promises.`);
		remainingIds.forEach((id) => {
			uploadPromiseMap.get(id).abortController.abort();
			uploadPromiseMap.get(id).reject(reason);
			uploadPromiseMap.delete(id);
		});
	}
	uploadInfoQueue = [];
}
async function createThundermailAccount(email, realname, hostname, displayName) {
	try {
		const result = await browser.MailAccounts.createAccount(email, realname, hostname, displayName);
		if (result.success) if (result.alreadyExists) return {
			success: true,
			message: `Account already exists for ${email}`,
			alreadyExists: true
		};
		else return {
			success: true,
			message: `Account created successfully for ${email}`,
			alreadyExists: false
		};
		else return {
			success: false,
			message: `Creation failed: ${result.error || "Unknown error"}`
		};
	} catch (e) {
		return {
			success: false,
			message: `Creation failed with error: ${e.message}`
		};
	}
}
async function addThundermailToken(token, email, hostname) {
	console.log(`[addThundermailToken] Setting token for ${email}`);
	try {
		console.log(`[addThundermailToken] Calling setToken API`);
		const result = await browser.MailAccounts.setToken(token, email, hostname);
		if (result.success) return {
			success: true,
			message: `Token saved successfully for ${email}`
		};
		else return {
			success: false,
			message: `Saving token failed: ${result.error || "Unknown error"}`
		};
	} catch (e) {
		console.log(`[addThundermailToken] Caught an error:`, e);
		return {
			success: false,
			message: `Saving token failed with error: ${e.message}`
		};
	}
}
function initStorageWatcher() {
	browser.storage.onChanged.addListener(async (changes) => {
		if (changes["STORAGE_KEY_AUTH"]) {
			if (changes["STORAGE_KEY_AUTH"].newValue === void 0) try {
				await browser.storage.local.remove(STORAGE_KEY_AUTH);
				browser.runtime.sendMessage({ type: SIGN_OUT });
			} catch {
				console.error(`Error during sign-out cleanup in background.js`);
			}
		}
	});
}
function initAccountHubListener() {
	browser.AccountHub.onAccountAdded.addListener(async ({ token, email }) => {
		console.log(`[AccountHub] onAccountAdded fired for ${email}. Logging in add-on.`);
		try {
			await addThundermailToken(token, email, THUNDERMAIL_HOST);
		} catch (e) {
			console.error("[AccountHub] Failed to store OIDC token:", e);
		}
		menuLoggedIn({ username: email });
		try {
			await triggerAddonLogin({ refresh_token: token });
		} catch (e) {
			console.error("[AccountHub] Failed to trigger addon login:", e);
		}
	});
}
function initTelemetryListener() {
	if (!browser.thundermailTelemetry?.onChanged?.addListener) {
		console.warn("[Telemetry] browser.thundermailTelemetry.onChanged unavailable; runtime telemetry pref-change broadcast disabled.");
		return;
	}
	browser.thundermailTelemetry.onChanged.addListener(async (enabled) => {
		(await browser.tabs.query({})).forEach((tab) => {
			if (tab.id && tab.url?.startsWith("https://send.tb.pro")) browser.tabs.sendMessage(tab.id, {
				type: TELEMETRY_STATE_CHANGED,
				enabled
			}).catch(() => {});
		});
	});
}
(async function main() {
	await checkAndUninstallIfDeprecated();
	init();
	const { isLoggedIn } = await getLoginState();
	if (shouldInitCloudFileOnStartup(isLoggedIn)) initCloudFile();
	else try {
		await browser.CloudFileAccounts.unregisterProvider();
	} catch (error) {
		console.warn("Error unregistering cloud file provider:", error);
	}
	initStorageWatcher();
	initAccountHubListener();
	initTelemetryListener();
})().catch((error) => {
	console.error("Error initializing background.js", error);
});
//#endregion
export { triggerAddonLogin };


"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ClientWidgetApi = void 0;
var _events = require("events");
var _PostmessageTransport = require("./transport/PostmessageTransport");
var _WidgetApiDirection = require("./interfaces/WidgetApiDirection");
var _WidgetApiAction = require("./interfaces/WidgetApiAction");
var _Capabilities = require("./interfaces/Capabilities");
var _ApiVersion = require("./interfaces/ApiVersion");
var _WidgetEventCapability = require("./models/WidgetEventCapability");
var _GetOpenIDAction = require("./interfaces/GetOpenIDAction");
var _SimpleObservable = require("./util/SimpleObservable");
var _Symbols = require("./Symbols");
var _UpdateDelayedEventAction = require("./interfaces/UpdateDelayedEventAction");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator["return"] && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, "catch": function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _asyncIterator(iterable) { var method, async, sync, retry = 2; for ("undefined" != typeof Symbol && (async = Symbol.asyncIterator, sync = Symbol.iterator); retry--;) { if (async && null != (method = iterable[async])) return method.call(iterable); if (sync && null != (method = iterable[sync])) return new AsyncFromSyncIterator(method.call(iterable)); async = "@@asyncIterator", sync = "@@iterator"; } throw new TypeError("Object is not async iterable"); }
function AsyncFromSyncIterator(s) { function AsyncFromSyncIteratorContinuation(r) { if (Object(r) !== r) return Promise.reject(new TypeError(r + " is not an object.")); var done = r.done; return Promise.resolve(r.value).then(function (value) { return { value: value, done: done }; }); } return AsyncFromSyncIterator = function AsyncFromSyncIterator(s) { this.s = s, this.n = s.next; }, AsyncFromSyncIterator.prototype = { s: null, n: null, next: function next() { return AsyncFromSyncIteratorContinuation(this.n.apply(this.s, arguments)); }, "return": function _return(value) { var ret = this.s["return"]; return void 0 === ret ? Promise.resolve({ value: value, done: !0 }) : AsyncFromSyncIteratorContinuation(ret.apply(this.s, arguments)); }, "throw": function _throw(value) { var thr = this.s["return"]; return void 0 === thr ? Promise.reject(value) : AsyncFromSyncIteratorContinuation(thr.apply(this.s, arguments)); } }, new AsyncFromSyncIterator(s); } /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * Copyright 2020 - 2024 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             *         http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             * limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             */
/**
 * API handler for the client side of widgets. This raises events
 * for each action received as `action:${action}` (eg: "action:screenshot").
 * Default handling can be prevented by using preventDefault() on the
 * raised event. The default handling varies for each action: ones
 * which the SDK can handle safely are acknowledged appropriately and
 * ones which are unhandled (custom or require the client to do something)
 * are rejected with an error.
 *
 * Events which are preventDefault()ed must reply using the transport.
 * The events raised will have a default of an IWidgetApiRequest
 * interface.
 *
 * When the ClientWidgetApi is ready to start sending requests, it will
 * raise a "ready" CustomEvent. After the ready event fires, actions can
 * be sent and the transport will be ready.
 *
 * When the widget has indicated it has loaded, this class raises a
 * "preparing" CustomEvent. The preparing event does not indicate that
 * the widget is ready to receive communications - that is signified by
 * the ready event exclusively.
 *
 * This class only handles one widget at a time.
 */
var ClientWidgetApi = /*#__PURE__*/function (_EventEmitter) {
  _inherits(ClientWidgetApi, _EventEmitter);
  var _super = _createSuper(ClientWidgetApi);
  /**
   * Creates a new client widget API. This will instantiate the transport
   * and start everything. When the iframe is loaded under the widget's
   * conditions, a "ready" event will be raised.
   * @param {Widget} widget The widget to communicate with.
   * @param {HTMLIFrameElement} iframe The iframe the widget is in.
   * @param {WidgetDriver} driver The driver for this widget/client.
   */
  function ClientWidgetApi(widget, iframe, driver) {
    var _this;
    _classCallCheck(this, ClientWidgetApi);
    _this = _super.call(this);
    _this.widget = widget;
    _this.iframe = iframe;
    _this.driver = driver;
    _defineProperty(_assertThisInitialized(_this), "transport", void 0);
    // contentLoadedActionSent is used to check that only one ContentLoaded request is send.
    _defineProperty(_assertThisInitialized(_this), "contentLoadedActionSent", false);
    _defineProperty(_assertThisInitialized(_this), "allowedCapabilities", new Set());
    _defineProperty(_assertThisInitialized(_this), "allowedEvents", []);
    _defineProperty(_assertThisInitialized(_this), "isStopped", false);
    _defineProperty(_assertThisInitialized(_this), "turnServers", null);
    _defineProperty(_assertThisInitialized(_this), "contentLoadedWaitTimer", void 0);
    if (!(iframe !== null && iframe !== void 0 && iframe.contentWindow)) {
      throw new Error("No iframe supplied");
    }
    if (!widget) {
      throw new Error("Invalid widget");
    }
    if (!driver) {
      throw new Error("Invalid driver");
    }
    _this.transport = new _PostmessageTransport.PostmessageTransport(_WidgetApiDirection.WidgetApiDirection.ToWidget, widget.id, iframe.contentWindow, window);
    _this.transport.targetOrigin = widget.origin;
    _this.transport.on("message", _this.handleMessage.bind(_assertThisInitialized(_this)));
    iframe.addEventListener("load", _this.onIframeLoad.bind(_assertThisInitialized(_this)));
    _this.transport.start();
    return _this;
  }
  _createClass(ClientWidgetApi, [{
    key: "hasCapability",
    value: function hasCapability(capability) {
      return this.allowedCapabilities.has(capability);
    }
  }, {
    key: "canUseRoomTimeline",
    value: function canUseRoomTimeline(roomId) {
      return this.hasCapability("org.matrix.msc2762.timeline:".concat(_Symbols.Symbols.AnyRoom)) || this.hasCapability("org.matrix.msc2762.timeline:".concat(roomId));
    }
  }, {
    key: "canSendRoomEvent",
    value: function canSendRoomEvent(eventType) {
      var msgtype = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
      return this.allowedEvents.some(function (e) {
        return e.matchesAsRoomEvent(_WidgetEventCapability.EventDirection.Send, eventType, msgtype);
      });
    }
  }, {
    key: "canSendStateEvent",
    value: function canSendStateEvent(eventType, stateKey) {
      return this.allowedEvents.some(function (e) {
        return e.matchesAsStateEvent(_WidgetEventCapability.EventDirection.Send, eventType, stateKey);
      });
    }
  }, {
    key: "canSendToDeviceEvent",
    value: function canSendToDeviceEvent(eventType) {
      return this.allowedEvents.some(function (e) {
        return e.matchesAsToDeviceEvent(_WidgetEventCapability.EventDirection.Send, eventType);
      });
    }
  }, {
    key: "canReceiveRoomEvent",
    value: function canReceiveRoomEvent(eventType) {
      var msgtype = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
      return this.allowedEvents.some(function (e) {
        return e.matchesAsRoomEvent(_WidgetEventCapability.EventDirection.Receive, eventType, msgtype);
      });
    }
  }, {
    key: "canReceiveStateEvent",
    value: function canReceiveStateEvent(eventType, stateKey) {
      return this.allowedEvents.some(function (e) {
        return e.matchesAsStateEvent(_WidgetEventCapability.EventDirection.Receive, eventType, stateKey);
      });
    }
  }, {
    key: "canReceiveToDeviceEvent",
    value: function canReceiveToDeviceEvent(eventType) {
      return this.allowedEvents.some(function (e) {
        return e.matchesAsToDeviceEvent(_WidgetEventCapability.EventDirection.Receive, eventType);
      });
    }
  }, {
    key: "canReceiveRoomAccountData",
    value: function canReceiveRoomAccountData(eventType) {
      return this.allowedEvents.some(function (e) {
        return e.matchesAsRoomAccountData(_WidgetEventCapability.EventDirection.Receive, eventType);
      });
    }
  }, {
    key: "stop",
    value: function stop() {
      this.isStopped = true;
      this.transport.stop();
    }
  }, {
    key: "beginCapabilities",
    value: function beginCapabilities() {
      var _this2 = this;
      // widget has loaded - tell all the listeners that
      this.emit("preparing");
      var requestedCaps;
      this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.Capabilities, {}).then(function (caps) {
        requestedCaps = caps.capabilities;
        return _this2.driver.validateCapabilities(new Set(caps.capabilities));
      }).then(function (allowedCaps) {
        console.log("Widget ".concat(_this2.widget.id, " is allowed capabilities:"), Array.from(allowedCaps));
        _this2.allowedCapabilities = allowedCaps;
        _this2.allowedEvents = _WidgetEventCapability.WidgetEventCapability.findEventCapabilities(allowedCaps);
        _this2.notifyCapabilities(requestedCaps);
        _this2.emit("ready");
      })["catch"](function (e) {
        _this2.emit("error:preparing", e);
      });
    }
  }, {
    key: "notifyCapabilities",
    value: function notifyCapabilities(requested) {
      var _this3 = this;
      this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities, {
        requested: requested,
        approved: Array.from(this.allowedCapabilities)
      })["catch"](function (e) {
        console.warn("non-fatal error notifying widget of approved capabilities:", e);
      }).then(function () {
        _this3.emit("capabilitiesNotified");
      });
    }
  }, {
    key: "onIframeLoad",
    value: function onIframeLoad(ev) {
      if (this.widget.waitForIframeLoad) {
        // If the widget is set to waitForIframeLoad the capabilities immediatly get setup after load.
        // The client does not wait for the ContentLoaded action.
        this.beginCapabilities();
      } else {
        // Reaching this means, that the Iframe got reloaded/loaded and
        // the clientApi is awaiting the FIRST ContentLoaded action.
        console.log("waitForIframeLoad is false: waiting for widget to send contentLoaded");
        this.contentLoadedWaitTimer = setTimeout(function () {
          console.error("Widget specified waitForIframeLoad=false but timed out waiting for contentLoaded event!");
        }, 10000);
        this.contentLoadedActionSent = false;
      }
    }
  }, {
    key: "handleContentLoadedAction",
    value: function handleContentLoadedAction(action) {
      if (this.contentLoadedWaitTimer !== undefined) {
        clearTimeout(this.contentLoadedWaitTimer);
        this.contentLoadedWaitTimer = undefined;
      }
      if (this.contentLoadedActionSent) {
        throw new Error("Improper sequence: ContentLoaded Action can only be sent once after the widget loaded " + "and should only be used if waitForIframeLoad is false (default=true)");
      }
      if (this.widget.waitForIframeLoad) {
        this.transport.reply(action, {
          error: {
            message: "Improper sequence: not expecting ContentLoaded event if " + "waitForIframeLoad is true (default=true)"
          }
        });
      } else {
        this.transport.reply(action, {});
        this.beginCapabilities();
      }
      this.contentLoadedActionSent = true;
    }
  }, {
    key: "replyVersions",
    value: function replyVersions(request) {
      this.transport.reply(request, {
        supported_versions: _ApiVersion.CurrentApiVersions
      });
    }
  }, {
    key: "handleCapabilitiesRenegotiate",
    value: function handleCapabilitiesRenegotiate(request) {
      var _request$data,
        _this4 = this;
      // acknowledge first
      this.transport.reply(request, {});
      var requested = ((_request$data = request.data) === null || _request$data === void 0 ? void 0 : _request$data.capabilities) || [];
      var newlyRequested = new Set(requested.filter(function (r) {
        return !_this4.hasCapability(r);
      }));
      if (newlyRequested.size === 0) {
        // Nothing to do - notify capabilities
        return this.notifyCapabilities([]);
      }
      this.driver.validateCapabilities(newlyRequested).then(function (allowed) {
        allowed.forEach(function (c) {
          return _this4.allowedCapabilities.add(c);
        });
        var allowedEvents = _WidgetEventCapability.WidgetEventCapability.findEventCapabilities(allowed);
        allowedEvents.forEach(function (c) {
          return _this4.allowedEvents.push(c);
        });
        return _this4.notifyCapabilities(Array.from(newlyRequested));
      });
    }
  }, {
    key: "handleNavigate",
    value: function handleNavigate(request) {
      var _request$data2,
        _request$data3,
        _this5 = this;
      if (!this.hasCapability(_Capabilities.MatrixCapabilities.MSC2931Navigate)) {
        return this.transport.reply(request, {
          error: {
            message: "Missing capability"
          }
        });
      }
      if (!((_request$data2 = request.data) !== null && _request$data2 !== void 0 && _request$data2.uri) || !((_request$data3 = request.data) !== null && _request$data3 !== void 0 && _request$data3.uri.toString().startsWith("https://matrix.to/#"))) {
        return this.transport.reply(request, {
          error: {
            message: "Invalid matrix.to URI"
          }
        });
      }
      var onErr = function onErr(e) {
        console.error("[ClientWidgetApi] Failed to handle navigation: ", e);
        return _this5.transport.reply(request, {
          error: {
            message: "Error handling navigation"
          }
        });
      };
      try {
        this.driver.navigate(request.data.uri.toString())["catch"](function (e) {
          return onErr(e);
        }).then(function () {
          return _this5.transport.reply(request, {});
        });
      } catch (e) {
        return onErr(e);
      }
    }
  }, {
    key: "handleOIDC",
    value: function handleOIDC(request) {
      var _this6 = this;
      var phase = 1; // 1 = initial request, 2 = after user manual confirmation

      var replyState = function replyState(state, credential) {
        credential = credential || {};
        if (phase > 1) {
          return _this6.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials, _objectSpread({
            state: state,
            original_request_id: request.requestId
          }, credential));
        } else {
          return _this6.transport.reply(request, _objectSpread({
            state: state
          }, credential));
        }
      };
      var replyError = function replyError(msg) {
        console.error("[ClientWidgetApi] Failed to handle OIDC: ", msg);
        if (phase > 1) {
          // We don't have a way to indicate that a random error happened in this flow, so
          // just block the attempt.
          return replyState(_GetOpenIDAction.OpenIDRequestState.Blocked);
        } else {
          return _this6.transport.reply(request, {
            error: {
              message: msg
            }
          });
        }
      };
      var observer = new _SimpleObservable.SimpleObservable(function (update) {
        if (update.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation && phase > 1) {
          observer.close();
          return replyError("client provided out-of-phase response to OIDC flow");
        }
        if (update.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation) {
          replyState(update.state);
          phase++;
          return;
        }
        if (update.state === _GetOpenIDAction.OpenIDRequestState.Allowed && !update.token) {
          return replyError("client provided invalid OIDC token for an allowed request");
        }
        if (update.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
          update.token = undefined; // just in case the client did something weird
        }

        observer.close();
        return replyState(update.state, update.token);
      });
      this.driver.askOpenID(observer);
    }
  }, {
    key: "handleReadRoomAccountData",
    value: function handleReadRoomAccountData(request) {
      var _this7 = this;
      var events = Promise.resolve([]);
      events = this.driver.readRoomAccountData(request.data.type);
      if (!this.canReceiveRoomAccountData(request.data.type)) {
        return this.transport.reply(request, {
          error: {
            message: "Cannot read room account data of this type"
          }
        });
      }
      return events.then(function (evs) {
        _this7.transport.reply(request, {
          events: evs
        });
      });
    }
  }, {
    key: "handleReadEvents",
    value: function handleReadEvents(request) {
      var _this8 = this;
      if (!request.data.type) {
        return this.transport.reply(request, {
          error: {
            message: "Invalid request - missing event type"
          }
        });
      }
      if (request.data.limit !== undefined && (!request.data.limit || request.data.limit < 0)) {
        return this.transport.reply(request, {
          error: {
            message: "Invalid request - limit out of range"
          }
        });
      }
      var askRoomIds = null; // null denotes current room only
      if (request.data.room_ids) {
        askRoomIds = request.data.room_ids;
        if (!Array.isArray(askRoomIds)) {
          askRoomIds = [askRoomIds];
        }
        var _iterator2 = _createForOfIteratorHelper(askRoomIds),
          _step2;
        try {
          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
            var roomId = _step2.value;
            if (!this.canUseRoomTimeline(roomId)) {
              return this.transport.reply(request, {
                error: {
                  message: "Unable to access room timeline: ".concat(roomId)
                }
              });
            }
          }
        } catch (err) {
          _iterator2.e(err);
        } finally {
          _iterator2.f();
        }
      }
      var limit = request.data.limit || 0;
      var since = request.data.since;
      var events = Promise.resolve([]);
      if (request.data.state_key !== undefined) {
        var stateKey = request.data.state_key === true ? undefined : request.data.state_key.toString();
        if (!this.canReceiveStateEvent(request.data.type, stateKey !== null && stateKey !== void 0 ? stateKey : null)) {
          return this.transport.reply(request, {
            error: {
              message: "Cannot read state events of this type"
            }
          });
        }
        events = this.driver.readStateEvents(request.data.type, stateKey, limit, askRoomIds);
      } else {
        if (!this.canReceiveRoomEvent(request.data.type, request.data.msgtype)) {
          return this.transport.reply(request, {
            error: {
              message: "Cannot read room events of this type"
            }
          });
        }
        events = this.driver.readRoomEvents(request.data.type, request.data.msgtype, limit, askRoomIds, since);
      }
      return events.then(function (evs) {
        return _this8.transport.reply(request, {
          events: evs
        });
      });
    }
  }, {
    key: "handleSendEvent",
    value: function handleSendEvent(request) {
      var _this9 = this;
      if (!request.data.type) {
        return this.transport.reply(request, {
          error: {
            message: "Invalid request - missing event type"
          }
        });
      }
      if (!!request.data.room_id && !this.canUseRoomTimeline(request.data.room_id)) {
        return this.transport.reply(request, {
          error: {
            message: "Unable to access room timeline: ".concat(request.data.room_id)
          }
        });
      }
      var isDelayedEvent = request.data.delay !== undefined || request.data.parent_delay_id !== undefined;
      if (isDelayedEvent && !this.hasCapability(_Capabilities.MatrixCapabilities.MSC4157SendDelayedEvent)) {
        return this.transport.reply(request, {
          error: {
            message: "Missing capability"
          }
        });
      }
      var sendEventPromise;
      if (request.data.state_key !== undefined) {
        if (!this.canSendStateEvent(request.data.type, request.data.state_key)) {
          return this.transport.reply(request, {
            error: {
              message: "Cannot send state events of this type"
            }
          });
        }
        if (!isDelayedEvent) {
          sendEventPromise = this.driver.sendEvent(request.data.type, request.data.content || {}, request.data.state_key, request.data.room_id);
        } else {
          var _request$data$delay, _request$data$parent_;
          sendEventPromise = this.driver.sendDelayedEvent((_request$data$delay = request.data.delay) !== null && _request$data$delay !== void 0 ? _request$data$delay : null, (_request$data$parent_ = request.data.parent_delay_id) !== null && _request$data$parent_ !== void 0 ? _request$data$parent_ : null, request.data.type, request.data.content || {}, request.data.state_key, request.data.room_id);
        }
      } else {
        var content = request.data.content || {};
        var msgtype = content['msgtype'];
        if (!this.canSendRoomEvent(request.data.type, msgtype)) {
          return this.transport.reply(request, {
            error: {
              message: "Cannot send room events of this type"
            }
          });
        }
        if (!isDelayedEvent) {
          sendEventPromise = this.driver.sendEvent(request.data.type, content, null,
          // not sending a state event
          request.data.room_id);
        } else {
          var _request$data$delay2, _request$data$parent_2;
          sendEventPromise = this.driver.sendDelayedEvent((_request$data$delay2 = request.data.delay) !== null && _request$data$delay2 !== void 0 ? _request$data$delay2 : null, (_request$data$parent_2 = request.data.parent_delay_id) !== null && _request$data$parent_2 !== void 0 ? _request$data$parent_2 : null, request.data.type, content, null,
          // not sending a state event
          request.data.room_id);
        }
      }
      sendEventPromise.then(function (sentEvent) {
        return _this9.transport.reply(request, _objectSpread({
          room_id: sentEvent.roomId
        }, "eventId" in sentEvent ? {
          event_id: sentEvent.eventId
        } : {
          delay_id: sentEvent.delayId
        }));
      })["catch"](function (e) {
        console.error("error sending event: ", e);
        return _this9.transport.reply(request, {
          error: {
            message: "Error sending event"
          }
        });
      });
    }
  }, {
    key: "handleUpdateDelayedEvent",
    value: function handleUpdateDelayedEvent(request) {
      var _this10 = this;
      if (!request.data.delay_id) {
        return this.transport.reply(request, {
          error: {
            message: "Invalid request - missing delay_id"
          }
        });
      }
      if (!this.hasCapability(_Capabilities.MatrixCapabilities.MSC4157UpdateDelayedEvent)) {
        return this.transport.reply(request, {
          error: {
            message: "Missing capability"
          }
        });
      }
      switch (request.data.action) {
        case _UpdateDelayedEventAction.UpdateDelayedEventAction.Cancel:
        case _UpdateDelayedEventAction.UpdateDelayedEventAction.Restart:
        case _UpdateDelayedEventAction.UpdateDelayedEventAction.Send:
          this.driver.updateDelayedEvent(request.data.delay_id, request.data.action).then(function () {
            return _this10.transport.reply(request, {});
          })["catch"](function (e) {
            console.error("error updating delayed event: ", e);
            return _this10.transport.reply(request, {
              error: {
                message: "Error updating delayed event"
              }
            });
          });
          break;
        default:
          return this.transport.reply(request, {
            error: {
              message: "Invalid request - unsupported action"
            }
          });
      }
    }
  }, {
    key: "handleSendToDevice",
    value: function () {
      var _handleSendToDevice = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(request) {
        return _regeneratorRuntime().wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              if (request.data.type) {
                _context.next = 5;
                break;
              }
              _context.next = 3;
              return this.transport.reply(request, {
                error: {
                  message: "Invalid request - missing event type"
                }
              });
            case 3:
              _context.next = 32;
              break;
            case 5:
              if (request.data.messages) {
                _context.next = 10;
                break;
              }
              _context.next = 8;
              return this.transport.reply(request, {
                error: {
                  message: "Invalid request - missing event contents"
                }
              });
            case 8:
              _context.next = 32;
              break;
            case 10:
              if (!(typeof request.data.encrypted !== "boolean")) {
                _context.next = 15;
                break;
              }
              _context.next = 13;
              return this.transport.reply(request, {
                error: {
                  message: "Invalid request - missing encryption flag"
                }
              });
            case 13:
              _context.next = 32;
              break;
            case 15:
              if (this.canSendToDeviceEvent(request.data.type)) {
                _context.next = 20;
                break;
              }
              _context.next = 18;
              return this.transport.reply(request, {
                error: {
                  message: "Cannot send to-device events of this type"
                }
              });
            case 18:
              _context.next = 32;
              break;
            case 20:
              _context.prev = 20;
              _context.next = 23;
              return this.driver.sendToDevice(request.data.type, request.data.encrypted, request.data.messages);
            case 23:
              _context.next = 25;
              return this.transport.reply(request, {});
            case 25:
              _context.next = 32;
              break;
            case 27:
              _context.prev = 27;
              _context.t0 = _context["catch"](20);
              console.error("error sending to-device event", _context.t0);
              _context.next = 32;
              return this.transport.reply(request, {
                error: {
                  message: "Error sending event"
                }
              });
            case 32:
            case "end":
              return _context.stop();
          }
        }, _callee, this, [[20, 27]]);
      }));
      function handleSendToDevice(_x) {
        return _handleSendToDevice.apply(this, arguments);
      }
      return handleSendToDevice;
    }()
  }, {
    key: "pollTurnServers",
    value: function () {
      var _pollTurnServers = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(turnServers, initialServer) {
        var _iteratorAbruptCompletion, _didIteratorError, _iteratorError, _iterator, _step, server;
        return _regeneratorRuntime().wrap(function _callee2$(_context2) {
          while (1) switch (_context2.prev = _context2.next) {
            case 0:
              _context2.prev = 0;
              _context2.next = 3;
              return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers, initialServer // it's compatible, but missing the index signature
              );
            case 3:
              // Pick the generator up where we left off
              _iteratorAbruptCompletion = false;
              _didIteratorError = false;
              _context2.prev = 5;
              _iterator = _asyncIterator(turnServers);
            case 7:
              _context2.next = 9;
              return _iterator.next();
            case 9:
              if (!(_iteratorAbruptCompletion = !(_step = _context2.sent).done)) {
                _context2.next = 16;
                break;
              }
              server = _step.value;
              _context2.next = 13;
              return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers, server // it's compatible, but missing the index signature
              );
            case 13:
              _iteratorAbruptCompletion = false;
              _context2.next = 7;
              break;
            case 16:
              _context2.next = 22;
              break;
            case 18:
              _context2.prev = 18;
              _context2.t0 = _context2["catch"](5);
              _didIteratorError = true;
              _iteratorError = _context2.t0;
            case 22:
              _context2.prev = 22;
              _context2.prev = 23;
              if (!(_iteratorAbruptCompletion && _iterator["return"] != null)) {
                _context2.next = 27;
                break;
              }
              _context2.next = 27;
              return _iterator["return"]();
            case 27:
              _context2.prev = 27;
              if (!_didIteratorError) {
                _context2.next = 30;
                break;
              }
              throw _iteratorError;
            case 30:
              return _context2.finish(27);
            case 31:
              return _context2.finish(22);
            case 32:
              _context2.next = 37;
              break;
            case 34:
              _context2.prev = 34;
              _context2.t1 = _context2["catch"](0);
              console.error("error polling for TURN servers", _context2.t1);
            case 37:
            case "end":
              return _context2.stop();
          }
        }, _callee2, this, [[0, 34], [5, 18, 22, 32], [23,, 27, 31]]);
      }));
      function pollTurnServers(_x2, _x3) {
        return _pollTurnServers.apply(this, arguments);
      }
      return pollTurnServers;
    }()
  }, {
    key: "handleWatchTurnServers",
    value: function () {
      var _handleWatchTurnServers = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(request) {
        var turnServers, _yield$turnServers$ne, done, value;
        return _regeneratorRuntime().wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3846TurnServers)) {
                _context3.next = 5;
                break;
              }
              _context3.next = 3;
              return this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              });
            case 3:
              _context3.next = 30;
              break;
            case 5:
              if (!this.turnServers) {
                _context3.next = 10;
                break;
              }
              _context3.next = 8;
              return this.transport.reply(request, {});
            case 8:
              _context3.next = 30;
              break;
            case 10:
              _context3.prev = 10;
              turnServers = this.driver.getTurnServers(); // Peek at the first result, so we can at least verify that the
              // client isn't banned from getting TURN servers entirely
              _context3.next = 14;
              return turnServers.next();
            case 14:
              _yield$turnServers$ne = _context3.sent;
              done = _yield$turnServers$ne.done;
              value = _yield$turnServers$ne.value;
              if (!done) {
                _context3.next = 19;
                break;
              }
              throw new Error("Client refuses to provide any TURN servers");
            case 19:
              _context3.next = 21;
              return this.transport.reply(request, {});
            case 21:
              // Start the poll loop, sending the widget the initial result
              this.pollTurnServers(turnServers, value);
              this.turnServers = turnServers;
              _context3.next = 30;
              break;
            case 25:
              _context3.prev = 25;
              _context3.t0 = _context3["catch"](10);
              console.error("error getting first TURN server results", _context3.t0);
              _context3.next = 30;
              return this.transport.reply(request, {
                error: {
                  message: "TURN servers not available"
                }
              });
            case 30:
            case "end":
              return _context3.stop();
          }
        }, _callee3, this, [[10, 25]]);
      }));
      function handleWatchTurnServers(_x4) {
        return _handleWatchTurnServers.apply(this, arguments);
      }
      return handleWatchTurnServers;
    }()
  }, {
    key: "handleUnwatchTurnServers",
    value: function () {
      var _handleUnwatchTurnServers = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(request) {
        return _regeneratorRuntime().wrap(function _callee4$(_context4) {
          while (1) switch (_context4.prev = _context4.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3846TurnServers)) {
                _context4.next = 5;
                break;
              }
              _context4.next = 3;
              return this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              });
            case 3:
              _context4.next = 15;
              break;
            case 5:
              if (this.turnServers) {
                _context4.next = 10;
                break;
              }
              _context4.next = 8;
              return this.transport.reply(request, {});
            case 8:
              _context4.next = 15;
              break;
            case 10:
              _context4.next = 12;
              return this.turnServers["return"](undefined);
            case 12:
              this.turnServers = null;
              _context4.next = 15;
              return this.transport.reply(request, {});
            case 15:
            case "end":
              return _context4.stop();
          }
        }, _callee4, this);
      }));
      function handleUnwatchTurnServers(_x5) {
        return _handleUnwatchTurnServers.apply(this, arguments);
      }
      return handleUnwatchTurnServers;
    }()
  }, {
    key: "handleReadRelations",
    value: function () {
      var _handleReadRelations = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(request) {
        var _this11 = this;
        var result, chunk;
        return _regeneratorRuntime().wrap(function _callee5$(_context5) {
          while (1) switch (_context5.prev = _context5.next) {
            case 0:
              if (request.data.event_id) {
                _context5.next = 2;
                break;
              }
              return _context5.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Invalid request - missing event ID"
                }
              }));
            case 2:
              if (!(request.data.limit !== undefined && request.data.limit < 0)) {
                _context5.next = 4;
                break;
              }
              return _context5.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Invalid request - limit out of range"
                }
              }));
            case 4:
              if (!(request.data.room_id !== undefined && !this.canUseRoomTimeline(request.data.room_id))) {
                _context5.next = 6;
                break;
              }
              return _context5.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Unable to access room timeline: ".concat(request.data.room_id)
                }
              }));
            case 6:
              _context5.prev = 6;
              _context5.next = 9;
              return this.driver.readEventRelations(request.data.event_id, request.data.room_id, request.data.rel_type, request.data.event_type, request.data.from, request.data.to, request.data.limit, request.data.direction);
            case 9:
              result = _context5.sent;
              // only return events that the user has the permission to receive
              chunk = result.chunk.filter(function (e) {
                if (e.state_key !== undefined) {
                  return _this11.canReceiveStateEvent(e.type, e.state_key);
                } else {
                  return _this11.canReceiveRoomEvent(e.type, e.content['msgtype']);
                }
              });
              return _context5.abrupt("return", this.transport.reply(request, {
                chunk: chunk,
                prev_batch: result.prevBatch,
                next_batch: result.nextBatch
              }));
            case 14:
              _context5.prev = 14;
              _context5.t0 = _context5["catch"](6);
              console.error("error getting the relations", _context5.t0);
              _context5.next = 19;
              return this.transport.reply(request, {
                error: {
                  message: "Unexpected error while reading relations"
                }
              });
            case 19:
            case "end":
              return _context5.stop();
          }
        }, _callee5, this, [[6, 14]]);
      }));
      function handleReadRelations(_x6) {
        return _handleReadRelations.apply(this, arguments);
      }
      return handleReadRelations;
    }()
  }, {
    key: "handleUserDirectorySearch",
    value: function () {
      var _handleUserDirectorySearch = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(request) {
        var result;
        return _regeneratorRuntime().wrap(function _callee6$(_context6) {
          while (1) switch (_context6.prev = _context6.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC3973UserDirectorySearch)) {
                _context6.next = 2;
                break;
              }
              return _context6.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              }));
            case 2:
              if (!(typeof request.data.search_term !== 'string')) {
                _context6.next = 4;
                break;
              }
              return _context6.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Invalid request - missing search term"
                }
              }));
            case 4:
              if (!(request.data.limit !== undefined && request.data.limit < 0)) {
                _context6.next = 6;
                break;
              }
              return _context6.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Invalid request - limit out of range"
                }
              }));
            case 6:
              _context6.prev = 6;
              _context6.next = 9;
              return this.driver.searchUserDirectory(request.data.search_term, request.data.limit);
            case 9:
              result = _context6.sent;
              return _context6.abrupt("return", this.transport.reply(request, {
                limited: result.limited,
                results: result.results.map(function (r) {
                  return {
                    user_id: r.userId,
                    display_name: r.displayName,
                    avatar_url: r.avatarUrl
                  };
                })
              }));
            case 13:
              _context6.prev = 13;
              _context6.t0 = _context6["catch"](6);
              console.error("error searching in the user directory", _context6.t0);
              _context6.next = 18;
              return this.transport.reply(request, {
                error: {
                  message: "Unexpected error while searching in the user directory"
                }
              });
            case 18:
            case "end":
              return _context6.stop();
          }
        }, _callee6, this, [[6, 13]]);
      }));
      function handleUserDirectorySearch(_x7) {
        return _handleUserDirectorySearch.apply(this, arguments);
      }
      return handleUserDirectorySearch;
    }()
  }, {
    key: "handleGetMediaConfig",
    value: function () {
      var _handleGetMediaConfig = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(request) {
        var result;
        return _regeneratorRuntime().wrap(function _callee7$(_context7) {
          while (1) switch (_context7.prev = _context7.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039UploadFile)) {
                _context7.next = 2;
                break;
              }
              return _context7.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              }));
            case 2:
              _context7.prev = 2;
              _context7.next = 5;
              return this.driver.getMediaConfig();
            case 5:
              result = _context7.sent;
              return _context7.abrupt("return", this.transport.reply(request, result));
            case 9:
              _context7.prev = 9;
              _context7.t0 = _context7["catch"](2);
              console.error("error while getting the media configuration", _context7.t0);
              _context7.next = 14;
              return this.transport.reply(request, {
                error: {
                  message: "Unexpected error while getting the media configuration"
                }
              });
            case 14:
            case "end":
              return _context7.stop();
          }
        }, _callee7, this, [[2, 9]]);
      }));
      function handleGetMediaConfig(_x8) {
        return _handleGetMediaConfig.apply(this, arguments);
      }
      return handleGetMediaConfig;
    }()
  }, {
    key: "handleUploadFile",
    value: function () {
      var _handleUploadFile = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8(request) {
        var result;
        return _regeneratorRuntime().wrap(function _callee8$(_context8) {
          while (1) switch (_context8.prev = _context8.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039UploadFile)) {
                _context8.next = 2;
                break;
              }
              return _context8.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              }));
            case 2:
              _context8.prev = 2;
              _context8.next = 5;
              return this.driver.uploadFile(request.data.file);
            case 5:
              result = _context8.sent;
              return _context8.abrupt("return", this.transport.reply(request, {
                content_uri: result.contentUri
              }));
            case 9:
              _context8.prev = 9;
              _context8.t0 = _context8["catch"](2);
              console.error("error while uploading a file", _context8.t0);
              _context8.next = 14;
              return this.transport.reply(request, {
                error: {
                  message: "Unexpected error while uploading a file"
                }
              });
            case 14:
            case "end":
              return _context8.stop();
          }
        }, _callee8, this, [[2, 9]]);
      }));
      function handleUploadFile(_x9) {
        return _handleUploadFile.apply(this, arguments);
      }
      return handleUploadFile;
    }()
  }, {
    key: "handleDownloadFile",
    value: function () {
      var _handleDownloadFile = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(request) {
        var result;
        return _regeneratorRuntime().wrap(function _callee9$(_context9) {
          while (1) switch (_context9.prev = _context9.next) {
            case 0:
              if (this.hasCapability(_Capabilities.MatrixCapabilities.MSC4039DownloadFile)) {
                _context9.next = 2;
                break;
              }
              return _context9.abrupt("return", this.transport.reply(request, {
                error: {
                  message: "Missing capability"
                }
              }));
            case 2:
              _context9.prev = 2;
              _context9.next = 5;
              return this.driver.downloadFile(request.data.content_uri);
            case 5:
              result = _context9.sent;
              return _context9.abrupt("return", this.transport.reply(request, {
                file: result.file
              }));
            case 9:
              _context9.prev = 9;
              _context9.t0 = _context9["catch"](2);
              console.error("error while downloading a file", _context9.t0);
              this.transport.reply(request, {
                error: {
                  message: "Unexpected error while downloading a file"
                }
              });
            case 13:
            case "end":
              return _context9.stop();
          }
        }, _callee9, this, [[2, 9]]);
      }));
      function handleDownloadFile(_x10) {
        return _handleDownloadFile.apply(this, arguments);
      }
      return handleDownloadFile;
    }()
  }, {
    key: "handleMessage",
    value: function handleMessage(ev) {
      if (this.isStopped) return;
      var actionEv = new CustomEvent("action:".concat(ev.detail.action), {
        detail: ev.detail,
        cancelable: true
      });
      this.emit("action:".concat(ev.detail.action), actionEv);
      if (!actionEv.defaultPrevented) {
        switch (ev.detail.action) {
          case _WidgetApiAction.WidgetApiFromWidgetAction.ContentLoaded:
            return this.handleContentLoadedAction(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.SupportedApiVersions:
            return this.replyVersions(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.SendEvent:
            return this.handleSendEvent(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.SendToDevice:
            return this.handleSendToDevice(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.GetOpenIDCredentials:
            return this.handleOIDC(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2931Navigate:
            return this.handleNavigate(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2974RenegotiateCapabilities:
            return this.handleCapabilitiesRenegotiate(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents:
            return this.handleReadEvents(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.WatchTurnServers:
            return this.handleWatchTurnServers(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.UnwatchTurnServers:
            return this.handleUnwatchTurnServers(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC3869ReadRelations:
            return this.handleReadRelations(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC3973UserDirectorySearch:
            return this.handleUserDirectorySearch(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.BeeperReadRoomAccountData:
            return this.handleReadRoomAccountData(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction:
            return this.handleGetMediaConfig(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039UploadFileAction:
            return this.handleUploadFile(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4039DownloadFileAction:
            return this.handleDownloadFile(ev.detail);
          case _WidgetApiAction.WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent:
            return this.handleUpdateDelayedEvent(ev.detail);
          default:
            return this.transport.reply(ev.detail, {
              error: {
                message: "Unknown or unsupported action: " + ev.detail.action
              }
            });
        }
      }
    }

    /**
     * Takes a screenshot of the widget.
     * @returns Resolves to the widget's screenshot.
     * @throws Throws if there is a problem.
     */
  }, {
    key: "takeScreenshot",
    value: function takeScreenshot() {
      return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.TakeScreenshot, {});
    }

    /**
     * Alerts the widget to whether or not it is currently visible.
     * @param {boolean} isVisible Whether the widget is visible or not.
     * @returns {Promise<IWidgetApiResponseData>} Resolves when the widget acknowledges the update.
     */
  }, {
    key: "updateVisibility",
    value: function updateVisibility(isVisible) {
      return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.UpdateVisibility, {
        visible: isVisible
      });
    }
  }, {
    key: "sendWidgetConfig",
    value: function sendWidgetConfig(data) {
      return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.WidgetConfig, data).then();
    }
  }, {
    key: "notifyModalWidgetButtonClicked",
    value: function notifyModalWidgetButtonClicked(id) {
      return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.ButtonClicked, {
        id: id
      }).then();
    }
  }, {
    key: "notifyModalWidgetClose",
    value: function notifyModalWidgetClose(data) {
      return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.CloseModalWidget, data).then();
    }

    /**
     * Feeds an event to the widget. If the widget is not able to accept the event due to
     * permissions, this will no-op and return calmly. If the widget failed to handle the
     * event, this will raise an error.
     * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
     * @param {string} currentViewedRoomId The room ID the user is currently interacting with.
     * Not the room ID of the event.
     * @returns {Promise<void>} Resolves when complete, rejects if there was an error sending.
     */
  }, {
    key: "feedEvent",
    value: function () {
      var _feedEvent = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10(rawEvent, currentViewedRoomId) {
        var _rawEvent$content;
        return _regeneratorRuntime().wrap(function _callee10$(_context10) {
          while (1) switch (_context10.prev = _context10.next) {
            case 0:
              if (!(rawEvent.room_id !== currentViewedRoomId && !this.canUseRoomTimeline(rawEvent.room_id))) {
                _context10.next = 2;
                break;
              }
              return _context10.abrupt("return");
            case 2:
              if (!(rawEvent.state_key !== undefined && rawEvent.state_key !== null)) {
                _context10.next = 7;
                break;
              }
              if (this.canReceiveStateEvent(rawEvent.type, rawEvent.state_key)) {
                _context10.next = 5;
                break;
              }
              return _context10.abrupt("return");
            case 5:
              _context10.next = 9;
              break;
            case 7:
              if (this.canReceiveRoomEvent(rawEvent.type, (_rawEvent$content = rawEvent.content) === null || _rawEvent$content === void 0 ? void 0 : _rawEvent$content["msgtype"])) {
                _context10.next = 9;
                break;
              }
              return _context10.abrupt("return");
            case 9:
              _context10.next = 11;
              return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.SendEvent, rawEvent // it's compatible, but missing the index signature
              );
            case 11:
            case "end":
              return _context10.stop();
          }
        }, _callee10, this);
      }));
      function feedEvent(_x11, _x12) {
        return _feedEvent.apply(this, arguments);
      }
      return feedEvent;
    }()
    /**
     * Feeds a to-device event to the widget. If the widget is not able to accept the
     * event due to permissions, this will no-op and return calmly. If the widget failed
     * to handle the event, this will raise an error.
     * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
     * @param {boolean} encrypted Whether the event contents were encrypted.
     * @returns {Promise<void>} Resolves when complete, rejects if there was an error sending.
     */
  }, {
    key: "feedToDevice",
    value: function () {
      var _feedToDevice = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee11(rawEvent, encrypted) {
        return _regeneratorRuntime().wrap(function _callee11$(_context11) {
          while (1) switch (_context11.prev = _context11.next) {
            case 0:
              if (!this.canReceiveToDeviceEvent(rawEvent.type)) {
                _context11.next = 3;
                break;
              }
              _context11.next = 3;
              return this.transport.send(_WidgetApiAction.WidgetApiToWidgetAction.SendToDevice, // it's compatible, but missing the index signature
              _objectSpread(_objectSpread({}, rawEvent), {}, {
                encrypted: encrypted
              }));
            case 3:
            case "end":
              return _context11.stop();
          }
        }, _callee11, this);
      }));
      function feedToDevice(_x13, _x14) {
        return _feedToDevice.apply(this, arguments);
      }
      return feedToDevice;
    }()
  }]);
  return ClientWidgetApi;
}(_events.EventEmitter);
exports.ClientWidgetApi = ClientWidgetApi;
//# sourceMappingURL=ClientWidgetApi.js.map
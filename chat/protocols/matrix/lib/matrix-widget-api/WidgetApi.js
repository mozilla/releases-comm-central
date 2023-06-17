"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WidgetApi = void 0;
var _events = require("events");
var _WidgetApiDirection = require("./interfaces/WidgetApiDirection");
var _ApiVersion = require("./interfaces/ApiVersion");
var _PostmessageTransport = require("./transport/PostmessageTransport");
var _WidgetApiAction = require("./interfaces/WidgetApiAction");
var _GetOpenIDAction = require("./interfaces/GetOpenIDAction");
var _WidgetType = require("./interfaces/WidgetType");
var _ModalWidgetActions = require("./interfaces/ModalWidgetActions");
var _WidgetEventCapability = require("./models/WidgetEventCapability");
var _Symbols = require("./Symbols");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator["return"] && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, "catch": function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
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
function _awaitAsyncGenerator(value) { return new _OverloadYield(value, 0); }
function _wrapAsyncGenerator(fn) { return function () { return new _AsyncGenerator(fn.apply(this, arguments)); }; }
function _AsyncGenerator(gen) { var front, back; function resume(key, arg) { try { var result = gen[key](arg), value = result.value, overloaded = value instanceof _OverloadYield; Promise.resolve(overloaded ? value.v : value).then(function (arg) { if (overloaded) { var nextKey = "return" === key ? "return" : "next"; if (!value.k || arg.done) return resume(nextKey, arg); arg = gen[nextKey](arg).value; } settle(result.done ? "return" : "normal", arg); }, function (err) { resume("throw", err); }); } catch (err) { settle("throw", err); } } function settle(type, value) { switch (type) { case "return": front.resolve({ value: value, done: !0 }); break; case "throw": front.reject(value); break; default: front.resolve({ value: value, done: !1 }); } (front = front.next) ? resume(front.key, front.arg) : back = null; } this._invoke = function (key, arg) { return new Promise(function (resolve, reject) { var request = { key: key, arg: arg, resolve: resolve, reject: reject, next: null }; back ? back = back.next = request : (front = back = request, resume(key, arg)); }); }, "function" != typeof gen["return"] && (this["return"] = void 0); }
_AsyncGenerator.prototype["function" == typeof Symbol && Symbol.asyncIterator || "@@asyncIterator"] = function () { return this; }, _AsyncGenerator.prototype.next = function (arg) { return this._invoke("next", arg); }, _AsyncGenerator.prototype["throw"] = function (arg) { return this._invoke("throw", arg); }, _AsyncGenerator.prototype["return"] = function (arg) { return this._invoke("return", arg); };
function _OverloadYield(value, kind) { this.v = value, this.k = kind; } /*
                                                                         * Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
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
 * API handler for widgets. This raises events for each action
 * received as `action:${action}` (eg: "action:screenshot").
 * Default handling can be prevented by using preventDefault()
 * on the raised event. The default handling varies for each
 * action: ones which the SDK can handle safely are acknowledged
 * appropriately and ones which are unhandled (custom or require
 * the widget to do something) are rejected with an error.
 *
 * Events which are preventDefault()ed must reply using the
 * transport. The events raised will have a detail of an
 * IWidgetApiRequest interface.
 *
 * When the WidgetApi is ready to start sending requests, it will
 * raise a "ready" CustomEvent. After the ready event fires, actions
 * can be sent and the transport will be ready.
 */
var WidgetApi = /*#__PURE__*/function (_EventEmitter) {
  _inherits(WidgetApi, _EventEmitter);
  var _super = _createSuper(WidgetApi);
  /**
   * Creates a new API handler for the given widget.
   * @param {string} widgetId The widget ID to listen for. If not supplied then
   * the API will use the widget ID from the first valid request it receives.
   * @param {string} clientOrigin The origin of the client, or null if not known.
   */
  function WidgetApi() {
    var _this2;
    var widgetId = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    var clientOrigin = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    _classCallCheck(this, WidgetApi);
    _this2 = _super.call(this);
    _this2.clientOrigin = clientOrigin;
    _defineProperty(_assertThisInitialized(_this2), "transport", void 0);
    _defineProperty(_assertThisInitialized(_this2), "capabilitiesFinished", false);
    _defineProperty(_assertThisInitialized(_this2), "supportsMSC2974Renegotiate", false);
    _defineProperty(_assertThisInitialized(_this2), "requestedCapabilities", []);
    _defineProperty(_assertThisInitialized(_this2), "approvedCapabilities", void 0);
    _defineProperty(_assertThisInitialized(_this2), "cachedClientVersions", void 0);
    _defineProperty(_assertThisInitialized(_this2), "turnServerWatchers", 0);
    if (!window.parent) {
      throw new Error("No parent window. This widget doesn't appear to be embedded properly.");
    }
    _this2.transport = new _PostmessageTransport.PostmessageTransport(_WidgetApiDirection.WidgetApiDirection.FromWidget, widgetId, window.parent, window);
    _this2.transport.targetOrigin = clientOrigin;
    _this2.transport.on("message", _this2.handleMessage.bind(_assertThisInitialized(_this2)));
    return _this2;
  }

  /**
   * Determines if the widget was granted a particular capability. Note that on
   * clients where the capabilities are not fed back to the widget this function
   * will rely on requested capabilities instead.
   * @param {Capability} capability The capability to check for approval of.
   * @returns {boolean} True if the widget has approval for the given capability.
   */
  _createClass(WidgetApi, [{
    key: "hasCapability",
    value: function hasCapability(capability) {
      if (Array.isArray(this.approvedCapabilities)) {
        return this.approvedCapabilities.includes(capability);
      }
      return this.requestedCapabilities.includes(capability);
    }

    /**
     * Request a capability from the client. It is not guaranteed to be allowed,
     * but will be asked for.
     * @param {Capability} capability The capability to request.
     * @throws Throws if the capabilities negotiation has already started and the
     * widget is unable to request additional capabilities.
     */
  }, {
    key: "requestCapability",
    value: function requestCapability(capability) {
      if (this.capabilitiesFinished && !this.supportsMSC2974Renegotiate) {
        throw new Error("Capabilities have already been negotiated");
      }
      this.requestedCapabilities.push(capability);
    }

    /**
     * Request capabilities from the client. They are not guaranteed to be allowed,
     * but will be asked for if the negotiation has not already happened.
     * @param {Capability[]} capabilities The capabilities to request.
     * @throws Throws if the capabilities negotiation has already started.
     */
  }, {
    key: "requestCapabilities",
    value: function requestCapabilities(capabilities) {
      var _this3 = this;
      capabilities.forEach(function (cap) {
        return _this3.requestCapability(cap);
      });
    }

    /**
     * Requests the capability to interact with rooms other than the user's currently
     * viewed room. Applies to event receiving and sending.
     * @param {string | Symbols.AnyRoom} roomId The room ID, or `Symbols.AnyRoom` to
     * denote all known rooms.
     */
  }, {
    key: "requestCapabilityForRoomTimeline",
    value: function requestCapabilityForRoomTimeline(roomId) {
      this.requestCapability("org.matrix.msc2762.timeline:".concat(roomId));
    }

    /**
     * Requests the capability to send a given state event with optional explicit
     * state key. It is not guaranteed to be allowed, but will be asked for if the
     * negotiation has not already happened.
     * @param {string} eventType The state event type to ask for.
     * @param {string} stateKey If specified, the specific state key to request.
     * Otherwise all state keys will be requested.
     */
  }, {
    key: "requestCapabilityToSendState",
    value: function requestCapabilityToSendState(eventType, stateKey) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forStateEvent(_WidgetEventCapability.EventDirection.Send, eventType, stateKey).raw);
    }

    /**
     * Requests the capability to receive a given state event with optional explicit
     * state key. It is not guaranteed to be allowed, but will be asked for if the
     * negotiation has not already happened.
     * @param {string} eventType The state event type to ask for.
     * @param {string} stateKey If specified, the specific state key to request.
     * Otherwise all state keys will be requested.
     */
  }, {
    key: "requestCapabilityToReceiveState",
    value: function requestCapabilityToReceiveState(eventType, stateKey) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forStateEvent(_WidgetEventCapability.EventDirection.Receive, eventType, stateKey).raw);
    }

    /**
     * Requests the capability to send a given to-device event. It is not
     * guaranteed to be allowed, but will be asked for if the negotiation has
     * not already happened.
     * @param {string} eventType The room event type to ask for.
     */
  }, {
    key: "requestCapabilityToSendToDevice",
    value: function requestCapabilityToSendToDevice(eventType) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forToDeviceEvent(_WidgetEventCapability.EventDirection.Send, eventType).raw);
    }

    /**
     * Requests the capability to receive a given to-device event. It is not
     * guaranteed to be allowed, but will be asked for if the negotiation has
     * not already happened.
     * @param {string} eventType The room event type to ask for.
     */
  }, {
    key: "requestCapabilityToReceiveToDevice",
    value: function requestCapabilityToReceiveToDevice(eventType) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forToDeviceEvent(_WidgetEventCapability.EventDirection.Receive, eventType).raw);
    }

    /**
     * Requests the capability to send a given room event. It is not guaranteed to be
     * allowed, but will be asked for if the negotiation has not already happened.
     * @param {string} eventType The room event type to ask for.
     */
  }, {
    key: "requestCapabilityToSendEvent",
    value: function requestCapabilityToSendEvent(eventType) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomEvent(_WidgetEventCapability.EventDirection.Send, eventType).raw);
    }

    /**
     * Requests the capability to receive a given room event. It is not guaranteed to be
     * allowed, but will be asked for if the negotiation has not already happened.
     * @param {string} eventType The room event type to ask for.
     */
  }, {
    key: "requestCapabilityToReceiveEvent",
    value: function requestCapabilityToReceiveEvent(eventType) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomEvent(_WidgetEventCapability.EventDirection.Receive, eventType).raw);
    }

    /**
     * Requests the capability to send a given message event with optional explicit
     * `msgtype`. It is not guaranteed to be allowed, but will be asked for if the
     * negotiation has not already happened.
     * @param {string} msgtype If specified, the specific msgtype to request.
     * Otherwise all message types will be requested.
     */
  }, {
    key: "requestCapabilityToSendMessage",
    value: function requestCapabilityToSendMessage(msgtype) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomMessageEvent(_WidgetEventCapability.EventDirection.Send, msgtype).raw);
    }

    /**
     * Requests the capability to receive a given message event with optional explicit
     * `msgtype`. It is not guaranteed to be allowed, but will be asked for if the
     * negotiation has not already happened.
     * @param {string} msgtype If specified, the specific msgtype to request.
     * Otherwise all message types will be requested.
     */
  }, {
    key: "requestCapabilityToReceiveMessage",
    value: function requestCapabilityToReceiveMessage(msgtype) {
      this.requestCapability(_WidgetEventCapability.WidgetEventCapability.forRoomMessageEvent(_WidgetEventCapability.EventDirection.Receive, msgtype).raw);
    }

    /**
     * Requests an OpenID Connect token from the client for the currently logged in
     * user. This token can be validated server-side with the federation API. Note
     * that the widget is responsible for validating the token and caching any results
     * it needs.
     * @returns {Promise<IOpenIDCredentials>} Resolves to a token for verification.
     * @throws Throws if the user rejected the request or the request failed.
     */
  }, {
    key: "requestOpenIDConnectToken",
    value: function requestOpenIDConnectToken() {
      var _this4 = this;
      return new Promise(function (resolve, reject) {
        _this4.transport.sendComplete(_WidgetApiAction.WidgetApiFromWidgetAction.GetOpenIDCredentials, {}).then(function (response) {
          var rdata = response.response;
          if (rdata.state === _GetOpenIDAction.OpenIDRequestState.Allowed) {
            resolve(rdata);
          } else if (rdata.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
            reject(new Error("User declined to verify their identity"));
          } else if (rdata.state === _GetOpenIDAction.OpenIDRequestState.PendingUserConfirmation) {
            var handlerFn = function handlerFn(ev) {
              ev.preventDefault();
              var request = ev.detail;
              if (request.data.original_request_id !== response.requestId) return;
              if (request.data.state === _GetOpenIDAction.OpenIDRequestState.Allowed) {
                resolve(request.data);
                _this4.transport.reply(request, {}); // ack
              } else if (request.data.state === _GetOpenIDAction.OpenIDRequestState.Blocked) {
                reject(new Error("User declined to verify their identity"));
                _this4.transport.reply(request, {}); // ack
              } else {
                reject(new Error("Invalid state on reply: " + rdata.state));
                _this4.transport.reply(request, {
                  error: {
                    message: "Invalid state"
                  }
                });
              }
              _this4.off("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials), handlerFn);
            };
            _this4.on("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.OpenIDCredentials), handlerFn);
          } else {
            reject(new Error("Invalid state: " + rdata.state));
          }
        })["catch"](reject);
      });
    }

    /**
     * Asks the client for additional capabilities. Capabilities can be queued for this
     * request with the requestCapability() functions.
     * @returns {Promise<void>} Resolves when complete. Note that the promise resolves when
     * the capabilities request has gone through, not when the capabilities are approved/denied.
     * Use the WidgetApiToWidgetAction.NotifyCapabilities action to detect changes.
     */
  }, {
    key: "updateRequestedCapabilities",
    value: function updateRequestedCapabilities() {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2974RenegotiateCapabilities, {
        capabilities: this.requestedCapabilities
      }).then();
    }

    /**
     * Tell the client that the content has been loaded.
     * @returns {Promise} Resolves when the client acknowledges the request.
     */
  }, {
    key: "sendContentLoaded",
    value: function sendContentLoaded() {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.ContentLoaded, {}).then();
    }

    /**
     * Sends a sticker to the client.
     * @param {IStickerActionRequestData} sticker The sticker to send.
     * @returns {Promise} Resolves when the client acknowledges the request.
     */
  }, {
    key: "sendSticker",
    value: function sendSticker(sticker) {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendSticker, sticker).then();
    }

    /**
     * Asks the client to set the always-on-screen status for this widget.
     * @param {boolean} value The new state to request.
     * @returns {Promise<boolean>} Resolve with true if the client was able to fulfill
     * the request, resolves to false otherwise. Rejects if an error occurred.
     */
  }, {
    key: "setAlwaysOnScreen",
    value: function setAlwaysOnScreen(value) {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.UpdateAlwaysOnScreen, {
        value: value
      }).then(function (res) {
        return res.success;
      });
    }

    /**
     * Opens a modal widget.
     * @param {string} url The URL to the modal widget.
     * @param {string} name The name of the widget.
     * @param {IModalWidgetOpenRequestDataButton[]} buttons The buttons to have on the widget.
     * @param {IModalWidgetCreateData} data Data to supply to the modal widget.
     * @param {WidgetType} type The type of modal widget.
     * @returns {Promise<void>} Resolves when the modal widget has been opened.
     */
  }, {
    key: "openModalWidget",
    value: function openModalWidget(url, name) {
      var buttons = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
      var data = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
      var type = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : _WidgetType.MatrixWidgetType.Custom;
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.OpenModalWidget, {
        type: type,
        url: url,
        name: name,
        buttons: buttons,
        data: data
      }).then();
    }

    /**
     * Closes the modal widget. The widget's session will be terminated shortly after.
     * @param {IModalWidgetReturnData} data Optional data to close the modal widget with.
     * @returns {Promise<void>} Resolves when complete.
     */
  }, {
    key: "closeModalWidget",
    value: function closeModalWidget() {
      var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.CloseModalWidget, data).then();
    }
  }, {
    key: "sendRoomEvent",
    value: function sendRoomEvent(eventType, content, roomId) {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendEvent, {
        type: eventType,
        content: content,
        room_id: roomId
      });
    }
  }, {
    key: "sendStateEvent",
    value: function sendStateEvent(eventType, stateKey, content, roomId) {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendEvent, {
        type: eventType,
        content: content,
        state_key: stateKey,
        room_id: roomId
      });
    }

    /**
     * Sends a to-device event.
     * @param {string} eventType The type of events being sent.
     * @param {boolean} encrypted Whether to encrypt the message contents.
     * @param {Object} contentMap A map from user IDs to device IDs to message contents.
     * @returns {Promise<ISendToDeviceFromWidgetResponseData>} Resolves when complete.
     */
  }, {
    key: "sendToDevice",
    value: function sendToDevice(eventType, encrypted, contentMap) {
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SendToDevice, {
        type: eventType,
        encrypted: encrypted,
        messages: contentMap
      });
    }
  }, {
    key: "readRoomEvents",
    value: function readRoomEvents(eventType, limit, msgtype, roomIds) {
      var data = {
        type: eventType,
        msgtype: msgtype
      };
      if (limit !== undefined) {
        data.limit = limit;
      }
      if (roomIds) {
        if (roomIds.includes(_Symbols.Symbols.AnyRoom)) {
          data.room_ids = _Symbols.Symbols.AnyRoom;
        } else {
          data.room_ids = roomIds;
        }
      }
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents, data).then(function (r) {
        return r.events;
      });
    }

    /**
     * Reads all related events given a known eventId.
     * @param eventId The id of the parent event to be read.
     * @param roomId The room to look within. When undefined, the user's currently
     * viewed room.
     * @param relationType The relationship type of child events to search for.
     * When undefined, all relations are returned.
     * @param eventType The event type of child events to search for. When undefined,
     * all related events are returned.
     * @param limit The maximum number of events to retrieve per room. If not
     * supplied, the server will apply a default limit.
     * @param from The pagination token to start returning results from, as
     * received from a previous call. If not supplied, results start at the most
     * recent topological event known to the server.
     * @param to The pagination token to stop returning results at. If not
     * supplied, results continue up to limit or until there are no more events.
     * @param direction The direction to search for according to MSC3715.
     * @returns Resolves to the room relations.
     */
  }, {
    key: "readEventRelations",
    value: function () {
      var _readEventRelations = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(eventId, roomId, relationType, eventType, limit, from, to, direction) {
        var versions, data;
        return _regeneratorRuntime().wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return this.getClientVersions();
            case 2:
              versions = _context.sent;
              if (versions.includes(_ApiVersion.UnstableApiVersion.MSC3869)) {
                _context.next = 5;
                break;
              }
              throw new Error("The read_relations action is not supported by the client.");
            case 5:
              data = {
                event_id: eventId,
                rel_type: relationType,
                event_type: eventType,
                room_id: roomId,
                to: to,
                from: from,
                limit: limit,
                direction: direction
              };
              return _context.abrupt("return", this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC3869ReadRelations, data));
            case 7:
            case "end":
              return _context.stop();
          }
        }, _callee, this);
      }));
      function readEventRelations(_x, _x2, _x3, _x4, _x5, _x6, _x7, _x8) {
        return _readEventRelations.apply(this, arguments);
      }
      return readEventRelations;
    }()
  }, {
    key: "readStateEvents",
    value: function readStateEvents(eventType, limit, stateKey, roomIds) {
      var data = {
        type: eventType,
        state_key: stateKey === undefined ? true : stateKey
      };
      if (limit !== undefined) {
        data.limit = limit;
      }
      if (roomIds) {
        if (roomIds.includes(_Symbols.Symbols.AnyRoom)) {
          data.room_ids = _Symbols.Symbols.AnyRoom;
        } else {
          data.room_ids = roomIds;
        }
      }
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2876ReadEvents, data).then(function (r) {
        return r.events;
      });
    }

    /**
     * Sets a button as disabled or enabled on the modal widget. Buttons are enabled by default.
     * @param {ModalButtonID} buttonId The button ID to enable/disable.
     * @param {boolean} isEnabled Whether or not the button is enabled.
     * @returns {Promise<void>} Resolves when complete.
     * @throws Throws if the button cannot be disabled, or the client refuses to disable the button.
     */
  }, {
    key: "setModalButtonEnabled",
    value: function setModalButtonEnabled(buttonId, isEnabled) {
      if (buttonId === _ModalWidgetActions.BuiltInModalButtonID.Close) {
        throw new Error("The close button cannot be disabled");
      }
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SetModalButtonEnabled, {
        button: buttonId,
        enabled: isEnabled
      }).then();
    }

    /**
     * Attempts to navigate the client to the given URI. This can only be called with Matrix URIs
     * (currently only matrix.to, but in future a Matrix URI scheme will be defined).
     * @param {string} uri The URI to navigate to.
     * @returns {Promise<void>} Resolves when complete.
     * @throws Throws if the URI is invalid or cannot be processed.
     * @deprecated This currently relies on an unstable MSC (MSC2931).
     */
  }, {
    key: "navigateTo",
    value: function navigateTo(uri) {
      if (!uri || !uri.startsWith("https://matrix.to/#")) {
        throw new Error("Invalid matrix.to URI");
      }
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC2931Navigate, {
        uri: uri
      }).then();
    }

    /**
     * Starts watching for TURN servers, yielding an initial set of credentials as soon as possible,
     * and thereafter yielding new credentials whenever the previous ones expire.
     * @yields {ITurnServer} The TURN server URIs and credentials currently available to the widget.
     */
  }, {
    key: "getTurnServers",
    value: function getTurnServers() {
      var _this = this;
      return _wrapAsyncGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3() {
        var setTurnServer, onUpdateTurnServers;
        return _regeneratorRuntime().wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              onUpdateTurnServers = /*#__PURE__*/function () {
                var _ref = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(ev) {
                  return _regeneratorRuntime().wrap(function _callee2$(_context2) {
                    while (1) switch (_context2.prev = _context2.next) {
                      case 0:
                        ev.preventDefault();
                        setTurnServer(ev.detail.data);
                        _context2.next = 4;
                        return _this.transport.reply(ev.detail, {});
                      case 4:
                      case "end":
                        return _context2.stop();
                    }
                  }, _callee2);
                }));
                return function onUpdateTurnServers(_x9) {
                  return _ref.apply(this, arguments);
                };
              }(); // Start listening for updates before we even start watching, to catch
              // TURN data that is sent immediately
              _this.on("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers);

              // Only send the 'watch' action if we aren't already watching
              if (!(_this.turnServerWatchers === 0)) {
                _context3.next = 12;
                break;
              }
              _context3.prev = 3;
              _context3.next = 6;
              return _awaitAsyncGenerator(_this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.WatchTurnServers, {}));
            case 6:
              _context3.next = 12;
              break;
            case 8:
              _context3.prev = 8;
              _context3.t0 = _context3["catch"](3);
              _this.off("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers);
              throw _context3.t0;
            case 12:
              _this.turnServerWatchers++;
              _context3.prev = 13;
            case 14:
              if (!true) {
                _context3.next = 21;
                break;
              }
              _context3.next = 17;
              return _awaitAsyncGenerator(new Promise(function (resolve) {
                return setTurnServer = resolve;
              }));
            case 17:
              _context3.next = 19;
              return _context3.sent;
            case 19:
              _context3.next = 14;
              break;
            case 21:
              _context3.prev = 21;
              // The loop was broken by the caller - clean up
              _this.off("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.UpdateTurnServers), onUpdateTurnServers);

              // Since sending the 'unwatch' action will end updates for all other
              // consumers, only send it if we're the only consumer remaining
              _this.turnServerWatchers--;
              if (!(_this.turnServerWatchers === 0)) {
                _context3.next = 27;
                break;
              }
              _context3.next = 27;
              return _awaitAsyncGenerator(_this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.UnwatchTurnServers, {}));
            case 27:
              return _context3.finish(21);
            case 28:
            case "end":
              return _context3.stop();
          }
        }, _callee3, null, [[3, 8], [13,, 21, 28]]);
      }))();
    }

    /**
     * Search for users in the user directory.
     * @param searchTerm The term to search for.
     * @param limit The maximum number of results to return. If not supplied, the
     * @returns Resolves to the search results.
     */
  }, {
    key: "searchUserDirectory",
    value: function () {
      var _searchUserDirectory = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(searchTerm, limit) {
        var versions, data;
        return _regeneratorRuntime().wrap(function _callee4$(_context4) {
          while (1) switch (_context4.prev = _context4.next) {
            case 0:
              _context4.next = 2;
              return this.getClientVersions();
            case 2:
              versions = _context4.sent;
              if (versions.includes(_ApiVersion.UnstableApiVersion.MSC3973)) {
                _context4.next = 5;
                break;
              }
              throw new Error("The user_directory_search action is not supported by the client.");
            case 5:
              data = {
                search_term: searchTerm,
                limit: limit
              };
              return _context4.abrupt("return", this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.MSC3973UserDirectorySearch, data));
            case 7:
            case "end":
              return _context4.stop();
          }
        }, _callee4, this);
      }));
      function searchUserDirectory(_x10, _x11) {
        return _searchUserDirectory.apply(this, arguments);
      }
      return searchUserDirectory;
    }()
    /**
     * Starts the communication channel. This should be done early to ensure
     * that messages are not missed. Communication can only be stopped by the client.
     */
  }, {
    key: "start",
    value: function start() {
      var _this5 = this;
      this.transport.start();
      this.getClientVersions().then(function (v) {
        if (v.includes(_ApiVersion.UnstableApiVersion.MSC2974)) {
          _this5.supportsMSC2974Renegotiate = true;
        }
      });
    }
  }, {
    key: "handleMessage",
    value: function handleMessage(ev) {
      var actionEv = new CustomEvent("action:".concat(ev.detail.action), {
        detail: ev.detail,
        cancelable: true
      });
      this.emit("action:".concat(ev.detail.action), actionEv);
      if (!actionEv.defaultPrevented) {
        switch (ev.detail.action) {
          case _WidgetApiAction.WidgetApiToWidgetAction.SupportedApiVersions:
            return this.replyVersions(ev.detail);
          case _WidgetApiAction.WidgetApiToWidgetAction.Capabilities:
            return this.handleCapabilities(ev.detail);
          case _WidgetApiAction.WidgetApiToWidgetAction.UpdateVisibility:
            return this.transport.reply(ev.detail, {});
          // ack to avoid error spam
          case _WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities:
            return this.transport.reply(ev.detail, {});
          // ack to avoid error spam
          default:
            return this.transport.reply(ev.detail, {
              error: {
                message: "Unknown or unsupported action: " + ev.detail.action
              }
            });
        }
      }
    }
  }, {
    key: "replyVersions",
    value: function replyVersions(request) {
      this.transport.reply(request, {
        supported_versions: _ApiVersion.CurrentApiVersions
      });
    }
  }, {
    key: "getClientVersions",
    value: function getClientVersions() {
      var _this6 = this;
      if (Array.isArray(this.cachedClientVersions)) {
        return Promise.resolve(this.cachedClientVersions);
      }
      return this.transport.send(_WidgetApiAction.WidgetApiFromWidgetAction.SupportedApiVersions, {}).then(function (r) {
        _this6.cachedClientVersions = r.supported_versions;
        return r.supported_versions;
      })["catch"](function (e) {
        console.warn("non-fatal error getting supported client versions: ", e);
        return [];
      });
    }
  }, {
    key: "handleCapabilities",
    value: function handleCapabilities(request) {
      var _this7 = this;
      if (this.capabilitiesFinished) {
        return this.transport.reply(request, {
          error: {
            message: "Capability negotiation already completed"
          }
        });
      }

      // See if we can expect a capabilities notification or not
      return this.getClientVersions().then(function (v) {
        if (v.includes(_ApiVersion.UnstableApiVersion.MSC2871)) {
          _this7.once("action:".concat(_WidgetApiAction.WidgetApiToWidgetAction.NotifyCapabilities), function (ev) {
            _this7.approvedCapabilities = ev.detail.data.approved;
            _this7.emit("ready");
          });
        } else {
          // if we can't expect notification, we're as done as we can be
          _this7.emit("ready");
        }

        // in either case, reply to that capabilities request
        _this7.capabilitiesFinished = true;
        return _this7.transport.reply(request, {
          capabilities: _this7.requestedCapabilities
        });
      });
    }
  }]);
  return WidgetApi;
}(_events.EventEmitter);
exports.WidgetApi = WidgetApi;
//# sourceMappingURL=WidgetApi.js.map
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ReceiptType = exports.MAIN_ROOM_TIMELINE = void 0;
/*
Copyright 2022 Šimon Brandner <simon.bra.ag@gmail.com>

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
let ReceiptType = exports.ReceiptType = /*#__PURE__*/function (ReceiptType) {
  ReceiptType["Read"] = "m.read";
  ReceiptType["FullyRead"] = "m.fully_read";
  ReceiptType["ReadPrivate"] = "m.read.private";
  return ReceiptType;
}({});
const MAIN_ROOM_TIMELINE = exports.MAIN_ROOM_TIMELINE = "main";

// We will only hold a synthetic receipt if we do not have a real receipt or the synthetic is newer.
// map: receipt type → user Id → receipt
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["MatrixPowerLevels"];

// See https://matrix.org/docs/spec/client_server/r0.5.0#m-room-power-levels
var MatrixPowerLevels = {
  user: 0,
  voice: 10,
  halfOp: 25,
  op: 50,
  founder: 100,
};

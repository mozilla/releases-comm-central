/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsComposeStrings.h"

const char* errorStringNameForErrorCode(nsresult aCode) {
#ifdef __GNUC__
// Temporary workaround until bug 783526 is fixed.
#  pragma GCC diagnostic push
#  pragma GCC diagnostic ignored "-Wswitch"
#endif
  switch (aCode) {
    default:
      return "sendFailed";
  }
#ifdef __GNUC__
#  pragma GCC diagnostic pop
#endif
}

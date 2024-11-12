/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DatabaseUtils_h__
#define DatabaseUtils_h__

#include "nsTString.h"

namespace mozilla {
namespace mailnews {

class DatabaseUtils {
 public:
  /**
   * Normalizes a string to Unicode canonical composition form. Strings should
   * be normalized before being inserted into the database. This will prevent
   * mistakes when comparing strings containing non-ASCII characters.
   */
  static nsCString Normalize(const nsACString& inString);
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // DatabaseUtils_h__

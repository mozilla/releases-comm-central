/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This module contains helper functions and macros for converting directory
   module to frozen linkage.
 */
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include <ctype.h>

/* Internal API helper macros */
#define LdapCompressWhitespace(str) (str).CompressWhitespace()

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMUTF7ToUnicode.h"

//----------------------------------------------------------------------
// Class nsMUTF7ToUnicode [implementation]

nsMUTF7ToUnicode::nsMUTF7ToUnicode() : nsBasicUTF7Decoder(',', '&') {}

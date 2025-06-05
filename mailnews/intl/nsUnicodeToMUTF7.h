/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_INTL_NSUNICODETOMUTF7_H_
#define COMM_MAILNEWS_INTL_NSUNICODETOMUTF7_H_

#include "nsUnicodeToUTF7.h"

//----------------------------------------------------------------------
// Class nsUnicodeToMUTF7 [declaration]

/**
 * A character set converter from Unicode to Modified UTF-7.
 *
 * @created         18/May/1999
 * @author  Catalin Rotaru [CATA]
 */
class nsUnicodeToMUTF7 : public nsBasicUTF7Encoder {
 public:
  /**
   * Class constructor.
   */
  nsUnicodeToMUTF7();
};

#endif  // COMM_MAILNEWS_INTL_NSUNICODETOMUTF7_H_

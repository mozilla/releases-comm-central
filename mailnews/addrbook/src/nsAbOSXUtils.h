/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_ADDRBOOK_SRC_NSABOSXUTILS_H_
#define COMM_MAILNEWS_ADDRBOOK_SRC_NSABOSXUTILS_H_

#include <Foundation/NSString.h>
#include "nsString.h"

NSString* WrapString(const nsString& aString);
void AppendToString(const NSString* aString, nsString& aResult);
void AssignToString(const NSString* aString, nsString& aResult);
void AppendToCString(const NSString* aString, nsCString& aResult);

struct nsAbOSXPropertyMap {
  NSString* const mOSXProperty;
  NSString* const mOSXLabel;
  NSString* const mOSXKey;
  const char* mPropertyName;
};

class nsAbOSXUtils {
 public:
  static const nsAbOSXPropertyMap kPropertyMap[];
  static const uint32_t kPropertyMapSize;
};

#endif  // COMM_MAILNEWS_ADDRBOOK_SRC_NSABOSXUTILS_H_

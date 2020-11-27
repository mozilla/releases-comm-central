/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsILDAPService.h"

// 6a89ae33-7a90-430d-888c-0dede53a951a
//
#define NS_LDAPSERVICE_CID                           \
  {                                                  \
    0x6a89ae33, 0x7a90, 0x430d, {                    \
      0x88, 0x8c, 0x0d, 0xed, 0xe5, 0x3a, 0x95, 0x1a \
    }                                                \
  }

// This is the interface we're implementing.
//
class nsLDAPService : public nsILDAPService {
 public:
  // interface decls
  //
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSILDAPSERVICE

  // constructor and destructor
  //
  nsLDAPService();

  nsresult Init();

 protected:
  virtual ~nsLDAPService();

  // kinda like strtok_r, but with iterators.  for use by
  // createFilter
  char* NextToken(const char** aIter, const char** aIterEnd);

  // count how many tokens are in this string; for use by
  // createFilter; note that unlike with NextToken, these params
  // are copies, not references.
  uint32_t CountTokens(const char* aIter, const char* aIterEnd);
};

/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_SEARCH_SRC_NSMSGSEARCHVALUE_H_
#define COMM_MAILNEWS_SEARCH_SRC_NSMSGSEARCHVALUE_H_

#include "nsIMsgSearchValue.h"
#include "nsMsgSearchCore.h"

class nsMsgSearchValueImpl : public nsIMsgSearchValue {
 public:
  explicit nsMsgSearchValueImpl(nsMsgSearchValue* aInitialValue);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGSEARCHVALUE

 private:
  virtual ~nsMsgSearchValueImpl();

  nsMsgSearchValue mValue;
};

#endif  // COMM_MAILNEWS_SEARCH_SRC_NSMSGSEARCHVALUE_H_

/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_EXTENSIONS_SMIME_NSCERTPICKER_H_
#define COMM_MAILNEWS_EXTENSIONS_SMIME_NSCERTPICKER_H_

#include "nsICertPickDialogs.h"
#include "nsIUserCertPicker.h"

class nsCertPicker : public nsICertPickDialogs, public nsIUserCertPicker {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICERTPICKDIALOGS
  NS_DECL_NSIUSERCERTPICKER

  nsCertPicker();
  nsresult Init();

 protected:
  virtual ~nsCertPicker();
};

#endif  // COMM_MAILNEWS_EXTENSIONS_SMIME_NSCERTPICKER_H_

/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsCertGen_h
#define nsCertGen_h

#include "nsICertGen.h"

#define NS_CERT_GEN_CID \
  {0x732494e4, 0xac6b, 0x4bab, {0x8c, 0x61, 0x88, 0xaf, 0x4a, 0x9b, 0x82, 0x15}}

class nsCertGen : public nsICertGen {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSICERTGEN

  nsCertGen() {}

 protected:
  virtual ~nsCertGen() {}
};

#endif  // nsCertGen_h

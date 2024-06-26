/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMimeRawEmitter_h_
#define _nsMimeRawEmitter_h_

#include "prio.h"
#include "nsMimeBaseEmitter.h"

class nsMimeRawEmitter : public nsMimeBaseEmitter {
 public:
  nsMimeRawEmitter();
  virtual ~nsMimeRawEmitter(void);

  NS_IMETHOD WriteBody(const nsACString& buf, uint32_t* amountWritten) override;

 protected:
};

#endif /* _nsMimeRawEmitter_h_ */

/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_EMITTERS_NSMIMEREBUFFER_H_
#define COMM_MAILNEWS_MIME_EMITTERS_NSMIMEREBUFFER_H_

#include <stdint.h>
#include "nsString.h"

//////////////////////////////////////////////////////////////
// A rebuffering class necessary for stream output buffering
//////////////////////////////////////////////////////////////

class MimeRebuffer {
 public:
  MimeRebuffer(void);
  virtual ~MimeRebuffer(void);

  uint32_t GetSize();
  uint32_t IncreaseBuffer(const nsACString& addBuf);
  uint32_t ReduceBuffer(uint32_t numBytes);
  nsACString& GetBuffer();

 protected:
  nsCString mBuf;
};

#endif  // COMM_MAILNEWS_MIME_EMITTERS_NSMIMEREBUFFER_H_

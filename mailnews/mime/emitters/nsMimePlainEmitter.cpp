/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <stdio.h>
#include "nsMimePlainEmitter.h"
#include "plstr.h"
#include "nscore.h"
#include "prmem.h"

/*
 * nsMimePlainEmitter definitions....
 */
nsMimePlainEmitter::nsMimePlainEmitter() {}

nsMimePlainEmitter::~nsMimePlainEmitter(void) {}

// Header handling routines.
nsresult nsMimePlainEmitter::StartHeader(bool rootMailHeader, bool headerOnly,
                                         const char* msgID,
                                         const char* outCharset) {
  mDocHeader = rootMailHeader;
  return NS_OK;
}

nsresult nsMimePlainEmitter::AddHeaderField(const char* field,
                                            const char* value) {
  if ((!field) || (!value)) return NS_OK;

  UtilityWrite(field);
  UtilityWrite(":\t");
  UtilityWriteCRLF(value);
  return NS_OK;
}

nsresult nsMimePlainEmitter::EndHeader(const nsACString& name) {
  UtilityWriteCRLF("");
  return NS_OK;
}

NS_IMETHODIMP
nsMimePlainEmitter::WriteBody(const nsACString& buf, uint32_t* amountWritten) {
  Write(buf, amountWritten);
  return NS_OK;
}

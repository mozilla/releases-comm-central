/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_MAILNEWSSTRINGGLUE_H_
#define COMM_MAILNEWS_BASE_SRC_MAILNEWSSTRINGGLUE_H_

#include "nsAString.h"

// This file contains C declarations for functions that are defined in the Rust
// mailnews_string_glue crate.

extern "C" {
nsresult nfc_normalize(const nsACString& src, nsACString& dst);
}

#endif  // COMM_MAILNEWS_BASE_SRC_MAILNEWSSTRINGGLUE_H_

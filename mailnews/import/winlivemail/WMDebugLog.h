/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef WMDebugLog_h___
#define WMDebugLog_h___

// Use PR_LOG for logging.
#include "mozilla/Logging.h"
extern PRLogModuleInfo *WMLOGMODULE;  // Logging module

#define IMPORT_LOG0(x)          MOZ_LOG(WMLOGMODULE, mozilla::LogLevel::Debug, (x))
#define IMPORT_LOG1(x, y)       MOZ_LOG(WMLOGMODULE, mozilla::LogLevel::Debug, (x, y))
#define IMPORT_LOG2(x, y, z)    MOZ_LOG(WMLOGMODULE, mozilla::LogLevel::Debug, (x, y, z))
#define IMPORT_LOG3(a, b, c, d) MOZ_LOG(WMLOGMODULE, mozilla::LogLevel::Debug, (a, b, c, d))



#endif /* WMDebugLog_h___ */

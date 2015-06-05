/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ImportDebug_h___
#define ImportDebug_h___

#ifdef NS_DEBUG
#define IMPORT_DEBUG  1
#endif

// Use MOZ_LOG for logging.
#include "mozilla/Logging.h"
extern PRLogModuleInfo *IMPORTLOGMODULE;  // Logging module

#define IMPORT_LOG0(x)          MOZ_LOG(IMPORTLOGMODULE, mozilla::LogLevel::Debug, (x))
#define IMPORT_LOG1(x, y)       MOZ_LOG(IMPORTLOGMODULE, mozilla::LogLevel::Debug, (x, y))
#define IMPORT_LOG2(x, y, z)    MOZ_LOG(IMPORTLOGMODULE, mozilla::LogLevel::Debug, (x, y, z))
#define IMPORT_LOG3(a, b, c, d) MOZ_LOG(IMPORTLOGMODULE, mozilla::LogLevel::Debug, (a, b, c, d))

#endif

/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef EudoraDebugLog_h___
#define EudoraDebugLog_h___

#ifdef NS_DEBUG
#define IMPORT_DEBUG  1
#endif

// Use PR_LOG for logging.
#include "mozilla/Logging.h"
extern PRLogModuleInfo *EUDORALOGMODULE;  // Logging module

#define IMPORT_LOG0(x)          MOZ_LOG(EUDORALOGMODULE, mozilla::LogLevel::Debug, (x))
#define IMPORT_LOG1(x, y)       MOZ_LOG(EUDORALOGMODULE, mozilla::LogLevel::Debug, (x, y))
#define IMPORT_LOG2(x, y, z)    MOZ_LOG(EUDORALOGMODULE, mozilla::LogLevel::Debug, (x, y, z))
#define IMPORT_LOG3(a, b, c, d) MOZ_LOG(EUDORALOGMODULE, mozilla::LogLevel::Debug, (a, b, c, d))



#endif /* EudoraDebugLog_h___ */

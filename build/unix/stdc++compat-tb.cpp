/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /* See stdc++compat.cpp in mozilla-central for general information. */

#include <stdio.h>

 /* operator delete with size is only available in CXXAPI_1.3.9, equivalent to
  * GLIBCXX_3.4.21. Included here as workaround for bug 1989872. */
 void operator delete(void* ptr, size_t size) noexcept(true) {
   ::operator delete(ptr);
 }

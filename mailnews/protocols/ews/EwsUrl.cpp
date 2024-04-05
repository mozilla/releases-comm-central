/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsUrl.h"

NS_IMPL_ADDREF_INHERITED(EwsUrl, nsMsgMailNewsUrl)
NS_IMPL_RELEASE_INHERITED(EwsUrl, nsMsgMailNewsUrl)
NS_IMPL_QUERY_HEAD(EwsUrl)
NS_IMPL_QUERY_TAIL_INHERITING(nsMsgMailNewsUrl)

EwsUrl::EwsUrl() = default;

EwsUrl::~EwsUrl() {}

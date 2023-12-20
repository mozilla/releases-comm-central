/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMailboxServer.h"
#include "nsLocalMailFolder.h"

NS_IMETHODIMP
nsMailboxServer::GetLocalStoreType(nsACString& type) {
  type.AssignLiteral("mailbox");
  return NS_OK;
}

NS_IMETHODIMP
nsMailboxServer::GetLocalDatabaseType(nsACString& type) {
  type.AssignLiteral("mailbox");
  return NS_OK;
}

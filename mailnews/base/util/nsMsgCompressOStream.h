/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsIOutputStream.h"
#include "nsCOMPtr.h"
#include "mozilla/UniquePtr.h"
#include "zlib.h"

class NS_MSG_BASE nsMsgCompressOStream final : public nsIOutputStream
{
public:
  nsMsgCompressOStream();

  NS_DECL_THREADSAFE_ISUPPORTS

  NS_DECL_NSIOUTPUTSTREAM

  nsresult InitOutputStream(nsIOutputStream *rawStream);

protected:
  ~nsMsgCompressOStream();
  nsCOMPtr<nsIOutputStream> m_oStream;
  mozilla::UniquePtr<char[]> m_zbuf;
  z_stream m_zstream;
};


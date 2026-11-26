/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::{RefPtr, interfaces::IExchangeAccountInfo};

/// Safe wrapper for an [`IExchangeAccountInfo`].
pub struct SafeExchangeAccountInfo(RefPtr<IExchangeAccountInfo>);

impl SafeExchangeAccountInfo {
    pub fn new(info: &IExchangeAccountInfo) -> Self {
        Self(RefPtr::new(info))
    }

    /// Convert types and forward to [`IExchangeAccountInfo::GetCurrentFolderIds`].
    pub fn get_current_folder_ids(&self) -> Result<impl Iterator<Item = String>, nsresult> {
        let mut ids = ThinVec::<nsCString>::new();

        // SAFETY: ids is initialized and remains live throughout the call.
        unsafe { self.0.GetCurrentFolderIds(&raw mut ids) }.to_result()?;
        Ok(ids.into_iter().map(|id| id.to_string()))
    }
}

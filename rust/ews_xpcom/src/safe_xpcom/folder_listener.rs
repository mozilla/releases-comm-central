/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::FolderId;
use fxhash::FxHashMap;
use nserror::nsresult;
use nsstring::nsCString;
use xpcom::interfaces::{nsMsgFolderFlagType, nsMsgFolderFlags, IEwsFolderListener};

use crate::error::XpComEwsError;

use super::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeEwsFolderListener = SafeListenerWrapper<IEwsFolderListener>;

impl SafeEwsFolderListener {
    /// Convert types and forward to [`IEwsFolderListener::OnNewRootFolder`]
    pub fn on_new_root_folder(&self, root_folder_id: FolderId) -> Result<(), XpComEwsError> {
        let folder_id = nsCString::from(root_folder_id.id);
        unsafe { self.0.OnNewRootFolder(&*folder_id) }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderListener::OnFolderCreated`]
    pub fn on_folder_created(
        &self,
        folder_id: Option<FolderId>,
        parent_folder_id: Option<FolderId>,
        display_name: Option<String>,
        well_known_map: &Option<FxHashMap<String, &str>>,
    ) -> Result<(), XpComEwsError> {
        let id = folder_id.map(|v| v.id).ok_or(nserror::NS_ERROR_FAILURE)?;
        let display_name = display_name.ok_or(nserror::NS_ERROR_FAILURE)?;

        let well_known_folder_flag = well_known_map
            .as_ref()
            .and_then(|map| map.get(&id))
            .map(distinguished_id_to_flag)
            .unwrap_or_default();

        let id = nsCString::from(id);
        let parent_folder_id: nsCString = parent_folder_id
            .as_ref()
            .map(|v| nsCString::from(&v.id))
            .ok_or(nserror::NS_ERROR_FAILURE)?;
        let display_name = nsCString::from(display_name);
        let flags = nsMsgFolderFlags::Mail | well_known_folder_flag;

        // SAFETY: We have converted all of the inputs into the appropriate
        // types to cross the Rust/C++ boundary.
        unsafe {
            self.0
                .OnFolderCreated(&*id, &*parent_folder_id, &*display_name, flags)
        }
        .to_result()?;

        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderListener::OnFolderUpdated`]
    pub fn on_folder_updated(
        &self,
        folder_id: Option<FolderId>,
        parent_folder_id: Option<FolderId>,
        display_name: Option<String>,
    ) -> Result<(), XpComEwsError> {
        let id = folder_id.map(|v| v.id).ok_or(nserror::NS_ERROR_FAILURE)?;
        let parent_id = parent_folder_id.ok_or(nserror::NS_ERROR_FAILURE)?;
        let display_name = display_name.ok_or(nserror::NS_ERROR_FAILURE)?;

        let id = nsCString::from(id);
        let parent_id = nsCString::from(parent_id.id);
        let display_name = nsCString::from(display_name);

        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.OnFolderUpdated(&*id, &*parent_id, &*display_name) }.to_result()?;

        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderListener::OnFolderDeleted`]
    pub fn on_folder_deleted(&self, id: String) -> Result<(), XpComEwsError> {
        let id = nsCString::from(id);
        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.OnFolderDeleted(&*id) }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderListener::OnSyncStateTokenChanged`]
    pub fn on_sync_state_token_changed(&self, sync_state_token: &str) -> Result<(), XpComEwsError> {
        let sync_state = nsCString::from(sync_state_token);
        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.OnSyncStateTokenChanged(&*sync_state) }.to_result()?;
        Ok(())
    }
}

impl SafeListener for SafeEwsFolderListener {
    type OnSuccessArg = ();
    type OnFailureArg = ();

    /// Forward to [`IEwsFolderListener::OnSuccess`].
    fn on_success(&self, _arg: ()) -> Result<(), nsresult> {
        unsafe { self.0.OnSuccess() }.to_result()
    }
}

/// Gets the Thunderbird flag corresponding to an EWS distinguished ID.
fn distinguished_id_to_flag(id: &&str) -> nsMsgFolderFlagType {
    // The type signature here is a little weird due to being passed directly to
    // `map()`.
    match *id {
        "inbox" => nsMsgFolderFlags::Inbox,
        "deleteditems" => nsMsgFolderFlags::Trash,
        "drafts" => nsMsgFolderFlags::Drafts,
        "outbox" => nsMsgFolderFlags::Queue,
        "sentitems" => nsMsgFolderFlags::SentMail,
        "junkemail" => nsMsgFolderFlags::Junk,
        "archive" => nsMsgFolderFlags::Archive,
        _ => Default::default(),
    }
}

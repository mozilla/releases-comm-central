/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::FolderId;
use fxhash::FxHashMap;
use nsstring::nsCString;
use xpcom::{
    interfaces::{nsMsgFolderFlagType, nsMsgFolderFlags, IEwsFolderCallbacks},
    RefPtr,
};

use crate::client::XpComEwsError;

use super::EwsClientError;

/// Wrapper newtype for [`IEwsFolderCallbacks`] that utilizes only safe Rust
/// types in its public interface and handles converting to unsafe types and
/// call to the underlying unsafe C++ callbacks with validated data.
pub struct SafeEwsFolderCallbacks(RefPtr<IEwsFolderCallbacks>);

impl SafeEwsFolderCallbacks {
    /// Return a new wrapper for the given [`IEwsFolderCallbacks`].  Will place
    /// the given borrow into a [`RefPtr`] to ensure the memory management of
    /// the inner callbacks is done correctly across the XPCOM boundary and
    /// guarantee that the lifetime of the borrowed inner
    /// [`IEwsFolderCallbacks`] meets or exceeds the lifetime of the returned
    /// [`SafeEwsFolderCallbacks`] for use in asynchronous operations.
    pub fn new(unsafe_callbacks: &IEwsFolderCallbacks) -> Self {
        SafeEwsFolderCallbacks(RefPtr::new(unsafe_callbacks))
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::RecordRootFolder`]
    pub fn record_root_folder(&self, root_folder_id: FolderId) -> Result<(), XpComEwsError> {
        let folder_id = nsCString::from(root_folder_id.id);
        unsafe { self.0.RecordRootFolder(&*folder_id) }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::Create`]
    pub fn create(
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
                .Create(&*id, &*parent_folder_id, &*display_name, flags)
        }
        .to_result()?;

        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::Update`]
    pub fn update(
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
        unsafe { self.0.Update(&*id, &*parent_id, &*display_name) }.to_result()?;

        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::Delete`]
    pub fn delete(&self, id: String) -> Result<(), XpComEwsError> {
        let id = nsCString::from(id);
        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.Delete(&*id) }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::UpdateSyncState`]
    pub fn update_sync_state(&self, sync_state_token: &str) -> Result<(), XpComEwsError> {
        let sync_state = nsCString::from(sync_state_token);
        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.UpdateSyncState(&*sync_state) }.to_result()?;
        Ok(())
    }

    /// Forward to [`IEwsFolderCallbacks::OnSuccess`].
    pub fn on_success(&self) -> Result<(), XpComEwsError> {
        unsafe { self.0.OnSuccess() }.to_result()?;
        Ok(())
    }

    /// Convert types and forward to [`IEwsFolderCallbacks::OnError`]
    pub fn on_error(&self, error: EwsClientError, description: &str) -> Result<(), XpComEwsError> {
        let error_code = error.into();
        let desc = nsCString::from(description);
        // SAFETY: We have converted all of the inputs into the appropriate types
        // to cross the Rust/C++ boundary.
        unsafe { self.0.OnError(error_code, &*desc) }.to_result()?;
        Ok(())
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

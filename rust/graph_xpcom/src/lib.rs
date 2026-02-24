/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::OnceCell, ffi::c_void};

use nserror::{NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_OK, nsresult};
use nsstring::{nsACString, nsCString};
use protocol_shared::{
    ExchangeConnectionDetails,
    authentication::credentials::AuthenticationProvider,
    safe_xpcom::{SafeEwsFolderListener, SafeUrlListener, uri::SafeUri},
};
use thin_vec::ThinVec;
use url::Url;
use xpcom::{
    RefPtr,
    interfaces::{
        IEwsFolderListener, IEwsMessageCreateListener, IEwsMessageFetchListener,
        IEwsMessageSyncListener, IEwsSimpleOperationListener, nsIInputStream, nsIMsgIncomingServer,
        nsIURI, nsIUrlListener,
    },
    nsIID, xpcom_method,
};

use crate::client::XpComGraphClient;

extern crate xpcom;

mod client;
mod error;

/// Creates a new instance of the XPCOM/Graph bridge interface [`XpcomGraphBridge`].
///
/// # SAFETY
/// `iid` must be a reference to a valid `nsIID` object, `result` must point to
/// valid memory, and `result` must not be used until the return value is
/// checked.
#[allow(non_snake_case)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn NS_CreateGraphClient(iid: &nsIID, result: *mut *mut c_void) -> nsresult {
    let instance = XpcomGraphBridge::allocate(InitXpcomGraphBridge {
        details: OnceCell::default(),
    });

    unsafe { instance.QueryInterface(iid, result) }
}

/// `XpcomEwsBridge` provides an XPCOM interface implementation for mediating
/// between C++ consumers and an async Rust Graph API client.
#[xpcom::xpcom(implement(IEwsClient), atomic)]
pub struct XpcomGraphBridge {
    details: OnceCell<ExchangeConnectionDetails>,
}

impl XpcomGraphBridge {
    xpcom_method!(running => GetRunning() -> bool);
    fn running(&self) -> Result<bool, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(idle => GetIdle() -> bool);
    fn idle(&self) -> Result<bool, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(record_telemetry => RecordTelemetry(server_url: *const nsACString));
    fn record_telemetry(&self, _server_url: &nsACString) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(initialize => Initialize(
        endpoint: *const nsACString,
        server: *const nsIMsgIncomingServer));
    fn initialize(
        &self,
        endpoint: &nsACString,
        server: &nsIMsgIncomingServer,
    ) -> Result<(), nsresult> {
        log::debug!(
            "Initializing XpcomGraphBridge with endpoint {}",
            endpoint.to_string()
        );

        let endpoint = Url::parse(&endpoint.to_utf8()).map_err(|_| NS_ERROR_INVALID_ARG)?;

        let credentials = server.get_credentials()?;
        let server = RefPtr::new(server);

        self.details
            .set(ExchangeConnectionDetails {
                endpoint,
                server,
                credentials,
            })
            .map_err(|_| NS_ERROR_ALREADY_INITIALIZED)?;

        Ok(())
    }

    xpcom_method!(shutdown => Shutdown());
    fn shutdown(&self) -> Result<(), nsresult> {
        // There's currently no shutdown operation for the Graph client.
        Ok(())
    }

    xpcom_method!(check_connectivity => CheckConnectivity(listener: *const nsIUrlListener) -> *const nsIURI);
    fn check_connectivity(&self, listener: &nsIUrlListener) -> Result<RefPtr<nsIURI>, nsresult> {
        let server = self.details.get().unwrap().server.clone();
        let endpoint = self.details.get().unwrap().endpoint.clone();

        let uri = endpoint.to_string();
        let uri = SafeUri::new(uri)?;

        let client = XpComGraphClient::new(server, endpoint);

        let listener = SafeUrlListener::new(listener);

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "check_connectivity",
            client.check_connectivity(uri.clone(), listener),
        )
        .detach();

        Ok(uri.into())
    }

    xpcom_method!(sync_folder_hierarchy => SyncFolderHierarchy(
        listener: *const IEwsFolderListener,
        sync_state: *const nsACString
    ));
    fn sync_folder_hierarchy(
        &self,
        listener: &IEwsFolderListener,
        sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().into_owned())
        };

        let server = self.details.get().unwrap().server.clone();
        let endpoint = self.details.get().unwrap().endpoint.clone();

        let client = XpComGraphClient::new(server, endpoint);

        moz_task::spawn_local(
            "sync_folder_hierarchy",
            client.sync_folder_hierarchy(SafeEwsFolderListener::new(listener), sync_state),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(create_folder => CreateFolder(
        _listener: *const IEwsSimpleOperationListener,
        _parent_id: *const nsACString,
        _name: *const nsACString
    ));
    fn create_folder(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _parent_id: &nsACString,
        _name: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(delete_folder => DeleteFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn delete_folder(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(empty_folder => EmptyFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>,
        subfolder_ids: *const ThinVec<nsCString>,
        message_ids: *const ThinVec<nsCString>
    ));
    fn empty_folder(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _folder_ids: &ThinVec<nsCString>,
        _subfolder_ids: &ThinVec<nsCString>,
        _message_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(update_folder => UpdateFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_id: *const nsACString,
        folder_name: *const nsACString
    ));
    fn update_folder(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _folder_id: &nsACString,
        _folder_name: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(sync_messages_for_folder => SyncMessagesForFolder(
        listener: *const IEwsMessageSyncListener,
        folder_id: *const nsACString,
        sync_state: *const nsACString
    ));
    fn sync_messages_for_folder(
        &self,
        _listener: &IEwsMessageSyncListener,
        _folder_id: &nsACString,
        _sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(get_message => GetMessage(
        callbacks: *const IEwsMessageFetchListener,
        id: *const nsACString
    ));
    fn get_message(
        &self,
        _listener: &IEwsMessageFetchListener,
        _id: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(change_read_status => ChangeReadStatus(
        listener: *const IEwsSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>,
        is_read: bool
    ));
    fn change_read_status(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _message_ids: &ThinVec<nsCString>,
        _is_read: bool,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(change_flag_status => ChangeFlagStatus(
        listener: *const IEwsSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>,
        is_flagged: bool
    ));
    fn change_flag_status(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _message_ids: &ThinVec<nsCString>,
        _is_flagged: bool,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(change_read_status_all => ChangeReadStatusAll(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool
    ));
    fn change_read_status_all(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _folder_ids: &ThinVec<nsCString>,
        _is_read: bool,
        _suppress_read_receipts: bool,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(create_message => CreateMessage(
        listener: *const IEwsMessageCreateListener,
        folder_id: *const nsACString,
        is_draft: bool,
        is_read: bool,
        message_stream: *const nsIInputStream
    ));
    fn create_message(
        &self,
        _listener: &IEwsMessageCreateListener,
        _folder_id: &nsACString,
        _is_draft: bool,
        _is_read: bool,
        _message_stream: &nsIInputStream,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(move_items => MoveItems(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn move_items(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _destination_folder_id: &nsACString,
        _item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(copy_items => CopyItems(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn copy_items(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _destination_folder_id: &nsACString,
        _item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(move_folders => MoveFolders(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn move_folders(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _destination_folder_id: &nsACString,
        _folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(copy_folders => CopyFolders(
        callbacks: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn copy_folders(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _destination_folder_id: &nsACString,
        _folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(delete_messages => DeleteMessages(
        listener: *const IEwsSimpleOperationListener,
        ews_ids: *const ThinVec<nsCString>
    ));
    fn delete_messages(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _ews_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(mark_items_as_junk => MarkItemsAsJunk(
        listener: *const IEwsSimpleOperationListener,
        ews_ids: *const ThinVec<nsCString>,
        is_junk: bool,
        legacyDestinationFolderId: *const nsACString
    ));
    fn mark_items_as_junk(
        &self,
        _listener: &IEwsSimpleOperationListener,
        _ews_ids: &ThinVec<nsCString>,
        _is_junk: bool,
        _legacy_destination_folder_id: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }
}

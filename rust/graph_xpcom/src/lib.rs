/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::OnceCell, ffi::c_void};

use nserror::{nsresult, NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_OK};
use nsstring::{nsACString, nsCString};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider, ExchangeConnectionDetails,
};
use thin_vec::ThinVec;
use url::Url;
use xpcom::{
    interfaces::{
        nsIInputStream, nsIMsgIncomingServer, nsIURI, nsIUrlListener, IEwsFolderListener,
        IEwsMessageCreateListener, IEwsMessageFetchListener, IEwsMessageSyncListener,
        IEwsSimpleOperationListener,
    },
    nsIID, xpcom_method, RefPtr,
};

extern crate xpcom;

/// Creates a new instance of the XPCOM/Graph bridge interface [`XpcomGraphBridge`].
///
/// # SAFETY
/// `iid` must be a reference to a valid `nsIID` object, `result` must point to
/// valid memory, and `result` must not be used until the return value is
/// checked.
#[allow(non_snake_case)]
#[no_mangle]
pub unsafe extern "C" fn NS_CreateGraphClient(iid: &nsIID, result: *mut *mut c_void) -> nsresult {
    let instance = XpcomGraphBridge::allocate(InitXpcomGraphBridge {
        details: OnceCell::default(),
    });

    instance.QueryInterface(iid, result)
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

    xpcom_method!(on_auth_changed => OnAuthChanged());
    fn on_auth_changed(&self) -> Result<(), nsresult> {
        // There's currently no in-memory storage of auth credentials for the
        // Graph client.
        Ok(())
    }

    xpcom_method!(check_connectivity => CheckConnectivity(listener: *const nsIUrlListener) -> *const nsIURI);
    fn check_connectivity(&self, _listener: &nsIUrlListener) -> Result<RefPtr<nsIURI>, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(sync_folder_hierarchy => SyncFolderHierarchy(
        _listener: *const IEwsFolderListener,
        _sync_state: *const nsACString
    ));
    fn sync_folder_hierarchy(
        &self,
        _listener: &IEwsFolderListener,
        _sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::OnceCell, ffi::c_void, sync::Arc};

use nserror::{
    NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_INITIALIZED, NS_OK, nsresult,
};
use nsstring::{nsACString, nsCString};
use protocol_shared::{
    client::ProtocolClient,
    safe_xpcom::{
        SafeExchangeFolderListener, SafeExchangeMessageCreateListener,
        SafeExchangeMessageFetchListener, SafeExchangeMessageSyncListener,
        SafeExchangeSimpleOperationListener, SafeUrlListener, uri::SafeUri,
    },
    xpcom_io,
};

use thin_vec::ThinVec;
use url::Url;
use xpcom::{
    RefPtr,
    interfaces::{
        IExchangeFolderListener, IExchangeMessageCreateListener, IExchangeMessageFetchListener,
        IExchangeMessageSyncListener, IExchangeSimpleOperationListener, nsIInputStream,
        nsIMsgIncomingServer, nsIURI, nsIUrlListener,
    },
    nsIID, xpcom_method,
};

use crate::client::XpComGraphClient;

mod client;
mod error;
mod outgoing;

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
        client: OnceCell::default(),
    });

    unsafe { instance.QueryInterface(iid, result) }
}

/// `XpcomEwsBridge` provides an XPCOM interface implementation for mediating
/// between C++ consumers and an async Rust Graph API client.
#[xpcom::xpcom(implement(IExchangeClient), atomic)]
pub struct XpcomGraphBridge {
    client: OnceCell<Arc<XpComGraphClient<nsIMsgIncomingServer>>>,
}

impl XpcomGraphBridge {
    xpcom_method!(running => GetRunning() -> bool);
    fn running(&self) -> Result<bool, nsresult> {
        let client = match self.client() {
            Ok(client) => client,
            Err(err) if err == NS_ERROR_NOT_INITIALIZED => return Ok(false),
            Err(err) => return Err(err),
        };

        Ok(client.running())
    }

    xpcom_method!(idle => GetIdle() -> bool);
    fn idle(&self) -> Result<bool, nsresult> {
        let client = match self.client() {
            Ok(client) => client,
            Err(err) if err == NS_ERROR_NOT_INITIALIZED => return Ok(false),
            Err(err) => return Err(err),
        };

        Ok(client.idle())
    }

    xpcom_method!(record_telemetry => RecordTelemetry(server_url: *const nsACString));
    fn record_telemetry(&self, _server_url: &nsACString) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(initialize => Initialize(
        endpoint: *const nsACString,
        server: *const nsIMsgIncomingServer));
    // See the documentation for `OperationSender::new()` regarding the use of
    // `Arc`.
    #[allow(clippy::arc_with_non_send_sync)]
    fn initialize(
        &self,
        endpoint: &nsACString,
        server: &nsIMsgIncomingServer,
    ) -> Result<(), nsresult> {
        log::debug!("Initializing XpcomGraphBridge with endpoint {endpoint}");

        let endpoint = Url::parse(&endpoint.to_utf8()).or(Err(NS_ERROR_INVALID_ARG))?;
        let server = RefPtr::new(server);

        let client = XpComGraphClient::new(server, endpoint)?;
        self.client
            .set(Arc::new(client))
            .or(Err(NS_ERROR_ALREADY_INITIALIZED))?;

        Ok(())
    }

    xpcom_method!(shutdown => Shutdown());
    fn shutdown(&self) -> Result<(), nsresult> {
        let client = self.client()?;
        moz_task::spawn_local("shutdown", client.shutdown()).detach();
        Ok(())
    }

    xpcom_method!(check_connectivity => CheckConnectivity(listener: *const nsIUrlListener) -> *const nsIURI);
    fn check_connectivity(&self, listener: &nsIUrlListener) -> Result<RefPtr<nsIURI>, nsresult> {
        let client = self.client()?;

        let uri = client.base_api_url()?.to_string();
        let uri = SafeUri::new(uri)?;

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
        listener: *const IExchangeFolderListener,
        sync_state: *const nsACString
    ));
    fn sync_folder_hierarchy(
        &self,
        listener: &IExchangeFolderListener,
        sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().into_owned())
        };

        let client = self.client()?;

        moz_task::spawn_local(
            "sync_folder_hierarchy",
            client.sync_folder_hierarchy(SafeExchangeFolderListener::new(listener), sync_state),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(create_folder => CreateFolder(
        _listener: *const IExchangeSimpleOperationListener,
        _parent_id: *const nsACString,
        _name: *const nsACString
    ));
    fn create_folder(
        &self,
        listener: &IExchangeSimpleOperationListener,
        parent_id: &nsACString,
        name: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "create_folder",
            client.create_folder(
                SafeExchangeSimpleOperationListener::new(listener),
                parent_id.to_utf8().into_owned(),
                name.to_utf8().into_owned(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(delete_folder => DeleteFolder(
        listener: *const IExchangeSimpleOperationListener,
        folder_id: *const nsACString
    ));
    fn delete_folder(
        &self,
        listener: &IExchangeSimpleOperationListener,
        folder_id: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "delete_folder",
            client.delete_folders(folder_id.to_string(), listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(empty_folder => EmptyFolder(
        listener: *const IExchangeSimpleOperationListener,
        folder_id: *const nsACString,
        subfolder_ids: *const ThinVec<nsCString>,
        message_ids: *const ThinVec<nsCString>
    ));
    fn empty_folder(
        &self,
        listener: &IExchangeSimpleOperationListener,
        folder_id: &nsACString,
        subfolder_ids: &ThinVec<nsCString>,
        message_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let folder_id = folder_id.to_string();
        let subfolder_ids = subfolder_ids.iter().map(ToString::to_string).collect();
        let message_ids = message_ids.iter().map(ToString::to_string).collect();

        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "empty_folder",
            client.empty_folder(folder_id, subfolder_ids, message_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(update_folder => UpdateFolder(
        listener: *const IExchangeSimpleOperationListener,
        folder_id: *const nsACString,
        folder_name: *const nsACString
    ));
    fn update_folder(
        &self,
        listener: &IExchangeSimpleOperationListener,
        folder_id: &nsACString,
        folder_name: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "update_folder",
            client.update_folder(
                folder_id.to_utf8().into_owned(),
                folder_name.to_utf8().into_owned(),
                SafeExchangeSimpleOperationListener::new(listener),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(sync_messages_for_folder => SyncMessagesForFolder(
        listener: *const IExchangeMessageSyncListener,
        folder_id: *const nsACString,
        sync_state: *const nsACString
    ));
    fn sync_messages_for_folder(
        &self,
        listener: &IExchangeMessageSyncListener,
        folder_id: &nsACString,
        sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let listener = SafeExchangeMessageSyncListener::new(listener);
        let folder_id = folder_id.to_utf8().to_string();
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().to_string())
        };

        moz_task::spawn_local(
            "sync_messages_for_folder",
            client.sync_messages_for_folder(listener, folder_id, sync_state),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(get_message => GetMessage(
        callbacks: *const IExchangeMessageFetchListener,
        id: *const nsACString
    ));
    fn get_message(
        &self,
        listener: &IExchangeMessageFetchListener,
        id: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let listener = SafeExchangeMessageFetchListener::new(listener);
        let id = id.to_utf8().to_string();

        moz_task::spawn_local("get_message", client.get_message(listener, id)).detach();

        Ok(())
    }

    xpcom_method!(change_read_status => ChangeReadStatus(
        listener: *const IExchangeSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>,
        is_read: bool
    ));
    fn change_read_status(
        &self,
        listener: &IExchangeSimpleOperationListener,
        message_ids: &ThinVec<nsCString>,
        is_read: bool,
    ) -> Result<(), nsresult> {
        let client = self.client()?;
        let message_ids = message_ids.into_iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "change_read_status",
            client.change_read_status(message_ids, is_read, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(change_flag_status => ChangeFlagStatus(
        listener: *const IExchangeSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>,
        is_flagged: bool
    ));
    fn change_flag_status(
        &self,
        listener: &IExchangeSimpleOperationListener,
        message_ids: &ThinVec<nsCString>,
        is_flagged: bool,
    ) -> Result<(), nsresult> {
        let client = self.client()?;
        let message_ids = message_ids.into_iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "change_flag_status",
            client.change_flag_status(message_ids, is_flagged, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(change_read_status_all => ChangeReadStatusAll(
        listener: *const IExchangeSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool
    ));
    fn change_read_status_all(
        &self,
        listener: &IExchangeSimpleOperationListener,
        folder_ids: &ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool,
    ) -> Result<(), nsresult> {
        let client = self.client()?;
        let folder_ids = folder_ids.into_iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "change_read_status_all",
            client.change_read_status_all(folder_ids, is_read, suppress_read_receipts, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(create_message => CreateMessage(
        listener: *const IExchangeMessageCreateListener,
        folder_id: *const nsACString,
        is_draft: bool,
        is_read: bool,
        message_stream: *const nsIInputStream
    ));
    fn create_message(
        &self,
        listener: &IExchangeMessageCreateListener,
        folder_id: &nsACString,
        is_draft: bool,
        is_read: bool,
        message_stream: &nsIInputStream,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let content = xpcom_io::read_stream(message_stream)?;

        moz_task::spawn_local(
            "sync_folder_hierarchy",
            client.create_message(
                folder_id.to_string(),
                is_draft,
                is_read,
                content,
                SafeExchangeMessageCreateListener::new(listener),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(move_items => MoveItems(
        listener: *const IExchangeSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn move_items(
        &self,
        listener: &IExchangeSimpleOperationListener,
        destination_folder_id: &nsACString,
        item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let destination_folder_id = destination_folder_id.to_string();
        let item_ids = item_ids.iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "move_messages",
            client.move_messages(destination_folder_id, item_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(copy_items => CopyItems(
        listener: *const IExchangeSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn copy_items(
        &self,
        listener: &IExchangeSimpleOperationListener,
        destination_folder_id: &nsACString,
        item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let destination_folder_id = destination_folder_id.to_string();
        let item_ids = item_ids.iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "copy_messages",
            client.copy_messages(destination_folder_id, item_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(move_folders => MoveFolders(
        listener: *const IExchangeSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn move_folders(
        &self,
        listener: &IExchangeSimpleOperationListener,
        destination_folder_id: &nsACString,
        folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let destination_folder_id = destination_folder_id.to_string();
        let folder_ids = folder_ids.iter().map(ToString::to_string).collect();

        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "move_folders",
            client.move_folders(destination_folder_id, folder_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(copy_folders => CopyFolders(
        callbacks: *const IExchangeSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn copy_folders(
        &self,
        listener: &IExchangeSimpleOperationListener,
        destination_folder_id: &nsACString,
        folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let destination_folder_id = destination_folder_id.to_string();
        let folder_ids = folder_ids.iter().map(ToString::to_string).collect();

        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "copy_folders",
            client.copy_folders(destination_folder_id, folder_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(delete_messages => DeleteMessages(
        listener: *const IExchangeSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>
    ));
    fn delete_messages(
        &self,
        listener: &IExchangeSimpleOperationListener,
        message_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let message_ids = message_ids.iter().map(ToString::to_string).collect();
        let listener = SafeExchangeSimpleOperationListener::new(listener);

        moz_task::spawn_local(
            "delete_messages",
            client.delete_messages(message_ids, listener),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(mark_items_as_junk => MarkItemsAsJunk(
        listener: *const IExchangeSimpleOperationListener,
        ews_ids: *const ThinVec<nsCString>,
        is_junk: bool,
        legacyDestinationFolderId: *const nsACString
    ));
    fn mark_items_as_junk(
        &self,
        listener: &IExchangeSimpleOperationListener,
        ews_ids: &ThinVec<nsCString>,
        _is_junk: bool,
        legacy_destination_folder_id: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let ews_ids = ews_ids.iter().map(ToString::to_string).collect();
        let legacy_destination_folder_id = legacy_destination_folder_id.to_utf8().into_owned();

        // NOTE: The is_junk parameter is unused because the Graph 1.0 API does not support a mark
        // as junk operation. Instead, we use the caller-supplied legacy_destination_folder_id
        // parameter to initiate a move to the caller-requested folder.
        moz_task::spawn_local(
            "mark_items_as_junk",
            client.mark_items_as_junk(
                legacy_destination_folder_id,
                ews_ids,
                SafeExchangeSimpleOperationListener::new(listener),
            ),
        )
        .detach();

        Ok(())
    }

    /// Gets a new reference to the Graph client if initialized. The client is
    /// wrapped into an `Arc`, which is cloned from `self.client` so the
    /// consumer does not need to clone it again.
    ///
    /// If the [`XpcomGraphBridge`] hasn't been initialized yet,
    /// [`NS_ERROR_NOT_INITIALIZED`] is returned.
    fn client(&self) -> Result<Arc<XpComGraphClient<nsIMsgIncomingServer>>, nsresult> {
        let client = self.client.get().ok_or(NS_ERROR_NOT_INITIALIZED)?.clone();
        Ok(client)
    }
}

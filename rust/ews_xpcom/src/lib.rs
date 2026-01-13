/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate xpcom;

use ews::copy_folder::CopyFolder;
use ews::copy_item::CopyItem;
use ews::move_folder::MoveFolder;
use ews::move_item::MoveItem;
use firefox_on_glean::metrics::mailnews_ews as glean_ews;
use mailnews_ui_glue::UserInteractiveServer;
use nserror::{
    nsresult, NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_INITIALIZED, NS_OK,
};
use nsstring::{nsACString, nsCString};
use protocol_shared::{
    safe_xpcom::{uri::SafeUri, SafeUrlListener},
    ExchangeConnectionDetails,
};
use std::{cell::OnceCell, ffi::c_void, sync::Arc};
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

use client::XpComEwsClient;
use safe_xpcom::{
    SafeEwsFolderListener, SafeEwsMessageCreateListener, SafeEwsMessageFetchListener,
    SafeEwsMessageSyncListener, SafeEwsSimpleOperationListener,
};

mod cancellable_request;
mod client;
mod error;
mod headers;
mod macros;
mod observers;
mod operation_queue;
mod operation_sender;
mod outgoing;
mod safe_xpcom;
mod server_version;
mod xpcom_io;

/// The base domains for Office365-hosted accounts. At the time of writing, the
/// only valid domain for Office365 EWS URLs should be `outlook.office365.com`,
/// but we'll throw a few additional Microsoft-owned ones in there in case it
/// changes in the future, as well as anything ending with a `microsoft` TLD.
/// This is currently only used for telemetry.
const OFFICE365_BASE_DOMAINS: [&str; 4] = [
    "office365.com",
    "outlook.com",
    "onmicrosoft.com",
    ".microsoft",
];

/// Creates a new instance of the XPCOM/EWS bridge interface [`XpcomEwsBridge`].
///
/// # SAFETY
/// `iid` must be a reference to a valid `nsIID` object, `result` must point to
/// valid memory, and `result` must not be used until the return value is
/// checked.
#[allow(non_snake_case)]
#[no_mangle]
pub unsafe extern "C" fn NS_CreateEwsClient(iid: &nsIID, result: *mut *mut c_void) -> nsresult {
    let instance = XpcomEwsBridge::allocate(InitXpcomEwsBridge {
        server: OnceCell::default(),
        details: OnceCell::default(),
        client: OnceCell::default(),
    });

    instance.QueryInterface(iid, result)
}

/// `XpcomEwsBridge` provides an XPCOM interface implementation for mediating
/// between C++ consumers and an async Rust EWS client.
#[xpcom::xpcom(implement(IEwsClient), atomic)]
pub(crate) struct XpcomEwsBridge {
    server: OnceCell<Box<dyn UserInteractiveServer>>,
    details: OnceCell<ExchangeConnectionDetails>,
    client: OnceCell<Arc<XpComEwsClient<nsIMsgIncomingServer>>>,
}

impl XpcomEwsBridge {
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
    fn record_telemetry(&self, server_url: &nsACString) -> Result<(), nsresult> {
        // Try to parse the URL.
        let server_url =
            Url::parse(&server_url.to_utf8()).or(Err(nserror::NS_ERROR_INVALID_ARG))?;

        // Try to extract a domain from the URL, so we can compare it with the
        // Offiche365 base domain.
        let domain = server_url.host_str().ok_or(nserror::NS_ERROR_INVALID_ARG)?;

        // See if we know an Exchange Server version for this URL.
        let version = server_version::read_server_version(&server_url)?;

        // We've handled any possible error, let's record some data.
        if let Some(version) = version {
            // Record the version, but only if we have one stored in the prefs, as
            // using the default value here would just skew the data.
            glean_ews::version
                .get(server_version::to_glean_label(&version).into())
                .add(1);
        }

        // Record whether the URL refers to Office365.
        let is_o365 = OFFICE365_BASE_DOMAINS
            .into_iter()
            .any(|o365_base_domain| domain.ends_with(o365_base_domain));

        let server_type_label = if is_o365 {
            glean_ews::ServerTypeLabel::EOffice365
        } else {
            glean_ews::ServerTypeLabel::EOnpremise
        };

        glean_ews::server_type.get(server_type_label.into()).add(1);

        Ok(())
    }

    xpcom_method!(initialize => Initialize(
        endpoint: *const nsACString,
        server: *const nsIMsgIncomingServer));
    // See the design consideration section from `operation_queue.rs` regarding
    // the use of `Arc`.
    #[allow(clippy::arc_with_non_send_sync)]
    fn initialize(
        &self,
        endpoint: &nsACString,
        server: &nsIMsgIncomingServer,
    ) -> Result<(), nsresult> {
        let endpoint = Url::parse(&endpoint.to_utf8()).map_err(|_| NS_ERROR_INVALID_ARG)?;
        let server = RefPtr::new(server);

        let client = XpComEwsClient::new(endpoint, server)?;
        self.client
            .set(Arc::new(client))
            .map_err(|_| NS_ERROR_ALREADY_INITIALIZED)?;

        Ok(())
    }

    xpcom_method!(shutdown => Shutdown());
    fn shutdown(&self) -> Result<(), nsresult> {
        let client = self.client()?;
        client.shutdown();
        Ok(())
    }

    xpcom_method!(check_connectivity => CheckConnectivity(listener: *const nsIUrlListener) -> *const nsIURI);
    fn check_connectivity(&self, listener: &nsIUrlListener) -> Result<RefPtr<nsIURI>, nsresult> {
        // Get an EWS client and make a request to check connectivity to the EWS
        // server.
        let client = self.client()?;

        // Extract the client's URL and turn it into an `nsIURI`.
        let uri = client.url().to_string();
        let uri = SafeUri::new(uri)?;

        moz_task::spawn_local(
            "check_connectivity",
            client.check_connectivity(uri.clone(), SafeUrlListener::new(listener)),
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
        // We can't use `Option` across XPCOM, but we want to use one internally
        // so we don't send an empty string for sync state.
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().into_owned())
        };

        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "sync_folder_hierarchy",
            client.sync_folder_hierarchy(SafeEwsFolderListener::new(listener), sync_state),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(create_folder => CreateFolder(
        listener: *const IEwsSimpleOperationListener,
        parent_id: *const nsACString,
        name: *const nsACString
    ));
    fn create_folder(
        &self,
        listener: &IEwsSimpleOperationListener,
        parent_id: &nsACString,
        name: &nsACString,
    ) -> Result<(), nsresult> {
        if parent_id.is_empty() || name.is_empty() {
            return Err(nserror::NS_ERROR_INVALID_ARG);
        }

        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "create_folder",
            client.create_folder(
                SafeEwsSimpleOperationListener::new(listener),
                parent_id.to_utf8().into(),
                name.to_utf8().into(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(delete_folder => DeleteFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn delete_folder(
        &self,
        listener: &IEwsSimpleOperationListener,
        folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "delete_folder",
            client.delete_folder(
                SafeEwsSimpleOperationListener::new(listener),
                folder_ids
                    .iter()
                    .map(|s| s.to_utf8().into_owned())
                    .collect(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(empty_folder => EmptyFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>,
        subfolder_ids: *const ThinVec<nsCString>,
        message_ids: *const ThinVec<nsCString>
    ));
    fn empty_folder(
        &self,
        listener: &IEwsSimpleOperationListener,
        folder_ids: &ThinVec<nsCString>,
        subfolder_ids: &ThinVec<nsCString>,
        message_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        let folder_ids = folder_ids
            .iter()
            .map(|s| s.to_utf8().into_owned())
            .collect();
        let subfolder_ids = subfolder_ids
            .iter()
            .map(|s| s.to_utf8().into_owned())
            .collect();
        let message_ids = message_ids
            .iter()
            .map(|s| s.to_utf8().into_owned())
            .collect();

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "empty_folder",
            client.empty_folder(
                SafeEwsSimpleOperationListener::new(listener),
                folder_ids,
                subfolder_ids,
                message_ids,
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(update_folder => UpdateFolder(
        listener: *const IEwsSimpleOperationListener,
        folder_id: *const nsACString,
        folder_name: *const nsACString
    ));
    fn update_folder(
        &self,
        listener: &IEwsSimpleOperationListener,
        folder_id: &nsACString,
        folder_name: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "update_folder",
            client.update_folder(
                SafeEwsSimpleOperationListener::new(listener),
                folder_id.to_utf8().into_owned(),
                folder_name.to_utf8().into_owned(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(sync_messages_for_folder => SyncMessagesForFolder(
        listener: *const IEwsMessageSyncListener,
        folder_id: *const nsACString,
        sync_state: *const nsACString
    ));
    fn sync_messages_for_folder(
        &self,
        listener: &IEwsMessageSyncListener,
        folder_id: &nsACString,
        sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        // We can't use `Option` across XPCOM, but we want to use one internally
        // so we don't send an empty string for sync state.
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().into_owned())
        };

        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "sync_messages_for_folder",
            client.sync_messages_for_folder(
                SafeEwsMessageSyncListener::new(listener),
                folder_id.to_utf8().into_owned(),
                sync_state,
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(get_message => GetMessage(
        callbacks: *const IEwsMessageFetchListener,
        id: *const nsACString
    ));
    fn get_message(
        &self,
        listener: &IEwsMessageFetchListener,
        id: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "get_message",
            client.get_message(
                SafeEwsMessageFetchListener::new(listener),
                id.to_utf8().into(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(change_read_status => ChangeReadStatus(
        listener: *const IEwsSimpleOperationListener,
        message_ids: *const ThinVec<nsCString>,
        is_read: bool
    ));
    fn change_read_status(
        &self,
        listener: &IEwsSimpleOperationListener,
        message_ids: &ThinVec<nsCString>,
        is_read: bool,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "change_read_status",
            client.change_read_status(
                SafeEwsSimpleOperationListener::new(listener),
                message_ids.clone(),
                is_read,
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(change_read_status_all => ChangeReadStatusAll(
        listener: *const IEwsSimpleOperationListener,
        folder_ids: *const ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool
    ));
    fn change_read_status_all(
        &self,
        listener: &IEwsSimpleOperationListener,
        folder_ids: &ThinVec<nsCString>,
        is_read: bool,
        suppress_read_receipts: bool,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "change_read_status_all",
            client.change_read_status_all(
                SafeEwsSimpleOperationListener::new(listener),
                folder_ids.clone(),
                is_read,
                suppress_read_receipts,
            ),
        )
        .detach();

        Ok(())
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
        listener: &IEwsMessageCreateListener,
        folder_id: &nsACString,
        is_draft: bool,
        is_read: bool,
        message_stream: &nsIInputStream,
    ) -> Result<(), nsresult> {
        let content = crate::xpcom_io::read_stream(message_stream)?;

        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "save_message",
            client.create_message(
                folder_id.to_utf8().into(),
                is_draft,
                is_read,
                content,
                SafeEwsMessageCreateListener::new(listener),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(move_items => MoveItems(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn move_items(
        &self,
        listener: &IEwsSimpleOperationListener,
        destination_folder_id: &nsACString,
        item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "move_items",
            client.copy_move_item::<MoveItem>(
                SafeEwsSimpleOperationListener::new(listener),
                destination_folder_id.to_string(),
                item_ids.iter().map(|id| id.to_string()).collect(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(copy_items => CopyItems(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        item_ids: *const ThinVec<nsCString>
    ));
    fn copy_items(
        &self,
        listener: &IEwsSimpleOperationListener,
        destination_folder_id: &nsACString,
        item_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "copy_items",
            client.copy_move_item::<CopyItem>(
                SafeEwsSimpleOperationListener::new(listener),
                destination_folder_id.to_string(),
                item_ids.iter().map(|id| id.to_string()).collect(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(move_folders => MoveFolders(
        listener: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn move_folders(
        &self,
        listener: &IEwsSimpleOperationListener,
        destination_folder_id: &nsACString,
        folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "move_folders",
            client.copy_move_folder::<MoveFolder>(
                SafeEwsSimpleOperationListener::new(listener),
                destination_folder_id.to_string(),
                folder_ids.iter().map(|id| id.to_string()).collect(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(copy_folders => CopyFolders(
        callbacks: *const IEwsSimpleOperationListener,
        destination_folder_id: *const nsACString,
        folder_ids: *const ThinVec<nsCString>
    ));
    fn copy_folders(
        &self,
        listener: &IEwsSimpleOperationListener,
        destination_folder_id: &nsACString,
        folder_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "copy_folders",
            client.copy_move_folder::<CopyFolder>(
                SafeEwsSimpleOperationListener::new(listener),
                destination_folder_id.to_string(),
                folder_ids.iter().map(|id| id.to_string()).collect(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(delete_messages => DeleteMessages(
        listener: *const IEwsSimpleOperationListener,
        ews_ids: *const ThinVec<nsCString>
    ));
    fn delete_messages(
        &self,
        listener: &IEwsSimpleOperationListener,
        ews_ids: &ThinVec<nsCString>,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "delete_messages",
            client.delete_messages(
                SafeEwsSimpleOperationListener::new(listener),
                ews_ids.clone(),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(mark_items_as_junk => MarkItemsAsJunk(
        listener: *const IEwsSimpleOperationListener,
        ews_ids: *const ThinVec<nsCString>,
        is_junk: bool,
        legacyDestinationFolderId: *const nsACString
    ));
    fn mark_items_as_junk(
        &self,
        listener: &IEwsSimpleOperationListener,
        ews_ids: &ThinVec<nsCString>,
        is_junk: bool,
        legacy_destination_folder_id: &nsACString,
    ) -> Result<(), nsresult> {
        let client = self.client()?;

        moz_task::spawn_local(
            "mark_items_as_junk",
            client.mark_as_junk(
                SafeEwsSimpleOperationListener::new(listener),
                ews_ids.clone(),
                is_junk,
                legacy_destination_folder_id.to_string(),
            ),
        )
        .detach();
        Ok(())
    }

    /// Gets a new EWS client if initialized. The client is wrapped into an
    /// `Arc`, which is cloned from `self.client` so the consumer does not need
    /// to clone it again.
    ///
    /// If the [`XpcomEwsBridge`] hasn't been initialized yet,
    /// [`NS_ERROR_NOT_INITIALIZED`] is returned.
    fn client(&self) -> Result<Arc<XpComEwsClient<nsIMsgIncomingServer>>, nsresult> {
        let client = self.client.get().ok_or(NS_ERROR_NOT_INITIALIZED)?.clone();
        Ok(client)
    }
}

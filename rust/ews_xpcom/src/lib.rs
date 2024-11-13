/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate xpcom;

use std::{cell::OnceCell, ffi::c_void};
use url::Url;
use nsstring::{nsCString};
use thin_vec::ThinVec;
use nserror::{
    nsresult, NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_INITIALIZED, NS_OK,
};
use nsstring::nsACString;
use xpcom::{
    interfaces::{
        nsIInputStream, nsIMsgCopyServiceListener, nsIMsgIncomingServer, nsIRequest,
        nsIStreamListener, IEwsFolderCallbacks, IEwsMessageCallbacks,
    },
    nsIID, xpcom_method, RefPtr,
};

use authentication::credentials::{AuthenticationProvider, Credentials};
use client::XpComEwsClient;

mod authentication;
mod cancellable_request;
mod client;
mod headers;
mod outgoing;
mod xpcom_io;

/// Creates a new instance of the XPCOM/EWS bridge interface [`XpcomEwsBridge`].
#[allow(non_snake_case)]
#[no_mangle]
pub unsafe extern "C" fn NS_CreateEwsClient(iid: &nsIID, result: *mut *mut c_void) -> nsresult {
    let instance = XpcomEwsBridge::allocate(InitXpcomEwsBridge {
        details: OnceCell::default(),
    });

    instance.QueryInterface(iid, result)
}

/// `XpcomEwsBridge` provides an XPCOM interface implementation for mediating
/// between C++ consumers and an async Rust EWS client.
#[xpcom::xpcom(implement(IEwsClient), atomic)]
struct XpcomEwsBridge {
    details: OnceCell<EwsConnectionDetails>,
}

#[derive(Clone)]
struct EwsConnectionDetails {
    endpoint: Url,
    credentials: Credentials,
}

impl XpcomEwsBridge {
    xpcom_method!(initialize => Initialize(endpoint: *const nsACString, server: *const nsIMsgIncomingServer));
    fn initialize(
        &self,
        endpoint: &nsACString,
        server: &nsIMsgIncomingServer,
    ) -> Result<(), nsresult> {
        let endpoint = Url::parse(&endpoint.to_utf8()).map_err(|_| NS_ERROR_INVALID_ARG)?;

        let credentials = server.get_credentials()?;

        self.details
            .set(EwsConnectionDetails {
                endpoint,
                credentials,
            })
            .map_err(|_| NS_ERROR_ALREADY_INITIALIZED)?;

        Ok(())
    }

    xpcom_method!(sync_folder_hierarchy => SyncFolderHierarchy(callbacks: *const IEwsFolderCallbacks, sync_state: *const nsACString));
    fn sync_folder_hierarchy(
        &self,
        callbacks: &IEwsFolderCallbacks,
        sync_state: &nsACString,
    ) -> Result<(), nsresult> {
        // We can't use `Option` across XPCOM, but we want to use one internally
        // so we don't send an empty string for sync state.
        let sync_state = if sync_state.is_empty() {
            None
        } else {
            Some(sync_state.to_utf8().into_owned())
        };

        let client = self.try_new_client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "sync_folder_hierarchy",
            client.sync_folder_hierarchy(RefPtr::new(callbacks), sync_state),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(change_read_status => ChangeReadStatus(
        aMessageIds: *const ThinVec<nsCString>,
        aIsRead: bool
    ));
    fn change_read_status(
        &self,
        message_ids: &ThinVec<nsCString>,  // Directly accept a reference
        is_read: bool,
    ) -> Result<(), nsresult> {
        // Convert `ThinVec<nsCString>` to `Vec<String>`
        let message_ids: Vec<String> = message_ids
            .iter()
            .map(|message_id| message_id.to_string())
            .collect();

        // Attempt to create the EWS client.
        let client = self.try_new_client()?;

        // Send the request asynchronously.
        moz_task::spawn_local(
            "mark_messages_read",
            client.change_read_status(message_ids, is_read),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(sync_messages_for_folder => SyncMessagesForFolder(callbacks: *const IEwsMessageCallbacks, folder_id: *const nsACString, sync_state: *const nsACString));
    fn sync_messages_for_folder(
        &self,
        callbacks: &IEwsMessageCallbacks,
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

        let client = self.try_new_client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "sync_messages_for_folder",
            client.sync_messages_for_folder(
                RefPtr::new(callbacks),
                folder_id.to_utf8().into_owned(),
                sync_state,
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(get_message => GetMessage(id: *const nsACString, request: *const nsIRequest, listener: *const nsIStreamListener));
    fn get_message(
        &self,
        id: &nsACString,
        request: &nsIRequest,
        listener: &nsIStreamListener,
    ) -> Result<(), nsresult> {
        let client = self.try_new_client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "get_message",
            client.get_message(
                id.to_utf8().into(),
                RefPtr::new(request),
                RefPtr::new(listener),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(save_message => SaveMessage(folder_id: *const nsACString, isDraft: bool, messageStream: *const nsIInputStream, copyListener: *const nsIMsgCopyServiceListener, messageCallbaks: *const IEwsMessageCallbacks));
    fn save_message(
        &self,
        folder_id: &nsACString,
        is_draft: bool,
        message_stream: &nsIInputStream,
        copy_listener: &nsIMsgCopyServiceListener,
        message_callbacks: &IEwsMessageCallbacks,
    ) -> Result<(), nsresult> {
        let content = crate::xpcom_io::read_stream(message_stream)?;

        let client = self.try_new_client()?;

        // The client operation is async and we want it to survive the end of
        // this scope, so spawn it as a detached `moz_task`.
        moz_task::spawn_local(
            "save_message",
            client.save_message(
                folder_id.to_utf8().into(),
                is_draft,
                content,
                RefPtr::new(copy_listener),
                RefPtr::new(message_callbacks),
            ),
        )
        .detach();

        Ok(())
    }

    /// Gets a new EWS client if initialized.
    fn try_new_client(&self) -> Result<XpComEwsClient, nsresult> {
        // We only get a reference out of the cell, but we need ownership in
        // order for the `XpcomEwsClient` to be `Send`, so we're forced to
        // clone.
        let EwsConnectionDetails {
            endpoint,
            credentials,
        } = self.details.get().ok_or(NS_ERROR_NOT_INITIALIZED)?.clone();

        Ok(XpComEwsClient {
            endpoint,
            credentials,
            client: moz_http::Client {},
        })
    }
}

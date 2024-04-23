/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate xpcom;

use std::{
    cell::{Cell, OnceCell},
    ffi::c_void,
    task::Waker,
};

use client::XpComEwsClient;
use futures::Future;
use nserror::{
    nsresult, NS_ERROR_ALREADY_INITIALIZED, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_INITIALIZED,
    NS_ERROR_UNEXPECTED, NS_OK,
};
use nsstring::nsACString;
use url::Url;
use xpcom::{
    interfaces::{IEwsFolderCallbacks, IEwsIncomingServer},
    nsIID, xpcom_method, RefPtr,
};

mod client;

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
    auth_source: RefPtr<IEwsIncomingServer>,
}

impl XpcomEwsBridge {
    xpcom_method!(initialize => Initialize(endpoint: *const nsACString, server: *const IEwsIncomingServer));
    fn initialize(
        &self,
        endpoint: &nsACString,
        server: &IEwsIncomingServer,
    ) -> Result<(), nsresult> {
        let endpoint = Url::parse(&endpoint.to_utf8()).map_err(|_| NS_ERROR_INVALID_ARG)?;

        self.details
            .set(EwsConnectionDetails {
                endpoint,
                auth_source: RefPtr::new(server),
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

    /// Gets a new EWS client if initialized.
    fn try_new_client(&self) -> Result<XpComEwsClient, nsresult> {
        // We only get a reference out of the cell, but we need ownership in
        // order for the `XpcomEwsClient` to be `Send`, so we're forced to
        // clone.
        let EwsConnectionDetails {
            endpoint,
            auth_source,
        } = self.details.get().ok_or(NS_ERROR_NOT_INITIALIZED)?.clone();

        Ok(XpComEwsClient {
            endpoint,
            auth_source,
            client: moz_http::Client {},
        })
    }
}

#[xpcom::xpcom(implement(IEwsAuthStringListener), atomic)]
struct AuthStringListener {
    result: OnceCell<Result<String, nsresult>>,
    waker: Cell<Option<Waker>>,
}

impl AuthStringListener {
    fn new() -> RefPtr<Self> {
        Self::allocate(InitAuthStringListener {
            result: Default::default(),
            waker: Default::default(),
        })
    }

    xpcom_method!(on_auth_available => OnAuthAvailable(auth_string: *const nsACString));
    fn on_auth_available(&self, auth_string: &nsACString) -> Result<(), nsresult> {
        let auth_string = String::from(auth_string.to_utf8());
        self.result
            .set(Ok(auth_string))
            .map_err(|_| NS_ERROR_UNEXPECTED)?;

        if let Some(waker) = self.waker.take() {
            waker.wake();
        }

        Ok(())
    }

    xpcom_method!(on_error => OnError(err: nsresult));
    fn on_error(&self, err: nsresult) -> Result<(), nsresult> {
        self.result.set(Err(err)).map_err(|_| NS_ERROR_UNEXPECTED)?;

        if let Some(waker) = self.waker.take() {
            waker.wake();
        }

        Ok(())
    }
}

impl Future for &AuthStringListener {
    type Output = Result<String, nsresult>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        match self.result.get() {
            Some(result) => {
                // Because `AuthStringListener` must be allocated by XPCOM in
                // order to pass it to XPCOM methods, we only have access to it
                // by immutable reference, so we're stuck getting a ref to the
                // `Result` and cloning.
                std::task::Poll::Ready(result.clone())
            }
            None => {
                self.waker.replace(Some(cx.waker().clone()));
                std::task::Poll::Pending
            }
        }
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{cell::RefCell, collections::HashMap, ffi::c_void};

use ews_xpcom::XpcomEwsBridge;
use graph_xpcom::XpcomGraphBridge;
use nserror::{NS_ERROR_INVALID_ARG, NS_ERROR_UNEXPECTED, NS_OK, nsresult};
use nsstring::{nsACString, nsCString};
use thin_vec::ThinVec;
use url::{Origin, Url};
use xpcom::{
    RefPtr, components,
    interfaces::{IExchangeClient, nsIMsgAccountManager, nsIMsgIncomingServer},
    nsIID, xpcom_method,
};

/// # SAFETY
/// `iid` must be a reference to a valid `nsIID` object, `result` must point to
/// valid memory, and `result` must not be used until the return value is
/// checked.
#[allow(non_snake_case)]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn NS_CreateProtocolClientService(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = ProtocolClientService::new();
    unsafe { instance.QueryInterface(iid, result) }
}

type ClientConstructor =
    fn(&nsACString, RefPtr<nsIMsgIncomingServer>) -> Result<RefPtr<IExchangeClient>, nsresult>;

#[xpcom::xpcom(implement(IProtocolClientService), atomic)]
pub struct ProtocolClientService {
    constructors: HashMap<String, ClientConstructor>,
    clients: RefCell<HashMap<String, RefPtr<IExchangeClient>>>,
    test_clients: RefCell<Vec<RefPtr<IExchangeClient>>>,
}

impl ProtocolClientService {
    // We need to explicitly allow trivial casts; the linter thinks the casts we
    // make when building `constructors` are superfluous because they can be
    // inferred from the function signatures, but without this cast the compiler
    // considers the functions as having different types even if their
    // signatures are the same.
    #![allow(trivial_casts)]
    fn new() -> RefPtr<ProtocolClientService> {
        let constructors = HashMap::from([
            (
                "graph".to_string(),
                XpcomGraphBridge::new_client as ClientConstructor,
            ),
            (
                "ews".to_string(),
                XpcomEwsBridge::new_client as ClientConstructor,
            ),
        ]);

        ProtocolClientService::allocate(InitProtocolClientService {
            constructors,
            clients: RefCell::new(HashMap::new()),
            test_clients: RefCell::new(Vec::new()),
        })
    }

    xpcom_method!(get_client => GetClient(
        protocol: *const nsACString,
        serverUrl: *const nsACString,
        username: *const nsACString
    ) -> *const IExchangeClient);
    fn get_client(
        &self,
        protocol: &nsACString,
        server_url: &nsACString,
        username: &nsACString,
    ) -> Result<RefPtr<IExchangeClient>, nsresult> {
        log::debug!(
            "get_client; protocol={protocol}, server_url={server_url}, username={username}"
        );

        // TODO: We should consider using `nsIMsgAccountManager::FindServer`
        // once https://bugzilla.mozilla.org/show_bug.cgi?id=2080906 is
        // addressed.
        let server = find_incoming_server(protocol, server_url, username)?;

        let mut key = nsCString::new();
        unsafe { server.GetKey(&raw mut *key) }.to_result()?;
        let key = key.to_string();

        log::debug!("get_client: found matching incoming server with key {key}");

        if let Some(client) = self.clients.borrow().get(&key).cloned() {
            log::debug!("get_client: using existing client for key {key}");
            return Ok(client);
        }

        let client = self.construct_client(protocol, server_url, server, &key)?;
        self.clients.borrow_mut().insert(key, client.clone());
        Ok(client)
    }

    xpcom_method!(shutdown_client => ShutdownClient(client: *const IExchangeClient));
    fn shutdown_client(&self, client: &IExchangeClient) -> Result<(), nsresult> {
        let client = RefPtr::new(client);

        let mut server_key = nsCString::new();
        unsafe { client.GetIncomingServerKey(&raw mut *server_key) }.to_result()?;
        let server_key = server_key.to_string();

        log::debug!("shutdown_client: shutting down client for key {server_key}");

        self.clients.borrow_mut().remove(&server_key);

        unsafe { client.Shutdown() }.to_result()?;
        Ok(())
    }

    xpcom_method!(create_test_client => CreateTestClient(
        protocol: *const nsACString,
        serverUrl: *const nsACString,
        server: *const nsIMsgIncomingServer
    ) -> *const IExchangeClient);
    fn create_test_client(
        &self,
        protocol: &nsACString,
        server_url: &nsACString,
        server: &nsIMsgIncomingServer,
    ) -> Result<RefPtr<IExchangeClient>, nsresult> {
        let server = RefPtr::new(server);

        let mut key = nsCString::new();
        unsafe { server.GetKey(&raw mut *key) }.to_result()?;
        let key = key.to_string();

        let client = self.construct_client(protocol, server_url, server, &key)?;
        self.test_clients.borrow_mut().push(client.clone());
        Ok(client)
    }

    xpcom_method!(shutdown_test_clients => ShutdownTestClients());
    fn shutdown_test_clients(&self) -> Result<(), nsresult> {
        self.test_clients
            .borrow()
            .iter()
            .map(|client| unsafe { client.Shutdown() }.to_result())
            .collect::<Result<Vec<_>, nsresult>>()?;

        self.test_clients.replace(Vec::new());

        Ok(())
    }

    /// Builds a client for the given server with the given configuration.
    fn construct_client(
        &self,
        protocol: &nsACString,
        server_url: &nsACString,
        server: RefPtr<nsIMsgIncomingServer>,
        server_key: &str,
    ) -> Result<RefPtr<IExchangeClient>, nsresult> {
        if let Some(constructor) = self.constructors.get(&protocol.to_string()) {
            log::debug!("construct_client: constructing new client for key {server_key}");
            let client = constructor(server_url, server)?;
            return Ok(client);
        }

        log::error!(
            "construct_client: cannot build client due to lack of existing constructor for protocol: {protocol}"
        );
        Err(NS_ERROR_INVALID_ARG)
    }
}

/// Finds an incoming server that matches the given protocol, URL and username.
///
/// URL comparison is performed unsing only the URLs' origins, not their full
/// form.
fn find_incoming_server(
    protocol: &nsACString,
    url: &nsACString,
    username: &nsACString,
) -> Result<RefPtr<nsIMsgIncomingServer>, nsresult> {
    let account_mgr = components::AccountManager::service::<nsIMsgAccountManager>()?;

    let mut servers = ThinVec::new();
    unsafe { account_mgr.GetAllServers(&raw mut servers) }.to_result()?;

    match servers
        .into_iter()
        // Filter out null pointers. They shouldn't happen (XPCOM forces us to
        // deal with this case because the server array might be coming from
        // C++), and we don't care about them if they do. `flatten()` here turns
        // each `Option` into an iterator that has either 0 or 1 item and
        // flattens them.
        .flatten()
        // Find the first server that matches our protocol and URL.
        .find(|server| {
            let mut server_type = nsCString::new();
            unsafe { server.GetType(&raw mut *server_type) };

            let mut server_url = nsCString::new();
            unsafe { server.GetStringValue(c"ews_url".as_ptr(), &raw mut *server_url) };

            let mut server_username = nsCString::new();
            unsafe { server.GetUsername(&raw mut *server_username) };

            // Check only the URL's origin, this way we still match if only one
            // of the URLs has e.g. a trailing slash or a path. Our Graph client
            // currently assumes we're always using version 1.0, so comparing
            // paths shouldn't be necessary.
            protocol == &*server_type
                && get_origin(url) == get_origin(server_url)
                && username == &*server_username
        }) {
        Some(server) => Ok(server),
        None => {
            log::debug!(
                "Could not find matching server; protocol={protocol}, url={url}, username={username}"
            );
            Err(NS_ERROR_UNEXPECTED)
        }
    }
}

/// Parses the provided string-like URL and returns its origin.
///
/// If the provided string cannot be parsed into a valid URL, this returns
/// [`None`].
fn get_origin<T: ToString>(url: T) -> Option<Origin> {
    let url = Url::parse(&url.to_string()).ok()?;
    Some(url.origin())
}

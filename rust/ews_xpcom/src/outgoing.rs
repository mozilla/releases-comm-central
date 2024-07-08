/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{OnceCell, RefCell};
use std::os::raw::{c_char, c_void};
use std::ptr;

use cstr::cstr;
use nserror::nsresult;
use nserror::NS_OK;
use nsstring::{nsACString, nsCString};
use url::Url;
use xpcom::{create_instance, getter_addrefs, nsIID};
use xpcom::{
    interfaces::{
        msgIOAuth2Module, nsIFile, nsIFileInputStream, nsIIOService, nsIMsgIdentity,
        nsIMsgStatusFeedback, nsIMsgWindow, nsIRequestObserver, nsIURI, nsIUrlListener,
        nsMsgAuthMethodValue, nsMsgSocketTypeValue,
    },
    xpcom_method, RefPtr,
};

use crate::authentication::credentials::AuthenticationProvider;
use crate::client::XpComEwsClient;

#[no_mangle]
pub unsafe extern "C" fn nsEwsOutgoingServerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = EwsOutgoingServer::new();
    instance.QueryInterface(iid, result)
}

#[xpcom::xpcom(implement(nsIMsgOutgoingServer, nsIEwsServer), atomic)]
pub struct EwsOutgoingServer {
    key: RefCell<nsCString>,
    uid: RefCell<nsCString>,
    description: RefCell<nsCString>,
    username: RefCell<nsCString>,
    password: RefCell<nsCString>,
    display_name: RefCell<nsCString>,
    auth_method: RefCell<nsMsgAuthMethodValue>,
    socket_type: RefCell<nsMsgSocketTypeValue>,
    ews_url: OnceCell<Url>,
}

impl EwsOutgoingServer {
    pub fn new() -> RefPtr<Self> {
        EwsOutgoingServer::allocate(InitEwsOutgoingServer {
            key: RefCell::new(nsCString::new()),
            uid: RefCell::new(nsCString::new()),
            description: RefCell::new(nsCString::new()),
            username: RefCell::new(nsCString::new()),
            password: RefCell::new(nsCString::new()),
            display_name: RefCell::new(nsCString::new()),
            auth_method: Default::default(),
            socket_type: Default::default(),
            ews_url: Default::default(),
        })
    }

    ///////////////////////////////////////////////////////////
    // Getters / setters for nsIMsgOutgoingServer attributes //
    ///////////////////////////////////////////////////////////

    // Key
    xpcom_method!(key => GetKey() -> nsACString);
    fn key(&self) -> Result<nsCString, nsresult> {
        let key = self.key.borrow().clone();
        Ok(key)
    }

    xpcom_method!(set_key => SetKey(key: *const nsACString));
    fn set_key(&self, key: &nsACString) -> Result<(), nsresult> {
        self.key.borrow_mut().assign(key);
        Ok(())
    }

    // UID
    xpcom_method!(uid => GetUID() -> nsACString);
    fn uid(&self) -> Result<nsCString, nsresult> {
        let uid = self.uid.borrow().clone();
        Ok(uid)
    }

    xpcom_method!(set_uid => SetUID(uid: *const nsACString));
    fn set_uid(&self, uid: &nsACString) -> Result<(), nsresult> {
        self.uid.borrow_mut().assign(uid);
        Ok(())
    }

    // Type
    xpcom_method!(server_type => GetType() -> nsACString);
    fn server_type(&self) -> Result<nsCString, nsresult> {
        Ok(nsCString::from("ews"))
    }

    // Description
    xpcom_method!(description => GetDescription() -> nsACString);
    fn description(&self) -> Result<nsCString, nsresult> {
        let description = self.description.borrow().clone();
        Ok(description)
    }

    xpcom_method!(set_description => SetDescription(description: *const nsACString));
    fn set_description(&self, description: &nsACString) -> Result<(), nsresult> {
        self.description.borrow_mut().assign(description);
        Ok(())
    }

    // Username
    xpcom_method!(username => GetUsername() -> nsACString);
    fn username(&self) -> Result<nsCString, nsresult> {
        let username = self.username.borrow().clone();
        Ok(username)
    }

    xpcom_method!(set_username => SetUsername(username: *const nsACString));
    fn set_username(&self, username: &nsACString) -> Result<(), nsresult> {
        self.username.borrow_mut().assign(username);
        Ok(())
    }

    // Password
    xpcom_method!(password => GetPassword() -> nsACString);
    fn password(&self) -> Result<nsCString, nsresult> {
        let password = self.password.borrow().clone();
        Ok(password)
    }

    xpcom_method!(set_password => SetPassword(password: *const nsACString));
    fn set_password(&self, password: &nsACString) -> Result<(), nsresult> {
        self.password.borrow_mut().assign(password);
        Ok(())
    }

    // Display name
    xpcom_method!(display_name => GetDisplayname() -> nsACString);
    fn display_name(&self) -> Result<nsCString, nsresult> {
        let display_name = self.display_name.borrow().clone();
        Ok(display_name)
    }

    xpcom_method!(set_display_name => SetDisplayname(display_name: *const nsACString));
    fn set_display_name(&self, display_name: &nsACString) -> Result<(), nsresult> {
        self.display_name.borrow_mut().assign(display_name);
        Ok(())
    }

    // Auth method
    xpcom_method!(auth_method => GetAuthMethod() -> nsMsgAuthMethodValue);
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        let auth_method = self.auth_method.borrow().clone();
        Ok(auth_method)
    }

    xpcom_method!(set_auth_method => SetAuthMethod(auth_method: nsMsgAuthMethodValue));
    fn set_auth_method(&self, auth_method: nsMsgAuthMethodValue) -> Result<(), nsresult> {
        self.auth_method.replace(auth_method);
        Ok(())
    }

    // Socket Type
    xpcom_method!(socket_type => GetSocketType() -> nsMsgSocketTypeValue);
    fn socket_type(&self) -> Result<nsMsgSocketTypeValue, nsresult> {
        let socket_type = self.socket_type.borrow().clone();
        Ok(socket_type)
    }

    xpcom_method!(set_socket_type => SetSocketType(socket_type: nsMsgSocketTypeValue));
    fn set_socket_type(&self, socket_type: nsMsgSocketTypeValue) -> Result<(), nsresult> {
        self.socket_type.replace(socket_type);
        Ok(())
    }

    // Server URI
    xpcom_method!(server_uri => GetServerURI() -> *const nsIURI);
    fn server_uri(&self) -> Result<RefPtr<nsIURI>, nsresult> {
        let ews_url = self.ews_url.get();
        let ews_url = ews_url.ok_or_else(|| {
            log::error!(
                "tried retrieving a URI for the server before initializing it with an EWS URL"
            );
            Err::<(), _>(nserror::NS_ERROR_NOT_INITIALIZED)
        })?;

        let url = nsCString::from(ews_url.as_str());

        let io_service =
            xpcom::get_service::<nsIIOService>(cstr!("@mozilla.org/network/io-service;1"))
                .ok_or(nserror::NS_ERROR_FAILURE)?;

        getter_addrefs(|p| unsafe { io_service.NewURI(&*url, ptr::null(), ptr::null(), p) })
    }

    // Maximum number of connections
    xpcom_method!(max_connections_number => GetMaximumConnectionsNumber() -> i32);
    fn max_connections_number(&self) -> Result<i32, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(set_max_connections_number => SetMaximumConnectionsNumber(max_connections_number: i32));
    fn set_max_connections_number(&self, _max_connections_number: i32) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    //////////////////////////////////////
    // Methods for nsIMsgOutgoingServer //
    //////////////////////////////////////

    xpcom_method!(forget_password => ForgetPassword());
    fn forget_password(&self) -> Result<(), nsresult> {
        self.password.replace(nsCString::new());
        Ok(())
    }

    xpcom_method!(send_mail => SendMailMessage(
        aFilePath: *const nsIFile,
        aRecipients: *const nsACString,
        aSenderIdentity: *const nsIMsgIdentity,
        aSender: *const nsACString,
        aPassword: *const nsACString,
        aStatusListener: *const nsIMsgStatusFeedback,
        aRequestDSN: bool,
        aMessageId: *const nsACString,
        aObserver: *const nsIRequestObserver
    ));
    fn send_mail(
        &self,
        file_path: &nsIFile,
        _recipients: &nsACString,
        _sender_identity: &nsIMsgIdentity,
        _sender: &nsACString,
        _password: &nsACString,
        _status_listener: &nsIMsgStatusFeedback,
        should_request_dsn: bool,
        message_id: &nsACString,
        observer: &nsIRequestObserver,
    ) -> Result<(), nsresult> {
        let message_content = read_file(file_path)?;
        let message_content =
            String::from_utf8(message_content).or(Err(nserror::NS_ERROR_FAILURE))?;

        // Ensure the URL is properly set.
        let url = self
            .ews_url
            .get()
            .ok_or_else(|| {
                log::error!("EwsOutgoingServer::SendMailMessage: EWS URL not set");
                nserror::NS_ERROR_NOT_INITIALIZED
            })?
            .clone();

        let credentials = self.get_credentials()?;

        // Set up the client to build and send the request.
        let client = XpComEwsClient {
            endpoint: url,
            credentials,
            client: moz_http::Client::new(),
        };

        // Send the request asynchronously.
        moz_task::spawn_local(
            "send_mail",
            client.send_message(
                message_content,
                message_id.to_utf8().into(),
                should_request_dsn,
                RefPtr::new(observer),
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(close_cached_connections => CloseCachedConnections());
    fn close_cached_connections(&self) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(clear_all => ClearAllValues());
    fn clear_all(&self) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(get_password_with_ui => GetPasswordWithUI(
        promptString: *const nsACString,
        promptTitle: *const nsACString
    ) -> nsACString);
    fn get_password_with_ui(
        &self,
        _prompt_string: *const nsACString,
        _prompt_title: *const nsACString,
    ) -> Result<nsACString, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(verify_logon => VerifyLogon(
        aUrlListener: *const nsIUrlListener,
        aMsgWindow: *const nsIMsgWindow
    ) -> *const nsIURI);
    fn verify_logon(
        &self,
        _url_listener: &nsIUrlListener,
        _window: &nsIMsgWindow,
    ) -> Result<RefPtr<nsIURI>, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    /////////////////////////////////
    // nsIEwsServer implementation //
    /////////////////////////////////

    xpcom_method!(initialize => Initialize(ews_url: *const nsACString));
    fn initialize(&self, ews_url: &nsACString) -> Result<(), nsresult> {
        let ews_url = ews_url.to_string();
        let ews_url = Url::parse(&ews_url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

        self.ews_url
            .set(ews_url)
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))
    }
}

// Make it possible to create an Auth from this server's attributes.
impl AuthenticationProvider for &EwsOutgoingServer {
    fn username(&self) -> Result<nsCString, nsresult> {
        Ok(self.username.borrow().clone())
    }

    fn password(&self) -> Result<nsCString, nsresult> {
        Ok(self.password.borrow().clone())
    }

    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        Ok(self.auth_method.borrow().clone())
    }

    fn oauth2_module(&self) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(c"@mozilla.org/mail/oauth2-module;1").ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe { oauth2_module.InitFromOutgoing(self.coerce(), &mut oauth2_supported) }
            .to_result()?;

        Ok(oauth2_supported.then_some(oauth2_module))
    }
}

/// Open the file provided and read its content into a vector of bytes.
fn read_file(file: &nsIFile) -> Result<Vec<u8>, nsresult> {
    let file_stream =
        create_instance::<nsIFileInputStream>(cstr!("@mozilla.org/network/file-input-stream;1"))
            .ok_or(nserror::NS_ERROR_FAILURE)?;

    // Open a stream from the file, and figure out how many bytes can be read
    // from it.
    let mut bytes_available = 0;
    unsafe {
        file_stream
            .Init(file, -1, -1, nsIFileInputStream::CLOSE_ON_EOF)
            .to_result()?;

        file_stream.Available(&mut bytes_available)
    }
    .to_result()?;

    // `nsIInputStream::Available` reads into a u64, but `nsIInputStream::Read`
    // takes a u32.
    let bytes_available = <u32>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?;

    let mut read_sink: Vec<u8> =
        vec![0; <usize>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?];

    // The amount of bytes actually read from the stream.
    let mut bytes_read: u32 = 0;

    // SAFETY: The call contract from `nsIInputStream::Read` guarantees that the
    // bytes written into the provided buffer is of type c_char (char* in
    // C-land) and is contiguous for the length it writes in `bytes_read`; and
    // that `bytes_read` is not greater than `bytes_available`.
    unsafe {
        let read_ptr = read_sink.as_mut_ptr();

        file_stream
            .Read(read_ptr as *mut c_char, bytes_available, &mut bytes_read)
            .to_result()?;
    };

    let bytes_read = <usize>::try_from(bytes_read).or(Err(nserror::NS_ERROR_FAILURE))?;
    Ok(Vec::from(&read_sink[..bytes_read]))
}

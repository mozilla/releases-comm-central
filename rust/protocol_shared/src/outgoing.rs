/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{OnceCell, RefCell};
use std::ffi::CString;
use std::sync::Arc;

use thin_vec::ThinVec;

use nserror::{NS_OK, nsresult};
use nsstring::{nsACString, nsCString, nsString};
use url::Url;
use uuid::Uuid;
use xpcom::components;
use xpcom::interfaces::nsIObserverService;
use xpcom::{
    RefPtr, get_service, getter_addrefs,
    interfaces::{
        msgIAddressObject, msgIPasswordAuthModule, nsIFile, nsIMsgIdentity, nsIMsgOutgoingListener,
        nsIMsgProgress, nsIMsgWindow, nsIPrefBranch, nsIPrefService, nsIURI, nsIUrlListener,
        nsMsgAuthMethodValue, nsMsgSocketType, nsMsgSocketTypeValue,
    },
    xpcom_method,
};

use crate::client::ProtocolClient;
use crate::observers::OutgoingRemovalObserver;
use crate::safe_xpcom::{SafeMsgOutgoingListener, uri::SafeUri};
use crate::xpcom_io;

/// An protocol client that can send a message via email.
///
/// This is a supertrait to [`ProtocolClient`] for protocols that support
/// sending messages, e.g. send-only protocols or protocols that support both
/// receiving and sending messages).
#[allow(async_fn_in_trait)]
pub trait SendCapableClient: ProtocolClient {
    async fn send_message(
        self: Arc<Self>,
        mime_content: String,
        message_id: String,
        should_request_dsn: bool,
        bcc_recipients: Vec<OwnedMailbox>,
        listener: SafeMsgOutgoingListener,
        server_uri: SafeUri,
    );
}

/// An owned version of [`Mailbox`], used to represent a recipient for an
/// outgoing message.
///
/// [`Mailbox`]: crate::headers::Mailbox
#[derive(Debug, Clone)]
pub struct OwnedMailbox {
    pub name: Option<String>,
    pub email_address: Option<String>,
}

/// Whether a field is required to have a value (either in memory or in a pref)
/// upon access.
///
/// A required field is typically a field involved in gathering credentials for
/// authentication, in which case we want to error early rather than knowingly
/// use invalid data.
enum FieldType {
    Required,
    Optional,
}

/// The name of a pref used to store a value that's part of an outgoing server's
/// configuration. It can be turned into a [`CString`] to be used with methods
/// from [`nsIPrefBranch`].
#[derive(Debug, Clone, Copy)]
enum PrefName {
    Key,
    Uid,
    Description,
    Username,
    AuthMethod,
    EwsUrl,
}

impl From<PrefName> for CString {
    fn from(value: PrefName) -> Self {
        match value {
            PrefName::Key => c"key",
            PrefName::Uid => c"uid",
            PrefName::Description => c"description",
            PrefName::Username => c"username",
            PrefName::AuthMethod => c"auth_method",
            PrefName::EwsUrl => c"ews_url",
        }
        .into()
    }
}

#[xpcom::xpcom(implement(nsIMsgOutgoingServer, IExchangeOutgoingServer), atomic)]
pub struct OutgoingServer<ClientT: SendCapableClient + 'static> {
    key: OnceCell<nsCString>,
    uid: OnceCell<nsCString>,
    description: RefCell<Option<nsCString>>,
    username: RefCell<Option<nsCString>>,
    password_module: RefCell<RefPtr<msgIPasswordAuthModule>>,
    auth_method: RefCell<Option<nsMsgAuthMethodValue>>,
    endpoint_url: OnceCell<Url>,
    pref_branch: OnceCell<RefPtr<nsIPrefBranch>>,
    client: OnceCell<Arc<ClientT>>,
    client_constructor: fn(&OutgoingServer<ClientT>) -> Result<ClientT, nsresult>,
}

#[allow(clippy::too_many_arguments)]
impl<ClientT: SendCapableClient> OutgoingServer<ClientT> {
    /// Construct a new `OutgoingServer`.
    ///
    /// # About `client_constructor`
    ///
    /// This is a function that is called only once, the first time the
    /// `OutgoingServer` requires a client to send a message.
    ///
    /// When the `OutgoingServer` is being removed (either because of manual
    /// user action, or because Thunderbird is shutting down),
    /// [`ProtocolClient::shutdown`] is called on the resulting client.
    ///
    /// The `OutgoingServer` keeps a reference on the resulting client so it can
    /// reuse it as is necessary. This means that, if the client being
    /// constructed is expected to keep a reference on the `OutgoingServer`, it
    /// should drop that reference upon shutdown to avoid memory leaks.
    pub fn new(
        client_constructor: fn(&OutgoingServer<ClientT>) -> Result<ClientT, nsresult>,
    ) -> Result<RefPtr<Self>, nsresult> {
        let password_module = xpcom::get_service::<msgIPasswordAuthModule>(
            c"@mozilla.org/mail/password-auth-module;1",
        )
        .ok_or(Err::<(), nsresult>(nserror::NS_ERROR_FAILURE))?;

        Ok(OutgoingServer::allocate(InitOutgoingServer {
            key: Default::default(),
            uid: Default::default(),
            description: Default::default(),
            username: Default::default(),
            password_module: RefCell::new(password_module),
            auth_method: Default::default(),
            endpoint_url: Default::default(),
            pref_branch: Default::default(),
            client: Default::default(),
            client_constructor,
        }))
    }

    /// Retrieves the existing client, or creates it if there isn't one.
    // We use `Arc` here because some methods from `ProtocolClient` require the
    // client to be wrapped into one. We *could* use `Rc` here since none of our
    // clients are `Send`, but that's something we hope to address in the
    // future.
    #[allow(clippy::arc_with_non_send_sync)]
    fn client(&self) -> Result<Arc<ClientT>, nsresult> {
        let client = match self.client.get() {
            Some(client) => client.clone(),
            None => {
                // Set up the client to build and send the request.
                let client = (self.client_constructor)(self)?;
                let client = Arc::new(client);

                // Register the observer that will take care of shutting down
                // the client if the server gets removed.
                let key = self.key()?;
                let obs = OutgoingRemovalObserver::new_observer(client.clone(), key.to_string())?;
                let observer_service = components::Observer::service::<nsIObserverService>()?;
                unsafe {
                    observer_service.AddObserver(
                        obs.coerce(),
                        c"message-smtpserver-removed".as_ptr(),
                        false,
                    )
                }
                .to_result()?;

                // We don't need to check the result because this only runs if
                // no client was set yet.
                let _ = self.client.set(client.clone());

                client
            }
        };

        Ok(client)
    }

    /// Retrieves the pref branch for this server, or initializes it if it isn't
    /// already.
    ///
    /// The root to use for looking up the pref branch needs to include the
    /// server's key, so this function will error with
    /// [`NS_ERROR_NOT_INITIALIZED`] if the key isn't set yet.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn pref_branch(&self) -> Result<RefPtr<nsIPrefBranch>, nsresult> {
        // In the future we should be able to do this with `get_or_try_init`,
        // once it has stabilized and we have a suitable MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let branch = match self.pref_branch.get() {
            Some(branch) => branch.clone(),
            None => {
                // Build the pref root from the key, if set. The root should be
                // in the format `mail.outgoingserver.protocolX.` - note the trailing
                // period.
                let key = self.key.get().ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;
                let pref_root = format!("mail.outgoingserver.{key}.");
                let pref_root = CString::new(pref_root).or(Err(nserror::NS_ERROR_FAILURE))?;

                // Retrieve the branch for our root from the pref service.
                let pref_svc = get_service::<nsIPrefService>(c"@mozilla.org/preferences-service;1")
                    .ok_or(nserror::NS_ERROR_FAILURE)?;

                let pref_branch =
                    getter_addrefs(unsafe { |p| pref_svc.GetBranch(pref_root.as_ptr(), p) })?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the branch wasn't already set.
                _ = self.pref_branch.set(pref_branch.clone());

                pref_branch
            }
        };

        Ok(branch)
    }

    /// Reads a string value from a [`RefCell`]. If this failed, reads the value
    /// from the given pref, and set as the [`RefCell`]'s value, before
    /// returning it.
    ///
    /// If no value could be read for the pref, the [`RefCell`] is left
    /// unchanged. If the field is required to have a value upon access, the
    /// error [`NS_ERROR_NOT_INITIALIZED`] is returned; otherwise an empty
    /// string (i.e. the default value for a string pref) is returned.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn string_pref_getter(
        &self,
        field: &RefCell<Option<nsCString>>,
        pref_name: PrefName,
        field_type: FieldType,
    ) -> Result<nsCString, nsresult> {
        if let Some(value) = field.borrow().as_ref() {
            return Ok(value.clone());
        }

        if let Some(value) = self.read_string_pref(pref_name)? {
            field.replace(Some(value.clone()));
            return Ok(value);
        }

        match field_type {
            FieldType::Required => {
                log::error!("missing required property: {pref_name:?}");
                Err(nserror::NS_ERROR_NOT_INITIALIZED)
            }
            FieldType::Optional => Ok(nsCString::new()),
        }
    }

    /// Reads an integer value from a [`RefCell`]. If this failed, reads the
    /// value from the given pref, and set as the [`RefCell`]'s value, before
    /// returning it.
    ///
    /// If no value could be read for the pref, the [`RefCell`] is left
    /// unchanged. If the field is required to have a value upon access, the
    /// error [`NS_ERROR_NOT_INITIALIZED`] is returned; otherwise `0` (i.e. the
    /// default value for an integer pref) is returned.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn int_pref_getter(
        &self,
        field: &RefCell<Option<i32>>,
        pref_name: PrefName,
        field_type: FieldType,
    ) -> Result<i32, nsresult> {
        if let Some(value) = field.borrow().as_ref() {
            return Ok(*value);
        }

        if let Some(value) = self.read_int_pref(pref_name)? {
            field.replace(Some(value));
            return Ok(value);
        }

        match field_type {
            FieldType::Required => {
                log::error!("missing required property: {pref_name:?}");
                Err(nserror::NS_ERROR_NOT_INITIALIZED)
            }
            FieldType::Optional => Ok(0),
        }
    }

    /// Set the pref with the given name to the given string value, and store
    /// that value in the provided [`RefCell`].
    fn string_pref_setter(
        &self,
        field: &RefCell<Option<nsCString>>,
        pref_name: PrefName,
        value: &nsACString,
    ) -> Result<(), nsresult> {
        self.store_string_pref(pref_name, value)?;
        field.replace(Some(value.into()));

        Ok(())
    }

    /// Set the pref with the given name to the given integer value, and store
    /// that value in the provided [`RefCell`].
    fn int_pref_setter(
        &self,
        field: &RefCell<Option<i32>>,
        pref_name: PrefName,
        value: i32,
    ) -> Result<(), nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();
        unsafe { branch.SetIntPref(pref_name.as_ptr(), value) }.to_result()?;

        field.replace(Some(value));

        Ok(())
    }

    /// Reads the value for a string pref with the given name.
    ///
    /// If no pref is set with this name, `None` is returned.
    fn read_string_pref(&self, pref_name: PrefName) -> Result<Option<nsCString>, nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();

        // Note: the documentation of `GetCharPref` mentions that it only reads
        // ASCII values. However, this is only relevant for JS, where the
        // method's return type (`ACString`) dictates that each byte is
        // interpreted as latin1 characters. For native code (including Rust),
        // we just get a string made from raw bytes read from the prefs file, so
        // we don't need to worry about the encoding as long as we got it right
        // when storing the value.
        let mut value = nsCString::new();
        match unsafe { branch.GetCharPref(pref_name.as_ptr(), &raw mut *value) }.to_result() {
            Ok(_) => (),
            Err(rv) => match rv {
                // `GetCharPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => return Ok(None),
                _ => return Err(rv),
            },
        }

        Ok(Some(value))
    }

    /// Reads the value for an integer pref with the given name.
    ///
    /// If no pref is set with this name, `None` is returned.
    fn read_int_pref(&self, pref_name: PrefName) -> Result<Option<i32>, nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();

        let mut value: i32 = 0;
        match unsafe { branch.GetIntPref(pref_name.as_ptr(), &raw mut value) }.to_result() {
            Ok(_) => (),
            Err(rv) => match rv {
                // `GetIntPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => return Ok(None),
                _ => return Err(rv),
            },
        }

        Ok(Some(value))
    }

    /// Set the given pref with the provided string value.
    fn store_string_pref(&self, pref_name: PrefName, value: &nsACString) -> Result<(), nsresult> {
        let branch = self.pref_branch()?;

        let pref_name: CString = pref_name.into();
        unsafe { branch.SetStringPref(pref_name.as_ptr(), value) }.to_result()
    }

    /// Retrieves the parsed endpoint URL.
    ///
    /// If no copy of the URL can be read from memory, the URL is read from the
    /// related pref and parsed.
    ///
    /// If no value could be read from prefs, errors with
    /// [`NS_ERROR_NOT_INITIALIZED`].
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    pub fn endpoint_url(&self) -> Result<Url, nsresult> {
        let url = match self.endpoint_url.get() {
            Some(url) => url.clone(),
            None => {
                let url = self
                    .read_string_pref(PrefName::EwsUrl)?
                    .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?
                    .to_string();

                let url = Url::parse(url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the URL wasn't already set.
                _ = self.endpoint_url.set(url.clone());

                url
            }
        };

        Ok(url)
    }

    ///////////////////////////////////////////////////////////
    // Getters / setters for nsIMsgOutgoingServer attributes //
    ///////////////////////////////////////////////////////////

    // Key
    xpcom_method!(key => GetKey() -> nsACString);
    fn key(&self) -> Result<nsCString, nsresult> {
        // Try to get the server's key from memory, or read it from prefs (and
        // set it) if it hasn't been set yet. In the future we should be able to
        // do this with `get_or_try_init`, once it has stabilized and we have a
        // suitable MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let key = self.key.get();

        let key = match key {
            Some(key) => key.clone(),
            None => {
                let key = self
                    .read_string_pref(PrefName::Key)?
                    .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the key wasn't already set.
                _ = self.key.set(key.clone());

                key
            }
        };

        Ok(key)
    }

    xpcom_method!(set_key => SetKey(key: *const nsACString));
    fn set_key(&self, key: &nsACString) -> Result<(), nsresult> {
        self.key
            .set(key.into())
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::Key, key)
    }

    // UID
    xpcom_method!(uid => GetUID() -> nsACString);
    fn uid(&self) -> Result<nsCString, nsresult> {
        // Try to get the UID from memory, or read it from prefs (and set it) if
        // it hasn't been set yet. In the future we should be able to do this
        // with `get_or_try_init`, once it has stabilized and we have a suitable
        // MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let uid = self.uid.get();

        let uid = match uid {
            Some(uid) => uid.clone(),
            None => {
                let uid = match self.read_string_pref(PrefName::Uid)? {
                    Some(uid) => uid,
                    None => {
                        // If no UID has been generated for this server yet,
                        // generate one and store it to the server's prefs, then
                        // return it.
                        let uid = Uuid::new_v4().hyphenated().to_string();
                        let uid = nsCString::from(uid);
                        self.store_string_pref(PrefName::Uid, &uid)?;
                        uid
                    }
                };

                // We don't need to check whether the return value is an error,
                // since this code only runs if the UID wasn't already set.
                _ = self.uid.set(uid.clone());

                uid
            }
        };

        Ok(uid)
    }

    xpcom_method!(set_uid => SetUID(uid: *const nsACString));
    fn set_uid(&self, uid: &nsACString) -> Result<(), nsresult> {
        self.uid
            .set(uid.into())
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::Uid, uid)
    }

    // Type
    xpcom_method!(server_type => GetType() -> nsACString);
    fn server_type(&self) -> Result<nsCString, nsresult> {
        let client = self.client()?;
        Ok(client.protocol_identifier().into())
    }

    // Description
    xpcom_method!(description => GetDescription() -> nsACString);
    fn description(&self) -> Result<nsCString, nsresult> {
        self.string_pref_getter(
            &self.description,
            PrefName::Description,
            FieldType::Optional,
        )
    }

    xpcom_method!(set_description => SetDescription(description: *const nsACString));
    fn set_description(&self, description: &nsACString) -> Result<(), nsresult> {
        self.string_pref_setter(&self.description, PrefName::Description, description)
    }

    // Username
    xpcom_method!(username => GetUsername() -> nsACString);
    fn username(&self) -> Result<nsCString, nsresult> {
        self.string_pref_getter(&self.username, PrefName::Username, FieldType::Required)
    }

    xpcom_method!(set_username => SetUsername(username: *const nsACString));
    fn set_username(&self, username: &nsACString) -> Result<(), nsresult> {
        self.string_pref_setter(&self.username, PrefName::Username, username)
    }

    // Password
    xpcom_method!(password => GetPassword() -> nsACString);
    fn password(&self) -> Result<nsCString, nsresult> {
        // Check to see if the password auth module has cached the password.
        let mut password = nsCString::new();
        unsafe {
            self.password_module
                .borrow()
                .GetCachedPassword(&raw mut *password)
        }
        .to_result()?;
        if !password.is_empty() {
            return Ok(password);
        }

        // Otherwise, ask it to look it up in the login manager.
        let username = self.username()?;
        let protocol = self.client()?.protocol_identifier();

        let endpoint_url = self.endpoint_url()?;
        let hostname = match endpoint_url.host() {
            Some(hostname) => hostname.to_string(),
            None => {
                log::error!(
                    "cannot get host from invalid endpoint URI: {}",
                    endpoint_url.as_str()
                );
                return Err(nserror::NS_ERROR_FAILURE);
            }
        };

        unsafe {
            self.password_module
                .borrow()
                .QueryPasswordFromManagerAndCache(
                    &raw const *username,
                    &raw const *nsCString::from(hostname),
                    &raw const *nsCString::from(protocol),
                    &raw mut *password,
                )
        }
        .to_result()?;

        // We don't check if the password is empty or not, because it looks like
        // `nsMsgIncomingServer`'s implementation is to return an empty string
        // if it cannot find a matching login; so we match this behaviour for
        // consistency.
        Ok(password)
    }

    xpcom_method!(set_password => SetPassword(password: *const nsACString));
    fn set_password(&self, password: &nsACString) -> Result<(), nsresult> {
        unsafe { self.password_module.borrow().SetCachedPassword(password) }.to_result()
    }

    // Display name
    xpcom_method!(display_name => GetDisplayname() -> nsACString);
    fn display_name(&self) -> Result<nsCString, nsresult> {
        let endpoint_url = self.endpoint_url()?;
        let hostname = endpoint_url
            .host_str()
            .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;
        Ok(nsCString::from(hostname))
    }

    // Auth method
    xpcom_method!(auth_method => GetAuthMethod() -> nsMsgAuthMethodValue);
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        self.int_pref_getter(&self.auth_method, PrefName::AuthMethod, FieldType::Required)
    }

    xpcom_method!(set_auth_method => SetAuthMethod(auth_method: nsMsgAuthMethodValue));
    fn set_auth_method(&self, auth_method: nsMsgAuthMethodValue) -> Result<(), nsresult> {
        self.int_pref_setter(&self.auth_method, PrefName::AuthMethod, auth_method)
    }

    // Socket Type
    xpcom_method!(socket_type => GetSocketType() -> nsMsgSocketTypeValue);
    fn socket_type(&self) -> Result<nsMsgSocketTypeValue, nsresult> {
        let endpoint_url = self.endpoint_url()?;
        let scheme = endpoint_url.scheme();

        match scheme {
            "https" => Ok(nsMsgSocketType::SSL),
            "http" => Ok(nsMsgSocketType::plain),
            _ => Err(nserror::NS_ERROR_UNKNOWN_PROTOCOL),
        }
    }

    xpcom_method!(set_socket_type => SetSocketType(socket_type: nsMsgSocketTypeValue));
    fn set_socket_type(&self, _socket_type: nsMsgSocketTypeValue) -> Result<(), nsresult> {
        log::error!(
            "OutgoingServer: tried calling SetSocketType, but the socket type can only be changed by changing the endpoint URL"
        );
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    // Server URI
    xpcom_method!(server_uri => GetServerURI() -> *const nsIURI);
    fn server_uri(&self) -> Result<RefPtr<nsIURI>, nsresult> {
        self.safe_server_uri().map(std::convert::Into::into)
    }

    fn safe_server_uri(&self) -> Result<SafeUri, nsresult> {
        let url = self.endpoint_url()?;
        SafeUri::new(url.as_str())
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
        let username = self.username()?;
        let server_type = self.server_type()?;
        let endpoint_url = self.endpoint_url()?;
        let host = endpoint_url.host().ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        unsafe {
            self.password_module.borrow().ForgetPassword(
                &raw const *username,
                &raw const *nsCString::from(host.to_string()),
                &raw const *server_type,
            )
        };

        Ok(())
    }

    xpcom_method!(send_mail => SendMailMessage(
        aFilePath: *const nsIFile,
        aRecipients: *const ThinVec<Option<RefPtr<msgIAddressObject>>>,
        aBccRecipients: *const ThinVec<Option<RefPtr<msgIAddressObject>>>,
        aSenderIdentity: *const nsIMsgIdentity,
        aSender: *const nsACString,
        aPassword: *const nsACString,
        aStatusListener: *const nsIMsgProgress,
        aRequestDSN: bool,
        aMessageId: *const nsACString,
        aListener: *const nsIMsgOutgoingListener
    ));
    fn send_mail(
        &self,
        file_path: &nsIFile,
        _recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        bcc_recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        _sender_identity: &nsIMsgIdentity,
        _sender: &nsACString,
        _password: &nsACString,
        _status_listener: Option<&nsIMsgProgress>,
        should_request_dsn: bool,
        message_id: &nsACString,
        listener: &nsIMsgOutgoingListener,
    ) -> Result<(), nsresult> {
        let message_content = xpcom_io::read_file(file_path)?;
        let message_content =
            String::from_utf8(message_content).or(Err(nserror::NS_ERROR_FAILURE))?;

        // Turn each msgIAddressObject into an `OwnedMailbox`.
        let bcc_recipients = bcc_recipients
            .iter()
            .map(|item| {
                // Filter out potential null pointers in the array.
                let addr_obj = item.as_ref().ok_or(nserror::NS_ERROR_NULL_POINTER)?;

                let mut address = nsString::new();
                let mut name = nsString::new();

                unsafe { addr_obj.GetEmail(&raw mut *address) }.to_result()?;
                unsafe { addr_obj.GetName(&raw mut *name) }.to_result()?;

                // The name is an optional part of the recipient, in which case,
                // the string we get across the XPCOM boundary will be empty.
                // However, in Rust-land we want this optionality to be
                // represented by an `Option`.
                let name = if !name.is_empty() {
                    Some(name.to_string())
                } else {
                    None
                };

                Ok(OwnedMailbox {
                    name,
                    email_address: Some(address.to_string()),
                })
            })
            .collect::<Result<Vec<OwnedMailbox>, nsresult>>()?;

        let client = self.client()?;

        // Send the request asynchronously.
        moz_task::spawn_local(
            "send_mail",
            client.send_message(
                message_content,
                message_id.to_utf8().into(),
                should_request_dsn,
                bcc_recipients,
                SafeMsgOutgoingListener::new(listener),
                self.safe_server_uri()?,
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

    // Using `xpcom_method!` isn't possible here, because we might need to
    // forward `NS_MSG_PASSWORD_PROMPT_CANCELLED` from the password module if
    // the user cancels. Since this status code is a success, and
    // `xpcom_method!` essentially overwrites all successes with `NS_OK`, we'd
    // lose an important bit of information in the process.
    #[allow(non_snake_case)]
    unsafe fn GetPasswordWithUI(
        &self,
        promptString: *const nsACString,
        promptTitle: *const nsACString,
        retval: *mut nsACString,
    ) -> nsresult {
        match unsafe { self.get_password_with_ui(promptString, promptTitle) } {
            Ok(new_password) => match new_password {
                Some(new_password) => {
                    unsafe {
                        (*retval).assign(&new_password);
                    }
                    NS_OK
                }
                None => nserror::NS_MSG_PASSWORD_PROMPT_CANCELLED,
            },
            Err(err) => err,
        }
    }

    /// Prompts the user for a password.
    ///
    /// Returns `Ok(None)` if the user cancelled the prompt.
    unsafe fn get_password_with_ui(
        &self,
        prompt_string: *const nsACString,
        prompt_title: *const nsACString,
    ) -> Result<Option<nsCString>, nsresult> {
        let username = self.username()?;
        let server_type = self.server_type()?;
        let endpoint_url = self.endpoint_url()?;

        let host = endpoint_url.host();
        if let Some(host) = host {
            let mut password = nsCString::new();
            let status = unsafe {
                self.password_module.borrow().QueryPasswordFromUserAndCache(
                    &raw const *username,
                    &raw const *nsCString::from(host.to_string()),
                    &raw const *server_type,
                    &raw const *prompt_string,
                    &raw const *prompt_title,
                    &raw mut *password,
                )
            };

            let password = if status == nserror::NS_MSG_PASSWORD_PROMPT_CANCELLED {
                // The user has cancelled the password prompt.
                // `NS_MSG_PASSWORD_PROMPT_CANCELLED` is a success, and as , so we need
                // to turn it into an error so the operation is properly
                // aborted.
                None
            } else {
                // We know the status code isn't a success we care about, now
                // check if it's an error we should propagate.
                status.to_result()?;
                Some(password)
            };

            Ok(password)
        } else {
            Err(nserror::NS_ERROR_UNEXPECTED)
        }
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

    ////////////////////////////////////////////
    // IExchangeOutgoingServer implementation //
    ////////////////////////////////////////////

    xpcom_method!(initialize => Initialize(endpoint_url: *const nsACString));
    fn initialize(&self, endpoint_url: &nsACString) -> Result<(), nsresult> {
        let key = self.key()?;

        log::debug!("Creating new outgoing server for {endpoint_url} ({key})");
        let url = endpoint_url.to_string();
        let url = Url::parse(url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

        self.endpoint_url
            .set(url)
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::EwsUrl, endpoint_url)
    }
}

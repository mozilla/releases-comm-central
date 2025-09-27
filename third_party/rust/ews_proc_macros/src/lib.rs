use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Ident, ItemStruct};

/// Annotate a struct as having its response include response messages of the given type,
/// and generate a response struct for it with the expected attributes and methods.
///
/// Response structs are named by appending "Response" to the end of the name of this struct.
#[proc_macro_attribute]
pub fn operation_response(attr: TokenStream, annotated_item: TokenStream) -> TokenStream {
    let response_type = parse_macro_input!(attr as Ident);
    let input_struct = parse_macro_input!(annotated_item as ItemStruct);

    let request_name = input_struct.ident.clone();
    let response_name = Ident::new(&format!("{request_name}Response"), request_name.span());

    let response_doc = format!(
        r#"A response to a [`{request_name}`] operation.

See <https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/{}>"#,
        response_name.to_string().to_ascii_lowercase()
    );
    let response_doc_attr = quote! { #[doc = #response_doc] };

    let expanded = quote! {
        #input_struct

        impl crate::Operation for #request_name {
            type Response = #response_name;
            const NAME: &'static str = stringify!(#request_name);
        }

        impl crate::types::sealed::EnvelopeBodyContents for #request_name {
            const NAME: &'static str = stringify!(#request_name);
        }

        #response_doc_attr
        #[derive(Clone, Debug, serde::Deserialize, PartialEq, Eq)]
        #[serde(rename_all = "PascalCase")]
        pub struct #response_name {
            pub response_messages: crate::ResponseMessages<#response_type>,
        }

        impl crate::OperationResponse for #response_name {
            type Message = #response_type;
            fn response_messages(&self) -> &[crate::ResponseClass<Self::Message>] {
                self.response_messages.response_messages.as_slice()
            }
            fn into_response_messages(self) -> Vec<crate::ResponseClass<Self::Message>> {
                self.response_messages.response_messages
            }
        }

        impl crate::types::sealed::EnvelopeBodyContents for #response_name {
            const NAME: &'static str = stringify!(#response_name);
        }
    };

    TokenStream::from(expanded)
}

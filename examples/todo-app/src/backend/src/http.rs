use std::{io::Cursor, str::FromStr};

use bhttp::{Message, Mode, StatusCode};
use ic_http_certification::{HttpRequest, HttpResponse, Method};

pub fn decode_args<'a>(bytes: Vec<u8>) -> HttpRequest<'a> {
    let mut cursor = Cursor::new(bytes);
    let msg = Message::read_bhttp(&mut cursor).unwrap();
    let content = msg.content().to_vec();

    let control = msg.control();
    let (method_bytes, path_bytes) = match control {
        bhttp::ControlData::Request {
            method,
            scheme: _,
            authority: _,
            path,
        } => (method, path),
        _ => panic!("Expected request, got response"),
    };

    let method_str = String::from_utf8_lossy(method_bytes);
    let path_str = String::from_utf8_lossy(path_bytes);

    let headers: Vec<(String, String)> = msg
        .header()
        .iter()
        .map(|field| {
            (
                String::from_utf8_lossy(field.name()).to_string(),
                String::from_utf8_lossy(field.value()).to_string(),
            )
        })
        .collect();

    HttpRequest::builder()
        .with_url(path_str.to_string())
        .with_method(Method::from_str(&method_str).unwrap())
        .with_headers(headers)
        .with_body(content)
        .build()
}

pub fn encode_result(res: HttpResponse) -> Vec<u8> {
    let status = StatusCode::try_from(res.status_code().as_u16()).unwrap();
    let mut msg = Message::response(status);

    for (header_name, header_value) in res.headers() {
        msg.put_header(header_name.as_bytes(), header_value.as_bytes());
    }

    if res.upgrade().unwrap_or(false) {
        msg.put_header(b"ic-upgrade", b"true");
    }

    msg.write_content(res.body());

    let mut encoded = Vec::new();
    msg.write_bhttp(Mode::KnownLength, &mut encoded).unwrap();
    encoded
}

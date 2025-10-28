use std::{io::Cursor, str::FromStr};

use http_bytes::{
    http::{HeaderValue, Response, Version, header::HeaderName},
    parse_request_header_easy, write_response_header,
};
use ic_http_certification::{HttpRequest, HttpResponse, Method};

pub fn decode_args<'a>(bytes: Vec<u8>) -> HttpRequest<'a> {
    let (request, body) = parse_request_header_easy(&bytes).unwrap().unwrap();
    let (parts, _) = request.into_parts();

    HttpRequest::builder()
        .with_url(parts.uri.path().to_string())
        .with_method(Method::from_str(parts.method.as_str()).unwrap())
        .with_headers(
            parts
                .headers
                .iter()
                .map(|h| (h.0.to_string(), h.1.to_str().unwrap().to_string()))
                .collect(),
        )
        .with_body(body.to_vec())
        .build()
}

pub fn encode_result(res: HttpResponse) -> Vec<u8> {
    let mut res_builder = Response::builder();
    {
        let headers = res_builder.headers_mut().unwrap();
        for (header_name, header_value) in res.headers() {
            headers.insert(
                HeaderName::from_str(&header_name).unwrap(),
                HeaderValue::from_str(&header_value).unwrap(),
            );
        }

        if res.upgrade().unwrap_or(false) {
            headers.insert(
                HeaderName::from_str("ic-upgrade").unwrap(),
                HeaderValue::from_str("true").unwrap(),
            );
        }
    }
    let response = res_builder
        .status(res.status_code().as_u16())
        .version(Version::HTTP_11)
        .body(res.body())
        .unwrap();

    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut bytes);
    write_response_header(&response, &mut cursor).unwrap();
    std::io::Write::write_all(&mut cursor, response.body()).unwrap();

    bytes
}

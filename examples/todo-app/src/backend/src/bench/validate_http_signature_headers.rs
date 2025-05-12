use std::hint::black_box;

use canbench_rs::bench;
use ic_http_auth::validate_http_signature_headers;
use ic_http_certification::{HttpRequest, Method};

use super::golden::{parse_request, user_principal, HTTP_REQUEST_GET, HTTP_REQUEST_POST};

use crate::root_key::with_root_key;

fn assert_valid_request(request: &HttpRequest, root_key: &[u8], expected_method: Method) {
    assert_eq!(request.method(), expected_method);
    let validation_res = validate_http_signature_headers(request, root_key).unwrap();
    assert_eq!(validation_res.principal, user_principal());
}

#[bench(raw)]
fn validate_http_signature_headers_get() -> canbench_rs::BenchResult {
    let request = parse_request(HTTP_REQUEST_GET);

    with_root_key(|root_key| {
        let bench_result = canbench_rs::bench_fn(|| {
            let _ = black_box(validate_http_signature_headers(
                black_box(&request),
                black_box(root_key),
            ));
        });

        assert_valid_request(&request, root_key, Method::GET);

        bench_result
    })
}

#[bench(raw)]
fn validate_http_signature_headers_post() -> canbench_rs::BenchResult {
    let request = parse_request(HTTP_REQUEST_POST);

    with_root_key(|root_key| {
        let bench_result = canbench_rs::bench_fn(|| {
            let _ = black_box(validate_http_signature_headers(
                black_box(&request),
                black_box(root_key),
            ));
        });

        assert_valid_request(&request, root_key, Method::POST);

        bench_result
    })
}

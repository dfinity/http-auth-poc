mod api;
mod assets;
mod http;
mod router;
mod todo;

use api::ErrorResponse;
use assets::*;
use ic_cdk::*;
use ic_http_certification::{HttpRequest, HttpResponse};
use matchit::Router;
use once_cell::sync::OnceCell;
use router::MethodRouter;
use todo::*;

#[init]
fn init() {
    certify_all_assets();
}

#[post_upgrade]
fn post_upgrade() {
    certify_all_assets();
}

#[query(decode_with = "http::decode_args", encode_with = "http::encode_result")]
fn http_request(req: HttpRequest) -> HttpResponse<'static> {
    let path = req.get_path().expect("Failed to parse request path");

    if path.starts_with("/api") {
        // [TODO] - return metrics on query
        return HttpResponse::builder().with_upgrade(true).build();
    }

    serve_asset(&req)
}

#[update(decode_with = "http::decode_args", encode_with = "http::encode_result")]
fn http_request_update(req: HttpRequest) -> HttpResponse<'static> {
    let path = req.get_path().expect("Failed to parse request path");

    if path.starts_with("/api") {
        return serve_api_route(&req);
    }

    ErrorResponse::bad_request("Update calls not allowed for certified static assets".to_string())
}

fn serve_api_route(req: &HttpRequest) -> HttpResponse<'static> {
    let router = get_api_router();
    let path = req.get_path().expect("Failed to parse request path");

    let route_match = router.at(&path);
    ic_cdk::println!(
        "[serve_api_route] Route match result: {:?}",
        route_match.is_ok()
    );

    let Ok(handler) = route_match else {
        ic_cdk::println!("[serve_api_route] No route found for path: {}", path);

        // Log the specific matchit error
        match route_match.err().unwrap() {
            matchit::MatchError::NotFound => {
                ic_cdk::println!("[serve_api_route] Error: Path not found in router");
            }
        }

        return HttpResponse::not_found(b"Not Found", vec![]).build();
    };

    handler.value.route(req, &handler.params)
}

fn get_api_router() -> &'static Router<MethodRouter> {
    static API_ROUTER: OnceCell<Router<MethodRouter>> = OnceCell::new();

    API_ROUTER.get_or_init(|| {
        let mut router = Router::new();

        router
            .insert(
                "/api/todos",
                MethodRouter::new()
                    .get(list_todo_items_handler)
                    .post(create_todo_item_handler)
                    .build(),
            )
            .unwrap();

        router
            .insert(
                "/api/todos/{id}",
                MethodRouter::new()
                    .get(get_todo_item_handler)
                    .patch(update_todo_item_handler)
                    .put(update_todo_item_handler)
                    .delete(delete_todo_item_handler)
                    .build(),
            )
            .unwrap();

        router
            .insert(
                "/api/metrics",
                MethodRouter::new().get(serve_metrics).build(),
            )
            .unwrap();

        router
    })
}

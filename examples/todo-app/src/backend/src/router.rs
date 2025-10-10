use ic_http_certification::{HttpRequest, HttpResponse, Method};
use matchit::Params;
use std::collections::HashMap;

pub type RouteHandler = for<'a> fn(&'a HttpRequest, &'a Params) -> HttpResponse<'static>;

type MethodMap = HashMap<Method, RouteHandler>;

pub struct MethodRouter {
    routes: MethodMap,
}

impl MethodRouter {
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
        }
    }

    pub fn get(self, handler: RouteHandler) -> Self {
        self.add_route(Method::GET, handler)
    }

    pub fn post(self, handler: RouteHandler) -> Self {
        self.add_route(Method::POST, handler)
    }

    pub fn patch(self, handler: RouteHandler) -> Self {
        self.add_route(Method::PATCH, handler)
    }

    pub fn put(self, handler: RouteHandler) -> Self {
        self.add_route(Method::PUT, handler)
    }

    pub fn delete(self, handler: RouteHandler) -> Self {
        self.add_route(Method::DELETE, handler)
    }

    pub fn build(self) -> Self {
        self
    }

    pub fn route(&self, req: &HttpRequest, params: &Params) -> HttpResponse<'_> {
        let handler = self.routes.get(req.method()).unwrap();

        handler(req, params)
    }

    fn add_route(mut self, method: Method, handler: RouteHandler) -> Self {
        self.routes.insert(method, handler);

        self
    }
}

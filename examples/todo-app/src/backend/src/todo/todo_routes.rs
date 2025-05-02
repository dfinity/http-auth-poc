use super::todo_types::{
    CreateTodoItemRequest, CreateTodoItemResponse, DeleteTodoItemResponse, ListTodosResponse,
    ListTodosResponseBody, TodoItem, UpdateTodoItemRequest, UpdateTodoItemResponse,
};
use crate::{api::json_decode, root_key::with_root_key};
use ic_http_auth::validate_http_signature_headers;
use ic_http_certification::{HttpRequest, HttpResponse};
use matchit::Params;
use once_cell::sync::OnceCell;
use std::{cell::RefCell, collections::HashMap, sync::Mutex};

thread_local! {
    static NEXT_TODO_ID: RefCell<u32> = RefCell::new(0);
    static TODO_ITEMS: RefCell<UserTodoMap> = RefCell::<UserTodoMap>::new(UserTodoMap::new());
}

type TodoMap = HashMap<u32, TodoItem>;

type UserTodoMap = HashMap<String, TodoMap>;

fn todos() -> &'static Mutex<UserTodoMap> {
    static INSTANCE: OnceCell<Mutex<UserTodoMap>> = OnceCell::new();

    INSTANCE.get_or_init(|| Mutex::new(UserTodoMap::new()))
}

pub fn list_todo_items_handler(req: &HttpRequest, _params: &Params) -> HttpResponse<'static> {
    with_root_key(|root_key| {
        let jwt = validate_http_signature_headers(req, root_key).unwrap();

        let mut all_todos = todos().lock().unwrap();

        let user_todos = all_todos
            .entry(jwt.principal.to_text())
            .or_insert_with(HashMap::new)
            .iter()
            .map(|(_, todo)| todo.clone())
            .collect::<Vec<_>>();

        let data = ListTodosResponseBody {
            todos: user_todos,
            user_principal: jwt.principal,
        };

        ListTodosResponse::ok(data)
    })
}

pub fn create_todo_item_handler(req: &HttpRequest, _params: &Params) -> HttpResponse<'static> {
    with_root_key(|root_key| {
        let jwt = validate_http_signature_headers(req, root_key).unwrap();

        let req_body: CreateTodoItemRequest = json_decode(req.body());

        let id = NEXT_TODO_ID.with_borrow_mut(|f| {
            let id = *f;
            *f += 1;
            id
        });

        let todo_item = TodoItem {
            id,
            title: req_body.title,
            completed: false,
        };
        let mut all_todos = todos().lock().unwrap();
        all_todos
            .entry(jwt.principal.to_text())
            .or_insert_with(HashMap::new)
            .insert(id, todo_item.clone());

        CreateTodoItemResponse::created(todo_item)
    })
}

pub fn update_todo_item_handler(req: &HttpRequest, params: &Params) -> HttpResponse<'static> {
    with_root_key(|root_key| {
        let jwt = validate_http_signature_headers(req, root_key).unwrap();

        let req_body: UpdateTodoItemRequest = json_decode(req.body());
        let id: u32 = params.get("id").unwrap().parse().unwrap();

        let mut all_todos = todos().lock().unwrap();
        let item = all_todos
            .get_mut(&jwt.principal.to_text())
            .and_then(|todos| todos.get_mut(&id))
            // [TODO] - handle 404 case
            .unwrap();

        if let Some(title) = req_body.title {
            item.title = title;
        }

        if let Some(completed) = req_body.completed {
            item.completed = completed;
        }

        UpdateTodoItemResponse::ok(())
    })
}

pub fn delete_todo_item_handler(req: &HttpRequest, params: &Params) -> HttpResponse<'static> {
    with_root_key(|root_key| {
        let jwt = validate_http_signature_headers(req, root_key).unwrap();

        let id: u32 = params.get("id").unwrap().parse().unwrap();

        let mut all_todos = todos().lock().unwrap();
        all_todos
            .get_mut(&jwt.principal.to_text())
            .and_then(|todos| todos.remove(&id));

        DeleteTodoItemResponse::ok(())
    })
}

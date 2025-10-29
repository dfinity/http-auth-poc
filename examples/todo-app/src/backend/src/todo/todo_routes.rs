use super::todo_types::{
    CreateTodoItemRequest, CreateTodoItemResponse, DeleteTodoItemResponse, GetTodoItemResponse,
    ListTodosResponse, ListTodosResponseBody, TodoItem, UpdateTodoItemRequest,
    UpdateTodoItemResponse,
};
use crate::api::json_decode;
use ic_cdk::{api::msg_caller, println};
use ic_http_certification::{HttpRequest, HttpResponse};
use matchit::Params;
use once_cell::sync::OnceCell;
use std::{cell::RefCell, collections::HashMap, sync::Mutex};

thread_local! {
    static NEXT_TODO_ID: RefCell<u32> = const { RefCell::new(0) };
    static TODO_ITEMS: RefCell<UserTodoMap> = RefCell::<UserTodoMap>::new(UserTodoMap::new());
}

type TodoMap = HashMap<u32, TodoItem>;

type UserTodoMap = HashMap<String, TodoMap>;

fn todos() -> &'static Mutex<UserTodoMap> {
    static INSTANCE: OnceCell<Mutex<UserTodoMap>> = OnceCell::new();

    INSTANCE.get_or_init(|| Mutex::new(UserTodoMap::new()))
}

pub fn get_todo_item_handler(req: &HttpRequest, params: &Params) -> HttpResponse<'static> {
    println!("[get_todo_item_handler] Processing request: {:?}", req);
    let caller = msg_caller();

    println!("[get_todo_item_handler] User principal: {}", caller);

    let Some(id_str) = params.get("id") else {
        ic_cdk::println!("[get_todo_item_handler] Missing ID parameter");
        return HttpResponse::bad_request(b"Missing ID parameter", vec![]).build();
    };
    let Ok(id) = id_str.parse::<u32>() else {
        ic_cdk::println!("[get_todo_item_handler] Invalid ID format: {}", id_str);
        return HttpResponse::bad_request(b"Invalid ID format", vec![]).build();
    };
    let user_id = caller.to_text();

    let all_todos = todos().lock().unwrap();

    // Get the user's todos
    if let Some(user_todos) = all_todos.get(&user_id) {
        // Find the specific todo
        if let Some(todo) = user_todos.get(&id) {
            return GetTodoItemResponse::ok(todo.clone());
        }
    }

    // Todo not found
    HttpResponse::not_found(b"Todo item not found", vec![]).build()
}

pub fn list_todo_items_handler(_req: &HttpRequest, _params: &Params) -> HttpResponse<'static> {
    let caller = msg_caller();

    let mut all_todos = todos().lock().unwrap();

    let user_todos = all_todos
        .entry(caller.to_text())
        .or_default()
        .values()
        .cloned()
        .collect::<Vec<_>>();

    let data = ListTodosResponseBody {
        todos: user_todos,
        user_principal: caller,
    };

    ListTodosResponse::ok(data)
}

pub fn create_todo_item_handler(req: &HttpRequest, _params: &Params) -> HttpResponse<'static> {
    println!("[create_todo_item_handler] Processing request: {:?}", req);
    let caller = msg_caller();

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
        .entry(caller.to_text())
        .or_default()
        .insert(id, todo_item.clone());

    CreateTodoItemResponse::created(todo_item)
}

pub fn update_todo_item_handler(req: &HttpRequest, params: &Params) -> HttpResponse<'static> {
    ic_cdk::println!("[update_todo_item_handler] Starting handler");
    ic_cdk::println!(
        "[update_todo_item_handler] Method: {}, Path: {}",
        req.method(),
        req.get_path().unwrap_or(String::from("unknown"))
    );
    ic_cdk::println!("[update_todo_item_handler] All Params: {:?}", params);

    let caller = msg_caller();
    ic_cdk::println!(
        "[update_todo_item_handler] User principal: {}",
        caller.to_text()
    );

    // Parse the request body
    let req_body_result =
        std::panic::catch_unwind(|| json_decode::<UpdateTodoItemRequest>(req.body()));
    if req_body_result.is_err() {
        ic_cdk::println!("[update_todo_item_handler] Failed to parse request body");
        return HttpResponse::bad_request(b"Invalid request body", vec![]).build();
    }
    let req_body = req_body_result.unwrap();
    ic_cdk::println!("[update_todo_item_handler] Request body: {:?}", req_body);

    // Parse the ID parameter - update this to use "id" in curly braces per matchit docs
    let id_param = params.get("id");
    ic_cdk::println!("[update_todo_item_handler] ID parameter: {:?}", id_param);

    if id_param.is_none() {
        ic_cdk::println!("[update_todo_item_handler] Missing ID parameter");
        return HttpResponse::bad_request(b"Missing ID parameter", vec![]).build();
    }

    let id_parse_result = id_param.unwrap().parse::<u32>();
    if id_parse_result.is_err() {
        ic_cdk::println!(
            "[update_todo_item_handler] Invalid ID format: {}",
            id_param.unwrap()
        );
        return HttpResponse::bad_request(b"Invalid ID format", vec![]).build();
    }

    let id = id_parse_result.unwrap();
    ic_cdk::println!("[update_todo_item_handler] Todo ID: {}", id);

    let mut all_todos = todos().lock().unwrap();
    let user_todos = all_todos.get_mut(&caller.to_text());

    if user_todos.is_none() {
        ic_cdk::println!(
            "[update_todo_item_handler] No todos found for user: {}",
            caller.to_text()
        );
        return HttpResponse::not_found(b"Todo item not found", vec![]).build();
    }

    let todo_item = user_todos.unwrap().get_mut(&id);

    if todo_item.is_none() {
        ic_cdk::println!("[update_todo_item_handler] Todo with ID {} not found", id);
        return HttpResponse::not_found(b"Todo item not found", vec![]).build();
    }

    let item = todo_item.unwrap();

    if let Some(title) = req_body.title {
        item.title = title;
    }

    if let Some(completed) = req_body.completed {
        item.completed = completed;
    }

    UpdateTodoItemResponse::ok(())
}

pub fn delete_todo_item_handler(req: &HttpRequest, params: &Params) -> HttpResponse<'static> {
    ic_cdk::println!("[delete_todo_item_handler] Starting handler");
    ic_cdk::println!(
        "[delete_todo_item_handler] Method: {}, Path: {}",
        req.method(),
        req.get_path().unwrap_or(String::from("unknown"))
    );
    ic_cdk::println!("[delete_todo_item_handler] All Params: {:?}", params);

    let caller = msg_caller();

    let id: u32 = params.get("id").unwrap().parse().unwrap();

    let mut all_todos = todos().lock().unwrap();
    all_todos
        .get_mut(&caller.to_text())
        .and_then(|todos| todos.remove(&id));

    DeleteTodoItemResponse::ok(())
}

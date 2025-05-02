use crate::api::ApiResponse;
use candid::Principal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct TodoItem {
    pub id: u32,
    pub title: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTodoItemRequest {
    pub title: String,
}

pub type CreateTodoItemResponse = ApiResponse<TodoItem>;

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTodoItemRequest {
    pub title: Option<String>,
    pub completed: Option<bool>,
}

pub type UpdateTodoItemResponse = ApiResponse;

pub type DeleteTodoItemResponse = ApiResponse;

#[derive(Debug, Clone, Serialize)]
pub struct ListTodosResponseBody {
    pub todos: Vec<TodoItem>,
    pub user_principal: Principal,
}

pub type ListTodosResponse = ApiResponse<ListTodosResponseBody>;

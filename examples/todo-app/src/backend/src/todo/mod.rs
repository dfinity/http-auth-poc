mod todo_routes;
mod todo_types;

pub use todo_routes::*;

use ic_cdk::storage::{stable_restore, stable_save};
use std::collections::HashMap;
use todo_types::TodoItem;

type TodoMap = HashMap<u32, TodoItem>;
type UserTodoMap = HashMap<String, TodoMap>;

pub fn persist_data_pre_upgrade() {
    ic_cdk::println!("Saving todo data to stable storage...");
    let data = todo_routes::get_all_todos();
    match stable_save((data,)) {
        Ok(_) => ic_cdk::println!("Successfully saved todo data"),
        Err(e) => ic_cdk::println!("Error saving todo data: {:?}", e),
    }
}

pub fn persist_data_post_upgrade() {
    ic_cdk::println!("Restoring todo data from stable storage...");
    match stable_restore::<(UserTodoMap,)>() {
        Ok((data,)) => {
            todo_routes::set_all_todos(data);
            ic_cdk::println!("Successfully restored todo data");
        }
        Err(e) => ic_cdk::println!("Error restoring todo data: {:?}", e),
    }
}

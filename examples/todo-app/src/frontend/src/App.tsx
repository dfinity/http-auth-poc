import {
  createEffect,
  createResource,
  createSignal,
  Match,
  Suspense,
  Switch,
  type Component,
  For,
} from 'solid-js';
import { addHttpMessageSignatureToRequest } from '@dfinity/http-auth';
import { AuthClient } from '@dfinity/auth-client';
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
} from '@dfinity/identity';

import styles from './App.module.css';

const DFX_NETWORK = import.meta.env.DFX_NETWORK;
const CANISTER_ID_TODO_APP_BACKEND = import.meta.env
  .CANISTER_ID_TODO_APP_BACKEND;

type LoginResponse = {
  keyPair: CryptoKeyPair;
  delegationChain: DelegationChain;
};

type TodoItem = {
  id: number;
  title: string;
  completed: boolean;
  isOptimistic?: boolean;
  isDeleting?: boolean;
  isUpdating?: boolean;
};

async function createAuthClient(): Promise<AuthClient> {
  return await AuthClient.create({ keyType: 'ECDSA' });
}

function getIdentity(authClient: AuthClient): DelegationIdentity {
  return authClient.getIdentity() as DelegationIdentity;
}

function keyPairFromIdentity(identity: DelegationIdentity): CryptoKeyPair {
  return (identity['_inner'] as ECDSAKeyIdentity).getKeyPair();
}

function authFromAuthClient(
  authClient: AuthClient | undefined,
): LoginResponse | undefined {
  if (!authClient || !authClient.isAuthenticated()) {
    return undefined;
  }
  const identity = getIdentity(authClient);
  if (identity.getPrincipal().isAnonymous()) {
    return undefined;
  }
  const delegation = identity.getDelegation();
  return {
    keyPair: keyPairFromIdentity(identity),
    delegationChain: delegation,
  };
}

async function fetchTodos(auth: LoginResponse | undefined): Promise<any> {
  if (!auth) {
    return null;
  }

  const req = new Request('/api/todos');
  await addHttpMessageSignatureToRequest(
    req,
    auth.keyPair,
    CANISTER_ID_TODO_APP_BACKEND,
    auth.delegationChain,
  );

  const response = await fetch(req);
  const res = await response.json();
  return res.ok.data;
}

async function fetchTodoById(
  auth: LoginResponse | undefined,
  id: number,
): Promise<TodoItem | null> {
  if (!auth) {
    return null;
  }

  try {
    const req = new Request(`/api/todos/${id}`);
    await addHttpMessageSignatureToRequest(
      req,
      auth.keyPair,
      CANISTER_ID_TODO_APP_BACKEND,
      auth.delegationChain,
    );

    const response = await fetch(req);
    if (!response.ok) {
      console.error('Failed to fetch todo:', response.statusText);
      return null;
    }

    const result = await response.json();
    return result.ok.data;
  } catch (error) {
    console.error('Failed to fetch todo:', error);
    return null;
  }
}

async function createTodo(
  auth: LoginResponse | undefined,
  title: string,
): Promise<{ success: boolean; id?: number }> {
  if (!auth) {
    return { success: false };
  }

  try {
    const req = new Request('/api/todos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title.trim(),
      }),
    });
    await addHttpMessageSignatureToRequest(
      req,
      auth.keyPair,
      CANISTER_ID_TODO_APP_BACKEND,
      auth.delegationChain,
    );

    const response = await fetch(req);
    const result = await response.json();

    if (response.ok && result.ok) {
      console.log('Todo created successfully with ID:', result.ok.data.id);
      return { success: true, id: result.ok.data.id };
    }
    console.error('Failed to create todo. Server response:', result);
    return { success: false };
  } catch (error) {
    console.error('Failed to create todo:', error);
    return { success: false };
  }
}

async function toggleTodoCompleted(
  auth: LoginResponse | undefined,
  id: number,
  completed: boolean,
): Promise<boolean> {
  if (!auth) {
    return false;
  }

  console.log(
    `Toggling todo #${id} completed status from ${completed} to ${!completed}`,
  );
  try {
    const req = new Request(`/api/todos/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        completed: !completed,
      }),
    });
    await addHttpMessageSignatureToRequest(
      req,
      auth.keyPair,
      CANISTER_ID_TODO_APP_BACKEND,
      auth.delegationChain,
    );

    const response = await fetch(req);
    if (response.ok) {
      console.log(`Successfully toggled todo #${id}`);
      return true;
    } else {
      console.error(`Failed to toggle todo #${id}, status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('Failed to toggle todo:', error);
    return false;
  }
}

async function deleteTodo(
  auth: LoginResponse | undefined,
  id: number,
): Promise<boolean> {
  if (!auth) {
    return false;
  }

  console.log(`Deleting todo #${id}`);
  try {
    const req = new Request(`/api/todos/${id}`, {
      method: 'DELETE',
    });
    await addHttpMessageSignatureToRequest(
      req,
      auth.keyPair,
      CANISTER_ID_TODO_APP_BACKEND,
      auth.delegationChain,
    );

    const response = await fetch(req);
    if (response.ok) {
      console.log(`Successfully deleted todo #${id}`);
      return true;
    } else {
      console.error(`Failed to delete todo #${id}, status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('Failed to delete todo:', error);
    return false;
  }
}

async function loginWithII(
  authClient: AuthClient,
): Promise<LoginResponse | undefined> {
  return await new Promise((resolve, reject) => {
    authClient.login({
      identityProvider:
        DFX_NETWORK === 'ic'
          ? 'https://identity.internetcomputer.org'
          : 'http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000',
      onSuccess: () => {
        resolve(authFromAuthClient(authClient));
      },
      onError: error => {
        reject(error);
      },
    });
  });
}

const App: Component = () => {
  const [getAuthClient] = createResource<AuthClient>(createAuthClient);
  const [auth, setAuth] = createSignal<LoginResponse>();
  const [todos, { refetch: refetchTodos, mutate: mutateTodos }] =
    createResource(auth, fetchTodos);
  const [isCreateLoading, setIsCreateLoading] = createSignal(false);
  const [newTodoTitle, setNewTodoTitle] = createSignal('');
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  // Helper for optimistic updates
  const getNextTempId = (() => {
    let tempId = -1;
    return () => tempId--;
  })();

  // Refreshes a single todo by ID using the new endpoint
  const refreshSingleTodo = async (id: number) => {
    if (!auth() || id < 0) return; // Skip refreshing optimistic todos

    console.log(`Refreshing todo with ID: ${id}`);
    try {
      const todoData = await fetchTodoById(auth(), id);

      if (todoData) {
        console.log(`Successfully refreshed todo #${id}:`, todoData);

        // Update just this todo in the todos list
        mutateTodos(currentTodos => {
          if (!currentTodos) return currentTodos;

          return {
            ...currentTodos,
            todos: currentTodos.todos.map((todo: TodoItem) =>
              todo.id === id
                ? { ...todoData, isUpdating: false, isDeleting: false }
                : todo,
            ),
          };
        });
      } else {
        console.warn(`Todo with ID ${id} not found during refresh`);
      }
    } catch (error) {
      console.error(`Failed to refresh todo #${id}:`, error);
    }
  };

  createEffect(() => {
    // load auth status on render
    const authClient = getAuthClient();
    setAuth(authFromAuthClient(authClient));
  });

  // Clear error message after 5 seconds
  createEffect(() => {
    if (errorMessage()) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  return (
    <div class={styles.App}>
      <header>
        <h1>Http Auth Todo</h1>
      </header>

      <main>
        <Switch>
          <Match when={auth()}>
            <section class={styles.todoSection}>
              <h2>Your Todos</h2>

              {errorMessage() && (
                <p role="alert" class={styles.error}>
                  {errorMessage()}
                </p>
              )}

              <form
                class={styles.todoForm}
                onSubmit={e => {
                  e.preventDefault();
                  const title = newTodoTitle().trim();
                  if (!title) return;

                  setIsCreateLoading(true);

                  // Create a temporary ID for optimistic UI
                  const tempId = getNextTempId();

                  // Optimistically add the new todo
                  mutateTodos(prev => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      todos: [
                        ...prev.todos,
                        {
                          id: tempId,
                          title,
                          completed: false,
                          isOptimistic: true,
                        },
                      ],
                    };
                  });

                  setNewTodoTitle('');

                  // Actually create the todo on the server
                  createTodo(auth(), title).then(async result => {
                    setIsCreateLoading(false);

                    if (result.success && result.id !== undefined) {
                      console.log(
                        `Fetching newly created todo with ID: ${result.id}`,
                      );

                      // Get the real todo data with the correct ID
                      const newTodo = await fetchTodoById(auth(), result.id);

                      if (newTodo) {
                        console.log('Successfully fetched new todo:', newTodo);

                        // Replace the optimistic todo with the real one
                        mutateTodos(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            todos: prev.todos.map((todo: TodoItem) =>
                              todo.id === tempId
                                ? { ...newTodo, isOptimistic: false }
                                : todo,
                            ),
                          };
                        });
                      } else {
                        console.warn(
                          `Could not fetch todo with ID: ${result.id}, falling back to optimistic update`,
                        );

                        // If we couldn't fetch the new todo, just update the ID
                        mutateTodos(prev => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            todos: prev.todos.map((todo: TodoItem) =>
                              todo.id === tempId
                                ? {
                                    ...todo,
                                    id: result.id!,
                                    isOptimistic: false,
                                  }
                                : todo,
                            ),
                          };
                        });
                      }
                    } else {
                      // Remove the optimistic todo if creation failed
                      mutateTodos(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          todos: prev.todos.filter(
                            (todo: TodoItem) => todo.id !== tempId,
                          ),
                        };
                      });
                      setErrorMessage(
                        'Failed to create todo. Please try again.',
                      );
                    }
                  });
                }}
              >
                <label for="new-todo">Add new todo:</label>
                <div class={styles.todoInputGroup}>
                  <input
                    id="new-todo"
                    type="text"
                    value={newTodoTitle()}
                    onInput={e => setNewTodoTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    disabled={isCreateLoading()}
                    aria-disabled={isCreateLoading()}
                  />
                  <button
                    type="submit"
                    disabled={isCreateLoading() || !newTodoTitle().trim()}
                    aria-disabled={isCreateLoading() || !newTodoTitle().trim()}
                  >
                    {isCreateLoading() ? 'Adding...' : 'Add Todo'}
                  </button>
                </div>
              </form>

              <Suspense
                fallback={<p aria-live="polite">Loading your todos...</p>}
              >
                <Switch>
                  <Match when={todos.error}>
                    <p role="alert" class={styles.error}>
                      Error loading todos: {todos.error.toString()}
                    </p>
                  </Match>
                  <Match when={todos()}>
                    <ul class={styles.todoList} aria-label="Todo list">
                      <For each={todos().todos}>
                        {(todo: TodoItem) => (
                          <li
                            class={`${styles.todoItem} 
                                    ${todo.completed ? styles.completed : ''} 
                                    ${todo.isOptimistic ? styles.optimistic : ''} 
                                    ${todo.isDeleting ? styles.deleting : ''} 
                                    ${todo.isUpdating ? styles.updating : ''}`}
                          >
                            <div class={styles.todoContent}>
                              <input
                                type="checkbox"
                                id={`todo-${todo.id}`}
                                checked={todo.completed}
                                onChange={() => {
                                  // Only allow toggle if not optimistic
                                  if (todo.isOptimistic) return;

                                  // Optimistically update the completed status
                                  mutateTodos(prev => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      todos: prev.todos.map((t: TodoItem) =>
                                        t.id === todo.id
                                          ? {
                                              ...t,
                                              completed: !t.completed,
                                              isUpdating: true,
                                            }
                                          : t,
                                      ),
                                    };
                                  });

                                  // Actually update on the server
                                  toggleTodoCompleted(
                                    auth(),
                                    todo.id,
                                    todo.completed,
                                  ).then(async success => {
                                    if (!success) {
                                      // Revert to the original state if the update failed
                                      mutateTodos(prev => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          todos: prev.todos.map(
                                            (t: TodoItem) =>
                                              t.id === todo.id
                                                ? {
                                                    ...t,
                                                    completed: todo.completed,
                                                    isUpdating: false,
                                                  }
                                                : t,
                                          ),
                                        };
                                      });
                                      setErrorMessage(
                                        'Failed to update todo. Please try again.',
                                      );
                                    } else {
                                      // Success - refresh just this todo
                                      await refreshSingleTodo(todo.id);
                                    }
                                  });
                                }}
                                aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
                                disabled={
                                  todo.isOptimistic ||
                                  todo.isUpdating ||
                                  todo.isDeleting
                                }
                              />
                              <label
                                for={`todo-${todo.id}`}
                                class={
                                  todo.completed ? styles.completedText : ''
                                }
                              >
                                {todo.title}
                                {todo.isOptimistic && ' (saving...)'}
                              </label>
                            </div>
                            <button
                              class={styles.deleteBtn}
                              onClick={() => {
                                // Only allow delete if not optimistic
                                if (todo.isOptimistic) return;

                                // Optimistically mark as deleting
                                mutateTodos(prev => {
                                  if (!prev) return prev;
                                  return {
                                    ...prev,
                                    todos: prev.todos.map((t: TodoItem) =>
                                      t.id === todo.id
                                        ? { ...t, isDeleting: true }
                                        : t,
                                    ),
                                  };
                                });

                                // Actually delete on the server
                                deleteTodo(auth(), todo.id).then(
                                  async success => {
                                    if (success) {
                                      // Remove the deleted todo from the list
                                      mutateTodos(prev => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          todos: prev.todos.filter(
                                            (t: TodoItem) => t.id !== todo.id,
                                          ),
                                        };
                                      });
                                    } else {
                                      // Remove the isDeleting flag if deletion failed
                                      mutateTodos(prev => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          todos: prev.todos.map(
                                            (t: TodoItem) =>
                                              t.id === todo.id
                                                ? { ...t, isDeleting: false }
                                                : t,
                                          ),
                                        };
                                      });
                                      setErrorMessage(
                                        'Failed to delete todo. Please try again.',
                                      );
                                    }
                                  },
                                );
                              }}
                              aria-label={`Delete todo: ${todo.title}`}
                              disabled={todo.isOptimistic || todo.isDeleting}
                            >
                              {todo.isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          </li>
                        )}
                      </For>
                      {todos().todos.length === 0 && (
                        <li class={styles.emptyState}>
                          <p>No todos yet. Add one above!</p>
                        </li>
                      )}
                    </ul>
                  </Match>
                </Switch>
              </Suspense>

              <div class={styles.logoutContainer}>
                <button
                  class={styles.logoutBtn}
                  onClick={async () => {
                    const authClient = getAuthClient();
                    if (authClient) {
                      await authClient.logout();
                      setAuth(undefined);
                    }
                  }}
                >
                  Logout
                </button>
              </div>
            </section>
          </Match>
          <Match when={!auth()}>
            <section class={styles.loginSection}>
              <p>Please login to manage your todos.</p>
              <button
                class={styles.loginBtn}
                onClick={async () => {
                  const authClient = getAuthClient();
                  if (authClient) {
                    const res = await loginWithII(authClient);
                    setAuth(res);
                    // After login, fetch todos
                    await refetchTodos();
                  }
                }}
              >
                Login with Internet Identity
              </button>
            </section>
          </Match>
        </Switch>
      </main>

      <footer>
        <p>
          Todo App · <span aria-label="Copyright">©</span>{' '}
          {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
};

export default App;

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

async function createTodo(
  auth: LoginResponse | undefined,
  title: string,
): Promise<void> {
  if (!auth) {
    return;
  }

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

  await fetch(req);
}

async function toggleTodoCompleted(
  auth: LoginResponse | undefined,
  id: number,
  completed: boolean,
): Promise<void> {
  if (!auth) {
    return;
  }

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

  await fetch(req);
}

async function deleteTodo(
  auth: LoginResponse | undefined,
  id: number,
): Promise<void> {
  if (!auth) {
    return;
  }

  const req = new Request(`/api/todos/${id}`, {
    method: 'DELETE',
  });
  await addHttpMessageSignatureToRequest(
    req,
    auth.keyPair,
    CANISTER_ID_TODO_APP_BACKEND,
    auth.delegationChain,
  );

  await fetch(req);
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
  const [todos, { refetch: refetchTodos }] = createResource(auth, fetchTodos);
  const [isCreateLoading, setIsCreateLoading] = createSignal(false);
  const [newTodoTitle, setNewTodoTitle] = createSignal('');

  createEffect(() => {
    // load auth status on render
    const authClient = getAuthClient();
    setAuth(authFromAuthClient(authClient));
  });

  return (
    <div class={styles.App}>
      <header>
        <h1>Todo App</h1>
      </header>

      <main>
        <Switch>
          <Match when={auth()}>
            <section class={styles.todoSection}>
              <h2>Your Todos</h2>

              <form
                class={styles.todoForm}
                onSubmit={e => {
                  e.preventDefault();
                  if (!newTodoTitle().trim()) return;

                  setIsCreateLoading(true);
                  createTodo(auth(), newTodoTitle()).then(async () => {
                    setIsCreateLoading(false);
                    setNewTodoTitle('');
                    await refetchTodos();
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
                            class={`${styles.todoItem} ${todo.completed ? styles.completed : ''}`}
                          >
                            <div class={styles.todoContent}>
                              <input
                                type="checkbox"
                                id={`todo-${todo.id}`}
                                checked={todo.completed}
                                onChange={() => {
                                  toggleTodoCompleted(
                                    auth(),
                                    todo.id,
                                    todo.completed,
                                  ).then(refetchTodos);
                                }}
                                aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
                              />
                              <label
                                for={`todo-${todo.id}`}
                                class={
                                  todo.completed ? styles.completedText : ''
                                }
                              >
                                {todo.title}
                              </label>
                            </div>
                            <button
                              class={styles.deleteBtn}
                              onClick={() => {
                                deleteTodo(auth(), todo.id).then(refetchTodos);
                              }}
                              aria-label={`Delete todo: ${todo.title}`}
                            >
                              Delete
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

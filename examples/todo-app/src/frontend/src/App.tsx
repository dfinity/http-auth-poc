import {
  createResource,
  createSignal,
  Match,
  Show,
  Switch,
  type Component,
} from 'solid-js';
import { addHttpMessageSignatureToRequest } from '@dfinity/http-auth';

import styles from './App.module.css';
import { login, LoginResponse } from './internet-identity';

async function fetchTodos(auth?: LoginResponse): Promise<any> {
  if (!auth) {
    return null;
  }

  const req = new Request('/api/todos');
  await addHttpMessageSignatureToRequest(
    req,
    auth.keyPair,
    'bkyz2-fmaaa-aaaaa-qaaaq-cai',
    auth.delegationChain,
  );

  const response = await fetch(req);
  const res = await response.json();
  return res.ok.data;
}

async function createTodo(auth?: LoginResponse): Promise<void> {
  if (!auth) {
    return;
  }

  const req = new Request('/api/todos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'New todo',
    }),
  });
  await addHttpMessageSignatureToRequest(
    req,
    auth.keyPair,
    'bkyz2-fmaaa-aaaaa-qaaaq-cai',
    auth.delegationChain,
  );

  await fetch(req);
}

async function loginWithII(): Promise<LoginResponse> {
  const response = await login(
    'http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8000',
  );

  return response;
}

const App: Component = () => {
  const [auth, setAuth] = createSignal<LoginResponse>();
  const [todos, { refetch: refetchTodos }] = createResource(auth, fetchTodos);

  return (
    <div class={styles.App}>
      <Show when={todos.loading}>Loading todos...</Show>

      <Switch>
        <Match when={todos.error}>
          <span>Error loading todos: {todos.error.toString()}</span>
        </Match>
        <Match when={todos()}>
          <div>{JSON.stringify(todos())}</div>
        </Match>
      </Switch>

      <div>
        <button
          onClick={async () => {
            await createTodo(auth());
            await refetchTodos();
          }}
        >
          Create todo
        </button>
      </div>

      <div>
        <button
          onClick={async () => {
            const res = await loginWithII();
            setAuth(res);
          }}
        >
          Login with Internet Identity
        </button>
      </div>
    </div>
  );
};

export default App;

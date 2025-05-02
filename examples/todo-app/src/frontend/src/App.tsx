import {
  createEffect,
  createResource,
  createSignal,
  Match,
  Suspense,
  Switch,
  type Component,
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

async function createTodo(auth: LoginResponse | undefined): Promise<void> {
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

  createEffect(() => {
    // load auth status on render
    const authClient = getAuthClient();
    setAuth(authFromAuthClient(authClient));
  });

  return (
    <div class={styles.App}>
      <Switch>
        <Match when={auth()}>
          <Suspense fallback={<div>Loading todos...</div>}>
            <Switch>
              <Match when={todos.error}>
                <span>Error loading todos: {todos.error.toString()}</span>
              </Match>
              <Match when={todos()}>
                <div>{JSON.stringify(todos())}</div>
              </Match>
            </Switch>
          </Suspense>
          <div>
            <button
              onClick={async () => {
                setIsCreateLoading(true);
                await createTodo(auth());
                setIsCreateLoading(false);
                await refetchTodos();
              }}
              disabled={isCreateLoading()}
            >
              {isCreateLoading() ? 'Creating...' : 'Create todo'}
            </button>
          </div>
          <div>
            <button
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
        </Match>
        <Match when={!auth()}>
          <button
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
        </Match>
      </Switch>
    </div>
  );
};

export default App;

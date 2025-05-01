/// <reference types="vite/client" />

interface ViteTypeOptions {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  // strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
  readonly DFX_NETWORK: 'ic' | 'local';
  readonly CANISTER_ID_TODO_APP_BACKEND: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** biome-ignore-all lint/complexity/noBannedTypes: Type definition file */
/** biome-ignore-all lint/correctness/noUnusedVariables: Type definition file */
/// <reference types="vite/client" />

type ViteTypeOptions = {
  // By adding this line, you can make the type of ImportMetaEnv strict
  // to disallow unknown keys.
  // strictImportMetaEnv: unknown
};

interface ImportMetaEnv {
  readonly DFX_NETWORK: 'ic' | 'local';
  readonly CANISTER_ID_TODO_APP_BACKEND: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

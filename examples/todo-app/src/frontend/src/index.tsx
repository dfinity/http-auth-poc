/* @refresh reload */
import { render } from 'solid-js/web';

import './index.css';
import App from './App.jsx';

const root = document.getElementById('root') as HTMLElement;

if (import.meta.env.DEV && !root) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => <App />, root);

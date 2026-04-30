// Bootstrap Monaco synchronously on first import: registers our custom
// language, completion providers, and shares the bundled monaco instance
// with @monaco-editor/react. Side-effect-only import.
import './lib/monaco/bootstrap';

import { createRoot } from 'react-dom/client';
import App from './App';
import 'file-icons-js/css/style.css';

// @ts-ignore
// eslint-disable-next-line no-extend-native,func-names
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

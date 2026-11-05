import '@graphiql/react/setup-workers/vite';
import { createRoot } from 'react-dom/client';
import 'graphiql/style.css';
import './styles.css';
import { openSession } from '../persistence/session';
import { App } from './App';
const root = document.getElementById('root')!;
try {
  const controller = await openSession(orca);
  createRoot(root).render(<App host={orca} controller={controller} />);
} catch (error) {
  root.className = 'document-error';
  const title = document.createElement('h1'); title.textContent = 'Unable to open GraphiQL session';
  const message = document.createElement('p'); message.textContent = error instanceof Error ? error.message : 'Invalid session. Open Source to repair the file.';
  root.replaceChildren(title, message);
}

import { createRoot } from 'react-dom/client';

import App from './components/App';

createRoot(document.getElementById('content')!).render(<App name="James" />);

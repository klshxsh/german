import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import UnitOverview from './pages/UnitOverview';
import FlashcardSession from './pages/FlashcardSession';
import SentenceBuilder from './pages/SentenceBuilder';
import ClozeSession from './pages/ClozeSession';
import ProgressPage from './pages/ProgressPage';
import SettingsPage from './pages/SettingsPage';
import Layout from './components/Layout';

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'unit/:id', element: <UnitOverview /> },
      { path: 'unit/:id/flashcards', element: <FlashcardSession /> },
      { path: 'unit/:id/builder', element: <SentenceBuilder /> },
      { path: 'unit/:id/cloze', element: <ClozeSession /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

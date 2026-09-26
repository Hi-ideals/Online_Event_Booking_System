import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      // Do not retry client errors such as 403/404.
      retry: (count, error) => count < 2 && !(error?.response?.status >= 400 && error.response.status < 500),
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-center" toastOptions={{ duration: 3500, style: { fontSize: '14px', borderRadius: '10px' } }} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);

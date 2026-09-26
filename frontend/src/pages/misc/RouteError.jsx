import { TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import Button from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';

/** Shown when a page crashes, instead of React Router's developer error screen. */
export default function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <EmptyState
        icon={TriangleAlert}
        title={notFound ? 'Page not found' : 'Something went wrong'}
        description={notFound ? 'The page you are looking for does not exist.' : 'An unexpected error occurred. Please reload the page or go back home.'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload page</Button>
            <Button variant="secondary" onClick={() => (window.location.href = '/')}>
              Go home
            </Button>
          </div>
        }
      />
    </div>
  );
}

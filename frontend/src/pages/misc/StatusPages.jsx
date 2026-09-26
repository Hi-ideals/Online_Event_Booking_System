import { Compass, Hammer } from 'lucide-react';
import { useLocation } from 'react-router';
import Button from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/Feedback';
import useDocumentTitle from '../../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<Button to="/">Back to home</Button>}
      />
    </div>
  );
}

/** Placeholder for sections built in later frontend phases. */
export function ComingSoonPage() {
  const { pathname } = useLocation();
  useDocumentTitle('Coming soon');
  return (
    <EmptyState
      icon={Hammer}
      title="Coming soon"
      description={`This section (${pathname}) is being built in an upcoming phase.`}
      className="rounded-2xl bg-white ring-1 ring-slate-200"
    />
  );
}

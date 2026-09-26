import { Navigate, Outlet, useLocation } from 'react-router';
import { homePathFor, redirectAfterLogin, useAuth } from '../../context/AuthContext';
import { PageLoader } from '../ui/Spinner';

/**
 * Requires login, and optionally one of `roles`. Organizers must also be approved unless
 * `allowInactive` is set. The backend enforces the same rules; this only guides navigation.
 */
export function RequireAuth({ roles, allowInactive = false, children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <PageLoader label="Checking your session..." />;
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  if (!allowInactive && user.role === 'organizer' && user.status !== 'active') {
    return <Navigate to="/organizer/pending" replace />;
  }
  return children ?? <Outlet />;
}

/** For login/register: logged-in users are sent to their home page (or the redirect target). */
export function GuestOnly({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <PageLoader />;
  if (user) {
    const redirect = new URLSearchParams(location.search).get('redirect');
    return <Navigate to={redirectAfterLogin(user, redirect)} replace />;
  }
  return children ?? <Outlet />;
}

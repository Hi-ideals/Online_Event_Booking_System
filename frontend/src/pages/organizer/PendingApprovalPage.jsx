import { Clock3, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Navigate, useNavigate } from 'react-router';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Feedback';
import { useAuth } from '../../context/AuthContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getErrorMessage } from '../../lib/errors';

export default function PendingApprovalPage() {
  useDocumentTitle('Account under review');
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  if (user.status === 'active') return <Navigate to="/organizer" replace />;
  const rejected = user.status === 'rejected';

  const checkStatus = async () => {
    setChecking(true);
    try {
      const fresh = await refreshUser();
      if (fresh.status === 'active') {
        toast.success('You are approved! Welcome aboard.');
        navigate('/organizer', { replace: true });
      } else {
        toast('Still under review. We will email you once approved.', { icon: '⏳' });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-10">
      <Card className="w-full max-w-lg p-6 text-center sm:p-10">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${rejected ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
          {rejected ? <XCircle className="h-7 w-7" /> : <Clock3 className="h-7 w-7" />}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{rejected ? 'Application not approved' : 'Your account is under review'}</h1>
        <p className="mt-2 text-slate-500">
          {rejected
            ? 'Unfortunately we could not approve your organizer account.'
            : `Thanks for registering ${user.organizerProfile?.organizationName ?? ''}. Our team usually reviews new organizers within 1-2 working days.`}
        </p>
        {rejected && user.organizerProfile?.rejectionReason && (
          <Alert tone="error" title="Reason" className="mt-5 text-left">
            {user.organizerProfile.rejectionReason}
          </Alert>
        )}
        {!rejected && (
          <Alert tone="info" className="mt-5 text-left">
            Meanwhile, complete your organization and payout details so you are ready to sell tickets.
          </Alert>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!rejected && (
            <Button onClick={checkStatus} loading={checking} icon={RefreshCw}>
              Check status
            </Button>
          )}
          <Button to="/account" variant="secondary">
            Edit profile
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
}

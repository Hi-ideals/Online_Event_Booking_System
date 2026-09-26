import { useState } from 'react';
import Button from './Button';
import { Field, Textarea } from './Form';
import Modal from './Modal';

/**
 * Confirmation dialog for destructive or important actions.
 * With `reasonLabel`, a reason text box is shown and passed to onConfirm(reason).
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading = false,
  reasonLabel,
  reasonMinLength = 0,
}) {
  const [reason, setReason] = useState('');
  const close = () => {
    if (loading) return;
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>
            Go back
          </Button>
          <Button variant={tone} loading={loading} disabled={reason.trim().length < reasonMinLength} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        {children}
        {reasonLabel && (
          <Field label={reasonLabel} hint={reasonMinLength ? `At least ${reasonMinLength} characters` : undefined}>
            {({ id }) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />}
          </Field>
        )}
      </div>
    </Modal>
  );
}

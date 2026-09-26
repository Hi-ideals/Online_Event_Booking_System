import { Building2, CreditCard, Lock, ShieldAlert, Smartphone } from 'lucide-react';
import { useState } from 'react';
import cn from '../../lib/cn';
import { formatCurrency } from '../../lib/format';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

const METHODS = [
  { value: 'upi', label: 'UPI', icon: Smartphone, hint: 'Google Pay, PhonePe, Paytm' },
  { value: 'card', label: 'Card', icon: CreditCard, hint: 'Visa, Mastercard, RuPay' },
  { value: 'netbanking', label: 'Netbanking', icon: Building2, hint: 'All major banks' },
];

/**
 * Stand-in for the Razorpay checkout popup, used when the backend runs PAYMENT_PROVIDER=mock.
 * No card or bank details are collected; the tester simply picks the outcome.
 */
export default function MockGateway({ open, checkout, onClose, onResult, busy }) {
  const [method, setMethod] = useState('upi');
  if (!checkout) return null;

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Test payment"
      description={`Booking ${checkout.orderNumber}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onResult('failure')} disabled={busy} icon={ShieldAlert}>
            Simulate failure
          </Button>
          <Button variant="success" onClick={() => onResult('success')} loading={busy} icon={Lock}>
            Pay {formatCurrency(checkout.amount / 100, { free: false })}
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 p-4 text-white">
        <p className="text-xs uppercase tracking-wider text-slate-400">Amount to pay</p>
        <p className="mt-1 text-3xl font-bold">{formatCurrency(checkout.amount / 100, { free: false })}</p>
        <p className="mt-2 text-sm text-slate-300">
          {checkout.prefill?.name} &middot; {checkout.prefill?.email}
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium text-slate-700">Payment method</legend>
        <div className="space-y-2">
          {METHODS.map(({ value, label, icon: Icon, hint }) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 transition',
                method === value ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200 hover:ring-slate-300'
              )}
            >
              <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
              <Icon className={cn('h-5 w-5', method === value ? 'text-brand-600' : 'text-slate-400')} />
              <span className="flex-1">
                <span className="block text-sm font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
        Test mode: no money is charged. Choose <strong>Pay</strong> to simulate a successful payment or <strong>Simulate failure</strong> to see a declined payment.
      </p>
    </Modal>
  );
}

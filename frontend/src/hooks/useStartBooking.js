import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router';
import { bookingsApi } from '../api/bookings';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';

/**
 * Creates a booking (tickets are held while the attendee pays) and opens checkout.
 * Guests are sent to login first and brought back to this page.
 */
export default function useStartBooking(eventSlug) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // Stored in a ref so it runs before navigating away (per-call callbacks can be skipped once the page unmounts).
  const onBookedRef = useRef(null);

  const mutation = useMutation({
    mutationFn: bookingsApi.create,
    onSuccess: (booking) => {
      onBookedRef.current?.(booking);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      navigate(booking.status === 'confirmed' ? `/bookings/${booking.id}?new=1` : `/checkout/${booking.id}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      if (error.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['events', 'seats', eventSlug] });
        queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventSlug] });
      }
    },
  });

  /** onBooked runs after the booking is created (e.g. to clear a saved selection). */
  const start = (payload, { onBooked } = {}) => {
    if (!user) {
      toast('Log in to continue booking', { icon: '🔒' });
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (user.role !== 'attendee') {
      toast.error('Organizer and admin accounts cannot book tickets. Log in with an attendee account.');
      return;
    }
    onBookedRef.current = onBooked;
    mutation.mutate(payload);
  };

  return { start, isPending: mutation.isPending, canBook: !user || user.role === 'attendee' };
}

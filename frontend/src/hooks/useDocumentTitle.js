import { useEffect } from 'react';

export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | EventBooking` : 'EventBooking - Discover and book events';
  }, [title]);
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function subscribe() {
    setIsSubmitting(true);
    const response = await fetch('/api/subscribe', { method: 'POST', body: JSON.stringify({ email }) });
    setIsSubmitting(false);
    setHasError(!response.ok);
  }

  return (
    <form className="subscribe" onSubmit={e => { e.preventDefault(); subscribe(); }}>
      <label htmlFor="email" className="label">Email</label>
      <input id="email" className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <Button type="submit" disabled={isSubmitting}>
        Subscribe
      </Button>
      {hasError && <p className="problem" role="alert">We could not subscribe you. Try again.</p>}
    </form>
  );
}

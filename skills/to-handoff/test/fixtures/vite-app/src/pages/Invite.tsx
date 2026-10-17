import { useState } from 'react';
import { Button } from '@carbon/react';

export default function Invite() {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function sendInvite() {
    setIsSending(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsSending(false);
    setIsSent(true);
  }

  return (
    <main className="page">
      <h1 className="title">Invite a member</h1>
      <form className="invite" onSubmit={e => { e.preventDefault(); sendInvite(); }}>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <Button kind="primary" size="md" type="submit" disabled={isSending}>
          {isSending ? 'Sending…' : 'Send invite'}
        </Button>
      </form>
      {isSent && <p className="notice">Invite sent to {email}.</p>}
    </main>
  );
}

import { Button } from '@carbon/react';
import { mockMembers } from '../data/members';

export default function Members() {
  const members = mockMembers;
  return (
    <main className="page">
      <h1 className="title">Project members</h1>
      {members.length === 0 ? (
        <p className="empty">No members yet.</p>
      ) : (
        <ul className="members">
          {members.map(m => (
            <li key={m.email} className="member">
              <span className="name">{m.name}</span>
              <span className="role">{m.role}</span>
            </li>
          ))}
        </ul>
      )}
      <Button kind="primary" size="md" href="/invite">
        Invite a member
      </Button>
    </main>
  );
}

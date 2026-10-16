import { BrowserRouter, Route, Routes } from 'react-router';
import Members from '@/pages/Members';
import Invite from '@/pages/Invite';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Members />} />
        <Route path="/invite" element={<Invite />} />
      </Routes>
    </BrowserRouter>
  );
}

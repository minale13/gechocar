import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = true;

  if (!isAdmin) {
    redirect('/');
  }

  return <>{children}</>;
}

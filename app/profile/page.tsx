'use client';

import { ProfileCard } from '@/components/app/profile-card';

/**
 * Mini App Profile page (/profile) — the logged-in Telegram user's registered
 * account identity (phone number, username, Telegram id) fetched from the
 * public.profiles row the registration bot creates via «ስልክ አጋራ».
 */
export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-[#0B141B] p-6 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 px-2 text-2xl font-bold">Profile</h1>
        <ProfileCard />
      </div>
    </main>
  );
}


export const metadata = { title: "Privacy Policy — MultiThreads" };

export default async function Privacy({ searchParams }: { searchParams: Promise<{ deletion?: string }> }) {
  const { deletion } = await searchParams;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed">
      {deletion && (
        <div className="card mb-8 p-4">
          <b>Data deletion request received.</b> Confirmation code: <code>{deletion}</code>. All data related to your Threads
          account has been removed from MultiThreads.
        </div>
      )}
      <h1 className="mb-4 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-3">MultiThreads is a private content-management tool used by its operator to schedule and publish posts to
        Threads accounts that the operator owns or manages, through the official Threads API.</p>
      <h2 className="mb-2 mt-6 font-semibold">Data we process</h2>
      <p className="mb-3">When a Threads account is connected we store its Threads user ID, username, display name, profile picture URL,
        biography, an access token (encrypted with AES-256-GCM), the content scheduled for publication and post/account insights
        returned by the Threads API. Panel users’ email addresses are stored for sign-in.</p>
      <h2 className="mb-2 mt-6 font-semibold">How we use it</h2>
      <p className="mb-3">Data is used only to publish content, show analytics and operate the service. It is not sold or shared with third
        parties. Infrastructure providers: Vercel (hosting) and Supabase (database, EU region).</p>
      <h2 className="mb-2 mt-6 font-semibold">Retention and deletion</h2>
      <p className="mb-3">Data is kept while the account remains connected. Revoking the app’s access in Threads settings disconnects the
        account and deletes its access token; a data-deletion request removes the account and all related data. You can also
        request deletion by contacting the operator of this service.</p>
    </main>
  );
}

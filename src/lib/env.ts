function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return req("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get serviceRoleKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },
  get appUrl() { return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""); },
  get threadsAppId() { return req("THREADS_APP_ID"); },
  get threadsAppSecret() { return req("THREADS_APP_SECRET"); },
  get threadsScopes() {
    return process.env.THREADS_SCOPES ??
      "threads_basic,threads_content_publish,threads_manage_insights,threads_read_replies,threads_manage_replies";
  },
  get encryptionKey() { return req("ENCRYPTION_KEY"); },
};

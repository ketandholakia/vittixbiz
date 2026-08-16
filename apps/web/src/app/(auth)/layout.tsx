export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="text-lg font-semibold text-slate-900">VittixBiz</div>
          <p className="mt-1 text-sm text-slate-500">GST billing &amp; accounting</p>
        </div>
        {children}
      </div>
    </div>
  );
}
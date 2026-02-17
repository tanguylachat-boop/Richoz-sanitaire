export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">Richoz</h1>
          <p className="text-gray-500 mt-1">Sanitaire</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-400 mt-6">
          © {new Date().getFullYear()} Richoz Sanitaire
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MES AI Tools Portal",
  description: "MES Estimating Department — Internal Tools Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b-2 border-accent-red px-6 py-5">
            <div className="max-w-7xl mx-auto flex items-center gap-4">
              <div className="flex-shrink-0">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect width="36" height="36" rx="8" fill="#e63946" />
                  <path
                    d="M10 10h16v3H10zM10 16h12v2H10zM10 21h14v2H10zM10 26h10v2H10z"
                    fill="#fff"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary tracking-tight">
                  MES AI Tools Portal
                </h1>
                <p className="text-sm text-text-secondary">
                  MES Estimating Department
                </p>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME } from "@/config/theme";

const appName = THEME === "siriusai" ? "SiriusAI" : "DLX";

const Logo = () => {
  if (THEME === "siriusai") {
    return (
      <img
        src={`${import.meta.env.BASE_URL}Logo - SiriusAI (2).png`}
        alt="SiriusAI"
        className="h-8 object-contain"
      />
    );
  }
  return (
    <img
      src={`${import.meta.env.BASE_URL}dlx-logo.png`}
      alt="DLX"
      className="h-8 object-contain"
    />
  );
};

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Top bar ── */}
      <header className="bg-white border-b px-6 py-3 flex items-center">
        <Logo />
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center space-y-8">

          {/* Decorative ring + icon */}
          <div className="relative mx-auto w-32 h-32">
            <div className="absolute inset-0 rounded-full bg-primary opacity-20" />
            <div className="absolute inset-3 rounded-full flex items-center justify-center bg-primary-light">
              <SearchX
                className="w-12 h-12 text-primary"
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* 404 heading */}
          <div className="space-y-1">
            <p className="text-8xl font-extrabold leading-none tracking-tight select-none text-primary">
              404
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">
              Page Not Found
            </h1>
          </div>

          {/* Description */}
          <p className="text-gray-500 leading-relaxed text-sm">
            The page{" "}
            <code className="bg-gray-100 text-gray-700 text-xs font-mono px-2 py-0.5 rounded border border-gray-200">
              {location.pathname}
            </code>{" "}
            doesn&apos;t exist or may have been moved. Double-check the URL or
            head back to the dashboard.
          </p>

          {/* CTA */}
          <div className="flex justify-center pt-2">
            <Button
              onClick={() => navigate("/")}
              className="gap-2 px-6 bg-primary text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Home className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 text-center">
        <p className="text-xs text-gray-400">
          &copy; {new Date().getFullYear()} {appName}. All rights reserved.
        </p>
      </footer>

    </div>
  );
};

export default NotFound;

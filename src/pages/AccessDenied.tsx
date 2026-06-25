import { ShieldX, ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const USER_GUIDE_URL =
  "https://deluxe.atlassian.net/wiki/spaces/AE/pages/8295710865/User_Guide+-+SDLC_Orchestrator#How-to-request-the-access-for-modules";

const AccessDenied = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full text-center space-y-8">
        {/* Icon */}
        <div className="mx-auto w-24 h-24 rounded-full bg-primary flex items-center justify-center">
          <ShieldX className="w-12 h-12 text-white" strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-gray-900">
          Access Not Available
        </h1>

        {/* Description */}
        <p className="text-lg text-gray-700 leading-relaxed px-4">
          You don't have access to <span className="font-semibold">this application</span>.
          <br />
          Please follow the steps mentioned in the document below to raise a request.
        </p>

        {/* Confluence link — single CTA */}
        <Button
          className="bg-primary text-white hover:bg-primary/90 px-8 py-3 text-base font-medium gap-2.5"
          onClick={() => window.open(USER_GUIDE_URL, "_blank")}
        >
          <ExternalLink className="w-5 h-5" />
          User Guide
        </Button>

        {/* Signed-in info + sign out */}
        <div className="pt-4 space-y-3">
          {user?.email && (
            <p className="text-sm text-gray-400">
              Signed in as <span className="font-medium text-gray-600">{user.email}</span>
            </p>
          )}
          <button
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;

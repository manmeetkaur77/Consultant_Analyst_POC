import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import msalInstance, { ensureMsalInitialized, loginWithAzureAD, getUserInfo, logout as azureLogout, getAccessToken, isAuthenticated as checkAzureAuth } from "@/services/authService";
import { fetchBackendUserInfo } from "@/services/authApi";
import { toast } from "sonner";

// Inactivity timeout — auto-logout after 5 minutes of no activity
const INACTIVITY_TIMEOUT_MS = 300_000;

// Kept only for the isBusinessUser convenience flag — the authoritative
// allowed-modules list now comes from the backend (which handles Azure AD
// groups-claim overage via Microsoft Graph).
const BUSINESS_GROUP_OID = "be88c38e-8a45-4026-ac85-f0f850b8cc03";

interface User {
  id: string;
  email: string;
  name: string;
  groups: string[];
  allowedModules: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  hasModuleAccess: (moduleId: string) => boolean;
  isBusinessUser: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ask the backend who this user is (source of truth for RBAC).
  // Falls back to empty modules if the call fails — user will see AccessDenied.
  const buildUserFromBackend = async (
    msalUser: { id: string; email: string; name: string; groups: string[] },
    token: string,
  ): Promise<User> => {
    try {
      const backend = await fetchBackendUserInfo(token);
      return {
        id: msalUser.id,
        email: backend.email || msalUser.email,
        name: backend.name || msalUser.name,
        groups: backend.groups || [],
        allowedModules: backend.allowed_modules || [],
      };
    } catch (err) {
      console.error("[AUTH] Failed to fetch user info from backend — denying access:", err);
      return {
        ...msalUser,
        allowedModules: [],
      };
    }
  };

  // Initialize auth — SIRIUS AI: Bypass Azure AD, use mock user
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log("[AUTH] Sirius AI mode — bypassing Azure AD, using mock user");
        
        // SIRIUS AI: Create mock user directly (no Azure AD)
        const mockUser: User = {
          id: "sirius-ai-user",
          email: "sirius@siriusai.com",
          name: "Sirius AI User",
          groups: [],
          allowedModules: ["all"],
        };
        
        setUser(mockUser);
        setAccessToken("mock-token");
        
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async () => {
    try {
      setIsLoading(true);
      // SIRIUS AI: Skip Azure AD, use mock user
      console.log("[AUTH] Sirius AI mode — skipping Azure login");
      const mockUser: User = {
        id: "sirius-ai-user",
        email: "sirius@siriusai.com",
        name: "Sirius AI User",
        groups: [],
        allowedModules: ["all"],
      };
      setUser(mockUser);
      setAccessToken("mock-token");
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      // SIRIUS AI: Simple logout (no Azure AD call)
      console.log("[AUTH] Sirius AI mode — logging out");
      setUser(null);
      setAccessToken(null);
    } catch (error) {
      console.error("Logout error:", error);
      setUser(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const hasModuleAccess = useCallback(
    (moduleId: string): boolean => {
      if (!user) return false;
      return user.allowedModules.includes(moduleId);
    },
    [user]
  );

  // ── Inactivity auto-logout ──
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Clear MSAL accounts locally without triggering Azure redirect
        const accounts = msalInstance.getAllAccounts();
        accounts.forEach((a) => msalInstance.setActiveAccount(null));
        localStorage.clear();

        setUser(null);
        setAccessToken(null);
        toast("Your session has ended", {
          description: "You were signed out after being inactive. Please log in again to continue.",
          duration: Infinity,
          icon: "🔒",
        });
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "scroll", "mousedown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        accessToken,
        login,
        logout,
        isLoading,
        hasModuleAccess,
        isBusinessUser: !!user?.groups.includes(BUSINESS_GROUP_OID),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

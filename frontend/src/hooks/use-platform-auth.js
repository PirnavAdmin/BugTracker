import { useContext } from "react";
import { PlatformAuthContext } from "@/context/PlatformAuthContext";

export const usePlatformAuth = () => {
  const context = useContext(PlatformAuthContext);

  if (!context) {
    throw new Error("usePlatformAuth must be used within a PlatformAuthProvider");
  }

  return context;
};

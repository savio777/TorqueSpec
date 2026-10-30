import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // O pacote de contratos é consumido do código-fonte compilado (dist) do workspace.
  transpilePackages: ["@torquespec/shared-types"],
};

export default nextConfig;

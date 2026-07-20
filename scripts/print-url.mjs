// Prints the URL the dashboard is reachable at, based on the network config.
// Used by the launcher to show an accurate banner + open the right browser tab.
import { readNetworkConfig } from "../lib/tls/network-config.mjs";

const c = readNetworkConfig();
const url =
  c.mode === "off"
    ? `http://localhost:${c.httpPort}`
    : `https://${c.domain || "localhost"}${c.httpsPort === 443 ? "" : ":" + c.httpsPort}`;
process.stdout.write(url);

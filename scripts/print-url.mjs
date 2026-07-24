// Prints the URL the dashboard is reachable at, based on the network config.
// Used by the launcher to show an accurate banner + open the right browser tab.
//
// `--port` prints just the port it will LISTEN on instead, which the launcher uses to
// detect an instance that is already running (BUG-07). That's the port actually bound —
// in HTTPS mode the server listens on httpsPort, whatever the display URL shows.
import { readNetworkConfig } from "../lib/tls/network-config.mjs";

const c = readNetworkConfig();

if (process.argv.includes("--port")) {
  process.stdout.write(String(c.mode === "off" ? c.httpPort : c.httpsPort));
} else {
  const url =
    c.mode === "off"
      ? `http://localhost:${c.httpPort}`
      : `https://${c.domain || "localhost"}${c.httpsPort === 443 ? "" : ":" + c.httpsPort}`;
  process.stdout.write(url);
}

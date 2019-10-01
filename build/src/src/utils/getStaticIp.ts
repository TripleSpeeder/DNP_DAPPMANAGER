import fs from "fs";
import * as db from "../db";
import params from "../params";
import Logs from "../logs";
import isIp from "is-ip";
const logs = Logs(module);

const staticIpPath = params.STATIC_IP_PATH;

// Get ip (maybe) set during the installation
// ====================================================
// > Only write the IP if it comes from the installation

function getInstallationStaticIp(): string {
  try {
    const ip = fs.readFileSync(staticIpPath, "utf8").trim();
    if (!isIp(ip)) return "";
    else return ip;
  } catch (e) {
    if (e.code === "ENOENT") {
      logs.warn(`staticIp not found at ${staticIpPath}: ${e.message}`);
    } else {
      logs.error(`Error reading staticIp at ${staticIpPath}: ${e.message}`);
    }
    return "";
  }
}

export default async function getStaticIp(): Promise<string> {
  if (db.importedInstallationStaticIp.get()) return db.staticIp.get();

  const staticIp = await getInstallationStaticIp();
  db.staticIp.set(staticIp);
  db.importedInstallationStaticIp.set(true);

  if (staticIp) logs.info(`Static IP was set on installation to ${staticIp}`);
  else logs.info(`Static IP was NOT set on installation`);

  return staticIp;
}
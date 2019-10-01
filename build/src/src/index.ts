import autobahn from "autobahn";
import * as eventBus from "./eventBus";
import logUserAction from "./logUserAction";
import { registerHandler } from "./registerHandler";
import params from "./params";
import * as db from "./db";
import { convertLegacyEnvFiles } from "./utils/configFiles";
import {
  ChainData,
  DirectoryDnp,
  ProgressLog,
  PackageNotification,
  UserActionLog,
  PackageContainer
} from "./types";
import Logs from "./logs";
const logs = Logs(module);

// import calls
import * as calls from "./calls";

// Start watchers
import "./watchers/autoUpdates";
import "./watchers/chains";
import "./watchers/diskUsage";
import "./watchers/natRenewal";

// Print version data
import "./utils/getVersionData";

// Start HTTP API
import "./httpApi";

// Initial calls to check this DAppNode's status
calls
  .passwordIsSecure()
  .then(({ result }) => {
    logs.info("Host user password is " + (result ? "secure" : "INSECURE"));
  })
  .catch(e => {
    logs.error(`Error checking if host user password is secure: ${e.message}`);
  });

/*
 * Connection configuration
 * ************************
 * Autobahn.js connects to the WAMP, whos url in defined in params.js
 * On connection open:
 * - all handlers are registered
 * - the native event bus is linked to the session to:
 *   - allow internal calls
 *   - publish progress logs and userAction logs
 * - it subscribe to userAction logs sent by the VPN to store them locally
 */
const url = params.autobahnUrl;
const realm = params.autobahnRealm;
const connection = new autobahn.Connection({ url, realm });

connection.onopen = (session, details): void => {
  logs.info(`Connected to DAppNode's WAMP
  url:     ${url}
  realm:   ${realm}
  session: ${(details || {}).authid}`);

  registerHandler(
    session,
    "ping.dappmanager.dnp.dappnode.eth",
    async (x: string) => ({ message: "ping", result: x })
  );
  for (const [callId, callHandler] of Object.entries(calls)) {
    registerHandler(
      session,
      callId + ".dappmanager.dnp.dappnode.eth",
      callHandler
    );
  }

  /**
   * All the session uses below can throw errors if the session closes.
   * so each single callback is wrapped in a try/catch block,
   * via the `eventBusOnSafe` method
   */

  /**
   * Utilities to encode arguments to publish with the Crossbar format (args, kwargs)
   * - Publisher:
   *     publish("event.name", arg1, arg2)
   * - Subscriber:
   *     subscribe("event.name", function(arg1, arg2) {})
   */
  function publish(event: string, ...args: any[]): void {
    // session.publish(topic, args, kwargs, options)
    session.publish(event, args);
  }
  function subscribe(event: string, cb: (...args: any[]) => void): void {
    // session.subscribe(topic, function(args, kwargs, details) )
    session.subscribe(event, args => {
      try {
        cb(...args);
      } catch (e) {
        logs.error(`Error on WAMP ${event}: ${e.stack}`);
      }
    });
  }

  eventBus.chainData.on((chainData: ChainData[]) => {
    publish("chainData.dappmanager.dnp.dappnode.eth", chainData);
  });

  // Emits the list of packages
  eventBus.packages.on((dnpList: PackageContainer[]) => {
    publish("packages.dappmanager.dnp.dappnode.eth", dnpList);
  });
  eventBus.requestPackages.on(async () => {
    const dnpList = (await calls.listPackages()).result;
    publish("packages.dappmanager.dnp.dappnode.eth", dnpList);
  });

  // Emits the directory
  eventBus.directory.on((pkgs: DirectoryDnp[]) => {
    publish("directory.dappmanager.dnp.dappnode.eth", pkgs);
  });

  // Emits the auto update data (settings, registry, pending)
  eventBus.requestAutoUpdateData.on(async () => {
    const autoUpdateData = (await calls.autoUpdateDataGet()).result;
    publish("autoUpdateData.dappmanager.dnp.dappnode.eth", autoUpdateData);
  });

  eventBus.logUi.on((logData: ProgressLog) => {
    publish("log.dappmanager.dnp.dappnode.eth", logData);
    // Also, log them internally. But skip download progress logs, too spam-y
    if (!(logData.message || "").includes("%") && !logData.clear)
      logs.info(JSON.stringify(logData));
    else logs.debug(JSON.stringify(logData));
  });

  eventBus.logUserAction.on((userActionLog: UserActionLog) => {
    publish("logUserAction.dappmanager.dnp.dappnode.eth", userActionLog);
  });

  /**
   * Receives userAction logs from the VPN nodejs app
   * See above for more details on userActionLog
   */
  subscribe("logUserActionToDappmanager", userActionLog => {
    logUserAction.log(userActionLog);
  });

  eventBus.notification.on((notification: PackageNotification) => {
    db.notification.set(notification.id, notification);
    publish("pushNotification.dappmanager.dnp.dappnode.eth", notification);
  });

  /**
   * Initial calls when WAMP is active
   * - When the DAPPMANAGER starts, update the list of packages
   */
  eventBus.requestAutoUpdateData.emit();
  eventBus.requestPackages.emit();
};

connection.onclose = (reason, details): boolean => {
  logs.warn(
    `WAMP connection closed: ${reason} ${(details || {}).message || ""}`
  );
  return false;
};

connection.open();
logs.info(`Attempting WAMP connection to ${url}, realm: ${realm}`);

/**
 * [LEGACY] The previous method of injecting ENVs to a DNP was via .env files
 * This function will read the contents of .env files and add them in the
 * compose itself in the `environment` field in array format
 */

async function runLegacyOps(): Promise<void> {
  try {
    if (!db.areEnvFilesMigrated.get()) {
      const { result: dnpList } = await calls.listPackages();
      for (const dnp of dnpList) {
        const hasConverted = convertLegacyEnvFiles(dnp);
        if (hasConverted)
          logs.info(`Converted ${dnp.name} .env file to compose environment`);
      }
      logs.info(`Finished converting legacy .env files without errors`);
      db.areEnvFilesMigrated.set(true);
    }
  } catch (e) {
    logs.error(`Error converting legacy .env files: ${e.stack || e.message}`);
  }
}

runLegacyOps();